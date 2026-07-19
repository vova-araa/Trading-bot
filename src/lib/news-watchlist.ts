// News watchlist: kies welke valuta's / markten je in de nieuws-tab wilt zien,
// en sla filters op als benoemde presets (per broker of asset).

export type WatchPreset = {
  id: string;
  name: string;
  emoji?: string;
  /** ISO currency codes: "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY". */
  currencies: string[];
  /** Alleen high-impact events tonen. */
  highOnly: boolean;
  builtin?: boolean;
};

export const ALL_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY"] as const;

export const BUILTIN_PRESETS: WatchPreset[] = [
  { id: "b-majors", name: "Forex Majors", emoji: "💱", currencies: ["USD", "EUR", "GBP", "JPY"], highOnly: false, builtin: true },
  { id: "b-usd",    name: "USD focus",    emoji: "🇺🇸", currencies: ["USD"], highOnly: false, builtin: true },
  { id: "b-metals", name: "Metals & Oil", emoji: "🛢️", currencies: ["USD", "CAD"], highOnly: true,  builtin: true },
  { id: "b-eu",     name: "Europa",       emoji: "🇪🇺", currencies: ["EUR", "GBP", "CHF"], highOnly: false, builtin: true },
  { id: "b-apac",   name: "APAC",         emoji: "🌏", currencies: ["JPY", "AUD", "NZD", "CNY"], highOnly: false, builtin: true },
  { id: "b-high",   name: "Alles · high", emoji: "🚨", currencies: [...ALL_CURRENCIES], highOnly: true, builtin: true },
];

type State = {
  currencies: string[];
  highOnly: boolean;
  enabled: boolean;
  activePresetId?: string;
  custom: WatchPreset[];
};

const KEY = "ara-news-watchlist-v1";
const DEFAULT: State = {
  currencies: [...ALL_CURRENCIES],
  highOnly: false,
  enabled: false,
  custom: [],
};

type Listener = (s: State) => void;
const listeners = new Set<Listener>();

function load(): State {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<State>;
    return {
      currencies: Array.isArray(p.currencies) && p.currencies.length ? p.currencies : DEFAULT.currencies,
      highOnly: !!p.highOnly,
      enabled: !!p.enabled,
      activePresetId: typeof p.activePresetId === "string" ? p.activePresetId : undefined,
      custom: Array.isArray(p.custom) ? p.custom : [],
    };
  } catch { return DEFAULT; }
}
function persist(s: State) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
  listeners.forEach((l) => l(s));
}

let cache: State = load();

export function getWatchState(): State { return { ...cache, custom: cache.custom.slice() }; }
export function subscribeWatch(l: Listener) { listeners.add(l); l(getWatchState()); return () => { listeners.delete(l); }; }

export function setEnabled(v: boolean)  { cache = { ...cache, enabled: v }; persist(cache); }
export function setHighOnly(v: boolean) { cache = { ...cache, highOnly: v, activePresetId: undefined }; persist(cache); }
export function toggleCurrency(c: string) {
  const has = cache.currencies.includes(c);
  const currencies = has ? cache.currencies.filter((x) => x !== c) : [...cache.currencies, c];
  cache = { ...cache, currencies, activePresetId: undefined };
  persist(cache);
}
export function selectAllCurrencies()  { cache = { ...cache, currencies: [...ALL_CURRENCIES], activePresetId: undefined }; persist(cache); }
export function clearCurrencies()      { cache = { ...cache, currencies: [], activePresetId: undefined }; persist(cache); }

export function listPresets(): WatchPreset[] { return [...BUILTIN_PRESETS, ...cache.custom]; }
export function applyPreset(id: string) {
  const p = listPresets().find((x) => x.id === id);
  if (!p) return;
  cache = { ...cache, currencies: [...p.currencies], highOnly: p.highOnly, activePresetId: p.id, enabled: true };
  persist(cache);
}
export function saveCurrentAsPreset(name: string, emoji?: string): WatchPreset {
  const preset: WatchPreset = {
    id: `pre-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || "Preset",
    emoji: emoji?.trim() || "⭐",
    currencies: [...cache.currencies],
    highOnly: cache.highOnly,
  };
  cache = { ...cache, custom: [preset, ...cache.custom], activePresetId: preset.id };
  persist(cache);
  return preset;
}
export function deletePreset(id: string) {
  cache = {
    ...cache,
    custom: cache.custom.filter((p) => p.id !== id),
    activePresetId: cache.activePresetId === id ? undefined : cache.activePresetId,
  };
  persist(cache);
}

/** Predicaat voor filtering van news items op basis van huidige watch-state. */
export function matchWatch(currency: string, impact: "low" | "medium" | "high"): boolean {
  if (!cache.enabled) return true;
  if (cache.highOnly && impact !== "high") return false;
  // Headlines hebben currency "-" → tonen als watchlist aan staat en er niet is uitgeschakeld.
  if (currency === "-") return true;
  return cache.currencies.includes(currency);
}
