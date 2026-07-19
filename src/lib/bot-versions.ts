// Version history for bot configurations.
// Every time settings/symbol change we push a snapshot. Users can view the
// changelog and restore any previous version in one tap.

import type { BotSettings } from "./bots";

export type BotVersion = {
  v: number;               // sequential version number (1-based)
  at: number;              // timestamp ms
  symbol: string;
  settings: BotSettings;
  note: string;            // human summary of what changed vs previous version
  source: "manual" | "install" | "reset" | "restore" | "symbol" | "auto";
};

const KEY = "ara-bot-versions-v1";
const MAX_PER_BOT = 30;

type Store = Record<string, BotVersion[]>;

function load(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}
function save(s: Store) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

let store: Store = load();
const subs = new Set<(id: string, v: BotVersion[]) => void>();

export function getVersions(botId: string): BotVersion[] {
  return store[botId] ?? [];
}

export function subscribeVersions(botId: string, fn: (v: BotVersion[]) => void) {
  const cb = (id: string, v: BotVersion[]) => { if (id === botId) fn(v); };
  subs.add(cb);
  fn(getVersions(botId));
  return () => { subs.delete(cb); };
}

function emit(botId: string) {
  save(store);
  const list = store[botId] ?? [];
  subs.forEach((s) => s(botId, list));
}

function diffNote(prev: BotVersion | undefined, next: { symbol: string; settings: BotSettings }): string {
  if (!prev) return "Eerste versie opgeslagen";
  const changes: string[] = [];
  if (prev.symbol !== next.symbol) changes.push(`symbool ${prev.symbol} → ${next.symbol}`);
  const keys = new Set([...Object.keys(prev.settings || {}), ...Object.keys(next.settings || {})]);
  keys.forEach((k) => {
    const a = prev.settings?.[k];
    const b = next.settings?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push(`${k}: ${fmt(a)} → ${fmt(b)}`);
    }
  });
  if (!changes.length) return "Geen wijzigingen";
  return changes.slice(0, 4).join(" · ") + (changes.length > 4 ? ` (+${changes.length - 4})` : "");
}
function fmt(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "boolean") return v ? "aan" : "uit";
  return String(v);
}

export function pushVersion(
  botId: string,
  snapshot: { symbol: string; settings: BotSettings },
  source: BotVersion["source"] = "manual",
  noteOverride?: string,
) {
  const list = store[botId] ?? [];
  const prev = list[0];
  // skip no-op saves for manual/auto sources
  if (prev
      && (source === "manual" || source === "auto")
      && prev.symbol === snapshot.symbol
      && JSON.stringify(prev.settings) === JSON.stringify(snapshot.settings)) {
    return;
  }
  const v: BotVersion = {
    v: (prev?.v ?? 0) + 1,
    at: Date.now(),
    symbol: snapshot.symbol,
    settings: { ...snapshot.settings },
    note: noteOverride ?? diffNote(prev, snapshot),
    source,
  };
  store[botId] = [v, ...list].slice(0, MAX_PER_BOT);
  emit(botId);
}

export function clearVersions(botId: string) {
  delete store[botId];
  emit(botId);
}
