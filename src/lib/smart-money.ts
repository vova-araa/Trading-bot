// Smart-money engine. Two real, key-free Binance WebSocket feeds that reveal
// when size steps in or out of the crypto market:
//
//   • Whale prints  — spot @aggTrade stream, filtered to large-notional trades.
//                     Buyer-aggressor = whale BUY, seller-aggressor = whale SELL.
//   • Liquidations  — USDⓈ-M futures @forceOrder stream: leveraged traders being
//                     force-closed (long liq = capitulation, short liq = squeeze).
//
// Everything runs in the browser and degrades to nothing if the host is blocked,
// so the rest of the app is unaffected. No API key required.

const BINANCE_SYMBOL: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  SOLUSD: "SOLUSDT",
  XRPUSD: "XRPUSDT",
  DOGEUSD: "DOGEUSDT",
  AVAXUSD: "AVAXUSDT",
  LINKUSD: "LINKUSDT",
};
const BINANCE_TO_ARA: Record<string, string> = Object.fromEntries(
  Object.entries(BINANCE_SYMBOL).map(([ara, bin]) => [bin, ara]),
);

export const FLOW_MIN_USD = 10_000; // count toward net flow
export const WHALE_MIN_USD = 50_000; // show in the whale tape
export const MEGA_USD = 250_000; // highlight as a mega print
const FLOW_WINDOW_MS = 5 * 60_000; // rolling net-flow window

export type WhaleTrade = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  usd: number;
  price: number;
  qty: number;
  time: number;
  mega: boolean;
};

export type Liquidation = {
  id: string;
  symbol: string;
  side: "long" | "short"; // which side got liquidated
  usd: number;
  price: number;
  time: number;
};

type FlowEntry = { t: number; usd: number; side: "buy" | "sell" };

const whales: WhaleTrade[] = [];
const liqs: Liquidation[] = [];
const flow = new Map<string, FlowEntry[]>();

type WhaleListener = (t: WhaleTrade) => void;
type LiqListener = (l: Liquidation) => void;
const whaleListeners = new Set<WhaleListener>();
const liqListeners = new Set<LiqListener>();

let seq = 0;
const nextId = () => `sm-${Date.now().toString(36)}-${seq++}`;

function recordFlow(symbol: string, usd: number, side: "buy" | "sell", t: number) {
  const arr = flow.get(symbol) ?? [];
  arr.push({ t, usd, side });
  const cutoff = t - FLOW_WINDOW_MS;
  while (arr.length && arr[0].t < cutoff) arr.shift();
  flow.set(symbol, arr);
}

/** Net whale flow (buy − sell USD) over the rolling window for a symbol. */
export function whaleFlow(symbol: string): { buyUsd: number; sellUsd: number; net: number } {
  const arr = flow.get(symbol) ?? [];
  const cutoff = Date.now() - FLOW_WINDOW_MS;
  let buyUsd = 0;
  let sellUsd = 0;
  for (const e of arr) {
    if (e.t < cutoff) continue;
    if (e.side === "buy") buyUsd += e.usd;
    else sellUsd += e.usd;
  }
  return { buyUsd, sellUsd, net: buyUsd - sellUsd };
}

/** Aggregate net flow across all tracked crypto — the overall smart-money bias. */
export function aggregateBias(): { buyUsd: number; sellUsd: number; net: number } {
  let buyUsd = 0;
  let sellUsd = 0;
  for (const ara of Object.keys(BINANCE_SYMBOL)) {
    const f = whaleFlow(ara);
    buyUsd += f.buyUsd;
    sellUsd += f.sellUsd;
  }
  return { buyUsd, sellUsd, net: buyUsd - sellUsd };
}

export function recentWhales(limit = 40): WhaleTrade[] {
  return whales.slice(0, limit);
}
export function recentLiquidations(limit = 40): Liquidation[] {
  return liqs.slice(0, limit);
}
export function onWhale(l: WhaleListener) {
  whaleListeners.add(l);
  return () => whaleListeners.delete(l);
}
export function onLiquidation(l: LiqListener) {
  liqListeners.add(l);
  return () => liqListeners.delete(l);
}

// ── WebSocket wiring ─────────────────────────────────────────────
let started = false;
let tradeWs: WebSocket | null = null;
let liqWs: WebSocket | null = null;
let tradeRetry = 0;
let liqRetry = 0;

function connectTradeWs() {
  if (typeof window === "undefined") return;
  const streams = Object.values(BINANCE_SYMBOL)
    .map((s) => `${s.toLowerCase()}@aggTrade`)
    .join("/");
  try {
    tradeWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
  } catch {
    scheduleTradeReconnect();
    return;
  }
  tradeWs.onopen = () => {
    tradeRetry = 0;
  };
  tradeWs.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as {
        data?: { s?: string; p?: string; q?: string; m?: boolean; T?: number };
      };
      const d = msg.data;
      if (!d?.s || !d.p || !d.q) return;
      const symbol = BINANCE_TO_ARA[d.s];
      if (!symbol) return;
      const price = Number(d.p);
      const qty = Number(d.q);
      const usd = price * qty;
      if (usd < FLOW_MIN_USD) return;
      // m = buyer is maker → aggressor sold. !m → aggressor bought.
      const side: "buy" | "sell" = d.m ? "sell" : "buy";
      const time = d.T ?? Date.now();
      recordFlow(symbol, usd, side, time);
      if (usd < WHALE_MIN_USD) return;
      const t: WhaleTrade = {
        id: nextId(),
        symbol,
        side,
        usd,
        price,
        qty,
        time,
        mega: usd >= MEGA_USD,
      };
      whales.unshift(t);
      if (whales.length > 120) whales.pop();
      whaleListeners.forEach((fn) => fn(t));
    } catch {
      /* ignore malformed frame */
    }
  };
  tradeWs.onerror = () => {
    try {
      tradeWs?.close();
    } catch {
      /* noop */
    }
  };
  tradeWs.onclose = () => {
    tradeWs = null;
    if (started) scheduleTradeReconnect();
  };
}
function scheduleTradeReconnect() {
  tradeRetry = Math.min(tradeRetry + 1, 6);
  setTimeout(
    () => {
      if (started && !tradeWs) connectTradeWs();
    },
    1000 * 2 ** tradeRetry,
  );
}

function connectLiqWs() {
  if (typeof window === "undefined") return;
  const streams = Object.values(BINANCE_SYMBOL)
    .map((s) => `${s.toLowerCase()}@forceOrder`)
    .join("/");
  try {
    liqWs = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
  } catch {
    scheduleLiqReconnect();
    return;
  }
  liqWs.onopen = () => {
    liqRetry = 0;
  };
  liqWs.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as {
        data?: { o?: { s?: string; S?: string; q?: string; p?: string; T?: number } };
      };
      const o = msg.data?.o;
      if (!o?.s || !o.p || !o.q || !o.S) return;
      const symbol = BINANCE_TO_ARA[o.s];
      if (!symbol) return;
      const price = Number(o.p);
      const usd = price * Number(o.q);
      // A forced SELL closes a long; a forced BUY closes a short.
      const side: "long" | "short" = o.S === "SELL" ? "long" : "short";
      const l: Liquidation = { id: nextId(), symbol, side, usd, price, time: o.T ?? Date.now() };
      liqs.unshift(l);
      if (liqs.length > 120) liqs.pop();
      liqListeners.forEach((fn) => fn(l));
    } catch {
      /* ignore malformed frame */
    }
  };
  liqWs.onerror = () => {
    try {
      liqWs?.close();
    } catch {
      /* noop */
    }
  };
  liqWs.onclose = () => {
    liqWs = null;
    if (started) scheduleLiqReconnect();
  };
}
function scheduleLiqReconnect() {
  liqRetry = Math.min(liqRetry + 1, 6);
  setTimeout(
    () => {
      if (started && !liqWs) connectLiqWs();
    },
    1000 * 2 ** liqRetry,
  );
}

export function startSmartMoney() {
  if (started || typeof window === "undefined") return;
  started = true;
  connectTradeWs();
  connectLiqWs();
}
