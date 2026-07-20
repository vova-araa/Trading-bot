// Live quote proxy. Returns the latest price + reference (day-open) price for
// a batch of ARA symbols, sourced server-side so the browser dodges CORS and
// provider auth.
//
//   • Crypto → Binance 24h ticker (one batched call).
//   • FX / metals / indices / futures → Stooq CSV (ONE batched call for the
//     whole set — datacenter-friendly, no key, no crumb), with Yahoo Finance
//     v8 chart as a per-symbol fallback only for anything Stooq misses.
//
// Batching matters: the previous per-symbol Yahoo fan-out fired ~19 requests
// every poll and got rate-limited (429) from a single Worker, which is why FX
// and gold fell back to DEMO. One Stooq request per poll fixes that. Any
// upstream miss yields no quote for that symbol and the client keeps
// simulating it — the feed degrades, it never breaks.

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

// ARA id → Stooq symbol (forex lowercase, indices ^xxx, futures xx.f).
const STOOQ: Record<string, string> = {
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

// ARA id → Yahoo ticker (fallback source).
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

type Source = "binance" | "stooq" | "yahoo";
type Quote = { id: string; price: number; ref: number; source: Source };

type BinanceTicker = { symbol: string; lastPrice?: string; openPrice?: string };
type YahooQuoteResp = {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number };
    }>;
  };
};

const CACHE = new Map<string, { at: number; quote: Quote }>();
// 10s cache: free FX/metal feeds only refresh ~once a minute, and this keeps
// upstream load low even when the client polls every 5s. Crypto price freshness
// comes from the browser WebSocket; this poll only supplies its day-open ref.
const TTL = 10000;

async function binanceQuotes(ids: string[]): Promise<Quote[]> {
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

// One CSV request for the whole non-crypto set.
async function stooqQuotes(ids: string[]): Promise<Quote[]> {
  const stooqToAra = new Map<string, string>();
  for (const id of ids) if (STOOQ[id]) stooqToAra.set(STOOQ[id].toUpperCase(), id);
  const list = ids
    .map((id) => STOOQ[id])
    .filter(Boolean)
    .join(",");
  if (!list) return [];
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(list)}&f=sohlcv&h&e=csv`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", accept: "text/csv" } });
  if (!res.ok) throw new Error(`stooq ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",");
  const iSym = header.indexOf("symbol");
  const iOpen = header.indexOf("open");
  const iClose = header.indexOf("close");
  const out: Quote[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const sym = (cols[iSym] ?? "").toUpperCase();
    const id = stooqToAra.get(sym);
    if (!id) continue;
    const price = Number(cols[iClose]);
    const open = Number(cols[iOpen]);
    if (!Number.isFinite(price) || price <= 0) continue; // 'N/D' → skip
    out.push({ id, price, ref: Number.isFinite(open) && open > 0 ? open : price, source: "stooq" });
  }
  return out;
}

async function yahooQuote(id: string): Promise<Quote> {
  const ticker = YAHOO[id];
  const hosts = ["query1", "query2"];
  let lastErr: Error | null = null;
  for (const host of hosts) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`;
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
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error("yahoo failed");
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
        const needStooq: string[] = [];

        for (const id of ids) {
          const hit = CACHE.get(id);
          if (hit && now - hit.at < TTL) {
            out.push(hit.quote);
            continue;
          }
          if (BINANCE[id]) needBinance.push(id);
          else if (STOOQ[id] || YAHOO[id]) needStooq.push(id);
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
              .catch(() => {}),
          );
        }

        if (needStooq.length) {
          tasks.push(
            stooqQuotes(needStooq)
              .then(async (qs) => {
                const got = new Set(qs.map((q) => q.id));
                for (const q of qs) {
                  CACHE.set(q.id, { at: now, quote: q });
                  out.push(q);
                }
                // Yahoo fallback only for symbols Stooq didn't return.
                const missing = needStooq.filter((id) => !got.has(id) && YAHOO[id]);
                await Promise.all(
                  missing.map((id) =>
                    yahooQuote(id)
                      .then((q) => {
                        CACHE.set(q.id, { at: now, quote: q });
                        out.push(q);
                      })
                      .catch(() => {}),
                  ),
                );
              })
              .catch(async () => {
                // Stooq wholly failed — fall back to Yahoo per symbol.
                await Promise.all(
                  needStooq
                    .filter((id) => YAHOO[id])
                    .map((id) =>
                      yahooQuote(id)
                        .then((q) => {
                          CACHE.set(q.id, { at: now, quote: q });
                          out.push(q);
                        })
                        .catch(() => {}),
                    ),
                );
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
