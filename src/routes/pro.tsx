import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TradingChart, type IndicatorFlags } from "@/components/TradingChart";
import { Watchlist } from "@/components/Watchlist";
import { Scanner } from "@/components/Scanner";
import { NewsFeed } from "@/components/NewsFeed";
import { StrategyPanel } from "@/components/StrategyPanel";
import { IndicatorPanel } from "@/components/IndicatorPanel";
import {
  SYMBOLS,
  TIMEFRAMES,
  currentPrice,
  formatPrice,
  dayChangePct,
  onTick,
  startTickStream,
  type Timeframe,
} from "@/lib/market-data";
import { LiveStatusBadge } from "@/components/LiveStatusBadge";
import { STRATEGIES } from "@/lib/strategies";

export const Route = createFileRoute("/pro")({
  head: () => ({
    meta: [
      { title: "ARA TRADES Pro — Realtime Trading Intelligence" },
      { name: "description", content: "Institutional-grade trading dashboard. Realtime forex, crypto and index charts from 00:00 UTC, live indicators, volume profile, strategy engine and auto setup scanner." },
      { property: "og:title", content: "ARA TRADES Pro — Realtime Trading Intelligence" },
      { property: "og:description", content: "Realtime charts, indicators, strategies and auto trade-setup scanner in a single terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const LS_KEY_IND = "nx.indicators";
const LS_KEY_STRAT = "nx.strategies";
const LS_KEY_SYM = "nx.symbol";
const LS_KEY_TF = "nx.tf";

const defaultIndicators: IndicatorFlags = {
  ema20: true, ema50: true, ema200: false,
  bollinger: false, volume: true, volumeProfile: true,
  macd: false, rsi: false,
};

function loadLS<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function saveLS<T>(k: string, v: T) {
  if (typeof window !== "undefined") try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

function Dashboard() {
  const [symbol, setSymbol] = useState<string>(() => loadLS(LS_KEY_SYM, "EURUSD"));
  const [tf, setTf] = useState<Timeframe>(() => loadLS<Timeframe>(LS_KEY_TF, "1m"));
  const [indicators, setIndicators] = useState<IndicatorFlags>(() => loadLS(LS_KEY_IND, defaultIndicators));
  const [strategies, setStrategies] = useState<Record<string, boolean>>(() =>
    loadLS(LS_KEY_STRAT, Object.fromEntries(STRATEGIES.map((s) => [s.id, true]))),
  );
  const [rightTab, setRightTab] = useState<"scanner" | "news" | "strategies">("scanner");
  const [price, setPrice] = useState<number>(() => currentPrice(symbol));
  const [prevPrice, setPrevPrice] = useState(price);
  const [clock, setClock] = useState(new Date());

  useEffect(() => { startTickStream(); }, []);
  useEffect(() => { const i = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => saveLS(LS_KEY_IND, indicators), [indicators]);
  useEffect(() => saveLS(LS_KEY_STRAT, strategies), [strategies]);
  useEffect(() => saveLS(LS_KEY_SYM, symbol), [symbol]);
  useEffect(() => saveLS(LS_KEY_TF, tf), [tf]);

  useEffect(() => {
    setPrice(currentPrice(symbol));
    const off = onTick((id, p) => {
      if (id !== symbol) return;
      setPrevPrice((old) => (old === p ? old : price));
      setPrice(p);
    });
    return () => { off(); };
  }, [symbol]);

  const sym = useMemo(() => SYMBOLS.find((s) => s.id === symbol)!, [symbol]);
  const changePct = dayChangePct(symbol);
  const change = (changePct / 100) * price;
  const up = price >= prevPrice;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* Top bar */}
      <header className="mono flex h-11 shrink-0 items-center justify-between border-b border-panel-border/70 bg-panel/70 px-3 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[11px] font-black text-primary-foreground">N</div>
            <span className="text-[13px] font-bold tracking-wider">NEXUS<span className="text-primary">.TERMINAL</span></span>
          </div>
          <span className="hidden text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">Realtime · Multi-asset</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="hidden md:flex">
            <LiveStatusBadge compact />
          </span>
          <span className="text-muted-foreground">UTC</span>
          <span className="tabular-nums font-semibold">{clock.toISOString().slice(11, 19)}</span>
        </div>
      </header>

      {/* Main grid */}
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-2 p-2">
        {/* Left: watchlist */}
        <aside className="col-span-12 min-h-[220px] md:col-span-3 lg:col-span-2">
          <Watchlist selected={symbol} onSelect={setSymbol} />
        </aside>

        {/* Center: chart column */}
        <section className="col-span-12 flex min-h-0 flex-col gap-2 md:col-span-6 lg:col-span-7">
          {/* Symbol header */}
          <div className="panel px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <div>
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{sym.kind}</div>
                  <div className="text-xl font-bold tracking-tight">{sym.id}</div>
                </div>
                <div className={`mono text-2xl font-bold tabular-nums ${up ? "text-bull" : "text-bear"}`}>
                  {formatPrice(sym.id, price)}
                </div>
                <div className={`mono text-[11px] tabular-nums ${up ? "text-bull" : "text-bear"}`}>
                  {change >= 0 ? "+" : ""}{change.toFixed(sym.id.includes("JPY") ? 3 : 5)}
                  {"  "}
                  ({change >= 0 ? "+" : ""}{changePct.toFixed(2)}%)
                </div>
              </div>
              <div className="mono flex flex-wrap gap-1">
                {TIMEFRAMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTf(t.id)}
                    className={`rounded px-2 py-1 text-[10px] font-semibold uppercase transition-colors ${
                      tf === t.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 border-t border-panel-border/60 pt-2">
              <IndicatorPanel flags={indicators} onChange={setIndicators} />
            </div>
          </div>
          {/* Chart */}
          <div className="panel min-h-[380px] flex-1 overflow-hidden">
            <TradingChart symbolId={symbol} timeframe={tf} indicators={indicators} />
          </div>
        </section>

        {/* Right: scanner / news / strategies */}
        <aside className="col-span-12 flex min-h-[400px] flex-col gap-2 md:col-span-3">
          <div className="mono flex gap-1 text-[10px]">
            <TopTab active={rightTab === "scanner"} onClick={() => setRightTab("scanner")}>Scanner</TopTab>
            <TopTab active={rightTab === "news"} onClick={() => setRightTab("news")}>News</TopTab>
            <TopTab active={rightTab === "strategies"} onClick={() => setRightTab("strategies")}>Strategies</TopTab>
          </div>
          <div className="min-h-0 flex-1">
            {rightTab === "scanner" && <Scanner enabled={strategies} />}
            {rightTab === "news" && <NewsFeed />}
            {rightTab === "strategies" && (
              <StrategyPanel enabled={strategies} onToggle={(id, v) => setStrategies((s) => ({ ...s, [id]: v }))} />
            )}
          </div>
        </aside>
      </div>

      <footer className="mono flex h-6 shrink-0 items-center justify-between border-t border-panel-border/70 bg-panel/70 px-3 text-[10px] text-muted-foreground">
        <span>live feed · Binance (crypto) + Yahoo/Stooq (fx, metals, indices) · simulator fallback offline</span>
        <span>© ARA TRADES Pro</span>
      </footer>
    </div>
  );
}

function TopTab({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        active
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-panel-border bg-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
