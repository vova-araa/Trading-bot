import { useEffect, useMemo, useState } from "react";
import { getEconomicCalendar, getHeadlines, type NewsItem } from "@/lib/news";

export function NewsFeed() {
  const [tab, setTab] = useState<"calendar" | "wires">("calendar");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(i); }, []);

  const cal = useMemo(() => getEconomicCalendar(now), [now]);
  const wires = useMemo(() => getHeadlines(now), [now]);
  const items = tab === "calendar" ? cal : wires;

  return (
    <div className="panel flex h-full flex-col">
      <div className="panel-header">
        <span>News & Calendar</span>
        <div className="mono flex gap-1 text-[10px] normal-case">
          <Tab active={tab === "calendar"} onClick={() => setTab("calendar")}>ForexFactory</Tab>
          <Tab active={tab === "wires"} onClick={() => setTab("wires")}>Wires</Tab>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <ul className="mono text-[11px]">
          {items.map((n) => <Row key={n.id} n={n} />)}
        </ul>
      </div>
    </div>
  );
}

function Row({ n }: { n: NewsItem }) {
  const impact = n.impact === "high" ? "bg-bear" : n.impact === "medium" ? "bg-warn" : "bg-muted-foreground";
  const released = n.actual !== undefined;
  const beat = released && n.forecast && parseFloat(n.actual!) > parseFloat(n.forecast);
  return (
    <li className="border-b border-panel-border/40 px-3 py-2 hover:bg-white/[0.03]">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${impact}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{new Date(n.time * 1000).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" })}</span>
            <span>·</span>
            <span className="font-semibold text-foreground">{n.currency}</span>
            <span>·</span>
            <span>{n.source}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-foreground">{n.title}</div>
          {(n.forecast || n.actual) && (
            <div className="mt-1 flex gap-3 text-[10px]">
              {n.previous && <Kv k="prev" v={n.previous} />}
              {n.forecast && <Kv k="fcst" v={n.forecast} />}
              {n.actual && <Kv k="act" v={n.actual} tone={beat ? "bull" : "bear"} />}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Kv({ k, v, tone }: { k: string; v: string; tone?: "bull" | "bear" }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <span className="text-muted-foreground">
      {k} <span className={`font-semibold ${cls}`}>{v}</span>
    </span>
  );
}

function Tab({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
        active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
