// Tiny persistent cache of the most recent trade setups so notification
// deep-links (/trade/latest, /trade/$id) can render the trade with entry,
// SL and TP even after a fresh app boot from a home-screen shortcut.

import type { Setup } from "./strategies";

const KEY = "ara-setup-cache-v1";
const MAX = 24;

function load(): Setup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Setup[];
  } catch {}
  return [];
}
function save(list: Setup[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch {}
}

export function cacheSetups(setups: Setup[]) {
  if (!setups.length) return;
  const map = new Map<string, Setup>();
  for (const s of [...setups, ...load()]) map.set(s.id, s);
  save(Array.from(map.values()).sort((a, b) => b.time - a.time));
}

export function getCachedSetups(): Setup[] { return load(); }

export function findCachedSetup(id: string): Setup | null {
  if (id === "latest") {
    const list = load();
    return list[0] ?? null;
  }
  return load().find((s) => s.id === id) ?? null;
}
