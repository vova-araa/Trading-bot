// User-configurable risk & safety settings (per device, localStorage).
// Two features live off this: the kill-switch (daily loss limit) and the
// risk-based position-size calculator. Everything here is plain config — the
// engines in kill-switch.ts / position-sizing.ts read these values.

export type RiskSettings = {
  /** Master switch for the daily-loss kill-switch. */
  killSwitchEnabled: boolean;
  /** Trip the kill-switch when the day's drawdown reaches this % of start-equity. */
  dailyLossLimitPct: number;
  /** When tripped, also close all open MT5 positions (not just stop new orders). */
  closeOnKill: boolean;
  /** % of account balance to risk per trade, used by the size calculator. */
  riskPerTradePct: number;
  /** Hard cap on any calculated lot size (safety ceiling). */
  maxLot: number;
  /** Balance used for sizing when MT5 isn't connected to read a real one. */
  manualBalance: number;
};

export const DEFAULT_RISK: RiskSettings = {
  killSwitchEnabled: false,
  dailyLossLimitPct: 3,
  closeOnKill: true,
  riskPerTradePct: 1,
  maxLot: 5,
  manualBalance: 10_000,
};

const KEY = "ara-risk-settings-v1";
export const RISK_EVENT = "ara-risk-change";

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Read settings, merged over defaults and sanitised so callers never see junk. */
export function getRiskSettings(): RiskSettings {
  if (typeof window === "undefined") return { ...DEFAULT_RISK };
  let raw: Partial<RiskSettings> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<RiskSettings>;
  } catch {
    raw = {};
  }
  return {
    killSwitchEnabled: !!(raw.killSwitchEnabled ?? DEFAULT_RISK.killSwitchEnabled),
    dailyLossLimitPct: clampNum(raw.dailyLossLimitPct, 0.1, 90, DEFAULT_RISK.dailyLossLimitPct),
    closeOnKill: raw.closeOnKill ?? DEFAULT_RISK.closeOnKill,
    riskPerTradePct: clampNum(raw.riskPerTradePct, 0.05, 20, DEFAULT_RISK.riskPerTradePct),
    maxLot: clampNum(raw.maxLot, 0.01, 100, DEFAULT_RISK.maxLot),
    manualBalance: clampNum(raw.manualBalance, 1, 100_000_000, DEFAULT_RISK.manualBalance),
  };
}

export function setRiskSettings(patch: Partial<RiskSettings>): RiskSettings {
  const next = { ...getRiskSettings(), ...patch };
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(RISK_EVENT));
  }
  return next;
}
