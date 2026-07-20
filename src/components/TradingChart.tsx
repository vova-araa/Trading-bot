import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type IPriceLine,
  type SeriesMarker,
  type UTCTimestamp,
  type MouseEventParams,
} from "lightweight-charts";
import type { Candle, Timeframe } from "@/lib/market-data";
import { buildCandles, onTick, onLiveCandles, SYMBOLS, TIMEFRAMES } from "@/lib/market-data";
import { ema, macd as macdCalc, bollinger, volumeProfile, rsi } from "@/lib/indicators";
import { getWeekCalendar, type NewsItem } from "@/lib/news";
import { symbolCurrencies, verdictFor, type EventVerdict } from "@/lib/chart-news";
import { NowcastTimeline } from "./NowcastTimeline";

export type IndicatorFlags = {
  ema20: boolean;
  ema50: boolean;
  ema200: boolean;
  bollinger: boolean;
  volumeProfile: boolean;
  macd: boolean;
  rsi: boolean;
  volume: boolean;
};

export type ChartPriceLine = { price: number; color: string; title: string; dashed?: boolean };

export function TradingChart({
  symbolId,
  timeframe,
  indicators,
  priceLines,
}: {
  symbolId: string;
  timeframe: Timeframe;
  indicators: IndicatorFlags;
  priceLines?: ChartPriceLine[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaRefs = useRef<Record<string, ISeriesApi<"Line">>>({});
  const bbRefs = useRef<Record<string, ISeriesApi<"Line">>>({});
  const dataRef = useRef<Candle[]>([]);
  const vpOverlayRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const eventsByTimeRef = useRef<Map<number, NewsItem>>(new Map());
  const [showNews, setShowNews] = useState(true);
  const [hoverEvent, setHoverEvent] = useState<{ n: NewsItem; x: number; y: number } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<NewsItem | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const currencies = useMemo(() => symbolCurrencies(symbolId), [symbolId]);
  const relevantEvents = useMemo<NewsItem[]>(() => {
    const items = getWeekCalendar(Date.now()).flatMap((d) => d.items);
    return items.filter((n) => currencies.includes(n.currency));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencies, tick]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#c9d1d9",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(120,140,160,0.06)" },
        horzLines: { color: "rgba(120,140,160,0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(120,140,160,0.2)" },
      timeScale: {
        borderColor: "rgba(120,140,160,0.2)",
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    chartRef.current = chart;

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#22d18c",
      downColor: "#ef5a5a",
      borderUpColor: "#22d18c",
      borderDownColor: "#ef5a5a",
      wickUpColor: "#22d18c",
      wickDownColor: "#ef5a5a",
    });
    candleRef.current = candle;
    markersRef.current = createSeriesMarkers(candle, []) as ISeriesMarkersPluginApi<UTCTimestamp>;

    const onMove = (param: MouseEventParams) => {
      if (!param.time || !param.point) { setHoverEvent(null); return; }
      const t = param.time as number;
      // find nearest event within one bucket
      const secs = TIMEFRAMES.find((tf) => tf.id === timeframe)!.seconds;
      let hit: NewsItem | null = null;
      let bestDist = secs;
      eventsByTimeRef.current.forEach((n, bucket) => {
        const d = Math.abs(bucket - t);
        if (d <= bestDist) { bestDist = d; hit = n; }
      });
      if (hit) setHoverEvent({ n: hit, x: param.point.x, y: param.point.y });
      else setHoverEvent(null);
    };
    chart.subscribeCrosshairMove(onMove);

    const onClick = (param: MouseEventParams) => {
      if (!param.time) return;
      const t = param.time as number;
      const secs = TIMEFRAMES.find((tf) => tf.id === timeframe)!.seconds;
      let hit: NewsItem | null = null;
      let bestDist = secs;
      eventsByTimeRef.current.forEach((n, bucket) => {
        const d = Math.abs(bucket - t);
        if (d <= bestDist) { bestDist = d; hit = n; }
      });
      if (hit) setSelectedEvent(hit);
    };
    chart.subscribeClick(onClick);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.unsubscribeClick(onClick);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      emaRefs.current = {};
      bbRefs.current = {};
      markersRef.current = null;
      eventsByTimeRef.current.clear();
    };
  }, []);

  // Recompute event markers whenever data or events change
  useEffect(() => { refreshEventMarkers(); }, [relevantEvents, showNews, symbolId, timeframe]);

  // Load data on symbol/timeframe change — and reload when live candles arrive
  useEffect(() => {
    const load = () => {
      const sym = SYMBOLS.find((s) => s.id === symbolId);
      if (!sym || !candleRef.current) return;
      const candles = buildCandles(sym, timeframe);
      dataRef.current = candles;
      candleRef.current.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
      chartRef.current?.timeScale().fitContent();
      refreshOverlays();
      refreshEventMarkers();
    };
    load();
    const secs = TIMEFRAMES.find((t) => t.id === timeframe)!.seconds;
    const off = onLiveCandles((id, s) => {
      if (id === symbolId && s === secs) load();
    });
    return () => {
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolId, timeframe]);

  // React to indicator toggles
  useEffect(() => {
    refreshOverlays();
  }, [indicators]);

  // Draw entry / SL / TP price lines from the order ticket + open positions.
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    priceLinesRef.current.forEach((l) => series.removePriceLine(l));
    priceLinesRef.current = [];
    for (const pl of priceLines ?? []) {
      if (!Number.isFinite(pl.price) || pl.price <= 0) continue;
      priceLinesRef.current.push(
        series.createPriceLine({
          price: pl.price,
          color: pl.color,
          lineWidth: 1,
          lineStyle: pl.dashed ? 2 : 0,
          axisLabelVisible: true,
          title: pl.title,
        }),
      );
    }
  }, [priceLines, symbolId, timeframe]);

  function refreshOverlays() {
    const chart = chartRef.current;
    if (!chart) return;

    // Clean previous
    Object.values(emaRefs.current).forEach((s) => chart.removeSeries(s));
    Object.values(bbRefs.current).forEach((s) => chart.removeSeries(s));
    emaRefs.current = {};
    bbRefs.current = {};
    if (volRef.current) { chart.removeSeries(volRef.current); volRef.current = null; }

    const candles = dataRef.current;
    if (!candles.length) return;
    const closes = candles.map((c) => c.close);

    if (indicators.volume) {
      const vol = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
        color: "rgba(120,140,160,0.35)",
      });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? "rgba(34,209,140,0.5)" : "rgba(239,90,90,0.5)",
        })),
      );
      volRef.current = vol;
    }

    const addEma = (period: number, color: string, key: string) => {
      const values = ema(closes, period);
      const line = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      line.setData(
        candles
          .map((c, i) => (values[i] != null ? { time: c.time as UTCTimestamp, value: values[i] as number } : null))
          .filter((v): v is { time: UTCTimestamp; value: number } => v !== null),
      );
      emaRefs.current[key] = line;
    };
    if (indicators.ema20) addEma(20, "#f5c26b", "ema20");
    if (indicators.ema50) addEma(50, "#5cc8ff", "ema50");
    if (indicators.ema200) addEma(200, "#b57bff", "ema200");

    if (indicators.bollinger) {
      const bb = bollinger(closes, 20, 2);
      const cfg: Array<[string, (number | null)[]]> = [["upper", bb.upper], ["mid", bb.mid], ["lower", bb.lower]];
      cfg.forEach(([k, arr]) => {
        const l = chart.addSeries(LineSeries, {
          color: k === "mid" ? "rgba(200,200,220,0.55)" : "rgba(120,180,255,0.55)",
          lineWidth: 1,
          lineStyle: k === "mid" ? 2 : 0,
          priceLineVisible: false, lastValueVisible: false,
        });
        l.setData(
          candles
            .map((c, i) => (arr[i] != null ? { time: c.time as UTCTimestamp, value: arr[i] as number } : null))
            .filter((v): v is { time: UTCTimestamp; value: number } => v !== null),
        );
        bbRefs.current[k] = l;
      });
    }

    // Volume profile overlay is drawn in HTML on top of chart
    drawVolumeProfile();
  }

  function refreshEventMarkers() {
    const mk = markersRef.current;
    if (!mk) return;
    const candles = dataRef.current;
    if (!candles.length || !showNews) { mk.setMarkers([]); eventsByTimeRef.current.clear(); return; }
    const secs = TIMEFRAMES.find((t) => t.id === timeframe)!.seconds;
    const first = candles[0].time;
    const last  = candles[candles.length - 1].time + secs * 2;
    const map = new Map<number, NewsItem>();
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    for (const n of relevantEvents) {
      if (n.time < first || n.time > last) continue;
      const bucket = Math.floor(n.time / secs) * secs;
      // Voorkom dubbele markers op dezelfde bucket — behoud hoogste impact
      const existing = map.get(bucket);
      if (existing && rankImpact(existing.impact) >= rankImpact(n.impact)) continue;
      map.set(bucket, n);
    }
    map.forEach((n, bucket) => {
      const v = verdictFor(n);
      const { color, text, shape } = markerStyle(n, v);
      markers.push({
        time: bucket as UTCTimestamp,
        position: "aboveBar",
        color,
        shape,
        text,
        size: n.impact === "high" ? 2 : 1,
      });
    });
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    mk.setMarkers(markers);
    eventsByTimeRef.current = map;
  }

  function drawVolumeProfile() {
    const overlay = vpOverlayRef.current;
    if (!overlay) return;
    overlay.innerHTML = "";
    if (!indicators.volumeProfile) return;
    const candles = dataRef.current;
    const vp = volumeProfile(candles, 30);
    if (!vp.bins.length) return;
    const maxVol = Math.max(...vp.bins.map((b) => b.volume));
    const frag = document.createDocumentFragment();
    vp.bins.forEach((b) => {
      const el = document.createElement("div");
      const w = (b.volume / maxVol) * 100;
      const isPoc = Math.abs(b.price - vp.poc) < 1e-9;
      const inVA = b.price >= vp.val && b.price <= vp.vah;
      el.style.cssText = `position:absolute;right:56px;height:${100 / vp.bins.length}%;bottom:${((b.price - vp.bins[0].price) / (vp.bins[vp.bins.length - 1].price - vp.bins[0].price)) * 100}%;width:${w * 0.22}%;background:${isPoc ? "rgba(245,194,107,0.7)" : inVA ? "rgba(92,200,255,0.35)" : "rgba(120,140,160,0.22)"};border-right:1px solid rgba(255,255,255,0.05);pointer-events:none;`;
      frag.appendChild(el);
    });
    overlay.appendChild(frag);
  }

  // Live ticks → update last candle
  useEffect(() => {
    const off = onTick((id, price, ts) => {
      if (id !== symbolId) return;
      const candles = dataRef.current;
      if (!candles.length || !candleRef.current) return;
      const secs = TIMEFRAMES.find((t) => t.id === timeframe)!.seconds;
      const last = candles[candles.length - 1];
      const bucket = Math.floor(ts / secs) * secs;
      if (bucket === last.time) {
        last.high = Math.max(last.high, price);
        last.low = Math.min(last.low, price);
        last.close = price;
        last.volume += 0.4;
        candleRef.current.update({ ...last, time: last.time as UTCTimestamp });
      } else if (bucket > last.time) {
        const nc: Candle = { time: bucket, open: last.close, high: price, low: price, close: price, volume: 0.5 };
        candles.push(nc);
        candleRef.current.update({ ...nc, time: nc.time as UTCTimestamp });
      }
    });
    return () => { off(); };
  }, [symbolId, timeframe]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      <div ref={vpOverlayRef} className="pointer-events-none absolute inset-0" />

      {/* Nieuws-toggle */}
      <button
        onClick={() => setShowNews((v) => !v)}
        className={`mono absolute right-2 top-2 z-10 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur ${
          showNews
            ? "border-primary/60 bg-primary/15 text-primary"
            : "border-panel-border bg-panel/70 text-muted-foreground"
        }`}
        title="Toon economische events op de chart"
      >
        📰 Nieuws {showNews ? "aan" : "uit"}
      </button>

      {/* Legenda / kleurenverklaring — alleen zichtbaar wanneer nieuws-markers aan staan */}
      {showNews && <ChartLegend />}

      {/* Hover tooltip — verbergen zodra het details-paneel open staat */}
      {hoverEvent && !selectedEvent && (
        <EventTooltip n={hoverEvent.n} x={hoverEvent.x} y={hoverEvent.y} />
      )}

      {/* Details-paneel bij klikken op een marker */}
      {selectedEvent && (
        <EventDetailsPanel n={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}

function rankImpact(i: "low" | "medium" | "high") {
  return i === "high" ? 3 : i === "medium" ? 2 : 1;
}

function markerStyle(n: NewsItem, v: EventVerdict): { color: string; text: string; shape: "arrowDown" | "circle" | "square" } {
  const label = shortLabel(n.title);
  if (v === "beat") return { color: "#22d18c", text: `▲ ${n.currency} ${label} · BEAT`, shape: "arrowDown" };
  if (v === "miss") return { color: "#ef5a5a", text: `▼ ${n.currency} ${label} · MISS`, shape: "arrowDown" };
  if (v === "inline") return { color: "#8a94a6", text: `≈ ${n.currency} ${label} · inline`, shape: "circle" };
  // pending — kleur op basis van impact
  const c = n.impact === "high" ? "#f5c26b" : n.impact === "medium" ? "#5cc8ff" : "#8a94a6";
  return { color: c, text: `${n.currency} ${label}`, shape: n.impact === "high" ? "arrowDown" : "circle" };
}

function shortLabel(t: string): string {
  return t
    .replace("Non-Farm Payrolls", "NFP")
    .replace("FOMC Statement", "FOMC")
    .replace(/ Rate Decision/, " Rate")
    .replace(/ Overnight Rate/, " Rate")
    .replace(/ Cash Rate/, " Rate")
    .replace(/ Statement/, "")
    .replace(/ Sentiment/, "")
    .replace(/ Inventories/, "")
    .slice(0, 22);
}

function EventTooltip({ n, x, y }: { n: NewsItem; x: number; y: number }) {
  const v = verdictFor(n);
  const impactColor = n.impact === "high" ? "bg-bear" : n.impact === "medium" ? "bg-warn" : "bg-muted-foreground";
  const verdictBadge =
    v === "beat" ? { c: "bg-bull text-background", t: "🟢 BEAT" } :
    v === "miss" ? { c: "bg-bear text-background", t: "🔴 MISS" } :
    v === "inline" ? { c: "bg-muted-foreground text-background", t: "🎯 INLINE" } :
    { c: "bg-warn text-background", t: "⏳ VERWACHT" };
  const style: React.CSSProperties = {
    left: Math.min(Math.max(x + 14, 8), 500),
    top: Math.max(y - 8, 8),
  };
  return (
    <div
      className="pointer-events-none absolute z-20 w-64 rounded-lg border border-panel-border bg-panel/95 p-2.5 shadow-xl backdrop-blur"
      style={style}
    >
      <div className="mono flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${impactColor}`} />
        {n.impact} impact
        <span className="ml-auto">{new Date(n.time * 1000).toLocaleString([], { hour12: false, month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-base leading-none">{n.country}</span>
        <span className="mono text-[10px] font-black text-muted-foreground">{n.currency}</span>
        <span className={`mono ml-auto rounded px-1.5 py-0.5 text-[9px] font-black ${verdictBadge.c}`}>{verdictBadge.t}</span>
      </div>
      <div className="mt-1 text-[12px] font-black leading-tight text-foreground">{n.title}</div>
      <div className="mono mt-1.5 grid grid-cols-3 gap-1 text-[10px]">
        <TVal k="vorige" v={n.previous ?? "—"} />
        <TVal k="fcst" v={n.forecast ?? "—"} />
        <TVal
          k={n.actual ? "actual" : n.prediction ? "🔮 nowcast" : "—"}
          v={n.actual ?? n.prediction?.value ?? "—"}
          tone={v === "beat" ? "bull" : v === "miss" ? "bear" : "primary"}
        />
      </div>
      {n.explain && <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">{n.explain}</p>}
    </div>
  );
}

function TVal({ k, v, tone }: { k: string; v: string; tone?: "bull" | "bear" | "primary" }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded border border-panel-border/60 bg-panel/60 px-1.5 py-1">
      <div className="text-[8px] uppercase text-muted-foreground">{k}</div>
      <div className={`mono font-black tabular-nums ${cls}`}>{v}</div>
    </div>
  );
}

function ChartLegend() {
  const [open, setOpen] = useState(true);
  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-10 max-w-[220px] rounded-lg border border-panel-border/70 bg-panel/85 p-2 text-[10px] backdrop-blur">
      <button
        onClick={() => setOpen((v) => !v)}
        className="mono flex w-full items-center justify-between gap-2 text-[9px] font-black uppercase tracking-wider text-primary"
      >
        <span>🎨 Legenda</span>
        <span className="text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          <div className="mono text-[8px] uppercase tracking-wider text-muted-foreground">Vóór release · impact</div>
          <LegendRow color="#ef5a5a" shape="pin" label="🔴 High impact — big mover" />
          <LegendRow color="#f6b93b" shape="pin" label="🟡 Medium impact" />
          <LegendRow color="#7f8b9a" shape="pin" label="⚪ Low impact — meestal ruis" />
          <div className="mono mt-1 text-[8px] uppercase tracking-wider text-muted-foreground">Na release · uitkomst</div>
          <LegendRow color="#22d18c" shape="arrow" label="▲ BEAT — beter dan verwacht" />
          <LegendRow color="#ef5a5a" shape="arrow" label="▼ MISS — slechter dan verwacht" />
          <LegendRow color="#7f8b9a" shape="arrow" label="≈ INLINE — conform consensus" />
          <div className="mono mt-1 border-t border-panel-border/40 pt-1 text-[9px] leading-snug text-muted-foreground">
            Marker boven de candle = event op dat tijdstip. Hover voor land, verwacht/actual en 1-zin uitleg.
          </div>
        </div>
      )}
    </div>
  );
}

function LegendRow({ color, shape, label }: { color: string; shape: "pin" | "arrow"; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center">
        {shape === "pin" ? (
          <span className="h-2.5 w-2.5 rounded-full border border-background/60" style={{ background: color }} />
        ) : (
          <span
            className="h-0 w-0"
            style={{
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: `6px solid ${color}`,
            }}
          />
        )}
      </span>
      <span className="mono text-foreground">{label}</span>
    </div>
  );
}

function EventDetailsPanel({ n, onClose }: { n: NewsItem; onClose: () => void }) {
  const v = verdictFor(n);
  const now = Date.now();
  const isPast = n.time * 1000 <= now;
  const impactColor = n.impact === "high" ? "bg-bear" : n.impact === "medium" ? "bg-warn" : "bg-muted-foreground";
  const verdictBadge =
    v === "beat" ? { c: "bg-bull text-background", t: "🟢 BEAT — beter dan verwacht" } :
    v === "miss" ? { c: "bg-bear text-background", t: "🔴 MISS — slechter dan verwacht" } :
    v === "inline" ? { c: "bg-muted-foreground text-background", t: "🎯 INLINE — conform consensus" } :
    { c: "bg-warn text-background", t: "⏳ NOG NIET UITGEKOMEN" };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-30 flex items-start justify-end p-2 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border border-panel-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-2 border-b border-panel-border/60 p-3">
          <span className="text-2xl leading-none">{n.country}</span>
          <div className="min-w-0 flex-1">
            <div className="mono flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${impactColor}`} />
              {n.impact} impact
              <span>·</span>
              <span className="font-black text-foreground">{n.currency}</span>
              <span className="ml-auto">
                {new Date(n.time * 1000).toLocaleString([], { hour12: false, weekday: "short", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="mt-0.5 text-[13px] font-black leading-tight text-foreground">{n.title}</div>
          </div>
          <button
            onClick={onClose}
            className="mono rounded border border-panel-border/60 px-1.5 py-0.5 text-[10px] font-black text-muted-foreground hover:bg-panel-border/30"
            aria-label="Sluiten"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {/* Verdict banner */}
          <div className={`mono rounded-md px-2 py-1.5 text-center text-[11px] font-black ${verdictBadge.c}`}>
            {verdictBadge.t}
          </div>

          {/* Verwacht / actual grid */}
          <div className="mono mt-3 grid grid-cols-3 gap-1.5 text-[11px]">
            <TVal k="vorige" v={n.previous ?? "—"} />
            <TVal k="verwacht" v={n.forecast ?? "—"} />
            <TVal
              k={n.actual ? "actual" : n.prediction ? "🔮 nowcast" : "—"}
              v={n.actual ?? n.prediction?.value ?? "—"}
              tone={v === "beat" ? "bull" : v === "miss" ? "bear" : "primary"}
            />
          </div>

          {/* Uitleg */}
          {n.explain && (
            <div className="mt-3 rounded-md border border-panel-border/60 bg-panel/40 p-2">
              <div className="mono text-[9px] uppercase tracking-wider text-muted-foreground">Wat betekent dit?</div>
              <p className="mt-0.5 text-[11.5px] leading-snug text-foreground">{n.explain}</p>
            </div>
          )}

          {/* Nowcast timeline — alleen zinvol vóór release */}
          {!isPast && <NowcastTimeline item={n} now={now} />}

          {isPast && n.actual && (
            <div className="mono mt-3 rounded-md border border-panel-border/60 bg-panel/40 p-2 text-[10.5px] leading-snug text-muted-foreground">
              Release voorbij — actual <span className="font-black text-foreground">{n.actual}</span> vs
              consensus <span className="font-black text-foreground">{n.forecast ?? "—"}</span>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
