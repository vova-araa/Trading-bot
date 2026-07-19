// Realtime validatie voor bot-instellingen. Draait bij elke wijziging in de
// BotEditor en checkt of SL/TP, lot, gridstap, hefboom en sessies passen
// bij het gekozen instrument + de risico-limieten van de broker.

import type { BotSettings } from "./bots";
import type { BrokerBinding } from "./broker-mapping";
import { brokerCaps, symbolKind } from "./broker-mapping";

export type Severity = "error" | "warn" | "info";
export type Issue = {
  field?: string;      // param key or "symbol" | "broker"
  severity: Severity;
  message: string;
};

// Per asset-kind pip/lot-conventies (vereenvoudigd maar realistisch).
const KIND_LIMITS = {
  forex:   { maxLot: 50,  maxSlPips: 200, minRR: 1.0, sessions: ["asia", "london", "ny", "london_ny"] },
  crypto:  { maxLot: 100, maxSlPips: 500, minRR: 1.0, sessions: ["asia", "london", "ny", "london_ny"] }, // 24/7
  futures: { maxLot: 20,  maxSlPips: 300, minRR: 1.2, sessions: ["ny", "london_ny"] },                    // CME/US sessies
} as const;

export function validateBot(
  symbol: string,
  settings: BotSettings,
  binding?: BrokerBinding,
): Issue[] {
  const issues: Issue[] = [];
  const kind = symbolKind(symbol);
  const limits = KIND_LIMITS[kind];

  // ── Broker binding ─────────────────────────────────────────────────────
  if (!binding) {
    issues.push({ field: "broker", severity: "warn", message: "Geen broker gekoppeld — bot draait in simulatie." });
  } else {
    const caps = brokerCaps(binding.brokerId);
    if (binding.leverage > caps.maxLeverage) {
      issues.push({
        field: "broker", severity: "error",
        message: `Hefboom ${binding.leverage}x overschrijdt limiet ${caps.maxLeverage}x van ${binding.brokerId}.`,
      });
    }
    if (kind === "crypto" && !["binance", "bybit", "tradingview"].includes(binding.brokerId)) {
      issues.push({ field: "broker", severity: "warn", message: `${binding.brokerId} ondersteunt geen crypto — kies Binance of Bybit.` });
    }
    if (kind === "forex" && ["binance", "bybit"].includes(binding.brokerId)) {
      issues.push({ field: "broker", severity: "error", message: `${binding.brokerId} biedt geen forex — kies MT4/MT5 of cTrader.` });
    }
    if (binding.leverage >= 50) {
      issues.push({ field: "broker", severity: "warn", message: `Hoge hefboom (${binding.leverage}x) — 1% ongunstig = ${(binding.leverage).toFixed(0)}% verlies.` });
    }
  }

  // ── Lot / order-grootte ────────────────────────────────────────────────
  const lot = num(settings.lot);
  if (lot !== undefined) {
    if (lot <= 0) issues.push({ field: "lot", severity: "error", message: "Lot moet groter dan 0 zijn." });
    else if (lot > limits.maxLot) issues.push({ field: "lot", severity: "error", message: `Lot ${lot} is te groot voor ${kind} (max ${limits.maxLot}).` });
    else if (kind === "forex" && lot > 5) issues.push({ field: "lot", severity: "warn", message: `Lot ${lot} = zware exposure per pip. Overweeg 0.1–1.0.` });
  }
  const orderSize = num(settings.orderSize) ?? num(settings.baseOrder);
  if (orderSize !== undefined && orderSize <= 0) {
    issues.push({ field: "orderSize", severity: "error", message: "Order grootte moet > 0." });
  }

  // ── SL / TP ────────────────────────────────────────────────────────────
  const sl = num(settings.sl);
  const tp = num(settings.tp);
  if (sl !== undefined) {
    if (sl <= 0) issues.push({ field: "sl", severity: "error", message: "Stop Loss moet > 0 pips." });
    else if (sl > limits.maxSlPips) issues.push({ field: "sl", severity: "warn", message: `SL ${sl} pips is groot voor ${kind} (typisch < ${limits.maxSlPips}).` });
    else if (kind === "forex" && sl < 5) issues.push({ field: "sl", severity: "warn", message: `SL ${sl} pips is héél tight — spread eet je op.` });
  }
  if (tp !== undefined && tp <= 0) issues.push({ field: "tp", severity: "error", message: "Take Profit moet > 0." });
  if (sl && tp) {
    const rr = tp / sl;
    if (rr < limits.minRR) {
      issues.push({ field: "tp", severity: "error", message: `Risk:Reward ${rr.toFixed(2)} onder ${limits.minRR} — TP verhogen of SL verkleinen.` });
    } else if (rr < 1.5) {
      issues.push({ field: "tp", severity: "warn", message: `R:R ${rr.toFixed(2)} — winrate moet > ${Math.round(100 / (1 + rr))}% zijn om break-even te zijn.` });
    }
  }

  // ── Risk % ─────────────────────────────────────────────────────────────
  const risk = num(settings.risk);
  if (risk !== undefined) {
    if (risk <= 0) issues.push({ field: "risk", severity: "error", message: "Risico per trade moet > 0%." });
    else if (risk > 5) issues.push({ field: "risk", severity: "error", message: `${risk}% per trade is roekeloos — max 2% is standaard.` });
    else if (risk > 2) issues.push({ field: "risk", severity: "warn", message: `${risk}% per trade — 10 verliezers op rij = ${(Math.pow(1 - risk/100, 10) * 100 - 100).toFixed(1)}% drawdown.` });
  }
  const rr = num(settings.rr);
  if (rr !== undefined && rr < limits.minRR) {
    issues.push({ field: "rr", severity: "error", message: `R:R ${rr} onder minimum ${limits.minRR} voor ${kind}.` });
  }

  // ── Grid ───────────────────────────────────────────────────────────────
  const gridStep = num(settings.gridStep);
  const gridLevels = num(settings.gridLevels);
  if (gridStep !== undefined) {
    if (gridStep <= 0) issues.push({ field: "gridStep", severity: "error", message: "Grid stap moet > 0%." });
    else if (kind === "forex" && gridStep > 1) issues.push({ field: "gridStep", severity: "warn", message: `Stap ${gridStep}% is groot voor forex (typisch 0.1–0.5%).` });
    else if (kind === "crypto" && gridStep < 0.3) issues.push({ field: "gridStep", severity: "warn", message: `Stap ${gridStep}% is klein voor crypto — snel getriggerd door noise.` });
  }
  if (gridStep && gridLevels) {
    const totalRange = gridStep * gridLevels;
    if (totalRange > 30) {
      issues.push({ field: "gridLevels", severity: "warn", message: `Grid bestrijkt ${totalRange.toFixed(1)}% — kapitaal wordt dun uitgesmeerd.` });
    }
    if (orderSize) {
      const capital = orderSize * gridLevels;
      if (capital > 10_000) {
        issues.push({ field: "gridLevels", severity: "warn", message: `Grid vraagt $${capital.toLocaleString()} totaal kapitaal.` });
      }
    }
  }

  // ── DCA safety-orders ──────────────────────────────────────────────────
  const baseOrder = num(settings.baseOrder);
  const safety = num(settings.safetyOrder);
  const maxSafety = num(settings.maxSafety);
  if (baseOrder && safety && safety > baseOrder * 3) {
    issues.push({ field: "safetyOrder", severity: "warn", message: `Safety order (${safety}) veel groter dan base (${baseOrder}) — martingale-risico.` });
  }
  if (baseOrder && safety && maxSafety) {
    const total = baseOrder + safety * maxSafety;
    if (total > 20_000) {
      issues.push({ field: "maxSafety", severity: "warn", message: `Max deployment $${total.toLocaleString()} — heb je die reserve?` });
    }
  }

  // ── Sessies ────────────────────────────────────────────────────────────
  const session = str(settings.session);
  if (session) {
    if (!limits.sessions.includes(session as never)) {
      issues.push({ field: "session", severity: "warn", message: `${sessionLabel(session)}-sessie is zwak voor ${kind}. Kies ${limits.sessions.map(sessionLabel).join(" of ")}.` });
    }
    if (kind === "crypto" && session !== "london_ny") {
      issues.push({ field: "session", severity: "info", message: "Crypto = 24/7 — sessiefilter beperkt kansen." });
    }
  }

  // ── EMA volgorde ───────────────────────────────────────────────────────
  const emaFast = num(settings.emaFast);
  const emaSlow = num(settings.emaSlow);
  if (emaFast && emaSlow && emaFast >= emaSlow) {
    issues.push({ field: "emaSlow", severity: "error", message: `EMA snel (${emaFast}) moet kleiner zijn dan EMA langzaam (${emaSlow}).` });
  }

  // ── Spread / slippage ──────────────────────────────────────────────────
  const spread = num(settings.minSpread);
  const slip = num(settings.maxSlippage);
  if (spread && slip && slip >= spread) {
    issues.push({ field: "maxSlippage", severity: "error", message: `Slippage (${slip}) ≥ min spread (${spread}) — arbitrage-marge = 0.` });
  }

  return issues;
}

export function issuesFor(field: string, issues: Issue[]): Issue[] {
  return issues.filter((i) => i.field === field);
}

export function highestSeverity(issues: Issue[]): Severity | null {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warn")) return "warn";
  if (issues.length) return "info";
  return null;
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function sessionLabel(s: string): string {
  return { asia: "Azië", london: "Londen", ny: "New York", london_ny: "Londen+NY" }[s] ?? s;
}
