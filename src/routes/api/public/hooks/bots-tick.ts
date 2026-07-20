// Server-side bot worker. Called by pg_cron every minute.
// Ticks every deployed+running bot: bumps P&L, updates heartbeat,
// occasionally logs a synthetic action/alert. Personal paper-trading
// dashboard — no real broker execution.

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
} as const;

type ServerBot = {
  id: string;
  owner_key: string;
  kind: string;
  symbol: string;
  running: boolean;
  deployed: boolean;
  pnl: number | string;
};

function tickDelta(kind: string): number {
  // paper-trading synthetic P&L per minute tick
  const base =
    kind === "grid"
      ? (Math.random() - 0.45) * 3.5
      : kind === "dca"
        ? (Math.random() - 0.4) * 2.0
        : kind === "signal"
          ? (Math.random() - 0.42) * 5.5
          : kind === "pump"
            ? (Math.random() - 0.44) * 7.0
            : kind === "scalper"
              ? (Math.random() - 0.44) * 4.5
              : kind === "trend"
                ? (Math.random() - 0.41) * 4.0
                : kind === "smc"
                  ? (Math.random() - 0.43) * 5.0
                  : kind === "arbitrage"
                    ? (Math.random() - 0.3) * 1.2
                    : (Math.random() - 0.43) * 3.0;
  return Number(base.toFixed(4));
}

function actionText(kind: string, symbol: string, delta: number, price: number): string {
  const r = Math.random();
  const priceStr = price.toFixed(4);
  if (r < 0.22) {
    const side = delta >= 0 ? "▲ long" : "▼ short";
    return `${side} ${symbol} @ ${priceStr}`;
  }
  if (r < 0.4) {
    const sign = delta >= 0 ? "+" : "";
    return `Trade gesloten ${sign}${delta.toFixed(2)}$`;
  }
  return `${kind} tick · ${symbol} ${priceStr}`;
}

function fakePrice(symbol: string, now: number): number {
  // stable per-symbol synthetic price so heartbeats look sensible in the log
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  const base = 10 + (h % 90000);
  const drift = Math.sin(now / 900000 + h) * base * 0.02;
  return Number((base + drift).toFixed(4));
}

// Real prices for the symbols a tick touches — Binance for crypto, Stooq for
// FX/metals/indices/futures. Best-effort: anything we can't fetch falls back to
// the synthetic fakePrice so a blocked host never stalls the worker.
const BINANCE_SYMBOL: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  SOLUSD: "SOLUSDT",
  XRPUSD: "XRPUSDT",
  DOGEUSD: "DOGEUSDT",
  AVAXUSD: "AVAXUSDT",
  LINKUSD: "LINKUSDT",
  BTCPERP: "BTCUSDT",
  ETHPERP: "ETHUSDT",
};
const STOOQ_SYMBOL: Record<string, string> = {
  EURUSD: "eurusd",
  GBPUSD: "gbpusd",
  USDJPY: "usdjpy",
  AUDUSD: "audusd",
  USDCAD: "usdcad",
  NZDUSD: "nzdusd",
  USDCHF: "usdchf",
  EURJPY: "eurjpy",
  GBPJPY: "gbpjpy",
  XAUUSD: "xauusd",
  XAGUSD: "xagusd",
  US30: "^dji",
  NAS100: "^ndx",
  SPX500: "^spx",
  ES: "es.f",
  NQ: "nq.f",
  CL: "cl.f",
  GC: "gc.f",
};

async function realPrices(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = Array.from(new Set(symbols));
  const crypto = uniq.filter((s) => BINANCE_SYMBOL[s]);
  const stooq = uniq.filter((s) => STOOQ_SYMBOL[s]);

  const tasks: Promise<void>[] = [];
  if (crypto.length) {
    const syms = JSON.stringify(Array.from(new Set(crypto.map((s) => BINANCE_SYMBOL[s]))));
    tasks.push(
      fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(syms)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Array<{ symbol: string; price: string }>) => {
          const bySym = new Map(rows.map((r) => [r.symbol, Number(r.price)]));
          for (const id of crypto) {
            const p = bySym.get(BINANCE_SYMBOL[id]);
            if (Number.isFinite(p) && (p as number) > 0) out.set(id, p as number);
          }
        })
        .catch(() => {
          /* fall back to fakePrice */
        }),
    );
  }
  if (stooq.length) {
    const list = stooq.map((s) => STOOQ_SYMBOL[s]).join(",");
    tasks.push(
      fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(list)}&f=sc&h&e=csv`, {
        headers: { "user-agent": "Mozilla/5.0" },
      })
        .then((r) => (r.ok ? r.text() : ""))
        .then((text) => {
          const toAra = new Map(stooq.map((id) => [STOOQ_SYMBOL[id].toUpperCase(), id]));
          const lines = text.trim().split(/\r?\n/).slice(1);
          for (const line of lines) {
            const [sym, close] = line.split(",");
            const id = toAra.get((sym ?? "").toUpperCase());
            const p = Number(close);
            if (id && Number.isFinite(p) && p > 0) out.set(id, p);
          }
        })
        .catch(() => {
          /* fall back to fakePrice */
        }),
    );
  }
  await Promise.all(tasks);
  return out;
}

const WARNS = [
  "Hoge spread gedetecteerd, order uitgesteld",
  "Broker latency > 400ms",
  "Slippage boven target op laatste order",
];
const ERRS = [
  "Order geweigerd (insufficient margin)",
  "API rate limit bereikt, retry over 30s",
  "Verbinding kort verbroken",
];

export const Route = createFileRoute("/api/public/hooks/bots-tick")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async () => {
        const startedAt = Date.now();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: bots, error } = await supabaseAdmin
          .from("bots")
          .select("id, owner_key, kind, symbol, running, deployed, pnl")
          .eq("deployed", true)
          .eq("running", true);

        if (error) {
          console.error("[bots-tick] fetch failed", error.message);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        }

        const list = (bots ?? []) as ServerBot[];
        const now = new Date().toISOString();
        let updated = 0;
        const alerts: Array<{ owner_key: string; bot_id: string; level: string; message: string }> =
          [];

        // Real prices for every symbol in this batch (one call per source).
        const live = await realPrices(list.map((b) => b.symbol));

        for (const b of list) {
          const price = live.get(b.symbol) ?? fakePrice(b.symbol, Date.now());
          const delta = tickDelta(b.kind);
          const newPnl = Number((Number(b.pnl) + delta).toFixed(4));
          const text = actionText(b.kind, b.symbol, delta, price);

          const { error: upErr } = await supabaseAdmin
            .from("bots")
            .update({
              pnl: newPnl,
              last_tick_at: now,
              last_action: text,
              last_action_at: now,
            })
            .eq("id", b.id);
          if (upErr) {
            console.warn("[bots-tick] update failed", b.id, upErr.message);
            continue;
          }
          updated++;

          if (Math.random() < 0.06) {
            alerts.push({
              owner_key: b.owner_key,
              bot_id: b.id,
              level: "warn",
              message: WARNS[Math.floor(Math.random() * WARNS.length)],
            });
          }
          if (Math.random() < 0.02) {
            alerts.push({
              owner_key: b.owner_key,
              bot_id: b.id,
              level: "error",
              message: ERRS[Math.floor(Math.random() * ERRS.length)],
            });
          }
        }

        if (alerts.length) {
          const { error: aErr } = await supabaseAdmin.from("bot_alerts").insert(alerts);
          if (aErr) console.warn("[bots-tick] alert insert failed", aErr.message);
        }

        const took = Date.now() - startedAt;
        console.log(
          `[bots-tick] ticked ${updated}/${list.length} bots in ${took}ms, ${alerts.length} alerts`,
        );

        return new Response(
          JSON.stringify({
            ok: true,
            ticked: updated,
            total: list.length,
            alerts: alerts.length,
            took_ms: took,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
        );
      },
    },
  },
});
