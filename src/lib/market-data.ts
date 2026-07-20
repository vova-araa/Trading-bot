// Market data layer. Serves REAL live data when reachable and transparently
// falls back to a deterministic simulator when it is not, behind one stable
// synchronous API so every consumer (signals, charts, alerts, bots, pump,
// portfolio) upgrades to live prices with zero changes.
//
//   • Crypto  → Binance public REST + WebSocket (CORS-friendly, no key).
//   • FX / metals / indices / futures → /api/market/{quotes,candles}, a
//     server-side proxy over Yahoo Finance (dodges CORS + provider auth).
//   • No network / blocked host → the original synthetic engine keeps the
//     whole app alive with plausible candles and ticks.

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
  { id: "XAUUSD", name: "Gold Spot", kind: "metal", price: 2412.8, vol: 1.2 },
  { id: "XAGUSD", name: "Silver Spot", kind: "metal", price: 29.84, vol: 2.4 },
  { id: "US30", name: "Dow Jones", kind: "index", price: 39804, vol: 0.8 },
  { id: "NAS100", name: "Nasdaq 100", kind: "index", price: 19420, vol: 1.1 },
  { id: "SPX500", name: "S&P 500 Futures", kind: "futures", price: 5432, vol: 0.9 },
  { id: "ES", name: "E-mini S&P Futures", kind: "futures", price: 5434, vol: 0.95 },
  { id: "NQ", name: "E-mini Nasdaq Futures", kind: "futures", price: 19425, vol: 1.2 },
  { id: "CL", name: "Crude Oil Futures", kind: "futures", price: 78.45, vol: 2.1 },
  { id: "GC", name: "Gold Futures", kind: "futures", price: 2414.5, vol: 1.3 },
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

const secondsFor = (tf: Timeframe) => TIMEFRAMES.find((t) => t.id === tf)!.seconds;

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
  const stepSigma = sym.vol / 100 / Math.sqrt(86400);
  for (let i = 0; i < count; i++) {
    // occasional macro impulse
    const shock = rnd() < 0.0008 ? (rnd() - 0.5) * sym.vol * 0.02 : 0;
    const drift = (rnd() - 0.5) * 2 * stepSigma;
    p = p * (1 + drift + shock);
    prices.push(p);
  }
  return prices;
}

/** Deterministic synthetic candles — the offline fallback. */
function syntheticCandles(
  sym: Symbol,
  tf: Timeframe,
  upTo = Math.floor(Date.now() / 1000),
): Candle[] {
  const secs = secondsFor(tf);
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
    const volume = slice.reduce(
      (v, _, i) => v + 0.5 + Math.abs((slice[i] - (slice[i - 1] ?? slice[i])) * 1e5),
      0,
    );
    candles.push({ time: t, open, high, low, close, volume });
    prevClose = close;
  }
  return candles;
}

// ────────────────────────────────────────────────────────────────
// Live data layer
// ────────────────────────────────────────────────────────────────

// Crypto has been removed — focus is FX, metals, indices and oil, all served by
// the Yahoo/Stooq proxy. The map is kept (empty) so the Binance code paths below
// simply no-op; isCrypto is always false.
const BINANCE_SYMBOL: Record<string, string> = {};
const isCrypto = (id: string) => !!BINANCE_SYMBOL[id];
const hasCrypto = Object.keys(BINANCE_SYMBOL).length > 0;

const BINANCE_INTERVAL: Record<number, string> = {
  1: "1s",
  60: "1m",
  300: "5m",
  900: "15m",
  3600: "1h",
  14400: "4h",
  86400: "1d",
};

// live price + reference (day-open) + freshness, plus a candle cache per key.
const refPrice = new Map<string, number>();
const lastLiveAt = new Map<string, number>();
const candleCache = new Map<string, { at: number; candles: Candle[] }>();
const candleInflight = new Set<string>();

const LIVE_FRESH_MS = 30_000;
const isLiveFresh = (id: string) => {
  const t = lastLiveAt.get(id);
  return t != null && Date.now() - t < LIVE_FRESH_MS;
};

const candleTtl = (secs: number, crypto: boolean) => {
  const base = secs <= 15 ? 5000 : secs < 300 ? 20000 : secs < 3600 ? 60000 : 300000;
  // Yahoo intraday (non-crypto) only refreshes ~once a minute and is easy to
  // rate-limit, so refetch far less aggressively than the Binance-backed crypto.
  return crypto ? base : Math.max(base, 45000);
};

/** Record a live price for a symbol and fan it out to tick listeners. */
function pushLivePrice(id: string, price: number, ts = Math.floor(Date.now() / 1000)) {
  if (!Number.isFinite(price) || price <= 0) return;
  const wasLive = isLiveFresh(id);
  state.set(id, price);
  lastLiveAt.set(id, Date.now());
  if (!wasLive) emitFeedStatus();
  listeners.forEach((l) => l(id, price, ts));
}

function aggregateCandles(candles: Candle[], group: number): Candle[] {
  if (group <= 1) return candles;
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

async function fetchBinanceKlines(id: string, secs: number, limit: number): Promise<Candle[]> {
  const sym = BINANCE_SYMBOL[id];
  // 5s / 15s are not native Binance intervals — pull 1s and aggregate.
  const native = BINANCE_INTERVAL[secs];
  const interval = native ?? "1s";
  const group = native ? 1 : secs; // seconds → 1s-candle count
  const want = native ? limit : Math.min(1000, limit * group);
  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${want}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const rows = (await res.json()) as unknown[][];
  const raw: Candle[] = rows.map((r) => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
  return native ? raw : aggregateCandles(raw, group).slice(-limit);
}

async function fetchProxyCandles(id: string, secs: number, limit: number): Promise<Candle[]> {
  const res = await fetch(
    `/api/market/candles?id=${encodeURIComponent(id)}&secs=${secs}&limit=${limit}`,
  );
  if (!res.ok) throw new Error(`proxy ${res.status}`);
  const json = (await res.json()) as { ok: boolean; candles?: Candle[] };
  if (!json.ok || !json.candles?.length) throw new Error("proxy empty");
  return json.candles;
}

/** Kick a background refresh of live candles for one (symbol, timeframe). */
function refreshLiveCandles(id: string, tf: Timeframe) {
  if (typeof window === "undefined" || !liveEnabled) return;
  const secs = secondsFor(tf);
  // Non-crypto sub-minute has no upstream — leave it to the simulator.
  if (!isCrypto(id) && secs < 60) return;
  const key = `${id}|${secs}`;
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < candleTtl(secs, isCrypto(id))) return;
  if (candleInflight.has(key)) return;
  candleInflight.add(key);
  const limit = 400;
  const p = isCrypto(id) ? fetchBinanceKlines(id, secs, limit) : fetchProxyCandles(id, secs, limit);
  p.then((candles) => {
    if (candles.length) {
      candleCache.set(key, { at: Date.now(), candles });
      const lastCandle = candles[candles.length - 1];
      pushLivePrice(id, lastCandle.close, lastCandle.time);
      candleListeners.forEach((l) => l(id, secs));
    }
  })
    .catch(() => {
      /* keep simulator */
    })
    .finally(() => {
      candleInflight.delete(key);
    });
}

export function buildCandles(
  sym: Symbol,
  tf: Timeframe,
  upTo = Math.floor(Date.now() / 1000),
): Candle[] {
  const secs = secondsFor(tf);
  const isNowWindow = upTo >= Math.floor(Date.now() / 1000) - 3;
  if (isNowWindow) {
    refreshLiveCandles(sym.id, tf);
    const hit = candleCache.get(`${sym.id}|${secs}`);
    if (hit && hit.candles.length) return hit.candles;
  }
  return syntheticCandles(sym, tf, upTo);
}

/** Build candles across N past days (ending at upTo). Live when a recent
 *  window is cached; deterministic synthetic otherwise. */
export function buildHistoricalCandles(
  sym: Symbol,
  tf: Timeframe,
  days: number,
  upTo = Math.floor(Date.now() / 1000),
): Candle[] {
  const secs = secondsFor(tf);
  const isNowWindow = upTo >= Math.floor(Date.now() / 1000) - 3;
  if (isNowWindow) {
    refreshLiveCandles(sym.id, tf);
    const hit = candleCache.get(`${sym.id}|${secs}`);
    if (hit && hit.candles.length > 1) return hit.candles;
  }
  const out: Candle[] = [];
  const dayStart = startOfDayUTC(upTo * 1000);
  for (let d = days - 1; d >= 0; d--) {
    const end = d === 0 ? upTo : dayStart - (d - 1) * 86400;
    out.push(...syntheticCandles(sym, tf, end));
  }
  return out;
}

// ── Live feed wiring ────────────────────────────────────────────
let liveEnabled = true;
let ws: WebSocket | null = null;
let wsRetry = 0;

const BINANCE_TO_ARA: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const [ara, bin] of Object.entries(BINANCE_SYMBOL)) (m[bin] ??= []).push(ara);
  return m;
})();

function connectBinanceWs() {
  if (typeof window === "undefined") return;
  const streams = Array.from(new Set(Object.values(BINANCE_SYMBOL)))
    .map((s) => `${s.toLowerCase()}@trade`)
    .join("/");
  try {
    ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
  } catch {
    scheduleWsReconnect();
    return;
  }
  ws.onopen = () => {
    wsRetry = 0;
    emitFeedStatus();
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as {
        data?: { s?: string; p?: string; T?: number };
      };
      const d = msg.data;
      if (!d?.s || !d.p) return;
      const price = Number(d.p);
      const ts = d.T ? Math.floor(d.T / 1000) : Math.floor(Date.now() / 1000);
      for (const ara of BINANCE_TO_ARA[d.s] ?? []) pushLivePrice(ara, price, ts);
    } catch {
      /* ignore malformed frame */
    }
  };
  ws.onerror = () => {
    try {
      ws?.close();
    } catch {
      /* noop */
    }
  };
  ws.onclose = () => {
    ws = null;
    emitFeedStatus();
    if (liveEnabled) scheduleWsReconnect();
  };
}
function scheduleWsReconnect() {
  wsRetry = Math.min(wsRetry + 1, 6);
  setTimeout(
    () => {
      if (liveEnabled && !ws) connectBinanceWs();
    },
    1000 * 2 ** wsRetry,
  );
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;
async function pollQuotes() {
  try {
    const ids = SYMBOLS.map((s) => s.id).join(",");
    const res = await fetch(`/api/market/quotes?ids=${encodeURIComponent(ids)}`);
    if (res.ok) {
      const json = (await res.json()) as {
        ok: boolean;
        quotes?: { id: string; price: number; ref: number }[];
      };
      for (const q of json.quotes ?? []) {
        if (Number.isFinite(q.ref) && q.ref > 0) refPrice.set(q.id, q.ref);
        // WebSocket owns fresh crypto prices; only fill non-crypto (or stale crypto) here.
        if (!isCrypto(q.id) || !isLiveFresh(q.id)) pushLivePrice(q.id, q.price);
      }
    }
  } catch {
    /* stay on simulator */
  }
  pollTimer = setTimeout(pollQuotes, 5000);
}

// ── Tick bus ────────────────────────────────────────────────────
type Listener = (id: string, price: number, ts: number) => void;
const listeners = new Set<Listener>();
const state = new Map<string, number>();

type CandleListener = (id: string, secs: number) => void;
const candleListeners = new Set<CandleListener>();

type FeedStatus = { connected: boolean; liveCount: number; total: number; wsOpen: boolean };
type FeedListener = (s: FeedStatus) => void;
const feedListeners = new Set<FeedListener>();

SYMBOLS.forEach((s) => state.set(s.id, s.price));

export function getFeedStatus(): FeedStatus {
  const liveCount = SYMBOLS.reduce((n, s) => n + (isLiveFresh(s.id) ? 1 : 0), 0);
  return {
    connected: liveCount > 0,
    liveCount,
    total: SYMBOLS.length,
    wsOpen: !!ws && ws.readyState === 1,
  };
}
let lastStatusKey = "";
function emitFeedStatus() {
  const s = getFeedStatus();
  const key = `${s.liveCount}|${s.wsOpen}`;
  if (key === lastStatusKey) return;
  lastStatusKey = key;
  feedListeners.forEach((l) => l(s));
}
export function onFeedStatus(l: FeedListener) {
  feedListeners.add(l);
  l(getFeedStatus());
  return () => feedListeners.delete(l);
}
export function onLiveCandles(l: CandleListener) {
  candleListeners.add(l);
  return () => candleListeners.delete(l);
}

/** Is this symbol currently driven by real live data? */
export function symbolSource(id: string): "live" | "sim" {
  return isLiveFresh(id) ? "live" : "sim";
}

/** Percent change since the reference (day-open) price. */
export function dayChangePct(id: string): number {
  const price = state.get(id);
  if (price == null) return 0;
  const ref = refPrice.get(id);
  if (ref && ref > 0) return ((price - ref) / ref) * 100;
  const base = SYMBOLS.find((s) => s.id === id)?.price;
  return base ? ((price - base) / base) * 100 : 0;
}

let started = false;
export function startTickStream() {
  if (started || typeof window === "undefined") return;
  started = true;

  // 1) Simulator drives every symbol immediately; it steps aside per-symbol the
  //    moment real data starts flowing (isLiveFresh), and resumes if it stops.
  SYMBOLS.forEach((s) => {
    const stepSigma = s.vol / 100 / Math.sqrt(86400);
    const rnd = mulberry32(seedFor(s.id) + Math.floor(Date.now() / 1000));
    const tick = () => {
      if (!isLiveFresh(s.id)) {
        const cur = state.get(s.id)!;
        const drift = (rnd() - 0.5) * 2 * stepSigma;
        const shock = rnd() < 0.005 ? (rnd() - 0.5) * s.vol * 0.008 : 0;
        const next = cur * (1 + drift + shock);
        state.set(s.id, next);
        const ts = Math.floor(Date.now() / 1000);
        listeners.forEach((l) => l(s.id, next, ts));
      }
      setTimeout(tick, 250 + Math.random() * 550);
    };
    setTimeout(tick, Math.random() * 800);
  });

  // 2) Bring the real feed online (no-ops gracefully if the network blocks it).
  if (liveEnabled) {
    if (hasCrypto) connectBinanceWs();
    void pollQuotes();
    // Warm the default 1m candle cache so signals/scanner go live fast. Crypto
    // (Binance) can all fire at once; non-crypto (Yahoo) is staggered so we
    // never burst ~19 requests at a rate-limit-prone host on the same tick.
    let delay = 0;
    SYMBOLS.forEach((s) => {
      if (isCrypto(s.id)) {
        refreshLiveCandles(s.id, "1m");
      } else {
        setTimeout(() => refreshLiveCandles(s.id, "1m"), delay);
        delay += 250;
      }
    });
  }
}

/** Force the app onto the deterministic simulator (used by tests/offline). */
export function disableLiveFeed() {
  liveEnabled = false;
  try {
    ws?.close();
  } catch {
    /* noop */
  }
  ws = null;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
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
