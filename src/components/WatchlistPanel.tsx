import { useEffect, useState } from "react";
import {
  ALL_CURRENCIES,
  applyPreset,
  clearCurrencies,
  deletePreset,
  getWatchState,
  listPresets,
  saveCurrentAsPreset,
  selectAllCurrencies,
  setEnabled,
  setHighOnly,
  subscribeWatch,
  toggleCurrency,
} from "@/lib/news-watchlist";

const FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", AUD: "🇦🇺",
  CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿", CNY: "🇨🇳",
};

export function WatchlistPanel() {
  const [s, setS] = useState(getWatchState());
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("⭐");
  useEffect(() => subscribeWatch(setS), []);
  const presets = listPresets();

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <span className="flex items-center gap-2">
          <span>👁 Watchlist</span>
          <span className="mono text-[10px] font-black text-muted-foreground">
            {s.enabled ? `${s.currencies.length} valuta actief` : "uit"}
          </span>
        </span>
        <label className="mono flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Filter aan
        </label>
      </div>

      <div className={`p-3 ${s.enabled ? "" : "opacity-60"}`}>
        {/* Presets */}
        <div className="mono mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Presets · broker/asset</div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const active = s.activePresetId === p.id;
            return (
              <div key={p.id} className="flex items-center">
                <button
                  onClick={() => applyPreset(p.id)}
                  className={`mono rounded-l-full border border-r-0 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                    active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-panel-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="mr-1">{p.emoji ?? "⭐"}</span>{p.name}
                </button>
                <button
                  onClick={() => {
                    if (p.builtin) return;
                    if (confirm(`Verwijder preset "${p.name}"?`)) deletePreset(p.id);
                  }}
                  disabled={p.builtin}
                  className={`mono rounded-r-full border px-1.5 py-1 text-[10px] font-black ${
                    active ? "border-primary text-primary" : "border-panel-border text-muted-foreground"
                  } ${p.builtin ? "opacity-40" : "hover:text-bear"}`}
                  title={p.builtin ? "Ingebouwd" : "Verwijder"}
                >
                  {p.builtin ? "•" : "×"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Currency grid */}
        <div className="mono mt-3 mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Valuta</span>
          <span className="flex gap-2">
            <button onClick={selectAllCurrencies} className="text-primary hover:underline">alles</button>
            <span>·</span>
            <button onClick={clearCurrencies} className="text-muted-foreground hover:text-bear">geen</button>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {ALL_CURRENCIES.map((c) => {
            const on = s.currencies.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleCurrency(c)}
                className={`mono flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-black transition-colors ${
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-panel-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-sm">{FLAGS[c]}</span>
                <span>{c}</span>
              </button>
            );
          })}
        </div>

        {/* High impact toggle */}
        <label className="mono mt-3 flex items-center gap-2 text-[11px] font-semibold">
          <input
            type="checkbox"
            checked={s.highOnly}
            onChange={(e) => setHighOnly(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          🔴 Alleen high-impact events
        </label>

        {/* Save preset */}
        <div className="mt-3 flex gap-1.5">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
            className="mono w-11 rounded-md border border-panel-border bg-panel px-1.5 py-1.5 text-center text-sm"
            maxLength={2}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Naam preset (bv. Bybit BTC/USD)"
            className="mono flex-1 rounded-md border border-panel-border bg-panel px-2 py-1.5 text-[11px]"
          />
          <button
            onClick={() => {
              if (!name.trim()) return;
              saveCurrentAsPreset(name, emoji);
              setName("");
              setEmoji("⭐");
            }}
            disabled={!name.trim()}
            className="mono rounded-md bg-primary px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary-foreground disabled:opacity-40"
          >
            💾 Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
