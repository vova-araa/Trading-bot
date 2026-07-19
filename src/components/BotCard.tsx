import type { Bot } from "@/lib/bots";
import { toggleBot, deployBot, undeployBot } from "@/lib/bots";
import { brokerEmoji, brokerLabel } from "@/lib/broker-mapping";

export function BotCard({ bot, onEdit }: { bot: Bot; onEdit?: (b: Bot) => void }) {
  const pnlPos = bot.pnl >= 0;
  return (
    <div className={`panel overflow-hidden ${bot.deployed ? "ring-2 ring-bull/60" : bot.enabled ? "ring-1 ring-primary/40" : "opacity-70"}`}>
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-panel-border/40 text-2xl">
          {bot.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black">{bot.name}</span>
            <span className="mono text-[10px] text-muted-foreground">{bot.symbol}</span>
            {bot.deployed && (
              <span className="mono flex items-center gap-1 rounded-full bg-bull/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-bull">
                <span className="live-dot h-1 w-1 rounded-full bg-bull" /> 24/7
              </span>
            )}
          </div>
          <div className="line-clamp-2 text-[11px] text-muted-foreground">{bot.desc}</div>
        </div>
        <button
          onClick={() => toggleBot(bot.id)}
          className={`mono relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            bot.enabled ? "bg-bull" : "bg-muted"
          }`}
          aria-label={bot.enabled ? "Uit" : "Aan"}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${
              bot.enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      {/* Broker binding badge */}
      <button
        onClick={() => onEdit?.(bot)}
        className={`mono flex w-full items-center gap-2 border-t border-panel-border/60 px-3 py-1.5 text-left text-[10px] font-black uppercase tracking-wider ${
          bot.broker
            ? "bg-primary/5 text-primary hover:bg-primary/10"
            : "bg-warn/10 text-warn hover:bg-warn/20"
        }`}
        aria-label="Broker mapping"
      >
        {bot.broker ? (
          <>
            <span className="text-sm">{brokerEmoji(bot.broker.brokerId)}</span>
            <span className="truncate">{brokerLabel(bot.broker.brokerId)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="truncate normal-case tracking-normal">{bot.broker.brokerSymbol}</span>
            <span className="text-muted-foreground">·</span>
            <span>{bot.broker.leverage}x</span>
            <span className="ml-auto opacity-60">wijzig ›</span>
          </>
        ) : (
          <>
            <span>⚠ Geen broker gekoppeld</span>
            <span className="ml-auto opacity-70">koppel ›</span>
          </>
        )}
      </button>
      <div className="grid grid-cols-3 gap-px border-t border-panel-border/60 bg-panel-border/50">
        <Stat label="Winst" value={`${pnlPos ? "+" : ""}$${bot.pnl.toFixed(2)}`} tone={pnlPos ? "bull" : "bear"} />
        <Stat label="Trades" value={bot.trades.toString()} />
        <Stat label="Winrate" value={`${(bot.winRate * 100).toFixed(0)}%`} />
      </div>
      <div className="grid grid-cols-[1fr_auto] border-t border-panel-border/60">
        <button
          onClick={() => (bot.deployed ? undeployBot(bot.id) : deployBot(bot.id))}
          className={`mono py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
            bot.deployed
              ? "bg-bear/10 text-bear hover:bg-bear/20"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {bot.deployed ? "■ Stop 24/7" : "☁ Deploy 24/7"}
        </button>
        <button
          onClick={() => onEdit?.(bot)}
          className="mono border-l border-panel-border/60 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground hover:bg-panel-border/40 hover:text-foreground"
          aria-label="Instellingen"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="bg-panel px-2 py-2 text-center">
      <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mono text-[13px] font-black tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
