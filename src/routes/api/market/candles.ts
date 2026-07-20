// Live candle proxy. Server-side fetch of real OHLC data so the browser
// never hits a CORS wall or leaks a provider quirk. Crypto is served from
// Binance klines; forex / metals / indices / futures from the Yahoo Finance
// v8 chart endpoint. Results are cached in-memory per (id, tf) for a short
// TTL to stay well under provider rate limits. On any upstream failure the
// route returns 502 and the client transparently falls back to its built-in
// simulator, so the app never blanks out.

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
};

// ARA symbol id → upstream ticker. Crypto uses Binance; everything else Yahoo.
const BINANCE: Record<string, string> = {
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
const YAHOO: Record<string, string> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  AUDUSD: "AUDUSD=X",
  USDCAD: "USDCAD=X",
  NZDUSD: "NZDUSD=X",
  USDCHF: "USDCHF=X",
  EURJPY: "EURJPY=X",
  GBPJPY: "GBPJPY=X",
  XAUUSD: "GC=F",
  XAGUSD: "SI=F",
  US30: "^DJI",
  NAS100: "^NDX",
  SPX500: "^GSPC",
  ES: "ES=F",
  NQ: "NQ=F",
  CL: "CL=F",
  GC: "GC=F",
};

// timeframe seconds → provider interval strings
const BINANCE_INTERVAL: Record<number, string> = {
  1: "1s",
  60: "1m",
  300: "5m",
  900: "15m",
  3600: "1h",
  14400: "4h",
  86400: "1d",
};
const YAHOO_INTERVAL: Record<number, { interval: string; range: string }> = {
  60: { interval: "1m", range: "1d" },
  300: { interval: "5m", range: "5d" },
  900: { interval: "15m", range: "5d" },
  3600: { interval: "1h", range: "1mo" },
  14400: { interval: "1h", range: "3mo" }, // aggregated ×4 below
  86400: { interval: "1d", range: "1y" },
};

const CACHE = new Map<string, { at: number; candles: Candle[] }>();
const ttlFor = (secs: number) =>
  secs <= 15 ? 4000 : secs < 300 ? 15000 : secs < 3600 ? 45000 : 300000;

async function fetchBinance(sym: string, secs: number, limit: number): Promise<Candle[]> {
  const interval = BINANCE_INTERVAL[secs] ?? "1m";
  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const rows = (await res.json()) as unknown[][];
  return rows.map((r) => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
}

async function fetchYahoo(ticker: string, secs: number, limit: number): Promise<Candle[]> {
  const conf = YAHOO_INTERVAL[secs] ?? YAHOO_INTERVAL[60];
  const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?range=${conf.range}&interval=${conf.interval}`;
  // query1 rate-limits from a single host; query2 is a live alternate.
  let json: YahooChart | null = null;
  let lastErr: Error | null = null;
  for (const host of ["query1", "query2"]) {
    try {
      const res = await fetch(`https://${host}.finance.yahoo.com${path}`, {
        headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
      });
      if (!res.ok) throw new Error(`yahoo ${res.status}`);
      json = (await res.json()) as YahooChart;
      break;
    } catch (err) {
      lastErr = err as Error;
    }
  }
  if (!json) throw lastErr ?? new Error("yahoo failed");
  const result = json?.chart?.result?.[0];
  const ts: number[] = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0] ?? {};
  let candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    if (open == null || high == null || low == null || close == null) continue;
    candles.push({ time: ts[i], open, high, low, close, volume: q.volume?.[i] ?? 0 });
  }
  if (secs === 14400) candles = aggregate(candles, 4); // 1h → 4h
  return candles.slice(-limit);
}

// Aggregate N consecutive candles into one (for timeframes an upstream lacks).
function aggregate(candles: Candle[], group: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += group) {
    const slice = candles.slice(i, i + group);
    if (!slice.length) continue;
    out.push({
      time: slice[0].time,
      open: slice[0].open,
      high: Math.max(...slice.map((c) => c.high)),
      low: Math.min(...slice.map((c) => c.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

export const Route = createFileRoute("/api/market/candles")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const id = (u.searchParams.get("id") ?? "").toUpperCase();
        const secs = Math.max(1, Number(u.searchParams.get("secs") ?? "60"));
        const limit = Math.min(1000, Math.max(10, Number(u.searchParams.get("limit") ?? "300")));

        const bin = BINANCE[id];
        const yah = YAHOO[id];
        if (!bin && !yah) {
          return json({ ok: false, error: "unknown symbol" }, 404);
        }

        const key = `${id}|${secs}`;
        const hit = CACHE.get(key);
        if (hit && Date.now() - hit.at < ttlFor(secs)) {
          return json({
            ok: true,
            source: bin ? "binance" : "yahoo",
            cached: true,
            candles: hit.candles,
          });
        }

        try {
          const candles = bin
            ? await fetchBinance(bin, secs, limit)
            : await fetchYahoo(yah, secs, limit);
          if (!candles.length) throw new Error("empty upstream");
          CACHE.set(key, { at: Date.now(), candles });
          return json({ ok: true, source: bin ? "binance" : "yahoo", cached: false, candles });
        } catch (err) {
          // serve stale cache if we have any, otherwise signal fallback
          if (hit)
            return json({
              ok: true,
              source: bin ? "binance" : "yahoo",
              cached: true,
              stale: true,
              candles: hit.candles,
            });
          return json({ ok: false, error: (err as Error).message }, 502);
        }
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
