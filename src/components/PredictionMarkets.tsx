import { useEffect, useState } from "react";

// Prediction-market odds (Polymarket) — the crowd's probability of macro/crypto
// outcomes BEFORE the event resolves. Hides itself if nothing loads.
type Prediction = {
  question: string;
  yesProb: number;
  volumeUsd: number;
  url: string;
  endDate: string | null;
  tag: string;
};

function usd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function probColor(p: number): string {
  if (p >= 0.66) return "#22d18c";
  if (p >= 0.34) return "#f5c26b";
  return "#ef5a5a";
}
function endsIn(d: string | null): string {
  if (!d) return "";
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return "";
  const days = Math.round((t - Date.now()) / 86400000);
  if (days < 0) return "";
  if (days === 0) return "vandaag";
  if (days === 1) return "1 dag";
  return `${days} dagen`;
}

export function PredictionMarkets() {
  const [items, setItems] = useState<Prediction[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/edge/predictions");
        const j = (await res.json()) as { items?: Prediction[] };
        if (!alive) return;
        setItems(j.items ?? []);
        setState(j.items?.length ? "ok" : "empty");
      } catch {
        if (alive) setState("empty");
      }
    };
    void load();
    const iv = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  if (state === "empty") return null;
  if (state === "loading") {
    return (
      <div className="panel animate-pulse p-4 text-center text-[12px] text-muted-foreground">
        Prediction markets laden…
      </div>
    );
  }
  if (!items) return null;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border/60 px-3 py-2">
        <div>
          <div className="text-sm font-black">🔮 Uitkomst vóór het nieuws</div>
          <div className="mono text-[10px] text-muted-foreground">
            Live crowd-kansen van Polymarket — wat de markt verwacht
          </div>
        </div>
        <span className="mono flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          live
        </span>
      </div>
      <div className="divide-y divide-panel-border/60">
        {items.map((p, i) => {
          const pct = Math.round(p.yesProb * 100);
          return (
            <a
              key={`${p.url}-${i}`}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 transition-colors hover:bg-panel-border/20"
            >
              <div className="flex items-center gap-2">
                <span className="mono shrink-0 rounded bg-panel-border/50 px-1.5 py-0.5 text-[8px] font-black uppercase text-muted-foreground">
                  {p.tag}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px]">{p.question}</span>
                <span
                  className="mono shrink-0 text-[14px] font-black tabular-nums"
                  style={{ color: probColor(p.yesProb) }}
                >
                  {pct}%
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-border/40">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: probColor(p.yesProb) }}
                  />
                </div>
                <span className="mono shrink-0 text-[9px] text-muted-foreground">
                  {usd(p.volumeUsd)} vol{p.endDate && ` · ${endsIn(p.endDate)}`}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
