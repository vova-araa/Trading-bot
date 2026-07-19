import { useEffect, useState } from "react";
import { SYMBOLS, currentPrice, formatPrice, onTick } from "@/lib/market-data";

type Row = { id: string; price: number; open: number; flash?: "up" | "down"; ts: number };

export function Watchlist({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    SYMBOLS.map((s) => ({ id: s.id, price: s.price, open: s.price, ts: Date.now() })),
  );

  useEffect(() => {
    const off = onTick((id, price, ts) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, price, flash: price >= r.price ? "up" : "down", ts: ts * 1000 }
            : r,
        ),
      );
    });
    return () => { off(); };
  }, []);

  return (
    <div className="panel flex h-full flex-col">
      <div className="panel-header">
        <span>Watchlist · {SYMBOLS.length}</span>
        <span className="flex items-center gap-1.5 text-[10px]">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-bull" />
          LIVE
        </span>
      </div>
      <div className="mono flex-1 overflow-auto text-[11px]">
        <table className="w-full">
          <thead className="sticky top-0 bg-panel text-[9px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-normal">Symbol</th>
              <th className="px-2 py-1.5 text-right font-normal">Price</th>
              <th className="px-2 py-1.5 text-right font-normal">Chg%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const chg = ((r.price - r.open) / r.open) * 100;
              const up = chg >= 0;
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  className={`cursor-pointer border-b border-panel-border/40 transition-colors hover:bg-white/[0.03] ${
                    selected === r.id ? "bg-white/[0.06]" : ""
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-1 w-1 rounded-full ${
                          selected === r.id ? "bg-primary" : "bg-muted-foreground/40"
                        }`}
                      />
                      <span className="font-medium">{r.id}</span>
                    </div>
                  </td>
                  <td
                    key={r.ts}
                    className={`px-2 py-1.5 text-right ${r.flash === "up" ? "text-bull" : r.flash === "down" ? "text-bear" : ""} ticker-pulse`}
                  >
                    {formatPrice(r.id, r.price)}
                  </td>
                  <td className={`px-2 py-1.5 text-right ${up ? "text-bull" : "text-bear"}`}>
                    {up ? "+" : ""}{chg.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
