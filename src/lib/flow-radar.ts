// Flow radar — the smart-money early-warning system for FX, metals, indices and
// oil. Unlike crypto, these markets have no public "whale trade" tape, so we
// infer big-player activity from the tape we DO get: a surge in futures volume,
// an expansion of range/volatility, or a break of the recent high/low. When a
// surge starts we flag it (and fire a notification) at its inception — the
// earliest actionable sign, so you can position before the move completes.

import { SYMBOLS, buildCandles, currentPrice, formatPrice, type Candle } from "./market-data";
import { atr } from "./indicators";
import { pushSignal } from "./notifications";

export type FlowKind = "volume" | "volatiliteit" | "breakout";
export type FlowEvent = {
  id: string;
  symbol: string;
  dir: "up" | "down";
  kind: FlowKind;
  score: number; // surge strength (≈ std-devs / ATR multiples)
  price: number;
  time: number;
};

const events: FlowEvent[] = [];
const heat = new Map<string, { score: number; dir: "up" | "down" }>();
const lastAlertAt = new Map<string, number>();

type Listener = (e: FlowEvent) => void;
const listeners = new Set<Listener>();

const SURGE_THRESHOLD = 2.6;
const ALERT_COOLDOWN_MS = 3 * 60_000;

let seq = 0;
const nextId = () => `flow-${Date.now().toString(36)}-${seq++}`;

function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}
function std(a: number[], m: number): number {
  if (a.length < 2) return 0;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
}

export function recentFlow(limit = 30): FlowEvent[] {
  return events.slice(0, limit);
}
export function symbolHeat(symbol: string): { score: number; dir: "up" | "down" } {
  return heat.get(symbol) ?? { score: 0, dir: "up" };
}
export function onFlow(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function analyse(sym: string, c: Candle[]): FlowEvent | null {
  if (c.length < 25) return null;
  const l = c.length - 1;
  const last = c[l];
  const prev = c[l - 1];
  const atrVal = atr(c, 14)[l] ?? 0;
  if (!atrVal) return null;

  // Volume z-score (real for futures; forex spot often has none → 0).
  const vols = c.slice(-30, -1).map((x) => x.volume);
  const mV = mean(vols);
  const sV = std(vols, mV);
  const volZ = sV > 0 && last.volume > 0 ? (last.volume - mV) / sV : 0;

  // Range / volatility expansion vs ATR.
  const rangeExp = (last.high - last.low) / atrVal;

  // Directional impulse + break of the recent 20-bar range.
  const win = c.slice(-21, -1);
  const recentHigh = Math.max(...win.map((x) => x.high));
  const recentLow = Math.min(...win.map((x) => x.low));
  const brokeUp = last.close > recentHigh;
  const brokeDown = last.close < recentLow;
  const move = (last.close - prev.close) / atrVal;

  const score = Math.max(volZ, rangeExp, Math.abs(move) * 1.2);
  const dir: "up" | "down" = last.close >= prev.close ? "up" : "down";
  heat.set(sym, { score, dir });

  const isSurge =
    score >= SURGE_THRESHOLD && (rangeExp >= 1.6 || volZ >= 2.5 || brokeUp || brokeDown);
  if (!isSurge) return null;

  let kind: FlowKind = "volatiliteit";
  if (volZ >= 2.5 && volZ >= rangeExp) kind = "volume";
  else if (brokeUp || brokeDown) kind = "breakout";

  return { id: nextId(), symbol: sym, dir, kind, score, price: last.close, time: Date.now() };
}

function kindLabel(k: FlowKind): string {
  if (k === "volume") return "volume-spike";
  if (k === "breakout") return "uitbraak";
  return "volatiliteit";
}

function fire(e: FlowEvent) {
  events.unshift(e);
  if (events.length > 80) events.pop();
  listeners.forEach((fn) => fn(e));

  const arrow = e.dir === "up" ? "▲ omhoog" : "▼ omlaag";
  pushSignal(
    `🚨 Grote ${kindLabel(e.kind)} op ${e.symbol}`,
    `${arrow} · mogelijke instap · nu ${formatPrice(e.symbol, currentPrice(e.symbol))}`,
    `flow-${e.symbol}`,
    { kind: "other", symbol: e.symbol, url: "/?tab=chart", priority: "high" },
  );
}

let started = false;
export function startFlowRadar() {
  if (started || typeof window === "undefined") return;
  started = true;
  const scan = () => {
    const now = Date.now();
    for (const s of SYMBOLS) {
      const e = analyse(s.id, buildCandles(s, "1m"));
      if (!e) continue;
      const last = lastAlertAt.get(s.id) ?? 0;
      if (now - last < ALERT_COOLDOWN_MS) continue;
      lastAlertAt.set(s.id, now);
      fire(e);
    }
  };
  scan();
  setInterval(scan, 4000);
}
