import { useEffect, useState } from "react";
import { topMovers } from "@/lib/bots";
import { formatPrice } from "@/lib/market-data";

export function PumpScreener() {
  const [movers, setMovers] = useState(() => topMovers(5));
  useEffect(() => {
    const iv = setInterval(() => setMovers(topMovers(5)), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border/60 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">🚀</span>
          <div>
            <div className="text-sm font-black">Pump Screener</div>
            <div className="mono text-[10px] text-muted-foreground">Grootste bewegers vandaag</div>
          </div>
        </div>
        <span className="mono text-[10px] text-muted-foreground">LIVE</span>
      </div>
      <div className="divide-y divide-panel-border/60">
        {movers.map((m, i) => {
          const up = m.change >= 0;
          return (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2">
              <span className="mono w-4 text-[11px] font-black text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold">{m.id}</div>
                <div className="mono text-[10px] text-muted-foreground">{formatPrice(m.id, m.price)}</div>
              </div>
              <div className={`mono flex items-center gap-1 text-[13px] font-black tabular-nums ${up ? "text-bull" : "text-bear"}`}>
                <span>{up ? "▲" : "▼"}</span>
                {up ? "+" : ""}{m.change.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
