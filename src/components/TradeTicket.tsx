import { useEffect, useMemo, useState } from "react";
import { currentPrice, formatPrice, onTick, SYMBOLS } from "@/lib/market-data";
import { openPosition, type Side } from "@/lib/positions";

// Order ticket — place a live-tracked paper trade straight from the chart.
// Buy/Sell, lot size, and stop-loss / take-profit (as % or exact price). The
// position then marks to market on every tick and auto-closes on SL/TP.
export function TradeTicket({ symbolId, onPlaced }: { symbolId: string; onPlaced?: () => void }) {
  const [side, setSide] = useState<Side>("long");
  const [size, setSize] = useState(0.5);
  const [slPct, setSlPct] = useState(0.5);
  const [tpPct, setTpPct] = useState(1.0);
  const [price, setPrice] = useState(() => currentPrice(symbolId));
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setPrice(currentPrice(symbolId));
    const off = onTick((id, p) => {
      if (id === symbolId) setPrice(p);
    });
    return () => {
      off();
    };
  }, [symbolId]);

  const dir = side === "long" ? 1 : -1;
  const sl = useMemo(() => price * (1 - (slPct / 100) * dir), [price, slPct, dir]);
  const tp = useMemo(() => price * (1 + (tpPct / 100) * dir), [price, tpPct, dir]);
  const notional = size * 1000;
  const riskUsd = (notional * slPct) / 100;
  const rewardUsd = (notional * tpPct) / 100;
  const rr = slPct > 0 ? tpPct / slPct : 0;
  const sym = SYMBOLS.find((s) => s.id === symbolId);

  function place() {
    openPosition({ symbol: symbolId, side, size, sl, tp });
    setFlash(
      `${side === "long" ? "▲ Long" : "▼ Short"} ${size.toFixed(2)} ${symbolId} geplaatst @ ${formatPrice(symbolId, price)}`,
    );
    setTimeout(() => setFlash(null), 2600);
    onPlaced?.();
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black">🎯 Order</span>
          <span className="mono text-[10px] text-muted-foreground">{sym?.name ?? symbolId}</span>
        </div>
        <span className="mono text-[12px] font-black tabular-nums">
          {formatPrice(symbolId, price)}
        </span>
      </div>

      <div className="grid gap-2.5 p-3">
        {/* Side */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide("long")}
            className={`mono rounded-md py-2 text-[12px] font-black uppercase tracking-wider transition-colors ${
              side === "long"
                ? "bg-bull text-background"
                : "border border-panel-border text-muted-foreground hover:text-foreground"
            }`}
          >
            ▲ Koop / Long
          </button>
          <button
            onClick={() => setSide("short")}
            className={`mono rounded-md py-2 text-[12px] font-black uppercase tracking-wider transition-colors ${
              side === "short"
                ? "bg-bear text-background"
                : "border border-panel-border text-muted-foreground hover:text-foreground"
            }`}
          >
            ▼ Verkoop / Short
          </button>
        </div>

        {/* Size */}
        <div>
          <div className="mono mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Grootte (lot)</span>
            <span className="text-foreground">≈ ${notional.toLocaleString("en-US")}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={size}
              onChange={(e) => setSize(Math.max(0.01, Number(e.target.value) || 0.01))}
              className="mono w-20 rounded-md border border-panel-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary/60"
            />
            <div className="flex gap-1">
              {[0.1, 0.5, 1, 2].map((v) => (
                <button
                  key={v}
                  onClick={() => setSize(v)}
                  className={`mono rounded px-2 py-1 text-[10px] font-bold ${
                    size === v
                      ? "bg-primary text-primary-foreground"
                      : "border border-panel-border text-muted-foreground"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SL / TP */}
        <div className="grid grid-cols-2 gap-2">
          <RiskInput
            label="🛑 Stop-loss"
            pct={slPct}
            onPct={setSlPct}
            price={sl}
            symbolId={symbolId}
            usd={riskUsd}
            tone="bear"
          />
          <RiskInput
            label="💰 Take-profit"
            pct={tpPct}
            onPct={setTpPct}
            price={tp}
            symbolId={symbolId}
            usd={rewardUsd}
            tone="bull"
          />
        </div>

        <div className="mono flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            Risk <span className="font-black text-bear">${riskUsd.toFixed(2)}</span> · Reward{" "}
            <span className="font-black text-bull">${rewardUsd.toFixed(2)}</span>
          </span>
          <span className="rounded bg-panel-border/40 px-1.5 py-0.5 font-black text-foreground">
            R:R {rr.toFixed(1)}
          </span>
        </div>

        <button
          onClick={place}
          className={`mono rounded-md py-2.5 text-[12px] font-black uppercase tracking-wider text-background ${
            side === "long" ? "bg-bull hover:brightness-110" : "bg-bear hover:brightness-110"
          }`}
        >
          {side === "long" ? "▲ Plaats koop-order" : "▼ Plaats verkoop-order"}
        </button>

        {flash && (
          <div className="mono rounded-md border border-bull/50 bg-bull/10 px-2 py-1.5 text-[11px] text-bull">
            ✓ {flash}
          </div>
        )}
        <p className="mono text-[9px] leading-snug text-muted-foreground">
          Paper-trade op live koersen — volgt de markt realtime en sluit automatisch op SL/TP. Voor
          echte uitvoering naar je broker: koppel via de Brokers-tab.
        </p>
      </div>
    </div>
  );
}

function RiskInput({
  label,
  pct,
  onPct,
  price,
  symbolId,
  usd,
  tone,
}: {
  label: string;
  pct: number;
  onPct: (v: number) => void;
  price: number;
  symbolId: string;
  usd: number;
  tone: "bull" | "bear";
}) {
  return (
    <div className="rounded-md border border-panel-border/60 bg-background/40 p-2">
      <div className="mono mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="0.1"
          min="0"
          value={pct}
          onChange={(e) => onPct(Math.max(0, Number(e.target.value) || 0))}
          className="mono w-14 rounded border border-panel-border bg-background px-1.5 py-1 text-[12px] outline-none focus:border-primary/60"
        />
        <span className="mono text-[11px] text-muted-foreground">%</span>
      </div>
      <div
        className={`mono mt-1 text-[11px] font-black tabular-nums ${tone === "bull" ? "text-bull" : "text-bear"}`}
      >
        {formatPrice(symbolId, price)}
      </div>
      <div className="mono text-[9px] text-muted-foreground">${usd.toFixed(2)}</div>
    </div>
  );
}
