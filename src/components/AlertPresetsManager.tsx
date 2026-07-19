import { useEffect, useMemo, useRef, useState } from "react";
import {
  BUILTIN_PRESETS,
  buildShareUrl,
  decodePresets,
  deletePreset,
  duplicatePreset,
  encodePresets,
  exportPresetsJSON,
  importPresetsJSON,
  listPresets,
  savePreset,
  subscribePresets,
  type AlertPreset,
} from "@/lib/alert-presets";

export function AlertPresetsManager() {
  const [presets, setPresets] = useState<AlertPreset[]>(() => listPresets());
  const [copied, setCopied] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const off = subscribePresets(setPresets); return () => { off(); }; }, []);

  // Auto-import via ?preset= in URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const token = u.searchParams.get("preset");
    if (!token) return;
    try {
      const arr = decodePresets(token);
      arr.forEach((p) => savePreset(p));
      setFlash(`✅ ${arr.length} preset${arr.length === 1 ? "" : "s"} geïmporteerd uit link`);
      u.searchParams.delete("preset");
      window.history.replaceState(null, "", u.toString());
      setTimeout(() => setFlash(null), 4000);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const custom = useMemo(() => presets.filter((p) => !p.builtin), [presets]);

  async function copyShare(p: AlertPreset) {
    const url = buildShareUrl(p);
    try { await navigator.clipboard.writeText(url); } catch { /* noop */ }
    setCopied(p.id);
    setTimeout(() => setCopied(null), 1600);
  }

  function downloadJSON() {
    const blob = new Blob([exportPresetsJSON(custom)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ara-alert-presets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((t) => {
      try {
        const n = importPresetsJSON(t);
        setFlash(`✅ ${n.length} preset${n.length === 1 ? "" : "s"} geïmporteerd`);
        setError(null);
      } catch (err) { setError((err as Error).message); }
      finally { if (fileRef.current) fileRef.current.value = ""; setTimeout(() => setFlash(null), 4000); }
    });
  }

  function importFromText() {
    setError(null);
    const raw = importText.trim();
    if (!raw) return;
    try {
      // Accept raw JSON, share-url, or token.
      let n: AlertPreset[] = [];
      if (raw.startsWith("{") || raw.startsWith("[")) {
        n = importPresetsJSON(raw);
      } else {
        const token = raw.includes("preset=") ? new URL(raw).searchParams.get("preset")! : raw;
        const arr = decodePresets(token);
        n = arr.map((p) => savePreset(p));
      }
      setFlash(`✅ ${n.length} preset${n.length === 1 ? "" : "s"} geïmporteerd`);
      setImportText("");
      setImportOpen(false);
      setTimeout(() => setFlash(null), 4000);
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Alarm-presets</div>
          <div className="text-lg font-black tracking-tight">🎛 Presets ({presets.length})</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Bundel niveaus + geluid + prioriteit. Deel via link of JSON.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => setImportOpen((o) => !o)}
            className="mono rounded-md border border-panel-border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-foreground hover:border-primary hover:text-primary"
          >📥 Import</button>
          <button
            onClick={downloadJSON}
            disabled={custom.length === 0}
            className="mono rounded-md border border-panel-border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
          >📤 Export</button>
        </div>
      </div>

      {flash && <div className="mb-2 rounded-md border border-bull/40 bg-bull/10 px-3 py-1.5 text-[11px] text-bull">{flash}</div>}
      {error && <div className="mb-2 rounded-md border border-bear/40 bg-bear/10 px-3 py-1.5 text-[11px] text-bear">⚠ {error}</div>}

      {importOpen && (
        <div className="mb-3 rounded-md border border-panel-border bg-muted/20 p-3">
          <div className="mono mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Plak link / token / JSON</div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={3}
            placeholder="https://…/?preset=…  of  {…}"
            className="mono w-full rounded-md border border-panel-border bg-background px-2 py-1.5 text-[11px]"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={importFromText}
              className="mono flex-1 rounded-md bg-primary py-1.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground hover:brightness-110"
            >Importeer</button>
            <label className="mono flex-1 cursor-pointer rounded-md border border-panel-border py-1.5 text-center text-[10px] font-black uppercase tracking-wider text-foreground hover:border-primary hover:text-primary">
              📄 JSON-bestand
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {presets.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-md border border-panel-border bg-background/40 px-2.5 py-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-panel-border/60 text-lg">{p.emoji ?? "🔔"}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-black">{p.name}</span>
                {p.builtin && <span className="mono rounded bg-muted px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-muted-foreground">standaard</span>}
              </div>
              <div className="mono truncate text-[10px] text-muted-foreground">
                {activeLevels(p).join(" · ")} · {p.priority} · {p.sound}/{p.vibrate} · {Math.round(p.volume * 100)}%
                {p.repeat && " · 🔁"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => copyShare(p)}
                className="mono rounded-md border border-panel-border px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground hover:border-primary hover:text-primary"
                title="Kopieer deel-link"
              >{copied === p.id ? "✓" : "🔗"}</button>
              {!p.builtin && (
                <>
                  <button
                    onClick={() => duplicatePreset(p.id)}
                    className="mono rounded-md border border-panel-border px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground hover:text-foreground"
                    title="Dupliceer"
                  >⧉</button>
                  <button
                    onClick={() => { if (confirm(`Verwijder preset "${p.name}"?`)) deletePreset(p.id); }}
                    className="mono rounded-md border border-panel-border px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground hover:border-bear/50 hover:text-bear"
                  >✕</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function activeLevels(p: AlertPreset): string[] {
  const out: string[] = [];
  if (p.levels.entryNear) out.push("⚡near");
  if (p.levels.entry) out.push("🎯entry");
  if (p.levels.tp) out.push("💰tp");
  if (p.levels.sl) out.push("🛑sl");
  return out.length ? out : ["—"];
}

/** Small dropdown used inside QuickAlertEditor. */
export function AlertPresetPicker({
  onApply,
  onSaveCurrent,
  onShareCurrent,
}: {
  onApply: (p: AlertPreset) => void;
  onSaveCurrent: (name: string) => void;
  onShareCurrent: () => Promise<string> | string;
}) {
  const [presets, setPresets] = useState<AlertPreset[]>(() => listPresets());
  const [savingName, setSavingName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [shared, setShared] = useState<string | null>(null);

  useEffect(() => { const off = subscribePresets(setPresets); return () => { off(); }; }, []);

  async function doShare() {
    const url = await onShareCurrent();
    try { await navigator.clipboard.writeText(url); } catch { /* noop */ }
    setShared("Gekopieerd ✓");
    setTimeout(() => setShared(null), 1500);
  }

  return (
    <section>
      <div className="mono mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Preset</span>
        <div className="flex gap-1">
          <button
            onClick={() => setSavingName((s) => (s === null ? "" : null))}
            className="mono rounded border border-panel-border px-2 py-0.5 text-[10px] font-bold text-foreground hover:border-primary hover:text-primary"
          >💾 Bewaar</button>
          <button
            onClick={doShare}
            className="mono rounded border border-panel-border px-2 py-0.5 text-[10px] font-bold text-foreground hover:border-primary hover:text-primary"
          >{shared ?? "🔗 Deel"}</button>
        </div>
      </div>
      <select
        onChange={(e) => {
          const p = presets.find((x) => x.id === e.target.value);
          if (p) onApply(p);
          e.currentTarget.selectedIndex = 0;
        }}
        defaultValue=""
        className="mono w-full rounded-md border border-panel-border bg-background px-3 py-2 text-sm"
      >
        <option value="" disabled>— Kies preset om toe te passen —</option>
        {BUILTIN_PRESETS.length > 0 && (
          <optgroup label="Standaard">
            {presets.filter((p) => p.builtin).map((p) => (
              <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
            ))}
          </optgroup>
        )}
        {presets.some((p) => !p.builtin) && (
          <optgroup label="Mijn presets">
            {presets.filter((p) => !p.builtin).map((p) => (
              <option key={p.id} value={p.id}>{p.emoji ?? "🔔"} {p.name}</option>
            ))}
          </optgroup>
        )}
      </select>
      {savingName !== null && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Naam (bijv. Mijn EURUSD scalps)"
            className="mono flex-1 rounded-md border border-panel-border bg-background px-2 py-1.5 text-[11px]"
          />
          <button
            onClick={() => { if (name.trim()) { onSaveCurrent(name.trim()); setName(""); setSavingName(null); } }}
            className="mono rounded-md bg-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground hover:brightness-110"
          >Bewaar</button>
        </div>
      )}
    </section>
  );
}

/** Helper to build a preset from live editor state. */
export function presetFromState(input: {
  name: string;
  emoji?: string;
  levels: { entryNear?: boolean; entry?: boolean; tp?: boolean; sl?: boolean };
  priority: AlertPreset["priority"];
  sound: AlertPreset["sound"];
  vibrate: AlertPreset["vibrate"];
  volume: number;
  repeat: boolean;
  nearFrac?: number;
}): AlertPreset {
  return savePreset({
    name: input.name,
    emoji: input.emoji ?? "🔔",
    levels: {
      entryNear: !!input.levels.entryNear,
      entry: !!input.levels.entry,
      tp: !!input.levels.tp,
      sl: !!input.levels.sl,
    },
    priority: input.priority,
    sound: input.sound,
    vibrate: input.vibrate,
    volume: input.volume,
    repeat: input.repeat,
    nearFrac: input.nearFrac ?? 0.08,
  });
}

/** Encode a single ad-hoc preset (not persisted) for sharing. */
export function encodeAdHoc(name: string, editor: {
  levels: { entryNear?: boolean; entry?: boolean; tp?: boolean; sl?: boolean };
  priority: AlertPreset["priority"];
  sound: AlertPreset["sound"];
  vibrate: AlertPreset["vibrate"];
  volume: number;
  repeat: boolean;
  nearFrac?: number;
}): string {
  const token = encodePresets([{
    id: "adhoc", createdAt: 0,
    name,
    emoji: "🔔",
    levels: {
      entryNear: !!editor.levels.entryNear,
      entry: !!editor.levels.entry,
      tp: !!editor.levels.tp,
      sl: !!editor.levels.sl,
    },
    priority: editor.priority,
    sound: editor.sound,
    vibrate: editor.vibrate,
    volume: editor.volume,
    repeat: editor.repeat,
    nearFrac: editor.nearFrac ?? 0.08,
  }]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?preset=${token}`;
}
