import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ALL_IDS,
  SHORTCUTS,
  getShortcutPrefs,
  setShortcutPrefs,
  type ShortcutId,
  type ShortcutPrefs,
} from "@/lib/shortcut-prefs";

export const Route = createFileRoute("/settings/shortcuts")({
  head: () => ({
    meta: [
      { title: "Snelmenu instellen — ARA TRADES" },
      { name: "description", content: "Kies zelf welke knoppen (laatste signaal, alarmen, bots, nieuws) in je homescreen snelmenu staan." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ShortcutSettings,
});

function ShortcutSettings() {
  const [prefs, setLocal] = useState<ShortcutPrefs>(() => getShortcutPrefs());

  useEffect(() => {
    // sync once on mount so first-time visitors' manifest matches saved state
    setShortcutPrefs(getShortcutPrefs());
  }, []);

  function commit(next: ShortcutPrefs) {
    setLocal(next);
    setShortcutPrefs(next);
  }

  function toggle(id: ShortcutId) {
    const disabled = prefs.disabled.includes(id)
      ? prefs.disabled.filter((x) => x !== id)
      : [...prefs.disabled, id];
    commit({ ...prefs, disabled });
  }

  function move(id: ShortcutId, dir: -1 | 1) {
    const order = [...prefs.order];
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    commit({ ...prefs, order });
  }

  function reset() {
    commit({ order: [...ALL_IDS], disabled: [] });
  }

  const enabledCount = prefs.order.filter((id) => !prefs.disabled.includes(id)).length;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-24 text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Snelmenu</h1>
          <p className="text-xs text-white/60">
            Kies welke knoppen op je homescreen (PWA) en bovenin de app staan.
          </p>
        </div>
        <Link to="/" className="text-xs text-white/60 underline">Terug</Link>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/70">
        {enabledCount} van {ALL_IDS.length} actief. Herinstalleer de PWA om nieuwe knoppen op je homescreen te zien.
      </div>

      <ul className="space-y-2">
        {prefs.order.map((id, idx) => {
          const s = SHORTCUTS[id];
          const on = !prefs.disabled.includes(id);
          return (
            <li
              key={id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                on ? "border-white/15 bg-white/[0.04]" : "border-white/5 bg-white/[0.01] opacity-60"
              }`}
            >
              <span className="text-2xl">{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{s.name}</div>
                <div className="truncate text-[11px] text-white/50">{s.description}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => move(id, -1)}
                  disabled={idx === 0}
                  className="rounded bg-white/10 px-2 py-0.5 text-xs disabled:opacity-30"
                  aria-label="Omhoog"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(id, 1)}
                  disabled={idx === prefs.order.length - 1}
                  className="rounded bg-white/10 px-2 py-0.5 text-xs disabled:opacity-30"
                  aria-label="Omlaag"
                >
                  ↓
                </button>
              </div>
              <button
                onClick={() => toggle(id)}
                className={`ml-1 rounded-full px-3 py-1 text-xs font-medium ${
                  on ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60"
                }`}
              >
                {on ? "Aan" : "Uit"}
              </button>
            </li>
          );
        })}
      </ul>

      <button onClick={reset} className="text-xs text-white/60 underline">
        Reset naar standaard
      </button>
    </div>
  );
}
