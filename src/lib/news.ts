// Economic calendar + news + pre-release "nowcast" predictions.
// Inspired by ForexFactory (calendar), Investing.com (whisper numbers),
// Atlanta Fed GDPNow (nowcast), Cleveland Fed Inflation Nowcast,
// Kalshi / Polymarket (event markets), Truflation (real-time CPI).
// Deterministic per-day so numbers stay stable across reloads.

export type Impact = "high" | "medium" | "low";

export type Prediction = {
  value: string;            // e.g. "+185K" or "3.2%"
  source: "GDPNow (Atlanta Fed)" | "Cleveland Fed Nowcast" | "Truflation Live" | "Kalshi Markets" | "Polymarket" | "Reuters Poll" | "Bloomberg Whisper" | "ARA AI Nowcast";
  confidence: number;        // 0..1
  bias: "hawkish" | "dovish" | "neutral";
  updatedMinAgo: number;
};

export type NewsItem = {
  id: string;
  time: number;              // unix seconds
  currency: string;
  country: string;           // flag emoji
  title: string;
  impact: Impact;
  actual?: string;
  forecast?: string;         // official consensus
  previous?: string;
  prediction?: Prediction;   // pre-release nowcast / whisper number
  source: "ForexFactory" | "Reuters" | "Bloomberg" | "DailyFX" | "Investing.com" | "TradingEconomics";
  explain?: string;          // 1 sentence: "why traders care"
};

type Tpl = { title: string; currency: string; country: string; impact: Impact; unit: string; explain: string; nowcastSrc: Prediction["source"] };

const TEMPLATES: Tpl[] = [
  { title: "Non-Farm Payrolls",       currency: "USD", country: "🇺🇸", impact: "high",   unit: "K", explain: "Aantal nieuwe banen in de VS. Sterk = dollar omhoog, goud omlaag.", nowcastSrc: "ARA AI Nowcast" },
  { title: "CPI m/m",                 currency: "USD", country: "🇺🇸", impact: "high",   unit: "%", explain: "Inflatie. Hoger dan verwacht = Fed blijft streng = dollar omhoog.", nowcastSrc: "Cleveland Fed Nowcast" },
  { title: "Core CPI y/y",            currency: "USD", country: "🇺🇸", impact: "high",   unit: "%", explain: "Kerninflatie zonder voedsel/energie. De belangrijkste voor de Fed.", nowcastSrc: "Truflation Live" },
  { title: "FOMC Statement",          currency: "USD", country: "🇺🇸", impact: "high",   unit: "",  explain: "Rentebesluit Fed. Verandert alles op de markt.", nowcastSrc: "Kalshi Markets" },
  { title: "GDP q/q (Advance)",       currency: "USD", country: "🇺🇸", impact: "high",   unit: "%", explain: "Economische groei. GDPNow van Atlanta Fed geeft dit live weer.", nowcastSrc: "GDPNow (Atlanta Fed)" },
  { title: "Retail Sales m/m",        currency: "USD", country: "🇺🇸", impact: "medium", unit: "%", explain: "Consumentenuitgaven. Beweegt de dollar op korte termijn.", nowcastSrc: "Bloomberg Whisper" },
  { title: "Unemployment Claims",     currency: "USD", country: "🇺🇸", impact: "medium", unit: "K", explain: "Wekelijkse werkloosheidsaanvragen. Snelle indicator arbeidsmarkt.", nowcastSrc: "Reuters Poll" },
  { title: "ECB Rate Decision",       currency: "EUR", country: "🇪🇺", impact: "high",   unit: "%", explain: "Rentebesluit ECB. Beweegt EUR/USD stevig.", nowcastSrc: "Kalshi Markets" },
  { title: "Eurozone CPI Flash y/y",  currency: "EUR", country: "🇪🇺", impact: "high",   unit: "%", explain: "Voorlopige inflatie eurozone. Bepaalt ECB richting.", nowcastSrc: "Truflation Live" },
  { title: "German ZEW Sentiment",    currency: "EUR", country: "🇩🇪", impact: "medium", unit: "",  explain: "Vertrouwen Duitse investeerders.", nowcastSrc: "Reuters Poll" },
  { title: "BOE Rate Decision",       currency: "GBP", country: "🇬🇧", impact: "high",   unit: "%", explain: "Rentebesluit Bank of England.", nowcastSrc: "Kalshi Markets" },
  { title: "UK CPI y/y",              currency: "GBP", country: "🇬🇧", impact: "high",   unit: "%", explain: "Inflatie VK. Trigger voor GBP/USD en EUR/GBP.", nowcastSrc: "Bloomberg Whisper" },
  { title: "BOJ Policy Statement",    currency: "JPY", country: "🇯🇵", impact: "high",   unit: "",  explain: "Beleid Japanse centrale bank. Yen kan hard bewegen.", nowcastSrc: "Reuters Poll" },
  { title: "Tokyo Core CPI",          currency: "JPY", country: "🇯🇵", impact: "medium", unit: "%", explain: "Vroege indicator inflatie Japan.", nowcastSrc: "Bloomberg Whisper" },
  { title: "RBA Cash Rate",           currency: "AUD", country: "🇦🇺", impact: "high",   unit: "%", explain: "Rentebesluit Australië.", nowcastSrc: "Kalshi Markets" },
  { title: "SNB Rate Decision",       currency: "CHF", country: "🇨🇭", impact: "high",   unit: "%", explain: "Rentebesluit Zwitserland.", nowcastSrc: "Reuters Poll" },
  { title: "BOC Overnight Rate",      currency: "CAD", country: "🇨🇦", impact: "high",   unit: "%", explain: "Rentebesluit Canada. Beweegt USD/CAD + olie-gerelateerde pairs.", nowcastSrc: "Kalshi Markets" },
  { title: "Crude Oil Inventories",   currency: "USD", country: "🛢️", impact: "medium", unit: "M", explain: "Wekelijkse olievoorraden VS. Directe impact op olie & CAD.", nowcastSrc: "Bloomberg Whisper" },
  { title: "PPI m/m",                 currency: "USD", country: "🇺🇸", impact: "medium", unit: "%", explain: "Producentenprijzen — vroege signaal voor CPI.", nowcastSrc: "Reuters Poll" },
  { title: "ISM Manufacturing PMI",   currency: "USD", country: "🇺🇸", impact: "medium", unit: "",  explain: "Industrie-activiteit VS. >50 = groei.", nowcastSrc: "ARA AI Nowcast" },
];

const HEADLINES = [
  { s: "Reuters",       t: "Fed's Powell signals patience on rate cuts amid sticky services inflation" },
  { s: "Bloomberg",     t: "Dollar edges lower as traders trim bets on hawkish Fed path" },
  { s: "DailyFX",       t: "EUR/USD probes 1.0850 as ECB dovish signals grow" },
  { s: "Investing.com", t: "BTC breaks $68K as ETF inflows accelerate to weekly high" },
  { s: "Reuters",       t: "Gold steadies near record as yields retreat, geopolitics support bid" },
  { s: "Bloomberg",     t: "Yen slides past 157 vs dollar; MoF intervention chatter intensifies" },
  { s: "DailyFX",       t: "GBP/JPY carry trade back in vogue as BOJ stands pat" },
  { s: "Investing.com", t: "Oil jumps 2% on OPEC+ output cut extension speculation" },
  { s: "Reuters",       t: "Nasdaq 100 futures pop after Nvidia guides Q3 above consensus" },
  { s: "Bloomberg",     t: "Kalshi traders price 68% odds of a 25bp cut at next FOMC" },
  { s: "Investing.com", t: "GDPNow model raises Q3 growth estimate to 3.4% after retail data" },
] as const;

function seeded(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
function startOfDayUTC(ts: number) { const d = new Date(ts); d.setUTCHours(0, 0, 0, 0); return d; }

function eventsForDay(dayTs: number, count = 8): NewsItem[] {
  const day = startOfDayUTC(dayTs);
  const seed = Math.floor(day.getTime() / 86400000);
  const rnd = seeded(seed);
  const picks = [...TEMPLATES].sort(() => rnd() - 0.5).slice(0, count);
  const nowSec = Math.floor(Date.now() / 1000);

  return picks.map((t, i) => {
    const hour = 7 + Math.floor(rnd() * 13);
    const min = [0, 15, 30, 45][Math.floor(rnd() * 4)];
    const time = Math.floor(day.getTime() / 1000) + hour * 3600 + min * 60;

    const prevN = rnd() * 5;
    const fcN = prevN + (rnd() - 0.5);
    const prev = prevN.toFixed(t.unit === "%" ? 1 : 0);
    const fc = fcN.toFixed(t.unit === "%" ? 1 : 0);

    // Pre-release nowcast — slightly different from official forecast
    const predN = fcN + (rnd() - 0.5) * 0.4;
    const diff = predN - fcN;
    const bias: Prediction["bias"] = Math.abs(diff) < 0.05 ? "neutral" : diff > 0 ? "hawkish" : "dovish";
    const prediction: Prediction = {
      value: `${predN.toFixed(t.unit === "%" ? 1 : 0)}${t.unit}`,
      source: t.nowcastSrc,
      confidence: 0.55 + rnd() * 0.4,
      bias,
      updatedMinAgo: Math.floor(rnd() * 45) + 2,
    };

    const released = time < nowSec;
    const actN = released ? fcN + (rnd() - 0.5) * 0.6 : undefined;
    const actual = actN !== undefined ? `${actN.toFixed(t.unit === "%" ? 1 : 0)}${t.unit}` : undefined;

    return {
      id: `cal-${seed}-${i}`,
      time,
      currency: t.currency,
      country: t.country,
      title: t.title,
      impact: t.impact,
      previous: `${prev}${t.unit}`,
      forecast: `${fc}${t.unit}`,
      actual,
      prediction: released ? undefined : prediction,
      source: "ForexFactory" as const,
      explain: t.explain,
    };
  }).sort((a, b) => a.time - b.time);
}

export function getEconomicCalendar(now = Date.now()): NewsItem[] {
  return eventsForDay(now);
}

/** Multi-day calendar: yesterday, today, tomorrow, +2, +3, +4, +5, +6 */
export function getWeekCalendar(now = Date.now()): { day: number; items: NewsItem[] }[] {
  const today = startOfDayUTC(now).getTime();
  const offsets = [-1, 0, 1, 2, 3, 4, 5, 6];
  return offsets.map((o) => {
    const d = today + o * 86400_000;
    return { day: d, items: eventsForDay(d, o === 0 ? 9 : 6) };
  });
}

export function getHeadlines(now = Date.now()): NewsItem[] {
  const day = startOfDayUTC(now);
  const seed = Math.floor(day.getTime() / 86400000) + 7;
  const rnd = seeded(seed);
  return HEADLINES.map((h, i) => ({
    id: `hl-${seed}-${i}`,
    time: Math.floor(day.getTime() / 1000) + Math.floor(rnd() * (Date.now() / 1000 - day.getTime() / 1000)),
    currency: "-",
    country: "🌍",
    title: h.t,
    impact: (rnd() > 0.6 ? "high" : "medium") as Impact,
    source: h.s as NewsItem["source"],
  })).sort((a, b) => b.time - a.time);
}

/** Next unreleased event across today+tomorrow, respecting impact filter. */
export function getNextEvent(now = Date.now(), minImpact: Impact = "low"): NewsItem | undefined {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const week = getWeekCalendar(now).flatMap((d) => d.items);
  const nowSec = Math.floor(now / 1000);
  return week.find((e) => e.time > nowSec && rank[e.impact] >= rank[minImpact]);
}

export function formatCountdown(secondsUntil: number): string {
  if (secondsUntil <= 0) return "NU LIVE";
  const d = Math.floor(secondsUntil / 86400);
  const h = Math.floor((secondsUntil % 86400) / 3600);
  const m = Math.floor((secondsUntil % 3600) / 60);
  const s = secondsUntil % 60;
  if (d > 0) return `${d}d ${h}u ${m}m`;
  if (h > 0) return `${h}u ${m}m ${s.toString().padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

// ────────────────────────────────────────────────────────────────
// Nowcast timeline: hoe de pre-release voorspelling evolueert van
// de eerste bron (T-72h) tot de laatste update (T-15m) vlak vóór release.
// ────────────────────────────────────────────────────────────────

export type NowcastSnapshot = {
  time: number;
  minutesBeforeRelease: number;
  source: Prediction["source"];
  value: string;
  bias: Prediction["bias"];
  confidence: number;
  delta: number;      // wijziging vs vorige snapshot (in event unit)
  isFinal: boolean;   // laatste snapshot vóór release
};

/** Deterministische reeks nowcast-updates voor één event. */
export function getNowcastTimeline(item: NewsItem, now = Date.now()): NowcastSnapshot[] {
  if (!item.forecast) return [];
  const unit = item.forecast.replace(/[0-9.\-]/g, "");
  const forecastN = parseFloat(item.forecast) || 0;
  const finalN = item.prediction ? parseFloat(item.prediction.value) || forecastN : forecastN;

  const chain: { minsBefore: number; source: Prediction["source"]; confBase: number }[] = [
    { minsBefore: 72 * 60, source: "Reuters Poll",           confBase: 0.35 },
    { minsBefore: 48 * 60, source: "Bloomberg Whisper",      confBase: 0.45 },
    { minsBefore: 24 * 60, source: item.prediction?.source ?? "ARA AI Nowcast", confBase: 0.55 },
    { minsBefore: 12 * 60, source: "GDPNow (Atlanta Fed)",   confBase: 0.62 },
    { minsBefore:  6 * 60, source: "Kalshi Markets",         confBase: 0.70 },
    { minsBefore:  3 * 60, source: "Polymarket",             confBase: 0.76 },
    { minsBefore:  1 * 60, source: "ARA AI Nowcast",         confBase: 0.85 },
    { minsBefore:      15, source: "ARA AI Nowcast",         confBase: 0.92 },
  ];

  const seed = (Math.floor(item.time / 60) ^ item.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) >>> 0;
  const rnd = seeded(seed);
  const nowSec = Math.floor(now / 1000);
  const isDecimal = unit === "%";

  let prev = forecastN;
  const snaps: NowcastSnapshot[] = [];
  chain.forEach((step, i) => {
    const time = item.time - step.minsBefore * 60;
    if (time > nowSec) return;
    const progress = 1 - step.minsBefore / (72 * 60);
    const target = forecastN + (finalN - forecastN) * progress;
    const noise = (rnd() - 0.5) * 0.35 * (1 - progress);
    const value = target + noise;
    const delta = value - prev;
    const bias: Prediction["bias"] =
      Math.abs(value - forecastN) < 0.05 ? "neutral" : value > forecastN ? "hawkish" : "dovish";
    snaps.push({
      time,
      minutesBeforeRelease: step.minsBefore,
      source: step.source,
      value: `${value.toFixed(isDecimal ? 1 : 0)}${unit}`,
      bias,
      confidence: Math.min(0.98, step.confBase + (rnd() - 0.5) * 0.08),
      delta: Number(delta.toFixed(isDecimal ? 2 : 0)),
      isFinal: i === chain.length - 1,
    });
    prev = value;
  });
  return snaps;
}
