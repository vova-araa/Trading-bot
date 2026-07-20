// Prediction-market proxy — the "outcome before the news". Pulls live odds from
// Polymarket's public gamma API (no key) and keeps the macro/crypto-relevant
// markets: Fed decisions, rate cuts, CPI/inflation, recession, Bitcoin/ETH
// targets, etc. Each market's price IS the crowd's probability of the outcome,
// updated continuously before the event resolves. Best-effort + cached; a
// failure just yields an empty list and the client hides the panel.

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type Prediction = {
  question: string;
  yesProb: number; // 0..1 crowd probability of "Yes"
  volumeUsd: number;
  url: string;
  endDate: string | null;
  tag: string;
};

type GammaMarket = {
  question?: string;
  slug?: string;
  outcomes?: string;
  outcomePrices?: string;
  volumeNum?: number;
  volume?: string;
  liquidityNum?: number;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
};

const KEYWORDS: { re: RegExp; tag: string }[] = [
  {
    re: /\bfed\b|fomc|powell|rate cut|rate hike|interest rate|basis points|\bbps\b/i,
    tag: "Fed / rente",
  },
  { re: /\bcpi\b|inflation|\bpce\b|core inflation/i, tag: "Inflatie" },
  { re: /recession|gdp|jobs report|unemployment|nonfarm|payroll/i, tag: "Macro" },
  { re: /bitcoin|\bbtc\b/i, tag: "Bitcoin" },
  { re: /ethereum|\beth\b/i, tag: "Ethereum" },
  { re: /gold|\bxau\b/i, tag: "Goud" },
];

function classify(q: string): string | null {
  for (const k of KEYWORDS) if (k.re.test(q)) return k.tag;
  return null;
}

let cache: { at: number; items: Prediction[] } | null = null;
const TTL = 60_000;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchPolymarket(): Promise<Prediction[]> {
  const url =
    "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=250&order=volumeNum&ascending=false";
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`polymarket ${res.status}`);
  const rows = (await res.json()) as GammaMarket[];
  const out: Prediction[] = [];
  for (const m of rows) {
    const q = m.question;
    if (!q || m.closed) continue;
    const tag = classify(q);
    if (!tag) continue;
    let prices: string[] = [];
    try {
      prices = m.outcomePrices ? (JSON.parse(m.outcomePrices) as string[]) : [];
    } catch {
      continue;
    }
    const yes = num(prices[0]);
    if (!(yes > 0 && yes < 1)) continue; // skip resolved / degenerate
    out.push({
      question: q,
      yesProb: yes,
      volumeUsd: m.volumeNum ?? num(m.volume),
      url: m.slug ? `https://polymarket.com/market/${m.slug}` : "https://polymarket.com",
      endDate: m.endDate ?? null,
      tag,
    });
  }
  out.sort((a, b) => b.volumeUsd - a.volumeUsd);
  return out.slice(0, 14);
}

export const Route = createFileRoute("/api/edge/predictions")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async () => {
        if (cache && Date.now() - cache.at < TTL) {
          return json({ ok: true, cached: true, items: cache.items });
        }
        try {
          const items = await fetchPolymarket();
          if (items.length) cache = { at: Date.now(), items };
          return json({ ok: true, cached: false, items });
        } catch (err) {
          if (cache) return json({ ok: true, cached: true, stale: true, items: cache.items });
          return json({ ok: false, error: (err as Error).message, items: [] }, 502);
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
