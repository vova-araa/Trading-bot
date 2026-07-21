// Daily-loss kill-switch. Watches your real MT5 equity and, when the day's
// drawdown reaches your configured limit, it (1) switches every live bot back
// to paper, (2) optionally closes all open MT5 positions, and (3) blocks any
// new app-initiated real order until you reset it (next day, or manually).
//
// Scope: this governs execution the APP starts — live bots and the order
// ticket's "⚡ Echt · MT5" button. It runs in the browser, so it needs MT5
// connected + the vault unlocked to read equity. The standalone TradingView
// webhook (server-side) is governed separately by whether you keep &exec=1.

import { getRiskSettings } from "./risk-settings";
import { mt5CloseAll, mt5Configured, mt5Positions } from "./mt5";
import { isUnlocked } from "./broker-vault";
import { disableAllLive } from "./bots";
import { pushSignal } from "./notifications";

export type KillState = {
  tripped: boolean;
  trippedAt?: number;
  reason?: string;
  dayKey?: string; // local date the baseline belongs to
  dayStartEquity?: number; // equity at the first read of the day
  lastEquity?: number;
  lastEquityAt?: number;
  drawdownPct?: number; // latest measured day drawdown (negative = loss)
};

const KEY = "ara-kill-state-v1";
export const KILL_EVENT = "ara-kill-change";
const POLL_MS = 15_000;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

let state: KillState = load();

function load(): KillState {
  if (typeof window === "undefined") return { tripped: false };
  try {
    return JSON.parse(localStorage.getItem(KEY) || "") as KillState;
  } catch {
    return { tripped: false };
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota — ignore */
  }
  window.dispatchEvent(new Event(KILL_EVENT));
}

export function getKillState(): KillState {
  return state;
}

/** True when app-initiated real trading is currently blocked. */
export function liveTradingBlocked(): boolean {
  return state.tripped === true;
}

function equityOf(account: unknown): number | null {
  if (!account || typeof account !== "object") return null;
  const a = account as { equity?: unknown; balance?: unknown };
  const eq = Number(a.equity);
  if (Number.isFinite(eq) && eq > 0) return eq;
  const bal = Number(a.balance);
  return Number.isFinite(bal) && bal > 0 ? bal : null;
}

async function trip(reason: string) {
  if (state.tripped) return;
  state = { ...state, tripped: true, trippedAt: Date.now(), reason };
  persist();

  const disabled = disableAllLive(`🛑 Kill-switch: ${reason}`);
  let closeNote = "";
  if (getRiskSettings().closeOnKill) {
    const res = await mt5CloseAll();
    closeNote = res.ok
      ? ` · ${res.closed} positie(s) gesloten`
      : ` · sluiten mislukt (${res.error ?? "?"})`;
  }
  pushSignal(
    "🛑 Kill-switch geactiveerd",
    `${reason}. ${disabled} live bot(s) uit${closeNote}.`,
    "kill-switch",
    { kind: "other", priority: "high" },
  );
}

/** Manually trip the kill-switch (panic button). */
export async function tripManually() {
  await trip("handmatig gestopt");
}

/** Reset after a trip — starts a fresh baseline from the latest equity. */
export function resetKillSwitch() {
  state = {
    tripped: false,
    dayKey: todayKey(),
    dayStartEquity: state.lastEquity,
    lastEquity: state.lastEquity,
    lastEquityAt: Date.now(),
    drawdownPct: 0,
  };
  persist();
}

async function tick() {
  const s = getRiskSettings();
  if (!s.killSwitchEnabled) return;
  if (!mt5Configured() || !isUnlocked()) return;

  const res = await mt5Positions();
  if (!res.ok) return;
  const equity = equityOf(res.account);
  if (equity == null) return;

  const key = todayKey();
  // New day → fresh baseline and clear any previous trip.
  if (state.dayKey !== key) {
    state = {
      tripped: false,
      dayKey: key,
      dayStartEquity: equity,
      lastEquity: equity,
      lastEquityAt: Date.now(),
      drawdownPct: 0,
    };
    persist();
    return;
  }

  if (!state.dayStartEquity || state.dayStartEquity <= 0) {
    state = { ...state, dayStartEquity: equity };
  }
  const start = state.dayStartEquity ?? equity;
  const ddPct = ((equity - start) / start) * 100;
  state = { ...state, lastEquity: equity, lastEquityAt: Date.now(), drawdownPct: ddPct };
  persist();

  if (!state.tripped && ddPct <= -s.dailyLossLimitPct) {
    await trip(`dagverlies ${ddPct.toFixed(2)}% (limiet ${s.dailyLossLimitPct}%)`);
  }
}

let started = false;
export function startKillSwitch() {
  if (started || typeof window === "undefined") return;
  started = true;
  void tick();
  setInterval(() => void tick(), POLL_MS);
}
