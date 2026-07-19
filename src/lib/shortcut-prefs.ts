// Personalized homescreen shortcuts (PWA + in-app quick menu).
// Stored client-side; a dynamic manifest is generated so the OS picks up the
// user's choices on next install/refresh.

export type ShortcutId = "signal" | "alarms" | "bots" | "news";

export type ShortcutDef = {
  id: ShortcutId;
  name: string;
  short: string;
  description: string;
  url: string;
  emoji: string;
};

export const SHORTCUTS: Record<ShortcutId, ShortcutDef> = {
  signal: {
    id: "signal",
    name: "Neem laatste signaal",
    short: "Signaal",
    description: "Open direct het nieuwste trade-setup met 1-tap uitvoeren",
    url: "/trade/latest?src=shortcut",
    emoji: "🎯",
  },
  alarms: {
    id: "alarms",
    name: "Alarmen",
    short: "Alarmen",
    description: "Beheer je entry, TP en SL alarmen",
    url: "/?tab=alarms&src=shortcut",
    emoji: "🔔",
  },
  bots: {
    id: "bots",
    name: "Mijn Bots",
    short: "Bots",
    description: "Bekijk status van je 24/7 bots",
    url: "/?tab=bots&src=shortcut",
    emoji: "🤖",
  },
  news: {
    id: "news",
    name: "Nieuws",
    short: "Nieuws",
    description: "Economische kalender met nowcast",
    url: "/?tab=news&src=shortcut",
    emoji: "📰",
  },
};

export const ALL_IDS: ShortcutId[] = ["signal", "alarms", "bots", "news"];
const KEY = "ara.shortcut-prefs.v1";
const EVT = "ara-shortcut-prefs-change";

export type ShortcutPrefs = {
  order: ShortcutId[];       // ordered list of enabled shortcuts
  disabled: ShortcutId[];    // explicitly disabled
};

const DEFAULT: ShortcutPrefs = { order: [...ALL_IDS], disabled: [] };

export function getShortcutPrefs(): ShortcutPrefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<ShortcutPrefs>;
    const order = (parsed.order || []).filter((x): x is ShortcutId => ALL_IDS.includes(x as ShortcutId));
    const disabled = (parsed.disabled || []).filter((x): x is ShortcutId => ALL_IDS.includes(x as ShortcutId));
    // Backfill any missing ids at the end (enabled by default)
    for (const id of ALL_IDS) if (!order.includes(id) && !disabled.includes(id)) order.push(id);
    return { order, disabled };
  } catch {
    return DEFAULT;
  }
}

export function setShortcutPrefs(next: ShortcutPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVT));
  syncManifest(next);
}

export function enabledShortcuts(prefs = getShortcutPrefs()): ShortcutDef[] {
  return prefs.order.filter((id) => !prefs.disabled.includes(id)).map((id) => SHORTCUTS[id]);
}

export function onShortcutPrefsChange(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}

// --- Dynamic manifest generation --------------------------------------------
// Rewrites <link rel="manifest"> to a blob URL built from the user's picks so
// the OS shows their chosen quick actions on next install / long-press.

let currentBlobUrl: string | null = null;

export function syncManifest(prefs = getShortcutPrefs()) {
  if (typeof document === "undefined") return;
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) return;
  fetch("/manifest.webmanifest")
    .then((r) => r.json())
    .then((base: Record<string, unknown>) => {
      const list = enabledShortcuts(prefs).map((s) => ({
        name: s.name,
        short_name: s.short,
        description: s.description,
        url: s.url,
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      }));
      const next = { ...base, shortcuts: list };
      const blob = new Blob([JSON.stringify(next)], { type: "application/manifest+json" });
      const url = URL.createObjectURL(blob);
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = url;
      link.setAttribute("href", url);
    })
    .catch(() => {
      /* keep static manifest on failure */
    });
}
