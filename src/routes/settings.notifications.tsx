import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  getPrefs,
  setPrefs,
  KIND_META,
  allSymbols,
  type NotifyPrefs,
  type NotifyKind,
} from "@/lib/notify-prefs";
import {
  getSoundPrefs,
  setSoundPrefs,
  previewCombo,
  SOUND_KEYS,
  VIBRATE_KEYS,
  SOUND_LABELS,
  VIBRATE_LABELS,
  type AlertSoundPrefs,
  type SoundPreset,
  type VibratePreset,
} from "@/lib/alert-sound";
import { NotificationToggle } from "@/components/NotificationToggle";


export const Route = createFileRoute("/settings/notifications")({
  head: () => ({
    meta: [
      { title: "Notificatie instellingen — ARA TRADES" },
      { name: "description", content: "Kies per type signaal (entry, exit, pump) en per valuta wanneer je een push melding krijgt." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotifSettings,
});

function NotifSettings() {
  const [prefs, setLocal] = useState<NotifyPrefs>(() => getPrefs());
  const [sound, setSound] = useState<AlertSoundPrefs>(() => getSoundPrefs());
  const [q, setQ] = useState("");

  useEffect(() => {
    const onChange = () => setLocal(getPrefs());
    const onSound = () => setSound(getSoundPrefs());
    window.addEventListener("ara-notify-prefs-change", onChange);
    window.addEventListener("ara-alert-sound-change", onSound);
    return () => {
      window.removeEventListener("ara-notify-prefs-change", onChange);
      window.removeEventListener("ara-alert-sound-change", onSound);
    };
  }, []);

  function commitSound(next: AlertSoundPrefs) {
    setSound(next);
    setSoundPrefs(next);
  }


  const symbols = useMemo(() => allSymbols(), []);
  const grouped = useMemo(() => {
    const filter = q.trim().toUpperCase();
    const list = symbols.filter((s) =>
      !filter || s.id.includes(filter) || s.name.toUpperCase().includes(filter),
    );
    const g: Record<string, typeof symbols> = {};
    for (const s of list) (g[s.kind] ||= []).push(s);
    return g;
  }, [symbols, q]);

  function commit(next: NotifyPrefs) {
    setLocal(next);
    setPrefs(next);
  }

  function toggleType(k: NotifyKind) {
    commit({ ...prefs, types: { ...prefs.types, [k]: !prefs.types[k] } });
  }

  function setMode(m: NotifyPrefs["mode"]) {
    commit({ ...prefs, mode: m });
  }

  function toggleSymbol(id: string) {
    const on = prefs.symbols.includes(id);
    commit({
      ...prefs,
      symbols: on ? prefs.symbols.filter((s) => s !== id) : [...prefs.symbols, id],
    });
  }

  function reset() {
    commit({
      types: { entry: true, exit: true, pump: true, other: true },
      mode: "all",
      symbols: [],
    });
  }

  const kindOrder: NotifyKind[] = ["entry", "exit", "pump", "other"];
  const kindLabel: Record<string, string> = {
    forex: "Forex", crypto: "Crypto", futures: "Futures", index: "Indices", metal: "Metalen",
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-20 border-b border-panel-border/70 bg-panel/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/"
              className="mono rounded-md border border-panel-border px-2 py-1 text-[10px] font-black uppercase text-muted-foreground hover:text-foreground"
            >
              ← Terug
            </Link>
            <div className="min-w-0">
              <div className="truncate text-sm font-black tracking-tight">🔔 Notificaties</div>
              <div className="mono text-[10px] text-muted-foreground">Kies wanneer je een push krijgt</div>
            </div>
          </div>
          <NotificationToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        {/* Types */}
        <section className="panel mb-5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider">Per type signaal</h2>
            <button
              onClick={reset}
              className="mono rounded-md border border-panel-border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          </div>
          <div className="flex flex-col divide-y divide-panel-border/60">
            {kindOrder.map((k) => {
              const on = prefs.types[k];
              const meta = KIND_META[k];
              return (
                <button
                  key={k}
                  onClick={() => toggleType(k)}
                  className="flex items-center gap-3 py-3 text-left transition-colors hover:bg-panel-border/20"
                >
                  <span className="text-2xl">{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black">{meta.label}</div>
                    <div className="text-[11px] text-muted-foreground">{meta.desc}</div>
                  </div>
                  <span
                    className={`mono shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                      on ? "bg-bull/20 text-bull" : "bg-panel-border/40 text-muted-foreground"
                    }`}
                  >
                    {on ? "Aan" : "Uit"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Sound & vibration per type */}
        <section className="panel mb-5 p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider">🔊 Geluid & trilling</h2>
            <button
              onClick={() => commitSound({
                entry: { sound: "triple", vibrate: "double", volume: 0.6 },
                exit:  { sound: "coin",   vibrate: "long",   volume: 0.7 },
                pump:  { sound: "siren",  vibrate: "pulse",  volume: 0.75 },
                other: { sound: "ding",   vibrate: "short",  volume: 0.5 },
              })}
              className="mono rounded-md border border-panel-border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Kies per signaal een uniek geluid en trilpatroon — dan hoor je direct het verschil zonder te kijken.
          </p>
          <div className="flex flex-col divide-y divide-panel-border/60">
            {kindOrder.map((k) => {
              const s = sound[k];
              const meta = KIND_META[k];
              return (
                <div key={k} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black">{meta.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {SOUND_LABELS[s.sound]} · trilling {VIBRATE_LABELS[s.vibrate].toLowerCase()}
                      </div>
                    </div>
                    <button
                      onClick={() => previewCombo(s.sound, s.vibrate, s.volume)}
                      className="mono shrink-0 rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/20"
                    >
                      ▶ Test
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="mono text-[9px] font-black uppercase tracking-wider text-muted-foreground">Geluid</span>
                      <select
                        value={s.sound}
                        onChange={(e) =>
                          commitSound({ ...sound, [k]: { ...s, sound: e.target.value as SoundPreset } })
                        }
                        className="mono rounded-md border border-panel-border bg-panel px-2 py-1.5 text-[11px] outline-none focus:border-primary"
                      >
                        {SOUND_KEYS.map((sk) => (
                          <option key={sk} value={sk}>{SOUND_LABELS[sk]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="mono text-[9px] font-black uppercase tracking-wider text-muted-foreground">Trilling</span>
                      <select
                        value={s.vibrate}
                        onChange={(e) =>
                          commitSound({ ...sound, [k]: { ...s, vibrate: e.target.value as VibratePreset } })
                        }
                        className="mono rounded-md border border-panel-border bg-panel px-2 py-1.5 text-[11px] outline-none focus:border-primary"
                      >
                        {VIBRATE_KEYS.map((vk) => (
                          <option key={vk} value={vk}>{VIBRATE_LABELS[vk]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="mono w-14 text-[9px] font-black uppercase tracking-wider text-muted-foreground">Volume</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={s.volume}
                      onChange={(e) =>
                        commitSound({ ...sound, [k]: { ...s, volume: Number(e.target.value) } })
                      }
                      className="flex-1 accent-primary"
                    />
                    <span className="mono w-10 text-right text-[10px] tabular-nums text-muted-foreground">
                      {Math.round(s.volume * 100)}%
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
          <p className="mono mt-3 text-[10px] text-muted-foreground">
            Tip: trilling werkt vooral op telefoons. Geluid vereist dat push notificaties aan staan.
          </p>
        </section>

        {/* Symbol scope */}

        <section className="panel p-4">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wider">Per valuta / symbool</h2>
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {([
              { id: "all", label: "Alles" },
              { id: "only", label: "Alleen deze" },
              { id: "mute", label: "Behalve deze" },
            ] as const).map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`mono rounded-md px-2 py-2 text-[11px] font-black uppercase tracking-wider transition-colors ${
                  prefs.mode === m.id
                    ? "bg-primary text-primary-foreground"
                    : "border border-panel-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="mb-3 text-[11px] text-muted-foreground">
            {prefs.mode === "all" && "Je krijgt meldingen voor elke valuta."}
            {prefs.mode === "only" && "Je krijgt alleen meldingen voor de aangevinkte symbolen."}
            {prefs.mode === "mute" && "Je krijgt meldingen voor alle symbolen behalve de aangevinkte."}
          </p>

          {prefs.mode !== "all" && (
            <>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Zoek EURUSD, BTC, gold…"
                className="mono mb-3 w-full rounded-md border border-panel-border bg-panel px-3 py-2 text-[12px] outline-none focus:border-primary"
              />
              <div className="flex items-center justify-between pb-2">
                <span className="mono text-[10px] text-muted-foreground">
                  {prefs.symbols.length} geselecteerd
                </span>
                <button
                  onClick={() => commit({ ...prefs, symbols: [] })}
                  className="mono text-[10px] font-bold text-primary hover:underline"
                >
                  Wis selectie
                </button>
              </div>
              <div className="flex flex-col gap-4">
                {Object.entries(grouped).map(([kind, list]) => (
                  <div key={kind}>
                    <div className="mono mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      {kindLabel[kind] ?? kind}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {list.map((s) => {
                        const on = prefs.symbols.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggleSymbol(s.id)}
                            className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                              on
                                ? "border-primary bg-primary/10"
                                : "border-panel-border hover:border-panel-border/80"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="mono text-[11px] font-black">{s.id}</div>
                              <div className="truncate text-[10px] text-muted-foreground">{s.name}</div>
                            </div>
                            <span className={`text-sm ${on ? "text-primary" : "text-muted-foreground/50"}`}>
                              {on ? "●" : "○"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <p className="mono mt-4 text-center text-[10px] text-muted-foreground">
          Instellingen worden lokaal opgeslagen op dit apparaat.
        </p>
      </main>
    </div>
  );
}
