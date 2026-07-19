import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/market-data";
import type { Setup } from "@/lib/strategies";
import { armSetupAlerts, getAlerts, subscribeAlerts } from "@/lib/alerts";
import { NearEntryAlertWizard } from "./NearEntryAlertWizard";
import { QuickAlertEditor } from "./QuickAlertEditor";
import { AlertBacktest } from "./AlertBacktest";

export function SignalCard({ setup, live }: { setup: Setup; live: number }) {
  const isLong = setup.side === "long";
  const dir = isLong ? "bull" : "bear";
  const [armed, setArmed] = useState(() => getAlerts().some((a) => a.linkedSetupId === setup.id));
  const [wizard, setWizard] = useState(false);
  const [editor, setEditor] = useState(false);
  const [backtest, setBacktest] = useState(false);
  useEffect(() => {
    const off = subscribeAlerts((all) => setArmed(all.some((a) => a.linkedSetupId === setup.id)));
    return () => { off(); };
  }, [setup.id]);

  // Distance to entry — how ready are we?
  const distToEntry = Math.abs(live - setup.entry);
  const range = Math.abs(setup.target - setup.stop);
  const readyPct = Math.max(0, Math.min(100, 100 - (distToEntry / (range * 0.15)) * 100));
  const ready = readyPct > 80;

  const potentialWin = Math.abs(setup.target - setup.entry);
  const potentialLoss = Math.abs(setup.entry - setup.stop);

  return (
    <div className={`panel overflow-hidden ${ready ? "ring-2 ring-primary/60" : ""}`}>
      {/* Big header */}
      <div className={`flex items-center justify-between px-4 py-3 ${isLong ? "bg-bull/15" : "bg-bear/15"}`}>
        <div className="flex items-center gap-3">
          <div
            className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl font-black ${
              isLong ? "bg-bull text-background" : "bg-bear text-background"
            }`}
          >
            {isLong ? "▲" : "▼"}
          </div>
          <div className="min-w-0">
            <div className={`mono text-[10px] font-bold uppercase tracking-widest ${isLong ? "text-bull" : "text-bear"}`}>
              {isLong ? "KOOP · LONG" : "VERKOOP · SHORT"}
            </div>
            <div className="truncate text-2xl font-black tracking-tight">{setup.symbol}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Nu prijs</div>
          <div className={`mono text-xl font-black tabular-nums text-${dir}`}>
            {formatPrice(setup.symbol, live)}
          </div>
        </div>
      </div>

      {/* Ready meter */}
      <div className="border-b border-panel-border/60 px-4 py-2">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="mono uppercase tracking-wider text-muted-foreground">
            {ready ? "🔥 Klaar om te kopen!" : "Wachten op prijs…"}
          </span>
          <span className="mono font-bold tabular-nums">{readyPct.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-500 ${ready ? "bg-primary" : "bg-muted-foreground/60"}`}
            style={{ width: `${readyPct}%` }}
          />
        </div>
      </div>

      {/* 3-step plan — kid friendly */}
      <div className="grid grid-cols-3 gap-px bg-panel-border/50">
        <Step
          num="1"
          label="Koop hier"
          hint="Entry"
          value={formatPrice(setup.symbol, setup.entry)}
          color="primary"
          icon="🎯"
        />
        <Step
          num="2"
          label="Stop hier"
          hint="Als het misgaat"
          value={formatPrice(setup.symbol, setup.stop)}
          color="bear"
          icon="🛑"
          sub={`-${formatPrice(setup.symbol, potentialLoss)}`}
        />
        <Step
          num="3"
          label="Neem winst"
          hint="Take profit"
          value={formatPrice(setup.symbol, setup.target)}
          color="bull"
          icon="💰"
          sub={`+${formatPrice(setup.symbol, potentialWin)}`}
        />
      </div>

      {/* Why */}
      <div className="flex items-center justify-between px-4 py-2.5 text-[11px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="mono">Reden:</span>
          <span>{setup.reason}</span>
        </div>
        <div className="mono flex items-center gap-2">
          <span className="rounded bg-bull/15 px-2 py-0.5 font-bold text-bull">
            Win {setup.rr.toFixed(1)}× meer dan verlies
          </span>
        </div>
      </div>

      {/* Alert bij entry */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-t border-panel-border/60 px-4 py-2.5">
        <button
          disabled={armed}
          onClick={() => armSetupAlerts(setup)}
          className={`mono rounded-md py-2 text-[11px] font-black uppercase tracking-wider transition-colors ${
            armed
              ? "bg-primary/15 text-primary"
              : "bg-primary text-primary-foreground hover:brightness-110"
          }`}
        >
          {armed ? "🔔 Alarmen actief" : "🔔 Zet alarm bij entry, TP & SL"}
        </button>
        <button
          onClick={() => setEditor(true)}
          title="Alarm-editor (levels, prioriteit, geluid)"
          className="mono rounded-md border border-panel-border px-3 py-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary"
        >
          ⚙
        </button>
        <button
          onClick={() => setBacktest(true)}
          title="Simuleer alarmen op historische data"
          className="mono rounded-md border border-panel-border px-3 py-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary"
        >
          🧪
        </button>
        <button
          onClick={() => setWizard(true)}
          title="Precies alarm instellen"
          className="mono rounded-md border border-panel-border px-3 py-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary"
        >
          ⚡
        </button>
      </div>
      {wizard && <NearEntryAlertWizard setup={setup} onClose={() => setWizard(false)} />}
      {editor && <QuickAlertEditor setup={setup} onClose={() => setEditor(false)} />}
      {backtest && <AlertBacktest setup={setup} onClose={() => setBacktest(false)} />}
    </div>
  );
}

function Step({
  num,
  label,
  hint,
  value,
  color,
  icon,
  sub,
}: {
  num: string;
  label: string;
  hint: string;
  value: string;
  color: "primary" | "bull" | "bear";
  icon: string;
  sub?: string;
}) {
  const textCls =
    color === "primary" ? "text-primary" : color === "bull" ? "text-bull" : "text-bear";
  return (
    <div className="bg-panel px-3 py-3">
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={`mono grid h-4 w-4 place-items-center rounded-full text-[9px] font-black ${
            color === "primary" ? "bg-primary text-primary-foreground" : color === "bull" ? "bg-bull text-background" : "bg-bear text-background"
          }`}
        >
          {num}
        </span>
        <span className="mono text-[9px] uppercase tracking-widest text-muted-foreground">{hint}</span>
      </div>
      <div className="mb-0.5 flex items-baseline gap-1.5">
        <span className="text-lg">{icon}</span>
        <span className="text-[12px] font-bold">{label}</span>
      </div>
      <div className={`mono text-base font-black tabular-nums ${textCls}`}>{value}</div>
      {sub && <div className={`mono text-[10px] font-semibold tabular-nums ${textCls} opacity-80`}>{sub}</div>}
    </div>
  );
}
