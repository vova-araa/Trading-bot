import { useEffect, useMemo, useState } from "react";
import { defaultValues, simulate } from "@/lib/bot-simulate";
import type { BotTemplate } from "@/lib/bot-marketplace";
import { onTick } from "@/lib/market-data";

// Toont welke entry/SL/TP + risico er uitkomen op basis van de huidige waarden,
// voor je installeert. Live: prijs tikt door.
export function BotPreview({ tpl }: { tpl: BotTemplate }) {
  const [symbol, setSymbol] = useState(tpl.symbols[0]);
  const [values, setValues] = useState(() => defaultValues(tpl));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const off = onTick(() => setTick((n) => n + 1));
    return () => { off(); };
  }, []);

  const sim = useMemo(() => simulate(tpl, values, symbol), [tpl, values, symbol, tick]);

  // Alleen de belangrijkste tweakbare velden tonen (te veel = onoverzichtelijk)
  const editableKeys = new Set(["lot", "sl", "tp", "risk", "rr", "gridStep", "gridLevels", "orderSize", "baseOrder", "safetyOrder", "maxSafety", "deviation", "leverage", "minSpread", "maxSlippage"]);
  const editableParams = tpl.params.filter((p) => editableKeys.has(p.key));

  return (
    <div className="border-t border-panel-border/60 bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="mono text-[10px] font-black uppercase tracking-wider text-primary">👁 Preview</div>
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="mono rounded-md border border-panel-border bg-background px-2 py-1 text-[10px] font-black uppercase"
        >
          {tpl.symbols.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Entry / SL / TP badges */}
      <div className="grid grid-cols-3 gap-1.5">
        <PriceBadge label="🎯 Entry" value={sim.entryStr} tone="primary" />
        <PriceBadge label="🛑 Stop" value={sim.slStr ?? "—"} tone="bear" />
        <PriceBadge label="💰 TP" value={sim.tpStr ?? "—"} tone="bull" />
      </div>

      {/* Risk numbers */}
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <Stat label="Risk" value={`$${sim.riskUsd.toFixed(0)}`} cls="text-bear" />
        <Stat label="Reward" value={`$${sim.rewardUsd.toFixed(0)}`} cls="text-bull" />
        <Stat label="R:R" value={sim.rr > 0 ? `1:${sim.rr.toFixed(2)}` : "—"} cls={sim.rr >= 2 ? "text-bull" : sim.rr >= 1 ? "text-primary" : "text-bear"} />
        <Stat label="Drawdown" value={`${sim.drawdownPct.toFixed(1)}%`} cls={sim.drawdownPct > 5 ? "text-bear" : "text-foreground"} />
      </div>

      {/* Live parameter tweaks */}
      {editableParams.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">Pas aan om effect te zien</div>
          <div className="grid grid-cols-2 gap-1.5">
            {editableParams.map((p) => (
              <label key={p.key} className="flex items-center justify-between gap-2 rounded-md border border-panel-border/60 bg-panel/60 px-2 py-1">
                <span className="mono truncate text-[10px] text-muted-foreground">{p.label}</span>
                {p.type === "select" ? (
                  <select
                    value={String(values[p.key] ?? p.default)}
                    onChange={(e) => setValues({ ...values, [p.key]: e.target.value })}
                    className="mono w-20 rounded bg-background px-1 py-0.5 text-right text-[10px] font-black"
                  >
                    {p.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    type="number"
                    step={p.step ?? 0.01}
                    min={p.min}
                    max={p.max}
                    value={Number(values[p.key] ?? p.default)}
                    onChange={(e) => setValues({ ...values, [p.key]: parseFloat(e.target.value) })}
                    className="mono w-20 rounded bg-background px-1 py-0.5 text-right text-[10px] font-black"
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Breakdown per bot-kind */}
      {sim.breakdown.length > 0 && (
        <div className="mt-3 rounded-md border border-panel-border/60 bg-panel/40 p-2">
          {sim.breakdown.map((b) => (
            <div key={b.label} className="mono flex justify-between text-[10px]">
              <span className="text-muted-foreground">{b.label}</span>
              <span className="font-black">{b.value}</span>
            </div>
          ))}
          <div className="mono mt-1 flex justify-between border-t border-panel-border/60 pt-1 text-[10px]">
            <span className="text-muted-foreground">Totale exposure</span>
            <span className="font-black">${sim.exposureUsd.toFixed(0)}</span>
          </div>
        </div>
      )}

      {/* Notes / warnings */}
      {sim.notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {sim.notes.map((n, i) => (
            <li key={i} className={`rounded-md border px-2 py-1 text-[10px] ${
              n.startsWith("⚠") ? "border-bear/40 bg-bear/10 text-bear" : "border-panel-border/60 bg-panel/40 text-muted-foreground"
            }`}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PriceBadge({ label, value, tone }: { label: string; value: string; tone: "primary" | "bear" | "bull" }) {
  const cls = tone === "primary" ? "border-primary/40 bg-primary/10 text-primary"
    : tone === "bear" ? "border-bear/40 bg-bear/10 text-bear"
    : "border-bull/40 bg-bull/10 text-bull";
  return (
    <div className={`rounded-md border px-2 py-1.5 text-center ${cls}`}>
      <div className="mono text-[9px] uppercase tracking-widest opacity-70">{label}</div>
      <div className="mono text-[12px] font-black">{value}</div>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-md bg-panel/60 px-2 py-1 text-center">
      <div className="mono text-[8px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mono text-[11px] font-black ${cls ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}
