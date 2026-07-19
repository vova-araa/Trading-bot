import { useEffect, useState } from "react";
import { formatPrice, currentPrice } from "@/lib/market-data";
import type { Setup } from "@/lib/strategies";
import {
  armSetupAlerts,
  removeSetupAlerts,
  getAlerts,
  subscribeAlerts,
  type AlertPriority,
  type LevelSelection,
} from "@/lib/alerts";
import {
  SOUND_KEYS,
  VIBRATE_KEYS,
  SOUND_LABELS,
  VIBRATE_LABELS,
  previewCombo,
  type SoundPreset,
  type VibratePreset,
} from "@/lib/alert-sound";
import { AlertPresetPicker, encodeAdHoc, presetFromState } from "./AlertPresetsManager";
import type { AlertPreset } from "@/lib/alert-presets";

const PRIORITIES: { k: AlertPriority; label: string; emoji: string; hint: string }[] = [
  { k: "low", label: "Laag", emoji: "🔕", hint: "Stil op systeem" },
  { k: "normal", label: "Normaal", emoji: "🔔", hint: "Standaard" },
  { k: "high", label: "Hoog", emoji: "🚨", hint: "Blijft in beeld" },
];

const LEVELS: { k: keyof LevelSelection; label: string; icon: string; color: string; getPrice: (s: Setup) => number }[] = [
  { k: "entryNear", label: "Vlakbij entry", icon: "⚡", color: "text-primary", getPrice: (s) => s.entry },
  { k: "entry",     label: "Entry hit",     icon: "🎯", color: "text-primary", getPrice: (s) => s.entry },
  { k: "tp",        label: "Take profit",   icon: "💰", color: "text-bull",    getPrice: (s) => s.target },
  { k: "sl",        label: "Stop loss",     icon: "🛑", color: "text-bear",    getPrice: (s) => s.stop },
];

export function QuickAlertEditor({ setup, onClose }: { setup: Setup; onClose: () => void }) {
  const [live, setLive] = useState(() => currentPrice(setup.symbol));
  const [levels, setLevels] = useState<LevelSelection>({ entryNear: true, entry: true, tp: true, sl: true });
  const [priority, setPriority] = useState<AlertPriority>("normal");
  const [sound, setSound] = useState<SoundPreset>("triple");
  const [vibrate, setVibrate] = useState<VibratePreset>("double");
  const [volume, setVolume] = useState(0.65);
  const [repeat, setRepeat] = useState(false);
  const [existing, setExisting] = useState(() => getAlerts().filter((a) => a.linkedSetupId === setup.id));

  useEffect(() => {
    const t = setInterval(() => setLive(currentPrice(setup.symbol)), 500);
    const off = subscribeAlerts((all) => setExisting(all.filter((a) => a.linkedSetupId === setup.id)));
    return () => { clearInterval(t); off(); };
  }, [setup.id, setup.symbol]);

  function toggleLevel(k: keyof LevelSelection) {
    setLevels((p) => ({ ...p, [k]: !p[k] }));
  }

  function apply() {
    // Replace existing linked alerts atomically.
    if (existing.length) removeSetupAlerts(setup.id);
    armSetupAlerts(setup, levels, { priority, sound, vibrate, volume, repeat });
    onClose();
  }

  function clearAll() {
    removeSetupAlerts(setup.id);
    onClose();
  }

  const anyLevel = LEVELS.some((l) => levels[l.k]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="panel w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-panel-border/60 px-4 py-3">
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Alarm editor</div>
            <div className="text-lg font-black">{setup.symbol} · {setup.side === "long" ? "Long" : "Short"}</div>
          </div>
          <button onClick={onClose} className="mono text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4">
          {/* Presets */}
          <AlertPresetPicker
            onApply={(p: AlertPreset) => {
              setLevels({ ...p.levels });
              setPriority(p.priority);
              setSound(p.sound);
              setVibrate(p.vibrate);
              setVolume(p.volume);
              setRepeat(p.repeat);
            }}
            onSaveCurrent={(name) => {
              presetFromState({ name, levels, priority, sound, vibrate, volume, repeat });
            }}
            onShareCurrent={() => encodeAdHoc(`${setup.symbol} ${setup.side}`, { levels, priority, sound, vibrate, volume, repeat })}
          />
          {/* Levels */}
          <section>
            <div className="mono mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Niveaus</span>
              <span className="tabular-nums text-foreground">nu {formatPrice(setup.symbol, live)}</span>
            </div>
            <div className="grid gap-1.5">
              {LEVELS.map((l) => {
                const on = !!levels[l.k];
                const price = l.getPrice(setup);
                const dist = Math.abs(live - price);
                return (
                  <button
                    key={l.k}
                    onClick={() => toggleLevel(l.k)}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors ${
                      on ? "border-primary bg-primary/10" : "border-panel-border hover:border-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`grid h-5 w-5 place-items-center rounded border text-[10px] font-black ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-panel-border text-muted-foreground"
                      }`}>{on ? "✓" : ""}</span>
                      <span className="text-lg">{l.icon}</span>
                      <div>
                        <div className="text-[12px] font-bold">{l.label}</div>
                        <div className="mono text-[10px] text-muted-foreground tabular-nums">
                          Δ {formatPrice(setup.symbol, dist)}
                        </div>
                      </div>
                    </div>
                    <div className={`mono text-sm font-black tabular-nums ${l.color}`}>
                      {formatPrice(setup.symbol, price)}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Priority */}
          <section>
            <div className="mono mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Prioriteit</div>
            <div className="grid grid-cols-3 gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.k}
                  onClick={() => setPriority(p.k)}
                  className={`mono rounded-md border px-2 py-2 text-center text-[11px] font-bold transition-colors ${
                    priority === p.k ? "border-primary bg-primary/15 text-primary" : "border-panel-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="text-base leading-none">{p.emoji}</div>
                  <div>{p.label}</div>
                  <div className="mt-0.5 text-[9px] font-normal opacity-70">{p.hint}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Sound */}
          <section>
            <div className="mono mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Geluid</span>
              <button
                onClick={() => previewCombo(sound, vibrate, volume)}
                className="mono rounded border border-panel-border px-2 py-0.5 text-[10px] font-bold text-foreground hover:border-primary hover:text-primary"
              >
                ▶ Test
              </button>
            </div>
            <select
              value={sound}
              onChange={(e) => setSound(e.target.value as SoundPreset)}
              className="mono w-full rounded-md border border-panel-border bg-background px-3 py-2 text-sm"
            >
              {SOUND_KEYS.map((k) => (
                <option key={k} value={k}>{SOUND_LABELS[k]}</option>
              ))}
            </select>
            <div className="mt-2">
              <div className="mono mb-1 flex justify-between text-[10px] text-muted-foreground">
                <span>Volume</span>
                <span className="tabular-nums text-foreground">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range" min={0} max={1} step={0.05}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </section>

          {/* Vibrate */}
          <section>
            <div className="mono mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Trilling</div>
            <select
              value={vibrate}
              onChange={(e) => setVibrate(e.target.value as VibratePreset)}
              className="mono w-full rounded-md border border-panel-border bg-background px-3 py-2 text-sm"
            >
              {VIBRATE_KEYS.map((k) => (
                <option key={k} value={k}>{VIBRATE_LABELS[k]}</option>
              ))}
            </select>
          </section>

          {/* Repeat */}
          <label className="mono flex items-center justify-between rounded-md border border-panel-border px-3 py-2 text-[11px] font-bold">
            <span>🔁 Herhaal alarm (blijft armed na trigger)</span>
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          </label>

          {existing.length > 0 && (
            <div className="rounded-md border border-panel-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              🔔 Er staan al {existing.length} alarm{existing.length === 1 ? "" : "en"} op deze setup. Opslaan vervangt ze.
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-panel-border/60 px-4 py-3">
          <button
            onClick={clearAll}
            disabled={existing.length === 0}
            className="mono rounded-md border border-panel-border py-2.5 text-[11px] font-black uppercase tracking-wider text-bear hover:border-bear disabled:opacity-40"
          >
            🗑 Wis
          </button>
          <button
            onClick={onClose}
            className="mono rounded-md border border-panel-border py-2.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Annuleer
          </button>
          <button
            onClick={apply}
            disabled={!anyLevel}
            className="mono rounded-md bg-primary py-2.5 text-[11px] font-black uppercase tracking-wider text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            💾 Zet {LEVELS.filter((l) => levels[l.k]).length}
          </button>
        </div>
      </div>
    </div>
  );
}
