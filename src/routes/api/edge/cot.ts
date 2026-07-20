// CFTC Commitment of Traders (COT) proxy — the real "are banks stepping in or
// out" data. Every week the CFTC publishes the net futures positioning of
// commercials (producers/banks/hedgers — the smart money) vs large speculators
// (funds) for gold, oil, the currencies and the equity indices. Free, no key,
// via the CFTC public Socrata API. Best-effort + cached; failure yields an
// empty list and the client hides the panel.

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

// CFTC contract-market code → friendly label + flag. Legacy futures-only report.
const MARKETS: { code: string; label: string; flag: string }[] = [
  { code: "088691", label: "Goud (XAU)", flag: "🥇" },
  { code: "084691", label: "Zilver (XAG)", flag: "🥈" },
  { code: "067651", label: "Ruwe olie (WTI)", flag: "🛢️" },
  { code: "099741", label: "Euro (EUR)", flag: "🇪🇺" },
  { code: "096742", label: "Pond (GBP)", flag: "🇬🇧" },
  { code: "097741", label: "Yen (JPY)", flag: "🇯🇵" },
  { code: "092741", label: "Zwitserse frank (CHF)", flag: "🇨🇭" },
  { code: "090741", label: "Canadese dollar (CAD)", flag: "🇨🇦" },
  { code: "232741", label: "Aussie dollar (AUD)", flag: "🇦🇺" },
  { code: "209742", label: "Nasdaq-100", flag: "💻" },
  { code: "13874A", label: "S&P 500 (E-mini)", flag: "📈" },
];
const CODES = MARKETS.map((m) => m.code);

type CotRow = {
  code: string;
  label: string;
  flag: string;
  commercialNet: number; // banks/hedgers net (long − short)
  commercialLongPct: number; // 0..100 of commercial open interest that is long
  specNet: number; // large speculators net
  weeklyChange: number; // change in commercial net vs last week
  openInterest: number;
  reportDate: string;
};

let cache: { at: number; rows: CotRow[] } | null = null;
const TTL = 6 * 3600_000; // COT updates weekly; refresh every few hours is plenty

// Socrata field names vary slightly across mirrors; read the first present one.
function pick(obj: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    if (obj[k] != null) {
      const n = Number(obj[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

async function fetchCot(): Promise<CotRow[]> {
  const where = `cftc_contract_market_code in(${CODES.map((c) => `'${c}'`).join(",")})`;
  const url =
    "https://publicreporting.cftc.gov/resource/6dca-aqww.json" +
    `?$where=${encodeURIComponent(where)}` +
    "&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=600";
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`cftc ${res.status}`);
  const rows = (await res.json()) as Record<string, unknown>[];

  // Keep the most recent report per market code.
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const code = String(r.cftc_contract_market_code ?? "");
    if (!latest.has(code)) latest.set(code, r);
  }

  const out: CotRow[] = [];
  for (const m of MARKETS) {
    const r = latest.get(m.code);
    if (!r) continue;
    const commLong = pick(r, ["comm_positions_long_all", "commercial_long_all"]);
    const commShort = pick(r, ["comm_positions_short_all", "commercial_short_all"]);
    const ncLong = pick(r, ["noncomm_positions_long_all", "noncommercial_long_all"]);
    const ncShort = pick(r, ["noncomm_positions_short_all", "noncommercial_short_all"]);
    const chLong = pick(r, ["change_in_comm_long_all", "change_in_commercial_long"]);
    const chShort = pick(r, ["change_in_comm_short_all", "change_in_commercial_short"]);
    const oi = pick(r, ["open_interest_all", "open_interest"]);
    const total = commLong + commShort;
    out.push({
      code: m.code,
      label: m.label,
      flag: m.flag,
      commercialNet: commLong - commShort,
      commercialLongPct: total > 0 ? (commLong / total) * 100 : 50,
      specNet: ncLong - ncShort,
      weeklyChange: chLong - chShort,
      openInterest: oi,
      reportDate: String(r.report_date_as_yyyy_mm_dd ?? "").slice(0, 10),
    });
  }
  return out;
}

export const Route = createFileRoute("/api/edge/cot")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async () => {
        if (cache && Date.now() - cache.at < TTL) {
          return json({ ok: true, cached: true, rows: cache.rows });
        }
        try {
          const rows = await fetchCot();
          if (rows.length) cache = { at: Date.now(), rows };
          return json({ ok: true, cached: false, rows });
        } catch (err) {
          if (cache) return json({ ok: true, cached: true, stale: true, rows: cache.rows });
          return json({ ok: false, error: (err as Error).message, rows: [] }, 502);
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
