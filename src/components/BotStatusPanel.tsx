import { useEffect, useState } from "react";
import {
  botHealth,
  clearAlerts,
  dismissAlert,
  subscribeBots,
  type Bot,
  type BotAlert,
  type BotHealth,
} from "@/lib/bots";

export function BotStatusPanel() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeBots(setBots), []);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const active = bots.filter((b) => b.enabled || b.deployed);

  const counts = {
    ok: active.filter((b) => botHealth(b, now) === "ok").length,
    warn: active.filter((b) => botHealth(b, now) === "warn").length,
    error: active.filter((b) => botHealth(b, now) === "error").length,
  };

  return (
    <section className="panel mb-5 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-panel-border/60 bg-panel-border/20 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-bull" />
          <span className="text-sm font-black tracking-tight">Bot status</span>
          <span className="mono text-[10px] text-muted-foreground">
            {active.length} actief
          </span>
        </div>
        <div className="mono flex items-center gap-1.5 text-[10px] font-black">
          <span className="rounded-full bg-bull/15 px-2 py-0.5 text-bull">{counts.ok} ok</span>
          {counts.warn > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-500">{counts.warn} warn</span>
          )}
          {counts.error > 0 && (
            <span className="rounded-full bg-bear/15 px-2 py-0.5 text-bear">{counts.error} fout</span>
          )}
        </div>
      </div>

      {active.length === 0 ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">
          Geen actieve bots. Zet een bot aan of deploy 24/7 om live status te zien.
        </div>
      ) : (
        <div className="divide-y divide-panel-border/60">
          {active.map((b) => (
            <StatusRow key={b.id} bot={b} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

function StatusRow({ bot, now }: { bot: Bot; now: number }) {
  const health = botHealth(bot, now);
  const uptime = bot.startedAt ? now - bot.startedAt : 0;
  const lastTickAgo = bot.lastTickAt ? now - bot.lastTickAt : null;
  const alerts = bot.alerts ?? [];
  const [open, setOpen] = useState(false);

  return (
    <div className="px-3 py-3">
      <div className="flex items-start gap-3">
        <HealthDot health={health} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-lg leading-none">{bot.emoji}</span>
            <span className="text-sm font-black">{bot.name}</span>
            <span className="mono text-[10px] text-muted-foreground">{bot.symbol}</span>
            {bot.deployed && (
              <span className="mono rounded-full bg-bull/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-bull">24/7</span>
            )}
            <HealthBadge health={health} />
          </div>
          <div className="mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>⏱ {formatDuration(uptime)}</span>
            <span>
              📡 {lastTickAgo != null ? `${formatAgo(lastTickAgo)} geleden` : "nog geen tick"}
            </span>
            <span className={`${bot.pnl >= 0 ? "text-bull" : "text-bear"}`}>
              {bot.pnl >= 0 ? "+" : ""}${bot.pnl.toFixed(2)}
            </span>
            <span>{bot.trades} trades</span>
          </div>
          {bot.lastAction && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
              <span className="mono rounded bg-panel-border/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                {actionLabel(bot.lastAction.kind)}
              </span>
              <span className="min-w-0 flex-1 truncate">{bot.lastAction.text}</span>
              <span className="mono shrink-0 text-[10px] text-muted-foreground">
                {formatAgo(now - bot.lastAction.at)}
              </span>
            </div>
          )}
        </div>
        {alerts.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className={`mono shrink-0 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
              alerts.some((a) => a.level === "error")
                ? "bg-bear/15 text-bear hover:bg-bear/25"
                : "bg-amber-500/15 text-amber-500 hover:bg-amber-500/25"
            }`}
          >
            {alerts.length} {open ? "▲" : "▼"}
          </button>
        )}
      </div>

      {open && alerts.length > 0 && (
        <div className="mt-3 rounded-md border border-panel-border/60 bg-panel-border/10">
          <div className="flex items-center justify-between border-b border-panel-border/50 px-2.5 py-1.5">
            <span className="mono text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Recent
            </span>
            <button
              onClick={() => clearAlerts(bot.id)}
              className="mono text-[10px] font-bold text-primary hover:underline"
            >
              wis alles
            </button>
          </div>
          <ul className="divide-y divide-panel-border/50">
            {alerts.map((a) => (
              <AlertRow key={a.at} alert={a} onDismiss={() => dismissAlert(bot.id, a.at)} now={now} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert, onDismiss, now }: { alert: BotAlert; onDismiss: () => void; now: number }) {
  const color =
    alert.level === "error"
      ? "text-bear"
      : alert.level === "warn"
        ? "text-amber-500"
        : "text-muted-foreground";
  const icon = alert.level === "error" ? "⛔" : alert.level === "warn" ? "⚠" : "ℹ";
  return (
    <li className="flex items-center gap-2 px-2.5 py-2 text-[11px]">
      <span className={color}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{alert.text}</span>
      <span className="mono shrink-0 text-[10px] text-muted-foreground">
        {formatAgo(now - alert.at)}
      </span>
      <button
        onClick={onDismiss}
        className="mono shrink-0 rounded px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
        aria-label="Sluiten"
      >
        ✕
      </button>
    </li>
  );
}

function HealthDot({ health }: { health: BotHealth }) {
  const map: Record<BotHealth, string> = {
    ok: "bg-bull",
    idle: "bg-primary",
    warn: "bg-amber-500",
    error: "bg-bear",
    off: "bg-muted",
  };
  const pulse = health === "ok" || health === "idle" ? "live-dot" : "";
  return <span className={`${pulse} mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${map[health]}`} />;
}

function HealthBadge({ health }: { health: BotHealth }) {
  const map: Record<BotHealth, { text: string; cls: string }> = {
    ok: { text: "Live", cls: "bg-bull/15 text-bull" },
    idle: { text: "Wacht", cls: "bg-primary/15 text-primary" },
    warn: { text: "Let op", cls: "bg-amber-500/15 text-amber-500" },
    error: { text: "Fout", cls: "bg-bear/15 text-bear" },
    off: { text: "Uit", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[health];
  return (
    <span className={`mono rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${m.cls}`}>
      {m.text}
    </span>
  );
}

function actionLabel(k: string) {
  return k === "open"
    ? "Open"
    : k === "close"
      ? "Close"
      : k === "tick"
        ? "Tick"
        : k === "deploy"
          ? "Deploy"
          : k === "stop"
            ? "Stop"
            : "Config";
}

function formatDuration(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}u`;
  if (h > 0) return `${h}u ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatAgo(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}u`;
  return `${Math.floor(h / 24)}d`;
}
