import { useMemo, useState } from "react";
import { getAllSourceStats, getSourceStats, type SourceStats } from "@/lib/source-accuracy";
import type { Prediction } from "@/lib/news";

const GRADE_COLORS: Record<SourceStats["grade"], string> = {
  A: "bg-bull/20 text-bull border-bull/40",
  B: "bg-primary/20 text-primary border-primary/40",
  C: "bg-yellow-500/20 text-yellow-500 border-yellow-500/40",
  D: "bg-bear/20 text-bear border-bear/40",
};

/** Compacte badge — 1 bron. Toont grade + directional accuracy. Klikbaar → full sheet. */
export function SourceAccuracyBadge({
  source,
  onOpen,
}: {
  source: Prediction["source"];
  onOpen?: () => void;
}) {
  const s = useMemo(() => getSourceStats(source), [source]);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Historische nauwkeurigheid ${source} — klik voor details`}
      className={`mono inline-flex items-center gap-1 rounded border px-1.5 py-[1px] text-[9px] font-black transition hover:brightness-110 ${GRADE_COLORS[s.grade]}`}
    >
      <span>{s.grade}</span>
      <span className="opacity-80">·</span>
      <span>{Math.round(s.directionalAccuracy * 100)}%</span>
      <span className="opacity-60">({s.n})</span>
    </button>
  );
}

/** Volledige tabel — alle bronnen, gesorteerd op directional accuracy. */
export function SourceAccuracyTable({ highlight }: { highlight?: Prediction["source"] }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => getAllSourceStats(), []);
  const topAcc = rows[0].directionalAccuracy;

  return (
    <div className="mt-3 rounded-lg border border-panel-border/60 bg-panel/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mono flex w-full items-center justify-between px-3 py-2 text-[10px] uppercase tracking-wider hover:bg-panel-border/20"
      >
        <span className="font-black text-primary">📊 Bron-nauwkeurigheid (historisch)</span>
        <span className="text-muted-foreground">{rows.length} bronnen · {open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-panel-border/40">
          {/* Header */}
          <div className="mono grid grid-cols-[1fr_38px_46px_46px_46px_54px] items-center gap-2 border-b border-panel-border/40 px-3 py-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>Bron</span>
            <span className="text-right" title="Sample size">n</span>
            <span className="text-right" title="Mean Absolute Error">MAE</span>
            <span className="text-right" title="Bias-Corrected MAE">BCM</span>
            <span className="text-right" title="Systematische bias vs actual">Bias</span>
            <span className="text-right" title="% correcte richting vs consensus">Hit</span>
          </div>

          {rows.map((s) => {
            const isHi = highlight === s.source;
            const accBar = (s.directionalAccuracy / topAcc) * 100;
            return (
              <div
                key={s.source}
                className={`grid grid-cols-[1fr_38px_46px_46px_46px_54px] items-center gap-2 border-b border-panel-border/30 px-3 py-1.5 text-[10px] last:border-b-0 ${
                  isHi ? "bg-primary/10" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="mono flex items-center gap-1.5">
                    <span className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[9px] font-black ${GRADE_COLORS[s.grade]}`}>
                      {s.grade}
                    </span>
                    <span className="truncate font-black text-foreground">{s.source}</span>
                  </div>
                  {/* Beat/Miss/Inline hit-rate mini-bars */}
                  <div className="mono mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                    <span className="text-bull">▲{Math.round(s.beat * 100)}%</span>
                    <span className="text-bear">▼{Math.round(s.miss * 100)}%</span>
                    <span>≈{Math.round(s.inline * 100)}%</span>
                  </div>
                </div>
                <span className="mono text-right text-muted-foreground">{s.n}</span>
                <span className="mono text-right font-black text-foreground">{s.mae}</span>
                <span className="mono text-right text-primary">{s.bcm}</span>
                <span className={`mono text-right ${s.bias > 0.05 ? "text-bull" : s.bias < -0.05 ? "text-bear" : "text-muted-foreground"}`}>
                  {s.bias > 0 ? "+" : ""}{s.bias}
                </span>
                <span className="relative flex items-center justify-end gap-1">
                  <span className="mono font-black text-foreground">{Math.round(s.directionalAccuracy * 100)}%</span>
                  <span className="h-1 w-6 overflow-hidden rounded-full bg-panel-border/50">
                    <span className="block h-full bg-gradient-to-r from-primary to-bull" style={{ width: `${accBar}%` }} />
                  </span>
                </span>
              </div>
            );
          })}

          <div className="mono border-t border-panel-border/40 px-3 py-2 text-[9px] leading-relaxed text-muted-foreground">
            <b className="text-foreground">MAE</b> = gem. absolute afwijking · <b className="text-foreground">BCM</b> = MAE na correctie voor systematische bias · <b className="text-foreground">Hit</b> = % keer dat de bron de juiste richting (beat/miss/inline) voorspelde. Grade A ≥75% · B ≥65% · C ≥55%.
          </div>
        </div>
      )}
    </div>
  );
}
