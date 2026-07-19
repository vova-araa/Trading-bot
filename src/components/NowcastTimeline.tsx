import { getNowcastTimeline, type NewsItem, type NowcastSnapshot } from "@/lib/news";
import { SourceAccuracyBadge, SourceAccuracyTable } from "./SourceAccuracy";

export function NowcastTimeline({ item, now }: { item: NewsItem; now: number }) {
  const snaps = getNowcastTimeline(item, now);
  if (snaps.length < 2) {
    return (
      <div className="mt-3 rounded-lg border border-panel-border/60 bg-panel/40 p-3 text-center text-[11px] text-muted-foreground">
        Timeline verschijnt zodra meer bronnen publiceren. Nu {snaps.length}/8 updates.
      </div>
    );
  }

  const nowSec = Math.floor(now / 1000);
  const first = snaps[0].time;
  const last = item.time; // release
  const span = Math.max(1, last - first);
  const nowPct = Math.min(100, Math.max(0, ((Math.min(nowSec, last) - first) / span) * 100));

  const forecastN = parseFloat(item.forecast ?? "0") || 0;
  const values = snaps.map((s) => parseFloat(s.value) || 0);
  const yMin = Math.min(forecastN, ...values);
  const yMax = Math.max(forecastN, ...values);
  const yRange = Math.max(0.1, yMax - yMin);
  const yPct = (v: number) => 100 - ((v - yMin) / yRange) * 100;

  const W = 100;
  const H = 60;
  const points = snaps.map((s, i) => {
    const x = ((s.time - first) / span) * W;
    const y = (yPct(parseFloat(s.value)) / 100) * H;
    return { x, y, s, i };
  });
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const forecastY = (yPct(forecastN) / 100) * H;

  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-panel/60 p-3">
      <div className="mono flex items-center justify-between text-[10px] uppercase tracking-wider">
        <span className="font-black text-primary">📈 Nowcast tijdlijn</span>
        <span className="text-muted-foreground">{snaps.length}/8 updates</span>
      </div>

      {/* Sparkline */}
      <div className="relative mt-2 h-[80px] w-full">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
          {/* Consensus baseline */}
          <line x1={0} x2={W} y1={forecastY} y2={forecastY} stroke="currentColor" strokeDasharray="1.5 1.5" strokeWidth={0.4} className="text-muted-foreground/60" />
          {/* Area under line */}
          <path
            d={`${linePath} L${points[points.length - 1].x.toFixed(2)},${H} L${points[0].x.toFixed(2)},${H} Z`}
            fill="hsl(var(--primary) / 0.15)"
          />
          {/* Line */}
          <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth={0.8} strokeLinejoin="round" strokeLinecap="round" />
          {/* Now marker */}
          <line x1={nowPct} x2={nowPct} y1={0} y2={H} stroke="hsl(var(--primary))" strokeWidth={0.5} strokeDasharray="0.8 0.8" opacity={0.6} />
          {/* Release marker at right */}
          <line x1={W} x2={W} y1={0} y2={H} stroke="hsl(var(--bear))" strokeWidth={0.6} />
          {/* Points */}
          {points.map((p) => {
            const color = p.s.bias === "hawkish" ? "hsl(var(--bull))" : p.s.bias === "dovish" ? "hsl(var(--bear))" : "hsl(var(--muted-foreground))";
            return <circle key={p.i} cx={p.x} cy={p.y} r={p.s.isFinal ? 1.6 : 1.1} fill={color} stroke="hsl(var(--background))" strokeWidth={0.3} />;
          })}
        </svg>
        <div className="mono pointer-events-none absolute -top-1 right-0 rounded bg-bear/20 px-1 text-[9px] font-black text-bear">RELEASE</div>
        <div className="mono pointer-events-none absolute -bottom-1 left-0 text-[9px] text-muted-foreground">T-72u</div>
      </div>

      {/* Legend */}
      <div className="mono mt-1.5 flex items-center gap-3 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-bull" />hawkish</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-bear" />dovish</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />neutraal</span>
        <span className="ml-auto">— — consensus {item.forecast}</span>
      </div>

      {/* Snapshot rows */}
      <ol className="mt-2 divide-y divide-panel-border/40 border-t border-panel-border/40">
        {snaps.map((s) => <SnapshotRow key={s.time} s={s} />)}
      </ol>

      {/* Historische nauwkeurigheid per bron */}
      <SourceAccuracyTable highlight={snaps[snaps.length - 1]?.source} />
    </div>
  );
}

function SnapshotRow({ s }: { s: NowcastSnapshot }) {
  const biasColor = s.bias === "hawkish" ? "text-bull" : s.bias === "dovish" ? "text-bear" : "text-muted-foreground";
  const biasIcon  = s.bias === "hawkish" ? "▲" : s.bias === "dovish" ? "▼" : "≈";
  const deltaSign = s.delta > 0 ? "+" : "";
  const deltaColor = s.delta > 0 ? "text-bull" : s.delta < 0 ? "text-bear" : "text-muted-foreground";
  return (
    <li className="grid grid-cols-[52px_1fr_auto] items-center gap-2 py-1.5 text-[10px]">
      <span className="mono font-black text-muted-foreground">
        {s.isFinal ? "T-15m" : formatMinsBefore(s.minutesBeforeRelease)}
      </span>
      <span className="min-w-0">
        <div className="mono flex items-center gap-1.5 truncate">
          <span className="truncate font-black text-foreground">{s.source}</span>
          <SourceAccuracyBadge source={s.source} />
        </div>
        <div className="mono text-muted-foreground">
          <span className={biasColor}>{biasIcon} {s.value}</span>
          {s.delta !== 0 && <span className={`ml-1.5 ${deltaColor}`}>{deltaSign}{s.delta}</span>}
          <span className="ml-1.5">· conf {(s.confidence * 100).toFixed(0)}%</span>
        </div>
      </span>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-panel-border/50">
        <span className="block h-full bg-gradient-to-r from-primary to-bull" style={{ width: `${s.confidence * 100}%` }} />
      </span>
    </li>
  );
}

function formatMinsBefore(m: number): string {
  if (m >= 60) {
    const h = Math.round(m / 60);
    return `T-${h}u`;
  }
  return `T-${m}m`;
}
