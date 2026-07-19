// MQL5-inspired bot marketplace. Templates die je met 1 klik installeert.
// Elke template heeft parameters die per bot instelbaar zijn.

export type ParamType = "number" | "select" | "boolean";

export type ParamDef = {
  key: string;
  label: string;
  type: ParamType;
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  help?: string;
};

export type BotTemplate = {
  id: string;
  name: string;
  author: string;      // Bekende trader / dev inspiratie
  platform: "MQL5" | "cTrader" | "TradingView" | "Binance" | "Universal";
  kind: "grid" | "dca" | "signal" | "scalper" | "trend" | "smc" | "arbitrage";
  emoji: string;
  price: "GRATIS" | string;
  rating: number;      // 0-5
  installs: number;
  desc: string;
  symbols: string[];   // aanbevolen assets
  timeframe: string;
  risk: "Laag" | "Middel" | "Hoog";
  params: ParamDef[];
};

export const MARKETPLACE: BotTemplate[] = [
  {
    id: "mql5-scalper-pro",
    name: "Scalper Pro EA",
    author: "MQL5 · TradeMaster",
    platform: "MQL5",
    kind: "scalper",
    emoji: "⚡",
    price: "GRATIS",
    rating: 4.7,
    installs: 12480,
    desc: "Snelle scalper op M1/M5. Pakt kleine bewegingen met tight stops.",
    symbols: ["EURUSD", "GBPUSD", "XAUUSD"],
    timeframe: "M1",
    risk: "Middel",
    params: [
      { key: "lot", label: "Lot grootte", type: "number", default: 0.1, min: 0.01, max: 5, step: 0.01, help: "Hoeveel volume per trade" },
      { key: "sl", label: "Stop Loss (pips)", type: "number", default: 15, min: 1, max: 500, step: 1 },
      { key: "tp", label: "Take Profit (pips)", type: "number", default: 25, min: 1, max: 1000, step: 1 },
      { key: "maxTrades", label: "Max open trades", type: "number", default: 3, min: 1, max: 20, step: 1 },
      { key: "trailing", label: "Trailing stop", type: "boolean", default: true },
    ],
  },
  {
    id: "mql5-grid-master",
    name: "Grid Master v3",
    author: "MQL5 · FaberQuant",
    platform: "MQL5",
    kind: "grid",
    emoji: "🕸️",
    price: "GRATIS",
    rating: 4.4,
    installs: 8320,
    desc: "Klassiek grid systeem. Zet orders op vaste intervallen boven en onder.",
    symbols: ["BTCUSD", "ETHUSD", "EURUSD"],
    timeframe: "M15",
    risk: "Hoog",
    params: [
      { key: "gridStep", label: "Grid stap (%)", type: "number", default: 1.0, min: 0.1, max: 10, step: 0.1 },
      { key: "gridLevels", label: "Aantal levels", type: "number", default: 10, min: 2, max: 50, step: 1 },
      { key: "orderSize", label: "Order grootte ($)", type: "number", default: 50, min: 1, max: 10000, step: 1 },
      { key: "direction", label: "Richting", type: "select", default: "both", options: [
        { value: "long", label: "Alleen Long" },
        { value: "short", label: "Alleen Short" },
        { value: "both", label: "Beide kanten" },
      ]},
    ],
  },
  {
    id: "ct-smc-hunter",
    name: "SMC Liquidity Hunter",
    author: "cTrader · Vaale",
    platform: "cTrader",
    kind: "smc",
    emoji: "🎯",
    price: "€49",
    rating: 4.9,
    installs: 3210,
    desc: "Smart Money Concepts: order blocks, FVGs en liquidity sweeps.",
    symbols: ["XAUUSD", "US30", "NAS100"],
    timeframe: "M15",
    risk: "Middel",
    params: [
      { key: "risk", label: "Risico per trade (%)", type: "number", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "rr", label: "Risk:Reward", type: "number", default: 3, min: 1, max: 10, step: 0.5 },
      { key: "session", label: "Trading sessie", type: "select", default: "london_ny", options: [
        { value: "asia", label: "Azië" },
        { value: "london", label: "Londen" },
        { value: "ny", label: "New York" },
        { value: "london_ny", label: "Londen + NY" },
      ]},
      { key: "confluence", label: "Wacht op confluence", type: "boolean", default: true },
    ],
  },
  {
    id: "tv-dca-bull",
    name: "DCA Bull Runner",
    author: "TradingView · CryptoTrend",
    platform: "TradingView",
    kind: "dca",
    emoji: "📥",
    price: "GRATIS",
    rating: 4.5,
    installs: 15670,
    desc: "Koopt bij op dips via TradingView webhook. Perfect voor bull markets.",
    symbols: ["BTCUSD", "ETHUSD", "SOLUSD"],
    timeframe: "H1",
    risk: "Laag",
    params: [
      { key: "baseOrder", label: "Basis order ($)", type: "number", default: 100, min: 10, max: 100000, step: 10 },
      { key: "safetyOrder", label: "Safety order ($)", type: "number", default: 50, min: 10, max: 100000, step: 10 },
      { key: "maxSafety", label: "Max safety orders", type: "number", default: 5, min: 1, max: 20, step: 1 },
      { key: "deviation", label: "Prijs deviation (%)", type: "number", default: 2.5, min: 0.5, max: 20, step: 0.1 },
      { key: "tp", label: "Take Profit (%)", type: "number", default: 3, min: 0.5, max: 50, step: 0.1 },
    ],
  },
  {
    id: "binance-trend-rider",
    name: "Trend Rider AI",
    author: "Binance · AlphaLab",
    platform: "Binance",
    kind: "trend",
    emoji: "📈",
    price: "€19/mo",
    rating: 4.6,
    installs: 5890,
    desc: "EMA + RSI trend volgend systeem met dynamische SL.",
    symbols: ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD"],
    timeframe: "H4",
    risk: "Middel",
    params: [
      { key: "emaFast", label: "EMA snel", type: "number", default: 20, min: 5, max: 200, step: 1 },
      { key: "emaSlow", label: "EMA langzaam", type: "number", default: 50, min: 10, max: 500, step: 1 },
      { key: "rsiMax", label: "RSI overbought", type: "number", default: 70, min: 50, max: 95, step: 1 },
      { key: "leverage", label: "Hefboom", type: "select", default: "3", options: [
        { value: "1", label: "1x (spot)" },
        { value: "3", label: "3x" },
        { value: "5", label: "5x" },
        { value: "10", label: "10x" },
      ]},
    ],
  },
  {
    id: "mql5-arb-scanner",
    name: "Arbitrage Scanner",
    author: "MQL5 · QuantForge",
    platform: "MQL5",
    kind: "arbitrage",
    emoji: "🔀",
    price: "€99",
    rating: 4.3,
    installs: 1240,
    desc: "Zoekt prijsverschillen tussen brokers en handelt automatisch.",
    symbols: ["EURUSD", "BTCUSD"],
    timeframe: "Tick",
    risk: "Laag",
    params: [
      { key: "minSpread", label: "Min spread (pips)", type: "number", default: 2, min: 0.1, max: 50, step: 0.1 },
      { key: "maxSlippage", label: "Max slippage (pips)", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: "orderSize", label: "Order grootte", type: "number", default: 1, min: 0.01, max: 100, step: 0.01 },
    ],
  },
];

export function findTemplate(id: string) {
  return MARKETPLACE.find((t) => t.id === id);
}
