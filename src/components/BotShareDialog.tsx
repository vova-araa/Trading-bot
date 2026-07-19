// Modal om een bot te exporteren of te importeren als deelbare template.
// - Export: laat JSON, deeplink en QR zien; kopieer of download.
// - Import: plak JSON/link, of gebruik bestand-upload.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildShare, importPayload, parseShare, toJSON, toShareURL, toToken,
  type SharePayload,
} from "@/lib/bot-share";
import type { Bot } from "@/lib/bots";

type Mode = "export" | "import";

export function BotShareDialog({
  bot,
  initialMode = "export",
  initialText,
  onClose,
  onImported,
}: {
  bot?: Bot;
  initialMode?: Mode;
  initialText?: string;
  onClose: () => void;
  onImported?: (bot: Bot) => void;
}) {
  const [mode, setMode] = useState<Mode>(bot ? initialMode : "import");
  const payload = useMemo(() => (bot ? buildShare(bot) : null), [bot]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="panel flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-3 border-b border-panel-border/70 p-4">
          <span className="text-2xl">🔗</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black">Deel bot-template</div>
            <div className="mono text-[10px] text-muted-foreground">
              Werkt platform-onafhankelijk · MQL5 · cTrader · TradingView · Binance
            </div>
          </div>
          <button onClick={onClose} className="mono rounded-md px-2 py-1 text-lg text-muted-foreground hover:bg-panel-border/60">✕</button>
        </div>

        {bot && (
          <div className="grid grid-cols-2 gap-px border-b border-panel-border/70 bg-panel-border/40">
            <TabBtn active={mode === "export"} onClick={() => setMode("export")}>📤 Export</TabBtn>
            <TabBtn active={mode === "import"} onClick={() => setMode("import")}>📥 Import</TabBtn>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {mode === "export" && payload ? <ExportView payload={payload} /> : <ImportView initialText={initialText} onImported={(b) => { onImported?.(b); onClose(); }} />}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`mono px-3 py-2 text-[11px] font-black uppercase tracking-wider transition-colors ${
        active ? "bg-panel text-foreground" : "bg-panel/60 text-muted-foreground hover:text-foreground"
      }`}
    >{children}</button>
  );
}

function ExportView({ payload }: { payload: SharePayload }) {
  const json = useMemo(() => toJSON(payload), [payload]);
  const url = useMemo(() => toShareURL(payload), [payload]);
  const token = useMemo(() => toToken(payload), [payload]);
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} gekopieerd`);
    } catch { toast.error("Kopiëren mislukt"); }
  };
  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${payload.name.toLowerCase().replace(/\s+/g, "-")}.ara-bot.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const nativeShare = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try { await navigator.share({ title: `ARA bot · ${payload.name}`, text: `Bot preset voor ${payload.symbol}`, url }); }
      catch { /* user cancelled */ }
    } else { copy(url, "Link"); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-panel-border/70 bg-panel-border/20 p-3">
        <div className="mono mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Bevat</div>
        <div className="text-sm font-black">{payload.emoji} {payload.name}</div>
        <div className="mono mt-1 text-[11px] text-muted-foreground">
          {payload.symbol} · {payload.platform ?? "Custom"} · {Object.keys(payload.settings).length} param
          {payload.broker ? ` · broker ${payload.broker.brokerId} ${payload.broker.leverage}x` : ""}
        </div>
      </div>

      <div>
        <div className="mono mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>🔗 Deelbare link</span>
          <button onClick={() => copy(url, "Link")} className="rounded bg-primary/20 px-2 py-0.5 text-[9px] text-primary hover:bg-primary/30">kopieer</button>
        </div>
        <div className="mono break-all rounded-md border border-panel-border bg-background px-2 py-1.5 text-[10px]">{url}</div>
      </div>

      <div className="flex items-start gap-3">
        <img src={qr} alt="QR-code voor deel-link" width={120} height={120} className="rounded-md border border-panel-border bg-white p-1" />
        <div className="flex-1 space-y-2 text-[11px] text-muted-foreground">
          <div>Scan deze QR met je telefoon om de preset direct te openen in ARA.</div>
          <button onClick={nativeShare} className="mono w-full rounded-md bg-primary px-3 py-2 text-[11px] font-black uppercase text-primary-foreground hover:bg-primary/90">
            📲 Deel via…
          </button>
        </div>
      </div>

      <div>
        <div className="mono mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>{"{}"} JSON</span>
          <div className="flex gap-1">
            <button onClick={() => copy(json, "JSON")} className="rounded bg-panel-border/60 px-2 py-0.5 text-[9px] hover:bg-panel-border">kopieer</button>
            <button onClick={() => copy(token, "Token")} className="rounded bg-panel-border/60 px-2 py-0.5 text-[9px] hover:bg-panel-border">token</button>
            <button onClick={download} className="rounded bg-panel-border/60 px-2 py-0.5 text-[9px] hover:bg-panel-border">.json</button>
          </div>
        </div>
        <textarea
          readOnly
          value={json}
          className="mono h-40 w-full resize-none rounded-md border border-panel-border bg-background p-2 text-[10px] leading-snug"
        />
      </div>
    </div>
  );
}

function ImportView({ onImported, initialText }: { onImported: (bot: Bot) => void; initialText?: string }) {
  const [text, setText] = useState(initialText ?? "");
  const parsed = useMemo(() => (text.trim() ? parseShare(text) : null), [text]);

  const onFile = async (f: File | null | undefined) => {
    if (!f) return;
    setText(await f.text());
  };
  const doImport = () => {
    if (!parsed?.ok) return;
    const bot = importPayload(parsed.payload);
    toast.success(`${bot.name} geïmporteerd`);
    onImported(bot);
  };
  const paste = async () => {
    try { setText(await navigator.clipboard.readText()); }
    catch { toast.error("Kon klembord niet lezen"); }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-[11px] text-muted-foreground">
        Plak een <span className="mono font-bold text-primary">ARA bot-link</span>, JSON of token —
        of upload een <span className="mono">.json</span> bestand.
      </div>

      <div className="flex gap-2">
        <button onClick={paste} className="mono flex-1 rounded-md border border-panel-border px-3 py-2 text-[11px] font-black uppercase hover:bg-panel-border/40">
          📋 Plak
        </button>
        <label className="mono flex-1 cursor-pointer rounded-md border border-panel-border px-3 py-2 text-center text-[11px] font-black uppercase hover:bg-panel-border/40">
          📂 Bestand
          <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="{ ...  } of https://ara.trades/?bot=..."
        className="mono h-40 w-full resize-none rounded-md border border-panel-border bg-background p-2 text-[10px] leading-snug"
      />

      {parsed && !parsed.ok && (
        <div className="rounded-md border border-bear/40 bg-bear/10 p-2 text-[11px] text-bear">
          ⛔ {parsed.error}
        </div>
      )}
      {parsed?.ok && (
        <div className="rounded-lg border border-bull/40 bg-bull/10 p-3">
          <div className="text-sm font-black text-bull">{parsed.payload.emoji} {parsed.payload.name}</div>
          <div className="mono mt-1 text-[11px] text-muted-foreground">
            {parsed.payload.symbol} · {parsed.payload.platform ?? "Custom"} · {Object.keys(parsed.payload.settings).length} params
            {parsed.payload.broker ? ` · ${parsed.payload.broker.brokerId} ${parsed.payload.broker.leverage}x` : ""}
          </div>
        </div>
      )}

      <button
        onClick={doImport}
        disabled={!parsed?.ok}
        className={`mono w-full rounded-md px-3 py-2 text-[12px] font-black uppercase ${
          parsed?.ok
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "cursor-not-allowed bg-panel-border/40 text-muted-foreground"
        }`}
      >
        ✓ Importeer als nieuwe bot
      </button>
    </div>
  );
}
