import { useEffect, useState } from "react";
import { SYMBOLS, formatPrice } from "@/lib/market-data";
import { startFlowRadar, onFlow, recentFlow, symbolHeat, type FlowEvent } from "@/lib/flow-radar";
import { getNextEvent, formatCountdown, type NewsItem } from "@/lib/news";
import { PredictionMarkets } from "@/components/PredictionMarkets";

function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}u`;
}

// Smart-money edge for FX / metals / indices / oil: institutional activity
// inferred from volume + volatility surges (with early-warning alerts), a
// countdown to the next high-impact event, and prediction-market odds.
export function EdgeTab() {
  const [, force] = useState(0);
  const [flashed, setFlashed] = useState<FlowEvent | null>(null);

  useEffect(() => {
    startFlowRadar();
    const off = onFlow((e) => {
      setFlashed(e);
      force((n) => n + 1);
    });
    const iv = setInterval(() => force((n) => n + 1), 1000);
    return () => {
      off();
      clearInterval(iv);
    };
  }, []);

  // Live surge heat per instrument, hottest first.
  const heat = SYMBOLS.map((s) => ({ id: s.id, ...symbolHeat(s.id) }))
    .filter((h) => h.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const events = recentFlow(24);

  return (
    <div className="flex flex-col gap-3">
      {/* Latest big-move flash */}
      {flashed && Date.now() - flashed.time < 20000 && (
        <div
          className={`mono flex items-center justify-between rounded-md border px-3 py-2 text-[11px] ${
            flashed.dir === "up"
              ? "border-bull/50 bg-bull/10 text-bull"
              : "border-bear/50 bg-bear/10 text-bear"
          }`}
        >
          <span className="font-black uppercase tracking-wider">
            🚨 {flashed.symbol} · grote {flashed.kind} {flashed.dir === "up" ? "▲" : "▼"}
          </span>
          <span className="text-muted-foreground">instap-kans · nu</span>
        </div>
      )}

      <NextEventCard />

      {/* Live institutional activity heat */}
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-panel-border/60 px-3 py-2">
          <div>
            <div className="text-sm font-black">📡 Institutionele activiteit</div>
            <div className="mono text-[10px] text-muted-foreground">
              Volume- & volatiliteits-surges (goud, forex, Nasdaq, olie)
            </div>
          </div>
          <span className="mono flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-bull" />
            live
          </span>
        </div>
        {heat.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-muted-foreground">
            Rustige markt — nog geen grote activiteit gedetecteerd.
          </div>
        ) : (
          <div className="divide-y divide-panel-border/60">
            {heat.map((h) => {
              const pct = Math.min(100, (h.score / 4) * 100);
              const hot = h.score >= 2.6;
              return (
                <div key={h.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="mono w-16 shrink-0 text-[11px] font-black">{h.id}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-border/40">
                    <div
                      className={h.dir === "up" ? "h-full bg-bull" : "h-full bg-bear"}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span
                    className={`mono w-14 shrink-0 text-right text-[10px] font-black tabular-nums ${hot ? (h.dir === "up" ? "text-bull" : "text-bear") : "text-muted-foreground"}`}
                  >
                    {hot ? "🔥 " : ""}
                    {h.score.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mono border-t border-panel-border/60 px-3 py-1.5 text-[9px] text-muted-foreground">
          Score ≥ 2.6 = grote speler actief · afgeleid uit futures-volume + range-expansie
        </div>
      </div>

      {/* Big-move tape */}
      <div className="panel overflow-hidden">
        <div className="border-b border-panel-border/60 px-3 py-2 text-sm font-black">
          🐋 Grote bewegingen (vroege signalen)
        </div>
        {events.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-muted-foreground">
            Wachten op grote bewegingen…
          </div>
        ) : (
          <div className="max-h-[320px] divide-y divide-panel-border/60 overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-2 px-3 py-1.5">
                <span
                  className={`mono shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black ${e.dir === "up" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"}`}
                >
                  {e.dir === "up" ? "▲ UP" : "▼ DOWN"}
                </span>
                <span className="mono w-16 shrink-0 text-[11px] font-black">{e.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-[11px]">
                  <span className="font-black">{e.kind}</span>
                  <span className="mono ml-1 text-[9px] text-muted-foreground">
                    @ {formatPrice(e.symbol, e.price)} · score {e.score.toFixed(1)}
                  </span>
                </span>
                <span className="mono shrink-0 text-[9px] text-muted-foreground">
                  {ago(e.time)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <PredictionMarkets />
    </div>
  );
}

// Countdown to the next high-impact economic event — position before the print.
function NextEventCard() {
  const [ev, setEv] = useState<NewsItem | undefined>(() => getNextEvent(Date.now(), "high"));
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      setEv(getNextEvent(Date.now(), "high"));
      tick((n) => n + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  if (!ev) return null;
  const secs = ev.time - Math.floor(Date.now() / 1000);
  const soon = secs <= 900; // within 15 min
  return (
    <div className={`panel flex items-center gap-3 p-3 ${soon ? "ring-1 ring-warn/60" : ""}`}>
      <span className="text-2xl">{ev.country}</span>
      <div className="min-w-0 flex-1">
        <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
          Volgende high-impact event · {ev.currency}
        </div>
        <div className="truncate text-[13px] font-black">{ev.title}</div>
        {ev.forecast && (
          <div className="mono text-[10px] text-muted-foreground">
            verwacht {ev.forecast}
            {ev.previous && ` · vorige ${ev.previous}`}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div
          className={`mono text-[15px] font-black tabular-nums ${soon ? "text-warn" : "text-foreground"}`}
        >
          {formatCountdown(secs)}
        </div>
        <div className="mono text-[9px] uppercase text-muted-foreground">tot release</div>
      </div>
    </div>
  );
}
