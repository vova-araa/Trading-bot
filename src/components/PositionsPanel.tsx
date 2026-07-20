import { useEffect, useState } from "react";
import { formatPrice, currentPrice, onTick } from "@/lib/market-data";
import {
  subscribePositions,
  getPositions,
  closePosition,
  clearClosedPositions,
  positionPnl,
  positionPnlPct,
  type Position,
} from "@/lib/positions";

// Live open positions + closed history. Each open row marks to market on every
// tick; SL/TP auto-close is handled by the position engine.
export function PositionsPanel({ symbolId }: { symbolId?: string }) {
  const [positions, setPositions] = useState<Position[]>(() => getPositions());
  const [, force] = useState(0);

  useEffect(() => subscribePositions(setPositions), []);
  useEffect(() => {
    // repaint P&L a few times a second while positions are open
    let dirty = false;
    const off = onTick(() => {
      dirty = true;
    });
    const iv = setInterval(() => {
      if (dirty) {
        dirty = false;
        force((n) => n + 1);
      }
    }, 300);
    return () => {
      off();
      clearInterval(iv);
    };
  }, []);

  const open = positions.filter((p) => p.status === "open" && (!symbolId || p.symbol === symbolId));
  const closed = positions.filter(
    (p) => p.status === "closed" && (!symbolId || p.symbol === symbolId),
  );
  const totalOpen = open.reduce((s, p) => s + positionPnl(p, currentPrice(p.symbol)), 0);

  if (!open.length && !closed.length) {
    return (
      <div className="panel p-4 text-center">
        <div className="text-2xl">📈</div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Nog geen posities. Plaats hierboven je eerste trade — hij verschijnt hier met live
          winst/verlies.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {open.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-panel-border/60 px-3 py-2">
            <span className="text-sm font-black">Open posities · {open.length}</span>
            <span
              className={`mono text-[13px] font-black tabular-nums ${totalOpen >= 0 ? "text-bull" : "text-bear"}`}
            >
              {totalOpen >= 0 ? "+" : ""}${totalOpen.toFixed(2)}
            </span>
          </div>
          <div className="divide-y divide-panel-border/60">
            {open.map((p) => (
              <PositionRow key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {closed.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-panel-border/60 px-3 py-2">
            <span className="mono text-[11px] font-black uppercase tracking-wider text-muted-foreground">
              Historie · {closed.length}
            </span>
            <button
              onClick={clearClosedPositions}
              className="mono text-[10px] font-bold uppercase text-muted-foreground hover:text-bear"
            >
              Wis
            </button>
          </div>
          <div className="divide-y divide-panel-border/60">
            {closed.slice(0, 15).map((p) => (
              <ClosedRow key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PositionRow({ p }: { p: Position }) {
  const live = currentPrice(p.symbol);
  const pnl = positionPnl(p, live);
  const pct = positionPnlPct(p, live);
  const up = pnl >= 0;
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span
        className={`mono shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black ${p.side === "long" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"}`}
      >
        {p.side === "long" ? "▲ LONG" : "▼ SHORT"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-black">
          {p.symbol}{" "}
          <span className="mono text-[10px] font-normal text-muted-foreground">
            {p.size.toFixed(2)} lot
          </span>
        </div>
        <div className="mono text-[10px] text-muted-foreground">
          in {formatPrice(p.symbol, p.entry)} · nu {formatPrice(p.symbol, live)}
          {p.sl != null && <> · SL {formatPrice(p.symbol, p.sl)}</>}
          {p.tp != null && <> · TP {formatPrice(p.symbol, p.tp)}</>}
        </div>
      </div>
      <div className={`mono shrink-0 text-right ${up ? "text-bull" : "text-bear"}`}>
        <div className="text-[13px] font-black tabular-nums">
          {up ? "+" : ""}${pnl.toFixed(2)}
        </div>
        <div className="text-[10px] tabular-nums">
          {up ? "+" : ""}
          {pct.toFixed(2)}%
        </div>
      </div>
      <button
        onClick={() => closePosition(p.id, "manual")}
        className="mono shrink-0 rounded-md border border-panel-border px-2 py-1 text-[10px] font-black uppercase tracking-wider hover:border-bear/60 hover:text-bear"
      >
        Sluit
      </button>
    </div>
  );
}

function ClosedRow({ p }: { p: Position }) {
  const pnl = positionPnl(p);
  const up = pnl >= 0;
  const reason = p.closeReason === "tp" ? "TP ✓" : p.closeReason === "sl" ? "SL" : "handmatig";
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 opacity-80">
      <span
        className={`mono shrink-0 text-[10px] ${p.side === "long" ? "text-bull" : "text-bear"}`}
      >
        {p.side === "long" ? "▲" : "▼"}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-bold">{p.symbol}</span>{" "}
        <span className="mono text-[9px] text-muted-foreground">
          {formatPrice(p.symbol, p.entry)} → {formatPrice(p.symbol, p.closePrice ?? p.entry)} ·{" "}
          {reason}
        </span>
      </div>
      <div
        className={`mono shrink-0 text-[11px] font-black tabular-nums ${up ? "text-bull" : "text-bear"}`}
      >
        {up ? "+" : ""}${pnl.toFixed(2)}
      </div>
    </div>
  );
}
