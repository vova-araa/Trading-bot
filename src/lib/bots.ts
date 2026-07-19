// Simulated trading bots inspired by Wundertrading (Grid, DCA, Signal, Pump).
// Each bot ticks its own P&L based on the live market simulator.

import { SYMBOLS, currentPrice, onTick } from "./market-data";
import { findTemplate, type BotTemplate } from "./bot-marketplace";
import { pushVersion, clearVersions } from "./bot-versions";
import { autoBind, translateSymbol, type BrokerBinding } from "./broker-mapping";


export type BotKind = "grid" | "dca" | "signal" | "pump" | "scalper" | "trend" | "smc" | "arbitrage";

export type BotSettings = Record<string, number | string | boolean>;

export type BotAction = {
  at: number;
  kind: "open" | "close" | "tick" | "deploy" | "stop" | "config";
  text: string;
  pnl?: number;
};

export type BotAlert = {
  at: number;
  level: "info" | "warn" | "error";
  text: string;
};

export type Bot = {
  id: string;
  kind: BotKind;
  name: string;
  symbol: string;
  emoji: string;
  desc: string;
  enabled: boolean;
  deployed: boolean; // running 24/7 on cloud
  pnl: number; // running P&L in $
  trades: number;
  winRate: number; // 0..1
  start: number; // start price
  templateId?: string;      // reference to marketplace template
  platform?: string;         // MQL5, cTrader, etc.
  settings?: BotSettings;    // configurable parameters
  startedAt?: number;        // ms since bot was enabled/deployed
  lastTickAt?: number;       // ms of last engine tick for this bot
  lastAction?: BotAction;    // most recent activity
  alerts?: BotAlert[];       // recent warnings/errors (max 8, newest first)
  broker?: BrokerBinding;    // gekoppelde broker + broker-symbool + hefboom
};

const KEY = "ara-bots-v1";

const DEFAULT_BOTS: Omit<Bot, "pnl" | "trades" | "winRate" | "start" | "deployed">[] = [
  { id: "grid-btc", kind: "grid", name: "Grid Bot", symbol: "BTCUSD", emoji: "🤖", desc: "Koopt laag, verkoopt hoog in een zone. Werkt goed als de prijs op-en-neer gaat.", enabled: true },
  { id: "grid-eth", kind: "grid", name: "Grid Bot", symbol: "ETHUSD", emoji: "🤖", desc: "Verdient aan kleine schommelingen. Zet aan en vergeet.", enabled: false },
  { id: "dca-btc", kind: "dca", name: "DCA Bot", symbol: "BTCUSD", emoji: "📥", desc: "Koopt elke keer een klein beetje bij als de prijs daalt. Slim voor lange termijn.", enabled: true },
  { id: "dca-sol", kind: "dca", name: "DCA Bot", symbol: "SOLUSD", emoji: "📥", desc: "Verlaagt je gemiddelde inkoopprijs automatisch.", enabled: false },
  { id: "signal-gold", kind: "signal", name: "Signal Bot", symbol: "XAUUSD", emoji: "📡", desc: "Luistert naar de scanner en opent trades op goud automatisch.", enabled: true },
  { id: "signal-eur", kind: "signal", name: "Signal Bot", symbol: "EURUSD", emoji: "📡", desc: "Automatische entries op EUR/USD signalen.", enabled: false },
  { id: "pump", kind: "pump", name: "Pump Screener", symbol: "ALL", emoji: "🚀", desc: "Zoekt munten die opeens hard omhoog gaan. Springt op de trein.", enabled: true },
];

function load(): Bot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_BOTS.map((b) => ({
    ...b,
    deployed: false,
    pnl: 0,
    trades: 0,
    winRate: 0.55 + Math.random() * 0.25,
    start: b.symbol === "ALL" ? 0 : currentPrice(b.symbol),
  }));
}

function save(bots: Bot[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(bots)); } catch {}
}

let bots: Bot[] = load();
const subs = new Set<(b: Bot[]) => void>();

function emit() {
  save(bots);
  subs.forEach((s) => s(bots));
}

export function getBots() { return bots; }

export function subscribeBots(fn: (b: Bot[]) => void) {
  subs.add(fn);
  fn(bots);
  return () => { subs.delete(fn); };
}

function pushAlert(b: Bot, level: BotAlert["level"], text: string): BotAlert[] {
  const list = [{ at: Date.now(), level, text }, ...(b.alerts ?? [])].slice(0, 8);
  return list;
}

export function toggleBot(id: string) {
  const now = Date.now();
  bots = bots.map((b) => {
    if (b.id !== id) return b;
    const enabled = !b.enabled;
    const action: BotAction = {
      at: now,
      kind: enabled ? "open" : "stop",
      text: enabled ? `Bot gestart op ${b.symbol}` : `Bot gestopt`,
    };
    return {
      ...b,
      enabled,
      start: b.symbol === "ALL" ? 0 : currentPrice(b.symbol),
      startedAt: enabled ? now : undefined,
      lastAction: action,
      alerts: pushAlert(b, "info", action.text),
    };
  });
  emit();
}

export function deployBot(id: string) {
  const now = Date.now();
  bots = bots.map((b) => {
    if (b.id !== id) return b;
    const action: BotAction = { at: now, kind: "deploy", text: "24/7 deploy live" };
    return {
      ...b,
      deployed: true,
      enabled: true,
      startedAt: b.startedAt ?? now,
      lastAction: action,
      alerts: pushAlert(b, "info", "Bot draait nu 24/7 in de cloud"),
    };
  });
  emit();
}
export function undeployBot(id: string) {
  const now = Date.now();
  bots = bots.map((b) => {
    if (b.id !== id) return b;
    const action: BotAction = { at: now, kind: "stop", text: "24/7 deploy gestopt" };
    return {
      ...b,
      deployed: false,
      lastAction: action,
      alerts: pushAlert(b, "warn", "24/7 deploy uitgezet"),
    };
  });
  emit();
}

function defaultsFor(tpl: BotTemplate): BotSettings {
  const s: BotSettings = {};
  tpl.params.forEach((p) => { s[p.key] = p.default; });
  return s;
}

export function installFromTemplate(templateId: string, symbol?: string, brokerIdOverride?: string): Bot | null {
  const tpl = findTemplate(templateId);
  if (!tpl) return null;
  const sym = symbol || tpl.symbols[0];
  const id = `${tpl.id}-${Date.now().toString(36)}`;
  let broker = autoBind(tpl, sym) ?? undefined;
  if (brokerIdOverride && broker && broker.brokerId !== brokerIdOverride) {
    broker = { ...broker, brokerId: brokerIdOverride, brokerSymbol: translateSymbol(brokerIdOverride, sym) };
  }
  const bot: Bot = {
    id,
    kind: tpl.kind as BotKind,
    name: tpl.name,
    symbol: sym,
    emoji: tpl.emoji,
    desc: tpl.desc,
    enabled: false,
    deployed: false,
    pnl: 0,
    trades: 0,
    winRate: 0.55 + Math.random() * 0.25,
    start: currentPrice(sym) || 0,
    templateId: tpl.id,
    platform: tpl.platform,
    settings: defaultsFor(tpl),
    broker,
  };
  bots = [bot, ...bots];
  const brokerNote = broker ? ` · gekoppeld aan ${broker.brokerId} (${broker.brokerSymbol}, ${broker.leverage}x)` : "";
  pushVersion(id, { symbol: sym, settings: bot.settings ?? {} }, "install", `Geïnstalleerd vanaf ${tpl.name}${brokerNote}`);
  emit();
  return bot;
}

export function updateBotBroker(id: string, broker: BrokerBinding | undefined) {
  bots = bots.map((b) => (b.id === id ? { ...b, broker } : b));
  emit();
}

export function updateBotSettings(id: string, settings: BotSettings) {
  bots = bots.map((b) => (b.id === id ? { ...b, settings: { ...b.settings, ...settings } } : b));
  const b = bots.find((x) => x.id === id);
  if (b) pushVersion(id, { symbol: b.symbol, settings: b.settings ?? {} }, "manual");
  emit();
}

export function updateBotSymbol(id: string, symbol: string) {
  bots = bots.map((b) => {
    if (b.id !== id) return b;
    const broker = b.broker ? { ...b.broker, brokerSymbol: translateSymbol(b.broker.brokerId, symbol) } : b.broker;
    return { ...b, symbol, start: currentPrice(symbol) || 0, broker };
  });
  const b = bots.find((x) => x.id === id);
  if (b) pushVersion(id, { symbol: b.symbol, settings: b.settings ?? {} }, "symbol");
  emit();
}

// Apply symbol + settings together (used for editor save and version restore)
// to produce a single version entry instead of two.
export function applyBotConfig(id: string, symbol: string, settings: BotSettings, source: "manual" | "restore" | "reset" = "manual", note?: string) {
  bots = bots.map((b) => {
    if (b.id !== id) return b;
    const symChanged = symbol !== b.symbol;
    const broker = b.broker && symChanged
      ? { ...b.broker, brokerSymbol: translateSymbol(b.broker.brokerId, symbol) }
      : b.broker;
    return {
      ...b,
      symbol,
      settings: { ...settings },
      start: symChanged ? (currentPrice(symbol) || 0) : b.start,
      broker,
    };
  });
  pushVersion(id, { symbol, settings }, source, note);
  emit();
}

export function removeBot(id: string) {
  bots = bots.filter((b) => b.id !== id);
  clearVersions(id);
  emit();
}


export function dismissAlert(id: string, at: number) {
  bots = bots.map((b) => (b.id === id ? { ...b, alerts: (b.alerts ?? []).filter((a) => a.at !== at) } : b));
  emit();
}

export function clearAlerts(id: string) {
  bots = bots.map((b) => (b.id === id ? { ...b, alerts: [] } : b));
  emit();
}

// Merge a partial patch (typically from the server) into an existing bot.
// Adds/removes are separate helpers to keep intent explicit.
export function mergeBotPatch(patch: Partial<Bot> & { id: string }) {
  let changed = false;
  bots = bots.map((b) => {
    if (b.id !== patch.id) return b;
    changed = true;
    return { ...b, ...patch };
  });
  if (changed) emit();
}
export function addRemoteBot(bot: Bot) {
  if (bots.some((b) => b.id === bot.id)) return;
  bots = [bot, ...bots];
  emit();
}
export function removeBotLocal(id: string) {
  const before = bots.length;
  bots = bots.filter((b) => b.id !== id);
  if (bots.length !== before) emit();
}


export type BotHealth = "ok" | "idle" | "warn" | "error" | "off";
export function botHealth(b: Bot, now = Date.now()): BotHealth {
  if (!b.enabled) return "off";
  const hasError = (b.alerts ?? []).some((a) => a.level === "error");
  if (hasError) return "error";
  const hasWarn = (b.alerts ?? []).some((a) => a.level === "warn");
  const stale = b.lastTickAt ? now - b.lastTickAt > 15000 : false;
  if (stale) return hasWarn ? "error" : "warn";
  if (hasWarn) return "warn";
  if (!b.lastTickAt || now - b.lastTickAt > 5000) return "idle";
  return "ok";
}

let started = false;
export function startBotEngine() {
  if (started || typeof window === "undefined") return;
  started = true;

  onTick((sym, price) => {
    let changed = false;
    const now = Date.now();
    bots = bots.map((b) => {
      if (!b.enabled) return b;
      if (b.symbol !== sym && b.symbol !== "ALL") return b;

      // very small simulated P&L delta per tick
      const seed = Math.sin((now / 1000) + b.id.length) * 0.5 + 0.5;
      let delta = 0;
      if (b.kind === "grid") delta = (Math.random() - 0.45) * 0.8;
      if (b.kind === "dca") delta = (Math.random() - 0.4) * 0.5;
      if (b.kind === "signal") delta = (Math.random() - 0.42) * 1.2;
      if (b.kind === "pump") delta = (Math.random() - 0.44) * 1.5;
      delta *= 1 + seed * 0.2;

      const pnl = b.pnl + delta;
      const opened = Math.random() < 0.02;
      const trades = opened ? b.trades + 1 : b.trades;

      let lastAction = b.lastAction;
      let alerts = b.alerts;

      if (opened) {
        const side = delta >= 0 ? "▲ long" : "▼ short";
        lastAction = { at: now, kind: "open", text: `${side} ${b.symbol} @ ${price.toFixed(4)}`, pnl };
      } else if (Math.random() < 0.008) {
        lastAction = { at: now, kind: "close", text: `Trade gesloten ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}$`, pnl };
      } else {
        lastAction = { at: now, kind: "tick", text: `Prijs check ${b.symbol} ${price.toFixed(4)}`, pnl };
      }

      // occasional simulated warnings/errors
      if (Math.random() < 0.0015) {
        const warns = [
          "Hoge spread gedetecteerd, order uitgesteld",
          "Broker latency > 400ms",
          "Slippage boven target op laatste order",
        ];
        alerts = pushAlert(b, "warn", warns[Math.floor(Math.random() * warns.length)]);
      }
      if (Math.random() < 0.0004) {
        const errs = [
          "Order geweigerd door broker (insufficient margin)",
          "API rate limit bereikt, retry over 30s",
          "Verbinding kort verbroken",
        ];
        alerts = pushAlert(b, "error", errs[Math.floor(Math.random() * errs.length)]);
      }

      changed = true;
      return { ...b, pnl, trades, lastTickAt: now, lastAction, alerts };
    });
    if (changed) {
      // throttle save/emit
      if (!(startBotEngine as any)._t) {
        (startBotEngine as any)._t = setTimeout(() => {
          (startBotEngine as any)._t = null;
          emit();
        }, 500);
      }
    }
  });
}

// Pump screener: top movers since midnight
export function topMovers(limit = 5) {
  return SYMBOLS
    .map((s) => {
      const now = currentPrice(s.id);
      const change = ((now - s.price) / s.price) * 100;
      return { id: s.id, name: s.name, kind: s.kind, price: now, change };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, limit);
}
