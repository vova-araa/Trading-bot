import { useEffect, useMemo, useState } from "react";
import {
  getWeekCalendar,
  getHeadlines,
  getNextEvent,
  formatCountdown,
  type NewsItem,
} from "@/lib/news";
import { WatchlistPanel } from "./WatchlistPanel";
import { getWatchState, matchWatch, subscribeWatch } from "@/lib/news-watchlist";
import { NowcastTimeline } from "./NowcastTimeline";

type View = "upcoming" | "week" | "wires";

export function NewsCenter() {
  const [view, setView] = useState<View>("upcoming");
  const [watch, setWatch] = useState(getWatchState());
  const [showWatch, setShowWatch] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => subscribeWatch(setWatch), []);

  const week  = useMemo(() => getWeekCalendar(now), [Math.floor(now / 30_000)]);
  const wires = useMemo(() => getHeadlines(now),    [Math.floor(now / 30_000)]);
  const nextImpact = watch.enabled && watch.highOnly ? "high" : "medium";
  const nextRaw = useMemo(() => getNextEvent(now, nextImpact), [now, nextImpact]);
  const next = nextRaw && (!watch.enabled || matchWatch(nextRaw.currency, nextRaw.impact)) ? nextRaw : null;

  const filterFn = (n: NewsItem) => matchWatch(n.currency, n.impact);

  return (
    <div className="flex flex-col gap-4">
      {next && <NextEventCard n={next} now={now} />}

      <div className="panel flex gap-1 p-1">
        <ViewTab active={view === "upcoming"} onClick={() => setView("upcoming")} label="⏱ Vandaag" />
        <ViewTab active={view === "week"} onClick={() => setView("week")} label="📅 Deze week" />
        <ViewTab active={view === "wires"} onClick={() => setView("wires")} label="📰 Nieuws" />
      </div>

      <button
        onClick={() => setShowWatch((v) => !v)}
        className="mono flex items-center justify-between rounded-lg border border-panel-border bg-panel/60 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-foreground hover:border-primary/60"
      >
        <span className="flex items-center gap-2">
          <span>👁 Watchlist</span>
          {watch.enabled ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
              {watch.highOnly ? "🔴 high · " : ""}{watch.currencies.length} valuta
            </span>
          ) : (
            <span className="text-muted-foreground">alles zichtbaar</span>
          )}
        </span>
        <span className="text-primary">{showWatch ? "▲ sluit" : "▼ open"}</span>
      </button>
      {showWatch && <WatchlistPanel />}

      {view === "upcoming" && <DayList items={week[1].items.filter(filterFn)} now={now} />}
      {view === "week" && (
        <div className="flex flex-col gap-3">
          {week.map(({ day, items }) => {
            const filtered = items.filter(filterFn);
            if (!filtered.length) return null;
            return (
              <div key={day} className="panel overflow-hidden">
                <div className="panel-header">
                  <span>{formatDayLabel(day, now)}</span>
                  <span className="mono text-[10px] text-muted-foreground">{filtered.length} events</span>
                </div>
                <DayList items={filtered} now={now} embedded />
              </div>
            );
          })}
        </div>
      )}
      {view === "wires" && (
        <div className="panel divide-y divide-panel-border/40">
          {wires.map((w) => <WireRow key={w.id} n={w} />)}
        </div>
      )}
    </div>
  );
}

function NextEventCard({ n, now }: { n: NewsItem; now: number }) {
  const secUntil = n.time - Math.floor(now / 1000);
  const impactColor = n.impact === "high" ? "bg-bear text-background" : n.impact === "medium" ? "bg-warn text-background" : "bg-muted-foreground text-background";
  return (
    <div className="panel relative overflow-hidden p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-bull/5" />
      <div className="relative">
        <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-primary" />
          Volgend event
          <span className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-black ${impactColor}`}>
            {n.impact === "high" ? "HIGH IMPACT" : n.impact === "medium" ? "MEDIUM" : "LOW"}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-2xl">{n.country}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-black tracking-tight">{n.title}</div>
            <div className="mono text-[10px] text-muted-foreground">
              {n.currency} · {new Date(n.time * 1000).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <div className="mono text-3xl font-black tabular-nums text-primary sm:text-4xl">
            {formatCountdown(secUntil)}
          </div>
          <div className="mono text-[10px] uppercase text-muted-foreground">tot release</div>
        </div>

        {n.explain && <p className="mt-2 text-[12px] text-muted-foreground">{n.explain}</p>}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat k="Vorige" v={n.previous ?? "—"} />
          <Stat k="Verwacht" v={n.forecast ?? "—"} />
          <Stat k="Nu voorspeld" v={n.prediction?.value ?? "—"} tone="primary" />
        </div>

        {n.prediction && <PredictionBar p={n.prediction} forecast={n.forecast} />}
        <NowcastTimeline item={n} now={now} />
      </div>
    </div>
  );
}

function PredictionBar({ p, forecast }: { p: NonNullable<NewsItem["prediction"]>; forecast?: string }) {
  const biasColor = p.bias === "hawkish" ? "text-bull" : p.bias === "dovish" ? "text-bear" : "text-muted-foreground";
  const biasLabel = p.bias === "hawkish" ? "▲ boven verwachting" : p.bias === "dovish" ? "▼ onder verwachting" : "≈ in lijn";
  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="mono font-black uppercase tracking-wider text-primary">🔮 Pre-release voorspelling</span>
        <span className="mono text-muted-foreground">{p.updatedMinAgo}m geleden</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
        <span className="mono font-black">{p.source}</span>
        <span className="text-muted-foreground">·</span>
        <span className={`font-black ${biasColor}`}>{biasLabel}</span>
        <span className="text-muted-foreground">·</span>
        <span className="mono text-muted-foreground">conf {(p.confidence * 100).toFixed(0)}%</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel-border/50">
        <div className="h-full bg-gradient-to-r from-primary to-bull" style={{ width: `${p.confidence * 100}%` }} />
      </div>
      {forecast && (
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          Consensus: <span className="mono font-bold text-foreground">{forecast}</span> · Nowcast: <span className="mono font-bold text-primary">{p.value}</span>
        </div>
      )}
    </div>
  );
}

function DayList({ items, now, embedded }: { items: NewsItem[]; now: number; embedded?: boolean }) {
  if (!items.length) {
    return (
      <div className={`${embedded ? "" : "panel"} p-6 text-center text-[12px] text-muted-foreground`}>
        Geen events die aan je filter voldoen.
      </div>
    );
  }
  return (
    <ul className={embedded ? "" : "panel divide-y divide-panel-border/40"}>
      {items.map((n) => <EventRow key={n.id} n={n} now={now} />)}
    </ul>
  );
}

function EventRow({ n, now }: { n: NewsItem; now: number }) {
  const nowSec = Math.floor(now / 1000);
  const released = n.actual !== undefined;
  const isNext = !released && n.time - nowSec < 3600;
  const beat = released && n.forecast && parseFloat(n.actual!) > parseFloat(n.forecast);
  const impactColor = n.impact === "high" ? "bg-bear" : n.impact === "medium" ? "bg-warn" : "bg-muted-foreground";

  return (
    <li className={`px-3 py-2.5 ${isNext ? "bg-primary/5" : ""}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${impactColor}`} />
        <div className="mono w-14 shrink-0 text-[11px] font-black tabular-nums text-foreground">
          {new Date(n.time * 1000).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none">{n.country}</span>
            <span className="mono text-[10px] font-black text-muted-foreground">{n.currency}</span>
            {isNext && (
              <span className="mono ml-auto shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-primary">
                in {formatCountdown(n.time - nowSec)}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] font-semibold text-foreground">{n.title}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
            {n.previous && <Kv k="vorige" v={n.previous} />}
            {n.forecast && <Kv k="fcst" v={n.forecast} />}
            {n.actual && <Kv k="actual" v={n.actual} tone={beat ? "bull" : "bear"} />}
            {!released && n.prediction && (
              <Kv k="🔮 nowcast" v={n.prediction.value} tone="primary" title={`${n.prediction.source} · conf ${(n.prediction.confidence*100).toFixed(0)}%`} />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function WireRow({ n }: { n: NewsItem }) {
  const impactColor = n.impact === "high" ? "bg-bear" : n.impact === "medium" ? "bg-warn" : "bg-muted-foreground";
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${impactColor}`} />
        <div className="min-w-0 flex-1">
          <div className="mono flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{new Date(n.time * 1000).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" })}</span>
            <span>·</span>
            <span className="font-black text-foreground">{n.source}</span>
          </div>
          <div className="mt-0.5 text-[12px] leading-snug text-foreground">{n.title}</div>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "primary" }) {
  return (
    <div className="rounded-lg border border-panel-border/60 bg-panel/60 p-2">
      <div className="mono text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className={`mono mt-0.5 text-sm font-black tabular-nums ${tone === "primary" ? "text-primary" : "text-foreground"}`}>{v}</div>
    </div>
  );
}

function Kv({ k, v, tone, title }: { k: string; v: string; tone?: "bull" | "bear" | "primary"; title?: string }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <span className="mono text-muted-foreground" title={title}>
      {k} <span className={`font-black ${cls}`}>{v}</span>
    </span>
  );
}

function ViewTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`mono flex-1 rounded-md px-2 py-2 text-[11px] font-black uppercase tracking-wider transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function formatDayLabel(dayTs: number, now: number): string {
  const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
  const diff = Math.round((dayTs - today.getTime()) / 86400_000);
  const d = new Date(dayTs);
  const dow = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"][d.getUTCDay()];
  const dm = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  if (diff === -1) return `Gisteren · ${dow} ${dm}`;
  if (diff === 0) return `Vandaag · ${dow} ${dm}`;
  if (diff === 1) return `Morgen · ${dow} ${dm}`;
  return `${dow} ${dm}`;
}
