// Kaart die na afsluiten van een trade het resultaat toont en deelbaar maakt.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { computeResult, shareResult, shareText, type TradeSide } from "@/lib/trade-share";

export function TradeShareCard({
  symbol,
  side,
  entry,
  stop,
  target,
  currentExit,
}: {
  symbol: string;
  side: TradeSide;
  entry: number;
  stop: number;
  target: number;
  currentExit: number;
}) {
  const [exit, setExit] = useState<number>(currentExit || entry);
  const [size, setSize] = useState<number>(1000);
  const [leverage, setLeverage] = useState<number>(1);

  const result = useMemo(
    () => computeResult({ symbol, side, entry, stop, target, exit, size, leverage }),
    [symbol, side, entry, stop, target, exit, size, leverage],
  );

  const win = result.pnlPct >= 0;
  const sign = win ? "+" : "";

  const preview = useMemo(() => shareText(result), [result]);

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.origin : undefined;
    const r = await shareResult(result, url);
    if (r === "shared") toast.success("Gedeeld");
    else if (r === "copied") toast.success("Resultaat gekopieerd");
    else toast.error("Delen mislukt");
  }

  function quick(kind: "tp" | "sl" | "now") {
    if (kind === "tp") setExit(target);
    else if (kind === "sl") setExit(stop);
    else setExit(currentExit);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{win ? "🏆" : "📉"}</span>
        <div>
          <div className="text-sm font-bold">Deel je resultaat</div>
          <div className="text-[11px] text-muted-foreground">Vul de exit in, share met één tap.</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <button onClick={() => quick("tp")} className="rounded-lg bg-green-500/10 border border-green-500/40 py-2 font-semibold text-green-500">🎯 TP</button>
        <button onClick={() => quick("now")} className="rounded-lg bg-muted/40 border border-border py-2 font-semibold">📍 Nu</button>
        <button onClick={() => quick("sl")} className="rounded-lg bg-red-500/10 border border-red-500/40 py-2 font-semibold text-red-500">🛑 SL</button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Field label="Exit prijs" value={exit} step={entry * 0.0001} onChange={setExit} />
        <Field label="Inzet ($)" value={size} step={100} onChange={setSize} />
        <Field label="Hefboom" value={leverage} step={1} min={1} onChange={setLeverage} />
      </div>

      <div className={`rounded-xl p-3 border-2 ${win ? "bg-green-500/10 border-green-500/50" : "bg-red-500/10 border-red-500/50"}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">{side === "long" ? "▲ LONG" : "▼ SHORT"} {symbol}</span>
          <span className={`mono text-xs ${win ? "text-green-500" : "text-red-500"}`}>{result.rr >= 0 ? "+" : ""}{result.rr.toFixed(2)}R</span>
        </div>
        <div className={`mono text-3xl font-black ${win ? "text-green-500" : "text-red-500"}`}>
          {sign}{result.pnlPct.toFixed(2)}%
        </div>
        {result.pnlAbs !== 0 && (
          <div className={`mono text-sm font-semibold ${win ? "text-green-500" : "text-red-500"}`}>
            {sign}${result.pnlAbs.toFixed(2)}
          </div>
        )}
      </div>

      <pre className="mono whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-2 text-[10px] leading-snug">{preview}</pre>

      <button
        onClick={onShare}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-bold active:scale-[0.98] transition"
      >
        📲 Deel resultaat
      </button>
    </div>
  );
}

function Field({ label, value, step, min, onChange }: { label: string; value: number; step: number; min?: number; onChange: (n: number) => void }) {
  return (
    <label className="rounded-lg border border-border bg-muted/20 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mono w-full bg-transparent text-sm font-bold outline-none"
      />
    </label>
  );
}
