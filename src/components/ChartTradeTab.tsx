import { useEffect, useMemo, useState } from "react";
import { TradingChart, type IndicatorFlags, type ChartPriceLine } from "@/components/TradingChart";
import { TradeTicket } from "@/components/TradeTicket";
import { PositionsPanel } from "@/components/PositionsPanel";
import { LiveStatusBadge } from "@/components/LiveStatusBadge";
import { subscribePositions, type Position, type Side } from "@/lib/positions";
import {
  SYMBOLS,
  TIMEFRAMES,
  buildCandles,
  currentPrice,
  formatPrice,
  dayChangePct,
  symbolSource,
  onTick,
  type Timeframe,
} from "@/lib/market-data";
import { STRATEGIES, type FibOverlay } from "@/lib/strategies";

const KINDS = ["all", "forex", "metal", "index", "futures"] as const;
type KindFilter = (typeof KINDS)[number];

const LS_SYM = "ara.chart.sym";
const LS_TF = "ara.chart.tf";
const LS_IND = "ara.chart.ind";

const defaultIndicators: IndicatorFlags = {
  ema20: true,
  ema50: false,
  ema200: false,
  bollinger: false,
  volume: true,
  volumeProfile: false,
  macd: false,
  rsi: false,
};

function loadLS<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLS<T>(k: string, v: T) {
  if (typeof window !== "undefined")
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
}

// Mobile-first chart + trade surface: live candles (all timeframes down to 1s),
// volume, indicator toggles, and an order ticket to trade straight from here.
export function ChartTradeTab() {
  const [symbol, setSymbol] = useState<string>(() => {
    const s = loadLS(LS_SYM, "XAUUSD");
    return SYMBOLS.some((x) => x.id === s) ? s : "XAUUSD"; // guard stale/removed symbols
  });
  const [tf, setTf] = useState<Timeframe>(() => loadLS<Timeframe>(LS_TF, "1m"));
  const [indicators, setIndicators] = useState<IndicatorFlags>(() =>
    loadLS(LS_IND, defaultIndicators),
  );
  const [kind, setKind] = useState<KindFilter>("all");
  const [price, setPrice] = useState(() => currentPrice(symbol));
  const [draft, setDraft] = useState<{ side: Side; sl: number; tp: number } | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [ote, setOte] = useState<{ fib: FibOverlay; side: Side; rr: number } | null>(null);

  useEffect(() => subscribePositions(setPositions), []);

  // Live OTE detection for the charted symbol/timeframe → draw its golden pocket.
  useEffect(() => {
    const strat = STRATEGIES.find((s) => s.id === "ote-golden");
    const so = SYMBOLS.find((s) => s.id === symbol);
    if (!strat || !so) return;
    const run = () => {
      const setup = strat.detect(buildCandles(so, tf), symbol);
      setOte(setup?.fib ? { fib: setup.fib, side: setup.side, rr: setup.rr } : null);
    };
    run();
    const iv = setInterval(run, 2000);
    return () => clearInterval(iv);
  }, [symbol, tf]);

  // Entry / SL / TP lines drawn on the chart: draft levels from the ticket plus
  // every open position on this symbol.
  const priceLines = useMemo<ChartPriceLine[]>(() => {
    const lines: ChartPriceLine[] = [];
    // Golden-pocket fib levels when an OTE setup is active on this symbol.
    if (ote) {
      for (const ln of ote.fib.lines) {
        lines.push({ price: ln.price, color: ln.color, title: ln.label });
      }
    }
    if (draft) {
      lines.push({ price: draft.sl, color: "#ef5a5a", title: "SL", dashed: true });
      lines.push({ price: draft.tp, color: "#22d18c", title: "TP", dashed: true });
    }
    for (const p of positions) {
      if (p.status !== "open" || p.symbol !== symbol) continue;
      lines.push({
        price: p.entry,
        color: p.side === "long" ? "#5cc8ff" : "#f5c26b",
        title: p.side === "long" ? "▲ entry" : "▼ entry",
      });
      if (p.sl != null) lines.push({ price: p.sl, color: "#ef5a5a", title: "pos SL" });
      if (p.tp != null) lines.push({ price: p.tp, color: "#22d18c", title: "pos TP" });
    }
    return lines;
  }, [draft, positions, symbol, ote]);

  const fibZone = ote ? { top: ote.fib.zoneTop, bottom: ote.fib.zoneBottom } : null;

  useEffect(() => saveLS(LS_SYM, symbol), [symbol]);
  useEffect(() => saveLS(LS_TF, tf), [tf]);
  useEffect(() => saveLS(LS_IND, indicators), [indicators]);

  useEffect(() => {
    setPrice(currentPrice(symbol));
    const off = onTick((id, p) => {
      if (id === symbol) setPrice(p);
    });
    return () => {
      off();
    };
  }, [symbol]);

  const sym = useMemo(() => SYMBOLS.find((s) => s.id === symbol)!, [symbol]);
  const change = dayChangePct(symbol);
  const up = change >= 0;
  const live = symbolSource(symbol) === "live";
  const filtered = useMemo(
    () => (kind === "all" ? SYMBOLS : SYMBOLS.filter((s) => s.kind === kind)),
    [kind],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Symbol strip */}
      <div className="panel overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-panel-border/60 px-2 py-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`mono shrink-0 rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                kind === k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "all" ? "Alles" : k}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto p-2">
          {filtered.map((s) => {
            const active = s.id === symbol;
            const chg = dayChangePct(s.id);
            return (
              <button
                key={s.id}
                onClick={() => setSymbol(s.id)}
                className={`shrink-0 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-panel-border hover:border-primary/40"
                }`}
              >
                <div className="mono text-[11px] font-black">{s.id}</div>
                <div
                  className={`mono text-[9px] tabular-nums ${chg >= 0 ? "text-bull" : "text-bear"}`}
                >
                  {chg >= 0 ? "+" : ""}
                  {chg.toFixed(2)}%
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Price header + timeframes */}
      <div className="panel px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2.5">
            <div>
              <div className="mono flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                {sym.kind} <LiveStatusBadge compact />
              </div>
              <div className="text-lg font-black tracking-tight">{sym.id}</div>
            </div>
            <div
              className={`mono text-2xl font-black tabular-nums ${up ? "text-bull" : "text-bear"}`}
            >
              {formatPrice(sym.id, price)}
            </div>
            <div
              className={`mono text-[11px] font-bold tabular-nums ${up ? "text-bull" : "text-bear"}`}
            >
              {up ? "▲ +" : "▼ "}
              {change.toFixed(2)}%
            </div>
          </div>
        </div>
        {/* Timeframes 1s → 1D */}
        <div className="mono mt-2 flex flex-wrap gap-1 border-t border-panel-border/60 pt-2">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTf(t.id)}
              className={`rounded px-2 py-1 text-[10px] font-black uppercase transition-colors ${
                tf === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
          {!live && tf.endsWith("s") && sym.kind !== "crypto" && (
            <span className="mono ml-1 self-center text-[9px] text-warn">
              sub-minuut = gesimuleerd voor {sym.kind}
            </span>
          )}
        </div>
        {/* Indicator toggles */}
        <div className="mono mt-2 flex flex-wrap gap-1.5 border-t border-panel-border/60 pt-2">
          <IndToggle
            on={indicators.volume}
            onClick={() => setIndicators((i) => ({ ...i, volume: !i.volume }))}
          >
            Volume
          </IndToggle>
          <IndToggle
            on={indicators.ema20}
            onClick={() => setIndicators((i) => ({ ...i, ema20: !i.ema20 }))}
          >
            EMA20
          </IndToggle>
          <IndToggle
            on={indicators.ema50}
            onClick={() => setIndicators((i) => ({ ...i, ema50: !i.ema50 }))}
          >
            EMA50
          </IndToggle>
          <IndToggle
            on={indicators.ema200}
            onClick={() => setIndicators((i) => ({ ...i, ema200: !i.ema200 }))}
          >
            EMA200
          </IndToggle>
          <IndToggle
            on={indicators.bollinger}
            onClick={() => setIndicators((i) => ({ ...i, bollinger: !i.bollinger }))}
          >
            Bollinger
          </IndToggle>
          <IndToggle
            on={indicators.volumeProfile}
            onClick={() => setIndicators((i) => ({ ...i, volumeProfile: !i.volumeProfile }))}
          >
            Vol-profiel
          </IndToggle>
        </div>
      </div>

      {/* OTE signal banner */}
      {ote && (
        <div
          className={`mono flex items-center justify-between rounded-md border px-3 py-1.5 text-[11px] ${
            ote.side === "long"
              ? "border-bull/50 bg-bull/10 text-bull"
              : "border-bear/50 bg-bear/10 text-bear"
          }`}
        >
          <span className="font-black uppercase tracking-wider">
            🎯 OTE golden pocket · {ote.side === "long" ? "LONG" : "SHORT"}
          </span>
          <span className="text-muted-foreground">
            entry 0.705 · zone 0.618–0.786 · R:R {ote.rr.toFixed(1)}
          </span>
        </div>
      )}

      {/* Chart */}
      <div className="panel h-[46vh] min-h-[320px] overflow-hidden">
        <TradingChart
          symbolId={symbol}
          timeframe={tf}
          indicators={indicators}
          priceLines={priceLines}
          fibZone={fibZone}
        />
      </div>

      {/* Order ticket + positions */}
      <TradeTicket symbolId={symbol} onLevels={setDraft} />
      <PositionsPanel />
    </div>
  );
}

function IndToggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
        on
          ? "bg-primary/20 text-primary"
          : "border border-panel-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
