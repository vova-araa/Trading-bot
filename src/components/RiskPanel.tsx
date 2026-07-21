import { useEffect, useState } from "react";
import {
  DEFAULT_RISK,
  getRiskSettings,
  RISK_EVENT,
  setRiskSettings,
  type RiskSettings,
} from "@/lib/risk-settings";
import {
  getKillState,
  KILL_EVENT,
  resetKillSwitch,
  tripManually,
  type KillState,
} from "@/lib/kill-switch";
import { mt5Configured } from "@/lib/mt5";
import { isUnlocked } from "@/lib/broker-vault";

// Risk & safety controls: the daily-loss kill-switch and the risk-based
// position-size defaults. Lives on the Bots tab so it sits next to the bots it
// protects.
export function RiskPanel() {
  const [s, setS] = useState<RiskSettings>(() => getRiskSettings());
  const [kill, setKill] = useState<KillState>(() => getKillState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const syncS = () => setS(getRiskSettings());
    const syncK = () => setKill({ ...getKillState() });
    const syncR = () => setReady(mt5Configured() && isUnlocked());
    syncR();
    window.addEventListener(RISK_EVENT, syncS);
    window.addEventListener(KILL_EVENT, syncK);
    window.addEventListener("ara-brokers-change", syncR);
    window.addEventListener("ara-vault-change", syncR);
    const iv = setInterval(syncK, 5000); // reflect kill-switch polling
    return () => {
      window.removeEventListener(RISK_EVENT, syncS);
      window.removeEventListener(KILL_EVENT, syncK);
      window.removeEventListener("ara-brokers-change", syncR);
      window.removeEventListener("ara-vault-change", syncR);
      clearInterval(iv);
    };
  }, []);

  const patch = (p: Partial<RiskSettings>) => setS(setRiskSettings(p));
  const dd = kill.drawdownPct;

  return (
    <div className="panel mb-3 overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border/60 px-3 py-2">
        <span className="text-sm font-black">🛡 Risk &amp; kill-switch</span>
        {kill.tripped ? (
          <span className="mono rounded bg-bear/20 px-2 py-0.5 text-[10px] font-black uppercase text-bear">
            🛑 GESTOPT
          </span>
        ) : s.killSwitchEnabled ? (
          <span className="mono rounded bg-bull/15 px-2 py-0.5 text-[10px] font-black uppercase text-bull">
            actief
          </span>
        ) : (
          <span className="mono rounded bg-panel-border/50 px-2 py-0.5 text-[10px] font-black uppercase text-muted-foreground">
            uit
          </span>
        )}
      </div>

      <div className="grid gap-3 p-3">
        {/* Kill-switch */}
        <div className="rounded-lg border border-panel-border/60 bg-background/40 p-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="mono text-[10px] font-black uppercase tracking-wider text-bear">
                Dagelijkse verlieslimiet
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                Zet alle live bots uit
                {s.closeOnKill ? " én sluit alle posities" : ""} zodra je dag-equity dit percentage
                zakt. Reset automatisch de volgende dag.
              </div>
            </div>
            <Toggle
              on={s.killSwitchEnabled}
              onClick={() => patch({ killSwitchEnabled: !s.killSwitchEnabled })}
              tone="bear"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <NumberField
              label="Limiet %"
              value={s.dailyLossLimitPct}
              step={0.5}
              min={0.1}
              onChange={(v) => patch({ dailyLossLimitPct: v })}
            />
            <div className="flex items-end">
              <label className="mono flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={s.closeOnKill}
                  onChange={(e) => patch({ closeOnKill: e.target.checked })}
                  className="h-3.5 w-3.5 accent-bear"
                />
                Sluit posities bij stop
              </label>
            </div>
          </div>

          {/* Live status */}
          <div className="mono mt-3 flex items-center justify-between border-t border-panel-border/50 pt-2 text-[10px]">
            {!ready ? (
              <span className="text-muted-foreground">
                MT5 niet verbonden — kan equity niet volgen (koppel + ontgrendel).
              </span>
            ) : (
              <span className="text-muted-foreground">
                Dag P&amp;L:{" "}
                <span className={`font-black ${(dd ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
                  {dd == null ? "—" : `${dd >= 0 ? "+" : ""}${dd.toFixed(2)}%`}
                </span>
                {kill.lastEquity != null && (
                  <> · equity {kill.lastEquity.toLocaleString("en-US")}</>
                )}
              </span>
            )}
            {kill.tripped ? (
              <button
                onClick={resetKillSwitch}
                className="mono rounded-md border border-bull/50 px-2 py-1 text-[10px] font-black uppercase text-bull hover:bg-bull/10"
              >
                ↺ Reset
              </button>
            ) : (
              <button
                onClick={() => void tripManually()}
                className="mono rounded-md border border-bear/50 px-2 py-1 text-[10px] font-black uppercase text-bear hover:bg-bear/10"
              >
                🛑 Stop nu
              </button>
            )}
          </div>
          {kill.tripped && kill.reason && (
            <div className="mono mt-2 rounded-md border border-bear/40 bg-bear/10 px-2 py-1.5 text-[10px] text-bear">
              Gestopt: {kill.reason}. Live traden staat uit tot je reset.
            </div>
          )}
        </div>

        {/* Position sizing */}
        <div className="rounded-lg border border-panel-border/60 bg-background/40 p-3">
          <div className="mono text-[10px] font-black uppercase tracking-wider text-primary">
            🎯 Positiegrootte op risico
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            De <b>🎯 Risk%</b>-knop in de order-ticket rekent je lot uit: risk% × saldo ÷ je
            stop-loss-afstand. Rond naar beneden af, nooit boven je max lot.
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <NumberField
              label="Risk % / trade"
              value={s.riskPerTradePct}
              step={0.25}
              min={0.05}
              onChange={(v) => patch({ riskPerTradePct: v })}
            />
            <NumberField
              label="Max lot"
              value={s.maxLot}
              step={0.1}
              min={0.01}
              onChange={(v) => patch({ maxLot: v })}
            />
            <NumberField
              label="Saldo ($)"
              value={s.manualBalance}
              step={100}
              min={1}
              onChange={(v) => patch({ manualBalance: v })}
            />
          </div>
          <div className="mono mt-2 text-[9px] leading-snug text-muted-foreground">
            Saldo wordt gebruikt als MT5 niet verbonden is. Contractgroottes zijn standaard —
            controleer index/olie-multipliers bij je broker.
          </div>
        </div>

        <button
          onClick={() => setS(setRiskSettings(DEFAULT_RISK))}
          className="mono self-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          ↺ Standaardwaarden
        </button>
      </div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  tone,
}: {
  on: boolean;
  onClick: () => void;
  tone: "bear" | "bull";
}) {
  const active = tone === "bear" ? "bg-bear" : "bg-bull";
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`mono relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? active : "bg-muted"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

function NumberField({
  label,
  value,
  step,
  min,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="mono w-full rounded-md border border-panel-border bg-background px-2 py-1.5 text-[12px] tabular-nums outline-none focus:border-primary/60"
      />
    </label>
  );
}
