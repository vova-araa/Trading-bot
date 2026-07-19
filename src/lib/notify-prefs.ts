// Per-type + per-symbol notification preferences.
// Stored in localStorage, read synchronously by pushSignal().

import { SYMBOLS } from "./market-data";

export type NotifyKind = "entry" | "exit" | "pump" | "other";

export type NotifyPrefs = {
  types: Record<NotifyKind, boolean>;
  // symbol filter mode: "all" = notify for every symbol,
  // "only" = notify only for symbols in `symbols`,
  // "mute" = notify for every symbol EXCEPT the ones in `symbols`.
  mode: "all" | "only" | "mute";
  symbols: string[];
};

const KEY = "ara-notify-prefs-v1";

const DEFAULT: NotifyPrefs = {
  types: { entry: true, exit: true, pump: true, other: true },
  mode: "all",
  symbols: [],
};

export function getPrefs(): NotifyPrefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<NotifyPrefs>;
    return {
      types: { ...DEFAULT.types, ...(p.types ?? {}) },
      mode: p.mode ?? "all",
      symbols: Array.isArray(p.symbols) ? p.symbols : [],
    };
  } catch {
    return DEFAULT;
  }
}

export function setPrefs(p: NotifyPrefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event("ara-notify-prefs-change"));
}

export function shouldNotify(kind: NotifyKind, symbol?: string): boolean {
  const p = getPrefs();
  if (!p.types[kind]) return false;
  if (!symbol) return true;
  if (p.mode === "all") return true;
  const inList = p.symbols.includes(symbol);
  return p.mode === "only" ? inList : !inList;
}

export function allSymbols() {
  return SYMBOLS.map((s) => ({ id: s.id, name: s.name, kind: s.kind }));
}

export const KIND_META: Record<NotifyKind, { label: string; icon: string; desc: string }> = {
  entry: { label: "Entry signalen", icon: "🎯", desc: "Nieuwe trade setup gevonden (koop/verkoop)." },
  exit: { label: "Exit / TP / SL", icon: "💰", desc: "Prijs raakt jouw entry, take profit of stop loss." },
  pump: { label: "Pump alerts", icon: "🚀", desc: "Koers beweegt ineens hard omhoog of omlaag." },
  other: { label: "Overig", icon: "🔔", desc: "Andere meldingen (nieuws, systeem, bots)." },
};
