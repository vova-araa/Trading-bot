// Realtime market data simulator. Deterministic seed per symbol so
// backfilled candles align with live ticks. Generates data from 00:00 UTC
// today to the current second, then streams new ticks every 250-800ms.

export type Symbol = {
  id: string;
  name: string;
  kind: "forex" | "crypto" | "index" | "metal" | "futures";
  price: number;
  vol: number; // baseline daily vol pct
};

export const SYMBOLS: Symbol[] = [
  { id: "EURUSD", name: "Euro / US Dollar", kind: "forex", price: 1.0842, vol: 0.6 },
  { id: "GBPUSD", name: "British Pound / USD", kind: "forex", price: 1.2731, vol: 0.7 },
  { id: "USDJPY", name: "US Dollar / Yen", kind: "forex", price: 157.28, vol: 0.75 },
  { id: "AUDUSD", name: "Aussie / USD", kind: "forex", price: 0.6612, vol: 0.85 },
  { id: "USDCAD", name: "US Dollar / CAD", kind: "forex", price: 1.3684, vol: 0.55 },
  { id: "NZDUSD", name: "Kiwi / USD", kind: "forex", price: 0.6091, vol: 0.9 },
  { id: "USDCHF", name: "US Dollar / Swiss", kind: "forex", price: 0.9042, vol: 0.5 },
  { id: "EURJPY", name: "Euro / Yen", kind: "forex", price: 170.51, vol: 0.8 },
  { id: "GBPJPY", name: "Pound / Yen", kind: "forex", price: 200.24, vol: 1.1 },
  { id: "BTCUSD", name: "Bitcoin", kind: "crypto", price: 67420, vol: 3.2 },
  { id: "ETHUSD", name: "Ethereum", kind: "crypto", price: 3512, vol: 3.8 },
  { id: "SOLUSD", name: "Solana", kind: "crypto", price: 168.4, vol: 5.5 },
  { id: "XRPUSD", name: "Ripple", kind: "crypto", price: 0.612, vol: 4.4 },
  { id: "DOGEUSD", name: "Dogecoin", kind: "crypto", price: 0.152, vol: 6.8 },
  { id: "AVAXUSD", name: "Avalanche", kind: "crypto", price: 34.8, vol: 5.9 },
  { id: "LINKUSD", name: "Chainlink", kind: "crypto", price: 14.6, vol: 5.2 },
  { id: "XAUUSD", name: "Gold Spot", kind: "metal", price: 2412.8, vol: 1.2 },
  { id: "XAGUSD", name: "Silver Spot", kind: "metal", price: 29.84, vol: 2.4 },
  { id: "US30", name: "Dow Jones", kind: "index", price: 39804, vol: 0.8 },
  { id: "NAS100", name: "Nasdaq 100", kind: "index", price: 19420, vol: 1.1 },
  { id: "SPX500", name: "S&P 500 Futures", kind: "futures", price: 5432, vol: 0.9 },
  { id: "ES", name: "E-mini S&P Futures", kind: "futures", price: 5434, vol: 0.95 },
  { id: "NQ", name: "E-mini Nasdaq Futures", kind: "futures", price: 19425, vol: 1.2 },
  { id: "CL", name: "Crude Oil Futures", kind: "futures", price: 78.45, vol: 2.1 },
  { id: "GC", name: "Gold Futures", kind: "futures", price: 2414.5, vol: 1.3 },
  { id: "BTCPERP", name: "Bitcoin Perpetual", kind: "futures", price: 67450, vol: 3.4 },
  { id: "ETHPERP", name: "Ethereum Perpetual", kind: "futures", price: 3514, vol: 4.0 },
];

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Timeframe = "1s" | "5s" | "15s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export const TIMEFRAMES: { id: Timeframe; label: string; seconds: number }[] = [
  { id: "1s", label: "1s", seconds: 1 },
  { id: "5s", label: "5s", seconds: 5 },
  { id: "15s", label: "15s", seconds: 15 },
  { id: "1m", label: "1m", seconds: 60 },
  { id: "5m", label: "5m", seconds: 300 },
  { id: "15m", label: "15m", seconds: 900 },
  { id: "1h", label: "1H", seconds: 3600 },
  { id: "4h", label: "4H", seconds: 14400 },
  { id: "1d", label: "1D", seconds: 86400 },
];

// Deterministic PRNG
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFor(sym: string) {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

function startOfDayUTC(now = Date.now()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** Build a synthetic tick stream from 00:00 UTC → now (1 tick per second). */
function ticksForToday(sym: Symbol, upTo: number): number[] {
  const start = startOfDayUTC(upTo * 1000);
  const seed = seedFor(sym.id + start);
  const rnd = mulberry32(seed);
  const count = Math.max(1, upTo - start);
  const prices: number[] = [];
  let p = sym.price;
  // per-second drift ≈ vol% / sqrt(86400)
  const stepSigma = (sym.vol / 100) / Math.sqrt(86400);
  for (let i = 0; i < count; i++) {
    // occasional macro impulse
    const shock = rnd() < 0.0008 ? (rnd() - 0.5) * sym.vol * 0.02 : 0;
    const drift = (rnd() - 0.5) * 2 * stepSigma;
    p = p * (1 + drift + shock);
    prices.push(p);
  }
  return prices;
}

export function buildCandles(sym: Symbol, tf: Timeframe, upTo = Math.floor(Date.now() / 1000)): Candle[] {
  const secs = TIMEFRAMES.find((t) => t.id === tf)!.seconds;
  const start = startOfDayUTC(upTo * 1000);
  const ticks = ticksForToday(sym, upTo);
  const candles: Candle[] = [];
  let prevClose = sym.price;
  for (let t = start; t < upTo; t += secs) {
    const from = t - start;
    const to = Math.min(from + secs, ticks.length);
    if (from >= ticks.length) break;
    const slice = ticks.slice(from, to);
    if (!slice.length) continue;
    const open = candles.length ? prevClose : slice[0];
    const close = slice[slice.length - 1];
    const high = Math.max(open, ...slice);
    const low = Math.min(open, ...slice);
    const volume = slice.reduce((v, _, i) => v + 0.5 + Math.abs((slice[i] - (slice[i - 1] ?? slice[i])) * 1e5), 0);
    candles.push({ time: t, open, high, low, close, volume });
    prevClose = close;
  }
  return candles;
}

/** Build candles across N past days (ending at upTo). Deterministic per symbol/day. */
export function buildHistoricalCandles(
  sym: Symbol,
  tf: Timeframe,
  days: number,
  upTo = Math.floor(Date.now() / 1000),
): Candle[] {
  const out: Candle[] = [];
  const dayStart = startOfDayUTC(upTo * 1000);
  for (let d = days - 1; d >= 0; d--) {
    const end = d === 0 ? upTo : dayStart - (d - 1) * 86400;
    const dayCandles = buildCandles(sym, tf, end);
    out.push(...dayCandles);
  }
  return out;
}

/** Global tick bus: emits new price for every symbol on a randomized cadence. */
type Listener = (id: string, price: number, ts: number) => void;
const listeners = new Set<Listener>();
const state = new Map<string, number>();

SYMBOLS.forEach((s) => state.set(s.id, s.price));

let started = false;
export function startTickStream() {
  if (started || typeof window === "undefined") return;
  started = true;
  SYMBOLS.forEach((s) => {
    const stepSigma = (s.vol / 100) / Math.sqrt(86400);
    const rnd = mulberry32(seedFor(s.id) + Math.floor(Date.now() / 1000));
    const tick = () => {
      const cur = state.get(s.id)!;
      const drift = (rnd() - 0.5) * 2 * stepSigma;
      const shock = rnd() < 0.005 ? (rnd() - 0.5) * s.vol * 0.008 : 0;
      const next = cur * (1 + drift + shock);
      state.set(s.id, next);
      const ts = Math.floor(Date.now() / 1000);
      listeners.forEach((l) => l(s.id, next, ts));
      setTimeout(tick, 250 + Math.random() * 550);
    };
    setTimeout(tick, Math.random() * 800);
  });
}

export function onTick(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function currentPrice(id: string): number {
  return state.get(id) ?? SYMBOLS.find((s) => s.id === id)?.price ?? 0;
}

export function formatPrice(id: string, p: number) {
  const s = SYMBOLS.find((x) => x.id === id);
  if (!s) return p.toFixed(2);
  if (s.kind === "crypto" && p > 1000) return p.toFixed(1);
  if (s.kind === "crypto" && p < 1) return p.toFixed(4);
  if (s.kind === "crypto") return p.toFixed(2);
  if (s.kind === "index") return p.toFixed(1);
  if (s.kind === "futures" && p > 1000) return p.toFixed(1);
  if (s.kind === "futures") return p.toFixed(2);
  if (s.kind === "metal") return p.toFixed(2);
  if (s.id.includes("JPY")) return p.toFixed(3);
  return p.toFixed(5);
}
