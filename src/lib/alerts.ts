// Price alerts engine — inspired by TradingView, Tickerly, Bybit & Binance alerts.
// Fires a notification + sound + haptic when a symbol crosses a target price or
// gets within a "near" proximity of an entry (pre-entry warning).
//
// Persisted in localStorage so alerts survive reloads.

import { currentPrice, formatPrice, onTick, SYMBOLS } from "./market-data";
import { pushSignal } from "./notifications";
import { previewCombo, type SoundPreset, type VibratePreset } from "./alert-sound";
import { logTrigger } from "./alert-history";

export type AlertKind = "above" | "below" | "near" | "cross";
export type AlertStatus = "armed" | "triggered" | "paused";
export type AlertPriority = "low" | "normal" | "high";

export type Alert = {
  id: string;
  symbol: string;
  kind: AlertKind;
  price: number;
  /** For "near": trigger when |live - price| <= proximity (absolute). */
  proximity?: number;
  /** Human note, e.g. "Entry EURUSD long". */
  note?: string;
  /** Optional take profit / stop that spawned this alert. */
  linkedSetupId?: string;
  /** Which level of the linked setup: entry / tp / sl / custom. */
  levelType?: "entry" | "tp" | "sl" | "near-entry" | "custom";
  /** Priority — high fires with requireInteraction + 🚨 prefix. */
  priority?: AlertPriority;
  /** Per-alert sound override (falls back to notify-prefs). */
  sound?: SoundPreset;
  /** Per-alert vibration override. */
  vibrate?: VibratePreset;
  /** Per-alert volume 0..1. */
  volume?: number;
  status: AlertStatus;
  /** Repeat after triggering? Default false = one-shot. */
  repeat: boolean;
  createdAt: number;
  triggeredAt?: number;
  /** Cached last-known price for direction detection on "cross". */
  lastPrice?: number;
};

const KEY = "ara-alerts-v1";
type Listener = (a: Alert[]) => void;
const listeners = new Set<Listener>();

function load(): Alert[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(a: Alert[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(a));
  listeners.forEach((l) => l(a));
}

let cache: Alert[] = load();

export function getAlerts(): Alert[] { return cache.slice(); }
export function subscribeAlerts(l: Listener) { listeners.add(l); l(cache.slice()); return () => listeners.delete(l); }

export function addAlert(a: Omit<Alert, "id" | "createdAt" | "status"> & { status?: AlertStatus }): Alert {
  const alert: Alert = {
    id: `al-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    status: a.status ?? "armed",
    lastPrice: currentPrice(a.symbol),
    ...a,
  };
  cache = [alert, ...cache];
  save(cache);
  return alert;
}

export function removeAlert(id: string) {
  cache = cache.filter((a) => a.id !== id);
  save(cache);
}
export function updateAlert(id: string, patch: Partial<Alert>) {
  cache = cache.map((a) => (a.id === id ? { ...a, ...patch } : a));
  save(cache);
}
export function toggleAlert(id: string) {
  const a = cache.find((x) => x.id === id);
  if (!a) return;
  updateAlert(id, { status: a.status === "armed" ? "paused" : "armed" });
}
export function clearTriggered() {
  cache = cache.filter((a) => a.status !== "triggered");
  save(cache);
}

export type LevelSelection = {
  entryNear?: boolean;
  entry?: boolean;
  tp?: boolean;
  sl?: boolean;
};

export type AlertOverrides = {
  priority?: AlertPriority;
  sound?: SoundPreset;
  vibrate?: VibratePreset;
  volume?: number;
  repeat?: boolean;
  /** Proximity for "near" as fraction of stop→target range (0..1). Default 0.08. */
  nearFrac?: number;
};

/** Remove all alerts linked to a setup id. */
export function removeSetupAlerts(setupId: string) {
  cache = cache.filter((a) => a.linkedSetupId !== setupId);
  save(cache);
}

/** Auto-create entry pre-alert + TP + SL from a signal setup. */
export function armSetupAlerts(
  setup: {
    id: string; symbol: string; side: "long" | "short";
    entry: number; stop: number; target: number;
  },
  levels: LevelSelection = { entryNear: true, entry: true, tp: true, sl: true },
  overrides: AlertOverrides = {},
): Alert[] {
  // De-dupe: skip if already armed for this setup id.
  if (cache.some((a) => a.linkedSetupId === setup.id)) return [];
  const range = Math.abs(setup.target - setup.stop);
  const proximity = range * (overrides.nearFrac ?? 0.08);
  const dir = setup.side === "long" ? "Koop" : "Verkoop";
  const base = {
    priority: overrides.priority,
    sound: overrides.sound,
    vibrate: overrides.vibrate,
    volume: overrides.volume,
    repeat: overrides.repeat ?? false,
    linkedSetupId: setup.id,
  };
  const created: Alert[] = [];
  if (levels.entryNear !== false) created.push(addAlert({
    ...base, symbol: setup.symbol, kind: "near", price: setup.entry, proximity,
    note: `⚡ Vlakbij entry (${dir})`, levelType: "near-entry",
  }));
  if (levels.entry !== false) created.push(addAlert({
    ...base, symbol: setup.symbol, kind: "cross", price: setup.entry,
    note: `🎯 Entry geraakt (${dir})`, levelType: "entry",
  }));
  if (levels.tp !== false) created.push(addAlert({
    ...base, symbol: setup.symbol, kind: "cross", price: setup.target,
    note: `💰 Take profit geraakt`, levelType: "tp",
  }));
  if (levels.sl !== false) created.push(addAlert({
    ...base, symbol: setup.symbol, kind: "cross", price: setup.stop,
    note: `🛑 Stop loss geraakt`, levelType: "sl",
  }));
  return created;
}

// ─── Engine ───────────────────────────────────────────────────────────────
let started = false;
export function startAlertEngine() {
  if (started || typeof window === "undefined") return;
  started = true;
  onTick((id, price) => {
    let changed = false;
    for (const a of cache) {
      if (a.symbol !== id || a.status !== "armed") continue;
      const prev = a.lastPrice ?? price;
      let fire = false;
      if (a.kind === "above" && price >= a.price) fire = true;
      else if (a.kind === "below" && price <= a.price) fire = true;
      else if (a.kind === "cross" && ((prev < a.price && price >= a.price) || (prev > a.price && price <= a.price))) fire = true;
      else if (a.kind === "near" && Math.abs(price - a.price) <= (a.proximity ?? 0)) fire = true;
      a.lastPrice = price;
      if (fire) {
        logTrigger(a, price, prev);
        // Play per-alert sound override, otherwise pushSignal plays kind-based sound.
        const hasOverride = !!(a.sound || a.vibrate);
        if (hasOverride) {
          previewCombo(a.sound ?? "ding", a.vibrate ?? "short", a.volume ?? 0.6);
        }
        const prio = a.priority ?? "normal";
        const prefix = prio === "high" ? "🚨 " : prio === "low" ? "" : "🔔 ";
        pushSignal(
          `${prefix}${a.symbol} ${a.kind === "near" ? "vlakbij" : "geraakt"} ${formatPrice(a.symbol, a.price)}`,
          `${a.note ?? ""}  ·  nu ${formatPrice(a.symbol, price)}`,
          a.id,
          { kind: "exit", symbol: a.symbol, silent: hasOverride, priority: prio },
        );
        if (a.repeat) {
          // keep armed; small cooldown by nudging lastPrice past the level
          a.lastPrice = a.kind === "above" ? price + 1e-9 : a.kind === "below" ? price - 1e-9 : price;
        } else {
          a.status = "triggered";
          a.triggeredAt = Date.now();
        }
        changed = true;
      }
    }
    if (changed) save(cache);
  });
}

export function symbolMeta(id: string) { return SYMBOLS.find((s) => s.id === id); }
