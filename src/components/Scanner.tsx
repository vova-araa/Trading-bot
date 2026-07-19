import { useEffect, useRef, useState } from "react";
import { buildCandles, SYMBOLS, formatPrice, onTick } from "@/lib/market-data";
import { STRATEGIES, type Setup } from "@/lib/strategies";

export function Scanner({ enabled }: { enabled: Record<string, boolean> }) {
  const [setups, setSetups] = useState<Setup[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const scansRef = useRef(0);
  const [scanCount, setScanCount] = useState(0);
  const [lastScan, setLastScan] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    const scan = () => {
      if (cancelled) return;
      const found: Setup[] = [];
      for (const sym of SYMBOLS) {
        const c = buildCandles(sym, "1m");
        for (const st of STRATEGIES) {
          if (!enabled[st.id]) continue;
          const setup = st.detect(c, sym.id);
          if (setup && !seenRef.current.has(setup.id)) {
            seenRef.current.add(setup.id);
            found.push(setup);
          }
        }
      }
      if (found.length) {
        setSetups((prev) => [...found, ...prev].slice(0, 50));
      }
      scansRef.current++;
      setScanCount(scansRef.current);
      setLastScan(Date.now());
    };
    scan();
    const off = onTick(() => { /* stream keeps candles alive */ });
    const iv = setInterval(scan, 4500);
    return () => { cancelled = true; clearInterval(iv); off(); };
  }, [enabled]);

  return (
    <div className="panel flex h-full flex-col">
      <div className="panel-header">
        <span>Setup Scanner</span>
        <span className="mono flex items-center gap-3 text-[10px] normal-case">
          <span className="text-muted-foreground">scans: {scanCount}</span>
          <span className="flex items-center gap-1.5">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            ACTIVE
          </span>
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {setups.length === 0 && (
          <div className="mono flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[11px] text-muted-foreground">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-primary" />
            Scanning {SYMBOLS.length} symbols across {Object.values(enabled).filter(Boolean).length} strategies…
            <span className="text-[10px] opacity-60">Setups will appear here in real time</span>
          </div>
        )}
        <ul>
          {setups.map((s) => (
            <li key={s.id} className="mono border-b border-panel-border/40 p-2.5 text-[11px] hover:bg-white/[0.03]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                      s.side === "long" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"
                    }`}
                  >
                    {s.side}
                  </span>
                  <span className="font-semibold">{s.symbol}</span>
                  <span className="text-muted-foreground">· {s.strategy}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(s.time * 1000).toLocaleTimeString([], { hour12: false })}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-2 text-[10px]">
                <Cell k="Entry" v={formatPrice(s.symbol, s.entry)} />
                <Cell k="Stop" v={formatPrice(s.symbol, s.stop)} tone="bear" />
                <Cell k="Target" v={formatPrice(s.symbol, s.target)} tone="bull" />
                <Cell k="R:R" v={`${s.rr.toFixed(1)}`} tone="primary" />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{s.reason}</span>
                <span>conf {s.confidence}%</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Cell({ k, v, tone }: { k: string; v: string; tone?: "bull" | "bear" | "primary" }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "primary" ? "text-primary" : "";
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className={`font-semibold ${cls}`}>{v}</span>
    </div>
  );
}
