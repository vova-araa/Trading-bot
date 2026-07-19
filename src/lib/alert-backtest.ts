// Backtest alert triggers on historical candles.
// Walks each candle high/low to decide if a "cross"/"above"/"below"/"near"
// level would have fired, and returns a timeline of events.

import type { Alert } from "./alerts";
import { buildHistoricalCandles, SYMBOLS, type Candle, type Timeframe } from "./market-data";

export type BacktestEvent = {
  time: number;
  alertId: string;
  level: NonNullable<Alert["levelType"]> | "custom";
  kind: Alert["kind"];
  price: number;
  hitPrice: number;
  note?: string;
};

export type BacktestResult = {
  symbol: string;
  timeframe: Timeframe;
  days: number;
  candles: Candle[];
  events: BacktestEvent[];
  perAlert: Record<string, { count: number; firstAt?: number; lastAt?: number }>;
  summary: {
    total: number;
    entryHit: number;
    tpHit: number;
    slHit: number;
    nearHit: number;
    // Best-case outcome per setup interpretation: entry then TP before SL.
    winRate?: number;
    trades?: number;
  };
};

function fires(alert: Alert, c: Candle, prevClose: number): { hit: boolean; hitPrice: number } {
  const { kind, price, proximity = 0 } = alert;
  if (kind === "above") {
    if (c.high >= price) return { hit: true, hitPrice: Math.max(prevClose, price) };
  } else if (kind === "below") {
    if (c.low <= price) return { hit: true, hitPrice: Math.min(prevClose, price) };
  } else if (kind === "cross") {
    if (c.low <= price && c.high >= price) return { hit: true, hitPrice: price };
  } else if (kind === "near") {
    // Any point inside [price-proximity, price+proximity] intersects [low,high]?
    if (c.high >= price - proximity && c.low <= price + proximity) {
      // pick closest point in candle range to `price`
      const hitPrice = Math.min(c.high, Math.max(c.low, price));
      return { hit: true, hitPrice };
    }
  }
  return { hit: false, hitPrice: 0 };
}

export function backtestAlerts(
  alerts: Alert[],
  opts: { symbol: string; timeframe?: Timeframe; days?: number } = { symbol: "" },
): BacktestResult {
  const symbol = opts.symbol || alerts[0]?.symbol;
  const timeframe: Timeframe = opts.timeframe ?? "5m";
  const days = Math.max(1, Math.min(30, opts.days ?? 7));
  const sym = SYMBOLS.find((s) => s.id === symbol);
  if (!sym) {
    return {
      symbol, timeframe, days, candles: [], events: [], perAlert: {},
      summary: { total: 0, entryHit: 0, tpHit: 0, slHit: 0, nearHit: 0 },
    };
  }
  const candles = buildHistoricalCandles(sym, timeframe, days);
  const filtered = alerts.filter((a) => a.symbol === symbol);
  const events: BacktestEvent[] = [];
  const perAlert: BacktestResult["perAlert"] = {};
  filtered.forEach((a) => (perAlert[a.id] = { count: 0 }));

  let prev = candles[0]?.open ?? 0;
  for (const c of candles) {
    for (const a of filtered) {
      const res = fires(a, c, prev);
      if (res.hit) {
        events.push({
          time: c.time,
          alertId: a.id,
          level: (a.levelType ?? "custom") as BacktestEvent["level"],
          kind: a.kind,
          price: a.price,
          hitPrice: res.hitPrice,
          note: a.note,
        });
        const p = perAlert[a.id];
        p.count += 1;
        p.firstAt = p.firstAt ?? c.time;
        p.lastAt = c.time;
      }
    }
    prev = c.close;
  }

  // Setup outcome: per group (linkedSetupId), find first entry then whether TP or SL hit first.
  const groups = new Map<string, { entry?: number; tp?: number; sl?: number }>();
  for (const a of filtered) {
    if (!a.linkedSetupId) continue;
    const g = groups.get(a.linkedSetupId) ?? {};
    groups.set(a.linkedSetupId, g);
  }
  let trades = 0;
  let wins = 0;
  for (const [gid] of groups) {
    const gEvents = events.filter((e) => filtered.find((a) => a.id === e.alertId)?.linkedSetupId === gid);
    const entryEv = gEvents.find((e) => e.level === "entry");
    if (!entryEv) continue;
    trades += 1;
    const after = gEvents.filter((e) => e.time > entryEv.time);
    const tpEv = after.find((e) => e.level === "tp");
    const slEv = after.find((e) => e.level === "sl");
    if (tpEv && (!slEv || tpEv.time <= slEv.time)) wins += 1;
  }

  const summary = {
    total: events.length,
    entryHit: events.filter((e) => e.level === "entry").length,
    tpHit: events.filter((e) => e.level === "tp").length,
    slHit: events.filter((e) => e.level === "sl").length,
    nearHit: events.filter((e) => e.level === "near-entry").length,
    trades: trades || undefined,
    winRate: trades ? (wins / trades) * 100 : undefined,
  };

  return { symbol, timeframe, days, candles, events, perAlert, summary };
}
