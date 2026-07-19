import { useEffect, useState } from "react";
import {
  clearHistory,
  getHistory,
  removeHistoryEntry,
  subscribeHistory,
  type HistoryEntry,
} from "@/lib/alert-history";
import { formatPrice } from "@/lib/market-data";

const levelEmoji: Record<string, string> = {
  entry: "🎯", tp: "💰", sl: "🛑", "near-entry": "⚡", custom: "🔔",
};
const kindLabel: Record<HistoryEntry["kind"], string> = {
  above: "▲ boven", below: "▼ onder", cross: "⇅ kruist", near: "≈ vlakbij",
};

function timeAgo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}u`;
  return `${Math.round(s / 86400)}d`;
}

export function AlertHistoryPanel({ limit = 50 }: { limit?: number }) {
  const [items, setItems] = useState<HistoryEntry[]>(() => getHistory());
  const [filter, setFilter] = useState<string>("");
  useEffect(() => { const off = subscribeHistory(setItems); return () => { off(); }; }, []);

  const filtered = items
    .filter((h) => (filter ? h.symbol === filter : true))
    .slice(0, limit);
  const symbols = Array.from(new Set(items.map((h) => h.symbol)));

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-panel-border/60 px-4 py-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Alarm-geschiedenis</div>
          <div className="text-sm font-black">📜 {items.length} triggers</div>
        </div>
        <div className="flex items-center gap-2">
          {symbols.length > 0 && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mono rounded-md border border-panel-border bg-background px-2 py-1 text-[10px] font-bold"
            >
              <option value="">Alle koersen</option>
              {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {items.length > 0 && (
            <button
              onClick={() => { if (confirm("Volledige alarm-geschiedenis wissen?")) clearHistory(); }}
              className="mono rounded-md border border-panel-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:border-bear/50 hover:text-bear"
            >Wis</button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <span className="text-3xl">📜</span>
          <p className="text-[12px] text-muted-foreground">Nog geen triggers. Zodra een alarm afgaat verschijnt de reden hier.</p>
        </div>
      ) : (
        <ol className="divide-y divide-panel-border/50">
          {filtered.map((h) => (
            <li key={h.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-panel-border/70 text-lg">
                {levelEmoji[h.levelType ?? "custom"]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mono flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-black tracking-tight">{h.symbol}</span>
                  {h.levelType && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                      {h.levelType}
                    </span>
                  )}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                    {kindLabel[h.kind]}
                  </span>
                  <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                    {timeAgo(h.at)} · {new Date(h.at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] leading-snug">{h.reason}</div>
                <div className="mono mt-0.5 flex flex-wrap gap-2 text-[9px] tabular-nums text-muted-foreground">
                  <span>Target <span className="text-foreground">{formatPrice(h.symbol, h.target)}</span></span>
                  <span>Prijs <span className="text-foreground">{formatPrice(h.symbol, h.price)}</span></span>
                  {h.prevPrice !== undefined && h.kind === "cross" && (
                    <span>Vorige <span className="text-foreground">{formatPrice(h.symbol, h.prevPrice)}</span></span>
                  )}
                  {h.note && <span className="truncate italic">"{h.note}"</span>}
                </div>
              </div>
              <button
                onClick={() => removeHistoryEntry(h.id)}
                title="Verwijder uit geschiedenis"
                className="mono shrink-0 rounded-md border border-transparent px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-panel-border hover:text-bear"
              >✕</button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
