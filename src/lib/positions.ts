// Paper trading engine. Lets you open real, live-tracked positions straight
// from the app (chart order ticket) without touching a real broker. Each
// position marks to market on every live tick and auto-closes when it hits its
// stop-loss or take-profit. Persisted per device in localStorage.
//
// Notional model: 1.00 lot = $1,000 exposure, so P&L($) = (price/entry − 1) ×
// direction × size × 1000 — the same convention the bot engine uses.

import { currentPrice, formatPrice, onTick } from "./market-data";

export type Side = "long" | "short";
export type PositionStatus = "open" | "closed";

export type Position = {
  id: string;
  symbol: string;
  side: Side;
  size: number; // lots
  entry: number;
  sl?: number;
  tp?: number;
  openedAt: number;
  closedAt?: number;
  closePrice?: number;
  status: PositionStatus;
  closeReason?: "manual" | "sl" | "tp";
};

const KEY = "ara-positions-v1";
const EVT = "ara-positions-change";
const NOTIONAL_PER_LOT = 1000;

function load(): Position[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Position[]) : [];
  } catch {
    return [];
  }
}

let positions: Position[] = load();
const subs = new Set<(p: Position[]) => void>();

function persist() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(positions));
    } catch {
      /* quota — ignore */
    }
    window.dispatchEvent(new CustomEvent(EVT));
  }
  subs.forEach((s) => s(positions));
}

export function getPositions(): Position[] {
  return positions;
}
export function openPositionsFor(symbol?: string): Position[] {
  return positions.filter((p) => p.status === "open" && (!symbol || p.symbol === symbol));
}
export function subscribePositions(cb: (p: Position[]) => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

let idSeq = 0;
function nextId() {
  idSeq += 1;
  return `pos-${Date.now().toString(36)}-${idSeq}`;
}

/** Open a new paper position at the live price. */
export function openPosition(input: {
  symbol: string;
  side: Side;
  size: number;
  sl?: number;
  tp?: number;
}): Position {
  const entry = currentPrice(input.symbol);
  const pos: Position = {
    id: nextId(),
    symbol: input.symbol,
    side: input.side,
    size: Math.max(0.01, input.size),
    entry,
    sl: input.sl,
    tp: input.tp,
    openedAt: Date.now(),
    status: "open",
  };
  positions = [pos, ...positions].slice(0, 200);
  persist();
  return pos;
}

export function closePosition(id: string, reason: Position["closeReason"] = "manual"): void {
  positions = positions.map((p) =>
    p.id === id && p.status === "open"
      ? {
          ...p,
          status: "closed",
          closedAt: Date.now(),
          closePrice: currentPrice(p.symbol),
          closeReason: reason,
        }
      : p,
  );
  persist();
}

export function clearClosedPositions(): void {
  positions = positions.filter((p) => p.status === "open");
  persist();
}

/** Unrealised (open) or realised (closed) P&L in dollars. */
export function positionPnl(p: Position, live = currentPrice(p.symbol)): number {
  const mark = p.status === "closed" ? (p.closePrice ?? p.entry) : live;
  if (!p.entry) return 0;
  const dir = p.side === "long" ? 1 : -1;
  return (mark / p.entry - 1) * dir * p.size * NOTIONAL_PER_LOT;
}

export function positionPnlPct(p: Position, live = currentPrice(p.symbol)): number {
  const mark = p.status === "closed" ? (p.closePrice ?? p.entry) : live;
  if (!p.entry) return 0;
  const dir = p.side === "long" ? 1 : -1;
  return (mark / p.entry - 1) * dir * 100;
}

export function totalOpenPnl(live?: (id: string) => number): number {
  return openPositionsFor().reduce(
    (sum, p) => sum + positionPnl(p, live ? live(p.symbol) : currentPrice(p.symbol)),
    0,
  );
}

/** Human summary of a position, e.g. "▲ LONG 0.50 XAUUSD @ 2412.80". */
export function describePosition(p: Position): string {
  const arrow = p.side === "long" ? "▲ LONG" : "▼ SHORT";
  return `${arrow} ${p.size.toFixed(2)} ${p.symbol} @ ${formatPrice(p.symbol, p.entry)}`;
}

// ── Engine: mark-to-market + SL/TP auto-close on every live tick ──
let started = false;
export function startPositionEngine(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  onTick((symbol, price) => {
    let hit = false;
    for (const p of positions) {
      if (p.status !== "open" || p.symbol !== symbol) continue;
      if (p.side === "long") {
        if (p.sl != null && price <= p.sl) {
          closePosition(p.id, "sl");
          hit = true;
        } else if (p.tp != null && price >= p.tp) {
          closePosition(p.id, "tp");
          hit = true;
        }
      } else {
        if (p.sl != null && price >= p.sl) {
          closePosition(p.id, "sl");
          hit = true;
        } else if (p.tp != null && price <= p.tp) {
          closePosition(p.id, "tp");
          hit = true;
        }
      }
    }
    if (hit) persist();
  });
}
