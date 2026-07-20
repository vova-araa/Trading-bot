// TradingView webhook receiver — the real, standard bridge for "trading via
// TradingView". You paste your personal URL (with your owner token `t`) into a
// TradingView alert's webhook field; when the alert fires, TradingView POSTs
// the message here. We validate the token, log it into the app's realtime
// alert feed (bot_alerts), and — when the payload names an action + symbol —
// record it on your matching deployed bots so they act on the signal.
//
// NOTE: this drives ARA's in-app (paper) bots and signal feed. It ALSO forwards
// to a real MT5 account via MetaApi when you opt in with `&exec=1` on the URL
// AND the server has METAAPI_TOKEN + METAAPI_ACCOUNT_ID set — see the Brokers
// tab / MetaApi. Without those, it stays paper + alerts only.

import { createFileRoute } from "@tanstack/react-router";
import { resolveCreds, placeOrder, closePosition, getPositions } from "@/lib/metaapi.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type Signal = {
  action: "buy" | "sell" | "close" | "alert";
  symbol: string | null;
  price: number | null;
  note: string | null;
  volume: number | null; // lots (for real execution)
  sl: number | null; // absolute stop-loss price
  tp: number | null; // absolute take-profit price
  brokerSymbol: string | null; // optional MT5 symbol override
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeAction(raw: unknown): Signal["action"] {
  const s = String(raw ?? "").toLowerCase();
  if (/\b(buy|long|bull)\b/.test(s)) return "buy";
  if (/\b(sell|short|bear)\b/.test(s)) return "sell";
  if (/\b(close|exit|flat)\b/.test(s)) return "close";
  return "alert";
}

/** Accept both JSON alerts and plain-text TradingView messages. */
function parseSignal(body: string): Signal {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>;
      const price = Number(j.price ?? j.close ?? j.p);
      return {
        action: normalizeAction(j.action ?? j.side ?? j.signal ?? j.strategy),
        symbol: j.symbol || j.ticker || j.sym ? String(j.symbol ?? j.ticker ?? j.sym) : null,
        price: Number.isFinite(price) && price > 0 ? price : null,
        note: j.note || j.comment || j.message ? String(j.note ?? j.comment ?? j.message) : null,
        volume: num(j.volume ?? j.qty ?? j.lot ?? j.size ?? j.contracts),
        sl: num(j.sl ?? j.stopLoss ?? j.stop),
        tp: num(j.tp ?? j.takeProfit ?? j.target),
        brokerSymbol: j.mt5symbol || j.brokerSymbol ? String(j.mt5symbol ?? j.brokerSymbol) : null,
      };
    } catch {
      /* fall through to text handling */
    }
  }
  // Plain text, e.g. "BUY XAUUSD @ 2412.8". Match real instrument tokens only,
  // so action words like BUY/SELL are never mistaken for the symbol.
  const symMatch = trimmed
    .toUpperCase()
    .match(
      /\b(XAUUSD|XAGUSD|US30|NAS100|SPX500|BTCPERP|ETHPERP|[A-Z]{3}(?:USD|USDT|JPY|EUR|GBP|CHF|CAD|AUD|NZD))\b/,
    );
  const priceMatch = trimmed.match(/(\d+(?:\.\d+)?)/);
  return {
    action: normalizeAction(trimmed),
    symbol: symMatch ? symMatch[1] : null,
    price: priceMatch ? Number(priceMatch[1]) : null,
    note: trimmed.slice(0, 240) || null,
    volume: null,
    sl: null,
    tp: null,
    brokerSymbol: null,
  };
}

/** Route a signal to the real MT5 account via MetaApi (env creds). */
async function executeMt5(sig: Signal): Promise<{ executed: boolean; detail: string }> {
  const creds = resolveCreds({}); // server env only — no per-user token here
  if (!creds) return { executed: false, detail: "geen server MetaApi-creds (METAAPI_TOKEN)" };
  const symbol = sig.brokerSymbol || sig.symbol;
  if (!symbol) return { executed: false, detail: "geen symbool" };

  if (sig.action === "close") {
    const pos = await getPositions(creds);
    if (!pos.ok) return { executed: false, detail: pos.error ?? "posities ophalen mislukt" };
    const rows = (pos.data ?? []) as { id: string; symbol?: string }[];
    const mine = rows.filter((p) => (p.symbol ?? "").toUpperCase() === symbol.toUpperCase());
    if (!mine.length) return { executed: false, detail: `geen open positie op ${symbol}` };
    let closed = 0;
    for (const p of mine) {
      const r = await closePosition(creds, p.id);
      if (r.ok) closed++;
    }
    return {
      executed: closed > 0,
      detail: `${closed}/${mine.length} positie(s) gesloten op ${symbol}`,
    };
  }

  // buy / sell → market order
  const volume = sig.volume ?? num(process.env.METAAPI_DEFAULT_LOT) ?? 0.1;
  const r = await placeOrder(creds, {
    symbol,
    side: sig.action === "buy" ? "long" : "short",
    volume,
    stopLoss: sig.sl ?? undefined,
    takeProfit: sig.tp ?? undefined,
    comment: "ARA TV",
  });
  if (!r.ok) return { executed: false, detail: r.error ?? "order geweigerd" };
  return { executed: true, detail: `${sig.action} ${volume} ${symbol} verstuurd naar MT5` };
}

function describe(sig: Signal): string {
  const icon =
    sig.action === "buy"
      ? "▲ KOOP"
      : sig.action === "sell"
        ? "▼ VERKOOP"
        : sig.action === "close"
          ? "✕ SLUIT"
          : "🔔";
  const parts = [icon, sig.symbol ?? ""].filter(Boolean);
  if (sig.price) parts.push(`@ ${sig.price}`);
  const head = parts.join(" ");
  return sig.note && sig.note !== head ? `${head} · ${sig.note}` : head || "TradingView alert";
}

export const Route = createFileRoute("/api/webhooks/tradingview")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      // Browser-friendly health check so users can verify the URL is live.
      GET: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t");
        return json({
          ok: true,
          live: true,
          tokenPresent: !!t,
          hint: 'POST your TradingView alert here. Body: {"action":"buy","symbol":"XAUUSD","volume":0.1}. Add &exec=1 to route it as a real MT5 order (needs server MetaApi creds).',
        });
      },

      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t");
        if (!token) return json({ ok: false, error: "missing token (?t=…)" }, 400);
        const wantExec = url.searchParams.get("exec") === "1";

        const raw = await request.text();
        if (!raw.trim()) return json({ ok: false, error: "empty body" }, 400);
        const sig = parseSignal(raw);
        const message = `TradingView: ${describe(sig)}`;

        // Real MT5 execution (opt-in via &exec=1 + server MetaApi creds).
        let execution: { executed: boolean; detail: string } | null = null;
        if (wantExec && sig.action !== "alert") {
          try {
            execution = await executeMt5(sig);
          } catch (err) {
            execution = { executed: false, detail: (err as Error).message };
          }
        }

        let stored = false;
        let botsTouched = 0;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const now = new Date().toISOString();

          const { error: aErr } = await supabaseAdmin.from("bot_alerts").insert({
            owner_key: token,
            level: "info",
            message,
          });
          if (!aErr) stored = true;

          // Log the real-execution outcome as its own alert so it shows in-app.
          if (execution) {
            await supabaseAdmin.from("bot_alerts").insert({
              owner_key: token,
              level: execution.executed ? "info" : "error",
              message: `⚡ MT5: ${execution.detail}`,
            });
          }

          // If the alert names a tradable action + symbol, stamp it on the
          // owner's deployed bots for that symbol so they act on the signal.
          if (sig.symbol && sig.action !== "alert") {
            const { data: matched } = await supabaseAdmin
              .from("bots")
              .select("id")
              .eq("owner_key", token)
              .eq("deployed", true)
              .in("symbol", [sig.symbol.toUpperCase(), "ALL"]);
            const ids = (matched ?? []).map((b: { id: string }) => b.id);
            if (ids.length) {
              await supabaseAdmin
                .from("bots")
                .update({ last_action: message, last_action_at: now, last_tick_at: now })
                .in("id", ids);
              botsTouched = ids.length;
            }
          }
        } catch (err) {
          console.error("[tradingview-webhook]", (err as Error).message);
          return json({ ok: false, error: "storage unavailable", signal: sig }, 502);
        }

        return json({ ok: true, stored, botsTouched, signal: sig, execution });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
