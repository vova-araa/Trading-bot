// Broker mapping engine. Wanneer je een bot installeert kiezen we automatisch
// de best passende gekoppelde broker, vertalen we het symbool naar het formaat
// van die broker, en vullen we account + hefboom uit een lokaal profiel.
// Zo hoef je bij install niks handmatig te doen — je kan het achteraf tweaken
// via de BotEditor.

import { BROKERS, getBrokerState, type Broker } from "./brokers";
import type { BotTemplate } from "./bot-marketplace";

export type BrokerBinding = {
  brokerId: string;         // e.g. "binance", "mt5"
  brokerSymbol: string;     // symbol as the broker knows it (BTCUSDT vs BTCUSD)
  accountLabel?: string;    // human label the user picked (e.g. "Live #1")
  leverage: number;         // 1..125
};

export type BrokerProfile = {
  brokerId: string;
  accountLabel: string;
  defaultLeverage: number;
  maxLeverage: number;
};

const PROFILE_KEY = "ara-broker-profiles-v1";

/** Per-broker defaults + capability caps. */
const BROKER_CAPS: Record<string, { defaultLeverage: number; maxLeverage: number; defaultAccount: string }> = {
  tradingview: { defaultLeverage: 1,  maxLeverage: 1,   defaultAccount: "Webhook" },
  ctrader:     { defaultLeverage: 30, maxLeverage: 500, defaultAccount: "cTrader Live" },
  mt4:         { defaultLeverage: 30, maxLeverage: 500, defaultAccount: "MT4 Live" },
  mt5:         { defaultLeverage: 30, maxLeverage: 500, defaultAccount: "MT5 Live" },
  binance:     { defaultLeverage: 3,  maxLeverage: 125, defaultAccount: "Binance USDT-M" },
  bybit:       { defaultLeverage: 3,  maxLeverage: 100, defaultAccount: "Bybit Perp" },
};

/** Symbol translation. Keys are ARA canonical symbols. */
const SYMBOL_MAP: Record<string, Record<string, string>> = {
  // Crypto — spot/perp naming differs per exchange
  BTCUSD: { binance: "BTCUSDT", bybit: "BTCUSDT", ctrader: "BTCUSD",  mt4: "BTCUSD",  mt5: "BTCUSD",  tradingview: "BINANCE:BTCUSDT" },
  ETHUSD: { binance: "ETHUSDT", bybit: "ETHUSDT", ctrader: "ETHUSD",  mt4: "ETHUSD",  mt5: "ETHUSD",  tradingview: "BINANCE:ETHUSDT" },
  SOLUSD: { binance: "SOLUSDT", bybit: "SOLUSDT", ctrader: "SOLUSD",  mt4: "SOLUSD",  mt5: "SOLUSD",  tradingview: "BINANCE:SOLUSDT" },
  XRPUSD: { binance: "XRPUSDT", bybit: "XRPUSDT", ctrader: "XRPUSD",  mt4: "XRPUSD",  mt5: "XRPUSD",  tradingview: "BINANCE:XRPUSDT" },
  DOGEUSD:{ binance: "DOGEUSDT",bybit: "DOGEUSDT",ctrader: "DOGEUSD", mt4: "DOGEUSD", mt5: "DOGEUSD", tradingview: "BINANCE:DOGEUSDT" },
  // Forex + metals — MT/cTrader gebruiken suffixes bij sommige brokers
  EURUSD: { ctrader: "EURUSD", mt4: "EURUSD", mt5: "EURUSD", tradingview: "FX:EURUSD" },
  GBPUSD: { ctrader: "GBPUSD", mt4: "GBPUSD", mt5: "GBPUSD", tradingview: "FX:GBPUSD" },
  USDJPY: { ctrader: "USDJPY", mt4: "USDJPY", mt5: "USDJPY", tradingview: "FX:USDJPY" },
  XAUUSD: { ctrader: "XAUUSD", mt4: "XAUUSD", mt5: "GOLD",   tradingview: "OANDA:XAUUSD" },
  // Indices / futures
  US30:   { ctrader: "US30",   mt4: "US30",   mt5: "US30",   tradingview: "TVC:DJI" },
  NAS100: { ctrader: "NAS100", mt4: "NAS100", mt5: "NAS100", tradingview: "TVC:NDX" },
  SPX500: { ctrader: "SPX500", mt4: "SPX500", mt5: "SPX500", tradingview: "TVC:SPX" },
};

/** Which brokers can trade which asset kind. */
const KIND_SUPPORT: Record<string, ("forex" | "crypto" | "futures" | "chart")[]> = {
  tradingview: ["chart", "forex", "crypto", "futures"],
  ctrader:     ["forex", "futures"],
  mt4:         ["forex"],
  mt5:         ["forex", "futures"],
  binance:     ["crypto"],
  bybit:       ["crypto"],
};

/** Best-effort asset kind of an ARA symbol. */
export function symbolKind(sym: string): "forex" | "crypto" | "futures" {
  if (["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD"].includes(sym)) return "crypto";
  if (["US30", "NAS100", "SPX500"].includes(sym)) return "futures";
  return "forex";
}

/** Translate an ARA symbol into the given broker's native ticker. */
export function translateSymbol(brokerId: string, araSymbol: string): string {
  return SYMBOL_MAP[araSymbol]?.[brokerId] ?? araSymbol;
}

export function connectedBrokers(): Broker[] {
  const state = getBrokerState();
  return BROKERS.filter((b) => state[b.id]?.connected);
}

/** Preference order: matching platform → matching asset kind → any connected. */
export function pickBrokerFor(template: BotTemplate, symbol: string): Broker | null {
  const connected = connectedBrokers();
  if (!connected.length) return null;

  const wantedPlatform = template.platform.toLowerCase();
  const kind = symbolKind(symbol);

  // 1. exact platform match that also supports the kind
  const platMatch = connected.find(
    (b) => b.id === wantedPlatform && (KIND_SUPPORT[b.id] ?? []).includes(kind),
  );
  if (platMatch) return platMatch;

  // 2. any broker that supports this asset kind
  const kindMatch = connected.find((b) => (KIND_SUPPORT[b.id] ?? []).includes(kind));
  if (kindMatch) return kindMatch;

  // 3. same platform even if kind mismatch
  const anyPlat = connected.find((b) => b.id === wantedPlatform);
  if (anyPlat) return anyPlat;

  return connected[0];
}

export function profileFor(brokerId: string): BrokerProfile {
  const all = loadProfiles();
  const saved = all[brokerId];
  const caps = BROKER_CAPS[brokerId] ?? { defaultLeverage: 1, maxLeverage: 10, defaultAccount: "Main" };
  return {
    brokerId,
    accountLabel: saved?.accountLabel ?? caps.defaultAccount,
    defaultLeverage: saved?.defaultLeverage ?? caps.defaultLeverage,
    maxLeverage: caps.maxLeverage,
  };
}

export function saveProfile(brokerId: string, patch: Partial<BrokerProfile>) {
  const all = loadProfiles();
  const cur = profileFor(brokerId);
  all[brokerId] = { ...cur, ...patch, brokerId };
  if (typeof window !== "undefined") localStorage.setItem(PROFILE_KEY, JSON.stringify(all));
}

function loadProfiles(): Record<string, BrokerProfile> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}"); } catch { return {}; }
}

/** Build a binding for a bot: broker + broker-native symbol + account + leverage. */
export function autoBind(template: BotTemplate, symbol: string): BrokerBinding | null {
  const broker = pickBrokerFor(template, symbol);
  if (!broker) return null;
  const prof = profileFor(broker.id);
  // For crypto templates we bump default leverage up to 3x, forex 30x — bounded by caps.
  const suggested = template.params.find((p) => p.key === "leverage");
  let lev = prof.defaultLeverage;
  if (suggested && typeof suggested.default === "string") {
    const n = Number(suggested.default);
    if (!Number.isNaN(n)) lev = Math.min(n, prof.maxLeverage);
  }
  return {
    brokerId: broker.id,
    brokerSymbol: translateSymbol(broker.id, symbol),
    accountLabel: prof.accountLabel,
    leverage: Math.max(1, Math.min(lev, prof.maxLeverage)),
  };
}

export function brokerCaps(brokerId: string) {
  return BROKER_CAPS[brokerId] ?? { defaultLeverage: 1, maxLeverage: 10, defaultAccount: "Main" };
}

export function brokerLabel(brokerId: string): string {
  return BROKERS.find((b) => b.id === brokerId)?.name ?? brokerId;
}
export function brokerEmoji(brokerId: string): string {
  return BROKERS.find((b) => b.id === brokerId)?.logo ?? "🔌";
}
