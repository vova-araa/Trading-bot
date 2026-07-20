// Live news + market-sentiment proxy. Pulls real, key-free sources server-side
// (dodging CORS) and normalises them:
//   • Crypto Fear & Greed  → alternative.me
//   • Global crypto stats   → CoinGecko (market cap, BTC dominance, 24h change)
//   • Headlines             → CoinDesk + FXStreet RSS (crypto + macro/forex)
// Every source is best-effort; a failure just omits that slice and the client
// keeps its built-in economic calendar. Short in-memory cache respects limits.

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type Headline = { title: string; url: string; source: string; time: number };
type FeedPayload = {
  fng?: { value: number; label: string };
  global?: { mcapUsd: number; btcDominance: number; change24h: number };
  headlines: Headline[];
};

let cache: { at: number; payload: FeedPayload } | null = null;
const TTL = 60_000;

async function fearGreed(): Promise<FeedPayload["fng"]> {
  const res = await fetch("https://api.alternative.me/fng/?limit=1", {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`fng ${res.status}`);
  const j = (await res.json()) as { data?: Array<{ value: string; value_classification: string }> };
  const d = j.data?.[0];
  if (!d) throw new Error("fng empty");
  return { value: Number(d.value), label: d.value_classification };
}

async function coingeckoGlobal(): Promise<FeedPayload["global"]> {
  const res = await fetch("https://api.coingecko.com/api/v3/global", {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`cg ${res.status}`);
  const j = (await res.json()) as {
    data?: {
      total_market_cap?: { usd?: number };
      market_cap_percentage?: { btc?: number };
      market_cap_change_percentage_24h_usd?: number;
    };
  };
  const d = j.data;
  if (!d?.total_market_cap?.usd) throw new Error("cg empty");
  return {
    mcapUsd: d.total_market_cap.usd,
    btcDominance: d.market_cap_percentage?.btc ?? 0,
    change24h: d.market_cap_change_percentage_24h_usd ?? 0,
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

async function rss(url: string, source: string, limit: number): Promise<Headline[]> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", accept: "application/rss+xml,text/xml" },
  });
  if (!res.ok) throw new Error(`${source} ${res.status}`);
  const xml = await res.text();
  const items = xml.match(/<item[\s\S]*?<\/item>/g) ?? [];
  const out: Headline[] = [];
  for (const item of items.slice(0, limit)) {
    const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const date = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    if (!title || !link) continue;
    const t = date ? Date.parse(decodeEntities(date)) : Number.NaN;
    out.push({
      title: decodeEntities(title),
      url: decodeEntities(link),
      source,
      time: Number.isFinite(t) ? Math.floor(t / 1000) : 0,
    });
  }
  return out;
}

export const Route = createFileRoute("/api/news/feed")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async () => {
        if (cache && Date.now() - cache.at < TTL) {
          return json({ ok: true, cached: true, ...cache.payload });
        }

        const [fng, global, coindesk, fxstreet] = await Promise.allSettled([
          fearGreed(),
          coingeckoGlobal(),
          rss("https://www.coindesk.com/arc/outboundfeeds/rss/", "CoinDesk", 8),
          rss("https://www.fxstreet.com/rss/news", "FXStreet", 8),
        ]);

        const headlines = [
          ...(coindesk.status === "fulfilled" ? coindesk.value : []),
          ...(fxstreet.status === "fulfilled" ? fxstreet.value : []),
        ]
          .sort((a, b) => b.time - a.time)
          .slice(0, 14);

        const payload: FeedPayload = {
          fng: fng.status === "fulfilled" ? fng.value : undefined,
          global: global.status === "fulfilled" ? global.value : undefined,
          headlines,
        };

        // Only cache if we got something real, so a transient outage self-heals.
        if (payload.fng || payload.global || payload.headlines.length) {
          cache = { at: Date.now(), payload };
        }
        return json({ ok: true, cached: false, ...payload });
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
