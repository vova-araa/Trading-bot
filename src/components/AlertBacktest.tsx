import { useEffect, useMemo, useState } from "react";
import type { Setup } from "@/lib/strategies";
import { formatPrice } from "@/lib/market-data";
import { getAlerts, type Alert } from "@/lib/alerts";
import { backtestAlerts, type BacktestResult } from "@/lib/alert-backtest";

type Props = { setup: Setup; onClose: () => void };
const TFS = ["1m", "5m", "15m", "1h"] as const;
const DAY_OPTS = [1, 3, 7, 14, 30];

function virtualAlerts(setup: Setup): Alert[] {
  const range = Math.abs(setup.target - setup.stop);
  const near = range * 0.08;
  const base = { symbol: setup.symbol, status: "armed" as const, repeat: false, createdAt: Date.now(), linkedSetupId: setup.id };
  return [
    { ...base, id: `v-near-${setup.id}`, kind: "near", price: setup.entry, proximity: near, levelType: "near-entry", note: "⚡ Vlakbij entry" },
    { ...base, id: `v-entry-${setup.id}`, kind: "cross", price: setup.entry, levelType: "entry", note: "🎯 Entry" },
    { ...base, id: `v-tp-${setup.id}`, kind: "cross", price: setup.target, levelType: "tp", note: "💰 Take profit" },
    { ...base, id: `v-sl-${setup.id}`, kind: "cross", price: setup.stop, levelType: "sl", note: "🛑 Stop loss" },
  ];
}

export function AlertBacktest({ setup, onClose }: Props) {
  const [tf, setTf] = useState<(typeof TFS)[number]>("5m");
  const [days, setDays] = useState(7);
  const [useVirtual, setUseVirtual] = useState<boolean | null>(null);

  const armed = useMemo(
    () => getAlerts().filter((a) => a.linkedSetupId === setup.id || a.symbol === setup.symbol),
    [setup.id, setup.symbol],
  );
  const hasArmed = armed.some((a) => a.linkedSetupId === setup.id);
  const useV = useVirtual ?? !hasArmed;

  const result: BacktestResult = useMemo(() => {
    const alerts = useV ? virtualAlerts(setup) : armed;
    return backtestAlerts(alerts, { symbol: setup.symbol, timeframe: tf, days });
  }, [useV, armed, setup, tf, days]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { candles, events, summary } = result;
  const min = candles.length ? Math.min(...candles.map((c) => c.low)) : 0;
  const max = candles.length ? Math.max(...candles.map((c) => c.high)) : 1;
  const pad = (max - min) * 0.05 || 1;
  const lo = min - pad, hi = max + pad;
  const y = (p: number) => 100 - ((p - lo) / (hi - lo)) * 100;

  const levelColor: Record<string, string> = {
    entry: "hsl(var(--primary))",
    tp: "hsl(var(--bull))",
    sl: "hsl(var(--bear))",
    "near-entry": "hsl(var(--muted-foreground))",
    custom: "hsl(var(--muted-foreground))",
  };
  const levelEmoji: Record<string, string> = {
    entry: "🎯", tp: "💰", sl: "🛑", "near-entry": "⚡", custom: "🔔",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="panel max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-panel-border bg-panel/95 px-4 py-3 backdrop-blur">
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">🧪 Alarm-backtest</div>
            <div className="text-lg font-black">{setup.symbol}</div>
          </div>
          <button onClick={onClose} className="mono rounded-md border border-panel-border px-3 py-1 text-xs">Sluit</button>
        </div>

        {/* Controls */}
        <div className="grid gap-3 border-b border-panel-border px-4 py-3">
          <div>
            <div className="mono mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Bron</div>
            <div className="flex gap-1">
              <button
                onClick={() => setUseVirtual(true)}
                className={`mono flex-1 rounded-md border px-2 py-1.5 text-[11px] font-bold ${useV ? "border-primary bg-primary/15 text-primary" : "border-panel-border text-muted-foreground"}`}
              >Deze setup ({virtualAlerts(setup).length})</button>
              <button
                onClick={() => setUseVirtual(false)}
                disabled={!hasArmed}
                className={`mono flex-1 rounded-md border px-2 py-1.5 text-[11px] font-bold disabled:opacity-40 ${!useV ? "border-primary bg-primary/15 text-primary" : "border-panel-border text-muted-foreground"}`}
              >Actieve alarmen ({armed.filter(a=>a.linkedSetupId===setup.id).length})</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mono mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Timeframe</div>
              <div className="flex gap-1">
                {TFS.map((t) => (
                  <button key={t} onClick={() => setTf(t)}
                    className={`mono flex-1 rounded-md border px-2 py-1 text-[11px] font-bold ${tf===t?"border-primary bg-primary/15 text-primary":"border-panel-border text-muted-foreground"}`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="mono mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Periode</div>
              <div className="flex gap-1">
                {DAY_OPTS.map((d) => (
                  <button key={d} onClick={() => setDays(d)}
                    className={`mono flex-1 rounded-md border px-2 py-1 text-[11px] font-bold ${days===d?"border-primary bg-primary/15 text-primary":"border-panel-border text-muted-foreground"}`}>{d}d</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-px bg-panel-border/50">
          <Stat label="Totaal" value={summary.total} />
          <Stat label="🎯 Entry" value={summary.entryHit} tone="primary" />
          <Stat label="💰 TP" value={summary.tpHit} tone="bull" />
          <Stat label="🛑 SL" value={summary.slHit} tone="bear" />
        </div>
        {typeof summary.winRate === "number" && (
          <div className="border-b border-panel-border px-4 py-2 text-[11px]">
            <span className="mono text-muted-foreground">Winrate simulatie:</span>{" "}
            <span className={`mono font-black ${summary.winRate >= 50 ? "text-bull" : "text-bear"}`}>{summary.winRate.toFixed(0)}%</span>
            <span className="mono text-muted-foreground"> · {summary.trades} trades</span>
          </div>
        )}

        {/* Sparkline chart */}
        <div className="border-b border-panel-border p-3">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-40 w-full">
            {/* level lines */}
            {(["entry","tp","sl"] as const).map((lvl) => {
              const price = lvl === "entry" ? setup.entry : lvl === "tp" ? setup.target : setup.stop;
              return (
                <line key={lvl} x1={0} x2={100} y1={y(price)} y2={y(price)}
                  stroke={levelColor[lvl]} strokeWidth={0.4} strokeDasharray="1,1" opacity={0.7} />
              );
            })}
            {/* price path */}
            {candles.length > 1 && (
              <polyline fill="none" stroke="hsl(var(--foreground))" strokeWidth={0.5}
                points={candles.map((c,i)=>`${(i/(candles.length-1))*100},${y(c.close)}`).join(" ")} />
            )}
            {/* event markers */}
            {events.map((e, i) => {
              const idx = candles.findIndex((c) => c.time === e.time);
              const x = candles.length > 1 ? (idx / (candles.length - 1)) * 100 : 50;
              return <circle key={i} cx={x} cy={y(e.hitPrice)} r={0.9} fill={levelColor[e.level]} />;
            })}
          </svg>
          <div className="mono mt-1 flex flex-wrap gap-2 text-[9px] text-muted-foreground">
            <span>🎯 {formatPrice(setup.symbol, setup.entry)}</span>
            <span className="text-bull">💰 {formatPrice(setup.symbol, setup.target)}</span>
            <span className="text-bear">🛑 {formatPrice(setup.symbol, setup.stop)}</span>
            <span className="ml-auto">{candles.length} candles · {events.length} triggers</span>
          </div>
        </div>

        {/* Event log */}
        <div className="px-4 py-3">
          <div className="mono mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Tijdlijn ({events.length})</div>
          {events.length === 0 ? (
            <div className="mono rounded-md border border-dashed border-panel-border px-3 py-6 text-center text-[11px] text-muted-foreground">
              Geen alarmen zouden getriggerd zijn in deze periode.
            </div>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {events.slice().reverse().map((e, i) => (
                <div key={i} className="mono flex items-center justify-between rounded-md border border-panel-border/60 px-2 py-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span>{levelEmoji[e.level]}</span>
                    <span className="font-bold uppercase" style={{ color: levelColor[e.level] }}>{e.level}</span>
                    <span className="text-muted-foreground">{new Date(e.time * 1000).toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <span className="font-bold tabular-nums">{formatPrice(setup.symbol, e.hitPrice)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "primary" | "bull" | "bear" }) {
  const color = tone === "primary" ? "text-primary" : tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="bg-panel px-2 py-2 text-center">
      <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mono text-lg font-black tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
