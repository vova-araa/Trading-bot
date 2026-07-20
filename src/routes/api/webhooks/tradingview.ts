// TradingView webhook receiver — the real, standard bridge for "trading via
// TradingView". You paste your personal URL (with your owner token `t`) into a
// TradingView alert's webhook field; when the alert fires, TradingView POSTs
// the message here. We validate the token, log it into the app's realtime
// alert feed (bot_alerts), and — when the payload names an action + symbol —
// record it on your matching deployed bots so they act on the signal.
//
// NOTE: this drives ARA's in-app (paper) bots and signal feed. Forwarding an
// order to a real broker account additionally requires a broker execution
// adapter (cTrader Open API / MetaApi / exchange REST) with your credentials —
// see the Brokers tab. This receiver is where that routing plugs in.

import { createFileRoute } from "@tanstack/react-router";

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
};

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
  };
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
          hint: 'POST your TradingView alert here. Body: {"action":"buy","symbol":"XAUUSD","price":"{{close}}"}',
        });
      },

      POST: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t");
        if (!token) return json({ ok: false, error: "missing token (?t=…)" }, 400);

        const raw = await request.text();
        if (!raw.trim()) return json({ ok: false, error: "empty body" }, 400);
        const sig = parseSignal(raw);
        const message = `TradingView: ${describe(sig)}`;

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

        return json({ ok: true, stored, botsTouched, signal: sig });
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
