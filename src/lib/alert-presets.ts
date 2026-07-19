// Alarm-presets: hergebruikbare bundels van niveaus + prioriteit + geluid/trilling +
// herhaal + near-proximity fractie. Deelbaar via link, exporteerbaar als JSON.

import type { AlertPriority, LevelSelection } from "./alerts";
import type { SoundPreset, VibratePreset } from "./alert-sound";

export type AlertPreset = {
  id: string;
  name: string;
  emoji?: string;
  levels: Required<LevelSelection>;
  priority: AlertPriority;
  sound: SoundPreset;
  vibrate: VibratePreset;
  volume: number;
  repeat: boolean;
  /** Fractie van (target-stop) voor "near"-alarm rond entry. Default 0.08 */
  nearFrac: number;
  builtin?: boolean;
  createdAt: number;
};

export const BUILTIN_PRESETS: AlertPreset[] = [
  {
    id: "builtin-scalper", name: "Scalper", emoji: "⚡", builtin: true, createdAt: 0,
    levels: { entryNear: true, entry: true, tp: true, sl: true },
    priority: "high", sound: "triple", vibrate: "double", volume: 0.8, repeat: false, nearFrac: 0.05,
  },
  {
    id: "builtin-swing", name: "Swing", emoji: "🌊", builtin: true, createdAt: 0,
    levels: { entryNear: true, entry: true, tp: true, sl: true },
    priority: "normal", sound: "ding", vibrate: "short", volume: 0.6, repeat: false, nearFrac: 0.15,
  },
  {
    id: "builtin-silent", name: "Silent watch", emoji: "🔕", builtin: true, createdAt: 0,
    levels: { entryNear: false, entry: true, tp: true, sl: true },
    priority: "low", sound: "mute", vibrate: "off", volume: 0, repeat: true, nearFrac: 0.08,
  },
  {
    id: "builtin-tp-only", name: "Alleen exits", emoji: "💰", builtin: true, createdAt: 0,
    levels: { entryNear: false, entry: false, tp: true, sl: true },
    priority: "high", sound: "chime", vibrate: "long", volume: 0.75, repeat: false, nearFrac: 0.08,
  },
];

const KEY = "ara-alert-presets-v1";
type Listener = (list: AlertPreset[]) => void;
const listeners = new Set<Listener>();

function loadCustom(): AlertPreset[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function saveCustom(list: AlertPreset[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
  const all = mergeAll(list);
  listeners.forEach((l) => l(all));
}
function mergeAll(custom: AlertPreset[]): AlertPreset[] {
  return [...BUILTIN_PRESETS, ...custom];
}

let custom: AlertPreset[] = loadCustom();

export function listPresets(): AlertPreset[] { return mergeAll(custom); }
export function getPreset(id: string): AlertPreset | undefined { return listPresets().find((p) => p.id === id); }
export function subscribePresets(l: Listener) { listeners.add(l); l(listPresets()); return () => listeners.delete(l); }

export function savePreset(input: Omit<AlertPreset, "id" | "createdAt" | "builtin"> & { id?: string }): AlertPreset {
  const now = Date.now();
  if (input.id) {
    const existing = custom.find((p) => p.id === input.id);
    if (existing) {
      Object.assign(existing, input, { builtin: false });
      custom = custom.slice();
      saveCustom(custom);
      return existing;
    }
  }
  const preset: AlertPreset = {
    ...input,
    id: input.id ?? `pre-${now}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
  };
  custom = [preset, ...custom];
  saveCustom(custom);
  return preset;
}

export function deletePreset(id: string) {
  custom = custom.filter((p) => p.id !== id);
  saveCustom(custom);
}

export function duplicatePreset(id: string): AlertPreset | undefined {
  const p = getPreset(id);
  if (!p) return;
  return savePreset({
    name: `${p.name} kopie`,
    emoji: p.emoji,
    levels: { ...p.levels },
    priority: p.priority,
    sound: p.sound,
    vibrate: p.vibrate,
    volume: p.volume,
    repeat: p.repeat,
    nearFrac: p.nearFrac,
  });
}

// ─── Encode / decode ──────────────────────────────────────────────────────────

/** Compact base64url payload of a preset (or list). */
export function encodePresets(list: AlertPreset[]): string {
  const stripped = list.map(({ id: _id, createdAt: _c, builtin: _b, ...rest }) => rest);
  const json = JSON.stringify({ v: 1, p: stripped });
  return b64urlEncode(json);
}
export function decodePresets(token: string): Omit<AlertPreset, "id" | "createdAt" | "builtin">[] {
  const json = b64urlDecode(token);
  const parsed = JSON.parse(json);
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.p)) throw new Error("Ongeldig preset-token");
  return parsed.p;
}

export function buildShareUrl(preset: AlertPreset): string {
  const token = encodePresets([preset]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?preset=${token}`;
}

export function exportPresetsJSON(list: AlertPreset[] = listPresets().filter((p) => !p.builtin)): string {
  const stripped = list.map(({ id: _id, createdAt: _c, builtin: _b, ...rest }) => rest);
  return JSON.stringify({ v: 1, presets: stripped }, null, 2);
}

export function importPresetsJSON(text: string): AlertPreset[] {
  const parsed = JSON.parse(text);
  const arr: any[] = Array.isArray(parsed) ? parsed
    : Array.isArray(parsed?.presets) ? parsed.presets
    : Array.isArray(parsed?.p) ? parsed.p
    : [];
  if (!arr.length) throw new Error("Geen presets gevonden in JSON");
  return arr.map((p) => savePreset(normalize(p)));
}

function normalize(p: any): Omit<AlertPreset, "id" | "createdAt" | "builtin"> {
  return {
    name: String(p.name ?? "Import"),
    emoji: p.emoji,
    levels: {
      entryNear: !!p.levels?.entryNear,
      entry: !!p.levels?.entry,
      tp: !!p.levels?.tp,
      sl: !!p.levels?.sl,
    },
    priority: (["low", "normal", "high"].includes(p.priority) ? p.priority : "normal") as AlertPriority,
    sound: (p.sound ?? "ding") as SoundPreset,
    vibrate: (p.vibrate ?? "short") as VibratePreset,
    volume: typeof p.volume === "number" ? Math.max(0, Math.min(1, p.volume)) : 0.6,
    repeat: !!p.repeat,
    nearFrac: typeof p.nearFrac === "number" ? Math.max(0.005, Math.min(0.5, p.nearFrac)) : 0.08,
  };
}

// ─── base64url helpers (unicode-safe) ────────────────────────────────────────
function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
