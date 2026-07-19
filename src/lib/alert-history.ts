// Persistent log of every alarm trigger with the exact price condition that fired it.
import { formatPrice } from "./market-data";
import type { Alert } from "./alerts";

export type HistoryEntry = {
  id: string;
  at: number; // ms epoch
  alertId: string;
  symbol: string;
  kind: Alert["kind"];
  levelType?: Alert["levelType"];
  target: number;
  price: number; // live price at trigger
  proximity?: number;
  prevPrice?: number; // for "cross"
  linkedSetupId?: string;
  note?: string;
  reason: string; // human-readable condition
};

const KEY = "ara-alert-history-v1";
const MAX = 500;
type Listener = (h: HistoryEntry[]) => void;
const listeners = new Set<Listener>();
let cache: HistoryEntry[] = load();

function load(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save() {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(cache));
  listeners.forEach((l) => l(cache.slice()));
}

export function getHistory() { return cache.slice(); }
export function subscribeHistory(l: Listener) {
  listeners.add(l); l(cache.slice()); return () => listeners.delete(l);
}
export function clearHistory() { cache = []; save(); }
export function removeHistoryEntry(id: string) {
  cache = cache.filter((h) => h.id !== id); save();
}

function reasonFor(alert: Alert, price: number, prevPrice?: number): string {
  const p = formatPrice(alert.symbol, price);
  const t = formatPrice(alert.symbol, alert.price);
  switch (alert.kind) {
    case "above":
      return `Prijs ${p} ≥ target ${t} (boven)`;
    case "below":
      return `Prijs ${p} ≤ target ${t} (onder)`;
    case "cross": {
      const dir = prevPrice !== undefined
        ? prevPrice < alert.price ? "van onder ↗ naar boven" : "van boven ↘ naar onder"
        : "kruiste";
      return `Prijs ${dir} target ${t} (nu ${p})`;
    }
    case "near": {
      const dist = Math.abs(price - alert.price);
      const prox = alert.proximity ?? 0;
      return `Prijs ${p} binnen ± ${formatPrice(alert.symbol, prox)} van ${t} (afstand ${formatPrice(alert.symbol, dist)})`;
    }
  }
}

export function logTrigger(alert: Alert, price: number, prevPrice?: number): HistoryEntry {
  const entry: HistoryEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    alertId: alert.id,
    symbol: alert.symbol,
    kind: alert.kind,
    levelType: alert.levelType,
    target: alert.price,
    price,
    proximity: alert.proximity,
    prevPrice,
    linkedSetupId: alert.linkedSetupId,
    note: alert.note,
    reason: reasonFor(alert, price, prevPrice),
  };
  cache = [entry, ...cache].slice(0, MAX);
  save();
  return entry;
}
