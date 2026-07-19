import { useEffect, useState } from "react";
import { TRADERS, type Trader, getFollowing, toggleFollow } from "@/lib/traders";

export function TraderList() {
  const [following, setFollowing] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setFollowing(getFollowing());
    sync();
    window.addEventListener("ara-follow-change", sync);
    return () => window.removeEventListener("ara-follow-change", sync);
  }, []);
  return (
    <div className="flex flex-col gap-3">
      {TRADERS.map((t) => (
        <TraderCard key={t.id} trader={t} following={following.includes(t.id)} />
      ))}
    </div>
  );
}

function TraderCard({ trader, following }: { trader: Trader; following: boolean }) {
  const riskCls =
    trader.risk === "Laag" ? "bg-bull/15 text-bull" : trader.risk === "Middel" ? "bg-primary/15 text-primary" : "bg-bear/15 text-bear";
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-panel-border/40 text-2xl">
          {trader.avatar}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black">{trader.name}</span>
            <span className={`mono rounded px-1.5 py-0.5 text-[9px] font-bold ${riskCls}`}>{trader.risk}</span>
          </div>
          <div className="mono truncate text-[10px] text-muted-foreground">{trader.handle} · {trader.style}</div>
        </div>
        <button
          onClick={() => toggleFollow(trader.id)}
          className={`mono shrink-0 rounded-md px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
            following ? "bg-bull/15 text-bull" : "bg-primary text-primary-foreground"
          }`}
        >
          {following ? "✓ Gekopieerd" : "Kopieer"}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-px border-t border-panel-border/60 bg-panel-border/50">
        <Cell label="Deze maand" value={`+${trader.roiMonth}%`} tone="bull" />
        <Cell label="Dit jaar" value={`+${trader.roiYear}%`} tone="bull" />
        <Cell label="Winrate" value={`${trader.winRate}%`} />
        <Cell label="Volgers" value={trader.followers > 999 ? `${(trader.followers / 1000).toFixed(1)}k` : `${trader.followers}`} />
      </div>
      <div className="border-t border-panel-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        {trader.bio}
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "bull" }) {
  const cls = tone === "bull" ? "text-bull" : "text-foreground";
  return (
    <div className="bg-panel px-2 py-2 text-center">
      <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mono text-[12px] font-black tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
