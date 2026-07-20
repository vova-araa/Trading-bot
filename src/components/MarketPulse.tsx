import { useEffect, useState } from "react";

// Live market-sentiment + headlines panel. Pulls the real /api/news/feed proxy
// (Fear & Greed, CoinGecko global, CoinDesk + FXStreet RSS). Silently hides if
// nothing loads, so the built-in economic calendar below always stands alone.
type Headline = { title: string; url: string; source: string; time: number };
type Feed = {
  ok: boolean;
  fng?: { value: number; label: string };
  global?: { mcapUsd: number; btcDominance: number; change24h: number };
  headlines: Headline[];
};

function ago(ts: number): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return "nu";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}u`;
  return `${Math.floor(s / 86400)}d`;
}

function fngColor(v: number): string {
  if (v >= 75) return "#22d18c";
  if (v >= 55) return "#8bd450";
  if (v >= 45) return "#f5c26b";
  if (v >= 25) return "#f0883e";
  return "#ef5a5a";
}

export function MarketPulse() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/news/feed");
        const j = (await res.json()) as Feed;
        if (!alive) return;
        const hasData = !!(j.fng || j.global || j.headlines?.length);
        setFeed(j);
        setState(hasData ? "ok" : "empty");
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
      <div className="panel mb-3 animate-pulse p-4 text-center text-[12px] text-muted-foreground">
        Live marktsentiment laden…
      </div>
    );
  }
  if (!feed) return null;

  return (
    <div className="mb-3 flex flex-col gap-3">
      {/* Sentiment tiles */}
      {(feed.fng || feed.global) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {feed.fng && (
            <div className="panel flex flex-col items-center justify-center gap-1 p-3">
              <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Fear & Greed
              </div>
              <div
                className="grid h-14 w-14 place-items-center rounded-full text-lg font-black"
                style={{
                  background: `conic-gradient(${fngColor(feed.fng.value)} ${feed.fng.value}%, rgba(120,140,160,0.15) 0)`,
                }}
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-panel">
                  {feed.fng.value}
                </span>
              </div>
              <div
                className="mono text-[10px] font-black"
                style={{ color: fngColor(feed.fng.value) }}
              >
                {feed.fng.label}
              </div>
            </div>
          )}
          {feed.global && (
            <>
              <Tile
                label="Crypto mcap"
                value={`$${(feed.global.mcapUsd / 1e12).toFixed(2)}T`}
                sub={`${feed.global.change24h >= 0 ? "+" : ""}${feed.global.change24h.toFixed(2)}% 24u`}
                subTone={feed.global.change24h >= 0 ? "bull" : "bear"}
              />
              <Tile label="BTC dominantie" value={`${feed.global.btcDominance.toFixed(1)}%`} />
              <Tile
                label="Sentiment"
                value={feed.global.change24h >= 0 ? "Risk-on" : "Risk-off"}
                subTone={feed.global.change24h >= 0 ? "bull" : "bear"}
              />
            </>
          )}
        </div>
      )}

      {/* Live headlines */}
      {feed.headlines.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-panel-border/60 px-3 py-2">
            <span className="text-sm font-black">📰 Live koppen</span>
            <span className="mono flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-bull" />
              realtime
            </span>
          </div>
          <div className="divide-y divide-panel-border/60">
            {feed.headlines.map((h, i) => (
              <a
                key={`${h.url}-${i}`}
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-panel-border/20"
              >
                <span className="mono mt-0.5 shrink-0 rounded bg-panel-border/50 px-1.5 py-0.5 text-[8px] font-black uppercase text-muted-foreground">
                  {h.source}
                </span>
                <span className="min-w-0 flex-1 text-[12px] leading-snug">{h.title}</span>
                <span className="mono shrink-0 text-[9px] text-muted-foreground">
                  {ago(h.time)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  subTone,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: "bull" | "bear";
}) {
  return (
    <div className="panel flex flex-col justify-center gap-0.5 p-3">
      <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-base font-black tabular-nums">{value}</div>
      {sub && (
        <div
          className={`mono text-[10px] font-bold ${subTone === "bull" ? "text-bull" : subTone === "bear" ? "text-bear" : "text-muted-foreground"}`}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
