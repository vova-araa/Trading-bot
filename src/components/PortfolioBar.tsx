import { useEffect, useState } from "react";
import { subscribeBots, type Bot } from "@/lib/bots";

export function PortfolioBar() {
  const [bots, setBots] = useState<Bot[]>([]);
  useEffect(() => subscribeBots(setBots), []);

  const totalPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const active = bots.filter((b) => b.enabled).length;
  const trades = bots.reduce((s, b) => s + b.trades, 0);
  const pos = totalPnl >= 0;

  return (
    <div className="panel grid grid-cols-3 gap-px overflow-hidden bg-panel-border/50">
      <Cell label="Portfolio winst" value={`${pos ? "+" : ""}$${totalPnl.toFixed(2)}`} big tone={pos ? "bull" : "bear"} />
      <Cell label="Actieve bots" value={`${active}`} />
      <Cell label="Trades vandaag" value={`${trades}`} />
    </div>
  );
}

function Cell({ label, value, tone, big }: { label: string; value: string; tone?: "bull" | "bear"; big?: boolean }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="bg-panel px-3 py-3 text-center">
      <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mono font-black tabular-nums ${big ? "text-xl" : "text-base"} ${cls}`}>{value}</div>
    </div>
  );
}
