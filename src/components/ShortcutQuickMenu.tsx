import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { enabledShortcuts, onShortcutPrefsChange, syncManifest, type ShortcutDef } from "@/lib/shortcut-prefs";

export function ShortcutQuickMenu() {
  const [items, setItems] = useState<ShortcutDef[]>(() => enabledShortcuts());

  useEffect(() => {
    // Ensure the PWA manifest reflects the saved prefs on load.
    syncManifest();
    return onShortcutPrefsChange(() => setItems(enabledShortcuts()));
  }, []);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/60">
        Geen snelmenu-knoppen. <Link to="/settings/shortcuts" className="underline">Kies knoppen →</Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-wider text-white/50">Snelmenu</span>
        <Link to="/settings/shortcuts" className="text-[10px] text-white/60 underline">
          Aanpassen
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.map((s) => (
          <Link
            key={s.id}
            to={s.url}
            className="flex flex-col items-center justify-center gap-1 rounded-lg bg-white/[0.04] py-2 text-center hover:bg-white/[0.08]"
          >
            <span className="text-xl leading-none">{s.emoji}</span>
            <span className="text-[10px] text-white/80">{s.short}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
