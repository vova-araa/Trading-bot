// Live quote proxy. Returns the latest price + reference (day-open) price for
// a batch of ARA symbols, sourced server-side so the browser dodges CORS and
// provider auth. Crypto → Binance 24h ticker; forex / metals / indices /
// futures → Yahoo Finance v8 chart meta. Short in-memory cache keeps us under
// rate limits. Any upstream failure yields ok:false for that symbol and the
// client keeps simulating it — the feed degrades, it never breaks.

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

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

type Quote = { id: string; price: number; ref: number; source: "binance" | "yahoo" };

type BinanceTicker = { symbol: string; lastPrice?: string; openPrice?: string };
type YahooQuoteResp = {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number };
    }>;
  };
};

const CACHE = new Map<string, { at: number; quote: Quote }>();
const TTL = 3500;

async function binanceQuotes(ids: string[]): Promise<Quote[]> {
  // Single call for all crypto: /ticker/24hr?symbols=[...]
  const symbols = ids.map((id) => BINANCE[id]);
  const uniq = Array.from(new Set(symbols));
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(uniq))}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const rows = (await res.json()) as BinanceTicker[];
  const bySym = new Map(rows.map((r) => [r.symbol, r]));
  return ids
    .map((id) => {
      const r = bySym.get(BINANCE[id]);
      const price = Number(r?.lastPrice);
      const ref = Number(r?.openPrice) || price;
      return { id, price, ref, source: "binance" as const };
    })
    .filter((q) => Number.isFinite(q.price) && q.price > 0);
}

async function yahooQuote(id: string): Promise<Quote> {
  const ticker = YAHOO[id];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
  });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const json = (await res.json()) as YahooQuoteResp;
  const meta = json?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  const ref = Number(meta?.chartPreviousClose ?? meta?.previousClose) || price;
  if (!Number.isFinite(price) || price <= 0) throw new Error("no price");
  return { id, price, ref, source: "yahoo" };
}

export const Route = createFileRoute("/api/market/quotes")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const ids = (u.searchParams.get("ids") ?? "")
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        if (!ids.length) return json({ ok: false, error: "no ids" }, 400);

        const now = Date.now();
        const out: Quote[] = [];
        const needBinance: string[] = [];
        const needYahoo: string[] = [];

        for (const id of ids) {
          const hit = CACHE.get(id);
          if (hit && now - hit.at < TTL) {
            out.push(hit.quote);
            continue;
          }
          if (BINANCE[id]) needBinance.push(id);
          else if (YAHOO[id]) needYahoo.push(id);
        }

        const tasks: Promise<void>[] = [];
        if (needBinance.length) {
          tasks.push(
            binanceQuotes(needBinance)
              .then((qs) => {
                for (const q of qs) {
                  CACHE.set(q.id, { at: now, quote: q });
                  out.push(q);
                }
              })
              .catch(() => {
                /* leave to client fallback */
              }),
          );
        }
        for (const id of needYahoo) {
          tasks.push(
            yahooQuote(id)
              .then((q) => {
                CACHE.set(q.id, { at: now, quote: q });
                out.push(q);
              })
              .catch(() => {
                /* leave to client fallback */
              }),
          );
        }
        await Promise.all(tasks);

        return json({ ok: true, quotes: out });
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
