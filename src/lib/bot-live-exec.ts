// Live bot execution — the bridge between the flow radar's real market signals
// and REAL MT5 orders. A bot only trades real money when ALL of these hold:
//   • the bot is enabled, deployed AND has `live` switched on,
//   • MT5 is connected and the vault is unlocked (so we can read the token),
//   • the flow radar fires a *confirmed* surge (volume/vol/breakout) on the
//     bot's symbol, in a direction that matches the bot's bias.
// It never fires on the noisy per-tick simulator — only on genuine surges — and
// a per-bot cooldown stops it from stacking orders on one move.

import { onFlow, type FlowEvent } from "./flow-radar";
import { getBots, logBotLive, type Bot } from "./bots";
import { currentPrice } from "./market-data";
import { mt5Configured, mt5PlaceOrder } from "./mt5";
import { isUnlocked } from "./broker-vault";
import { liveTradingBlocked } from "./kill-switch";

const COOLDOWN_MS = 5 * 60_000; // one live order per bot per 5 min
const lastLiveAt = new Map<string, number>();

/** Which side, if any, this bot should take on a surge in direction `dir`. */
function desiredSide(bot: Bot, dir: FlowEvent["dir"]): "long" | "short" | null {
  const bias = bot.settings?.bias;
  if (bias === "long") return dir === "up" ? "long" : null;
  if (bias === "short") return dir === "down" ? "short" : null;
  // Unbiased (signal/trend/smc) bots follow the surge direction.
  return dir === "up" ? "long" : "short";
}

async function execute(bot: Bot, e: FlowEvent) {
  const side = desiredSide(bot, e.dir);
  if (!side) return; // surge is against the bot's bias — skip

  const now = Date.now();
  const last = lastLiveAt.get(bot.id) ?? 0;
  if (now - last < COOLDOWN_MS) return;
  lastLiveAt.set(bot.id, now);

  const price = currentPrice(bot.symbol) || e.price;
  const lot = Math.max(0.01, Number(bot.settings?.lot ?? 0.1) || 0.1);
  const slPct = Number(bot.settings?.slPct ?? 0) || 0;
  const tpPct = Number(bot.settings?.tpPct ?? 0) || 0;
  const dir = side === "long" ? 1 : -1;
  const stopLoss = slPct > 0 ? price * (1 - (slPct / 100) * dir) : undefined;
  const takeProfit = tpPct > 0 ? price * (1 + (tpPct / 100) * dir) : undefined;

  const res = await mt5PlaceOrder({
    symbol: bot.symbol,
    side,
    volume: lot,
    stopLoss,
    takeProfit,
    comment: `ARA ${bot.id}`,
  });

  if (res.ok) {
    logBotLive(
      bot.id,
      "info",
      `⚡ ECHTE ${side === "long" ? "koop" : "verkoop"} ${lot.toFixed(2)} lot ${bot.symbol} @ ~${price.toFixed(4)} (${e.kind}-signaal)`,
      true,
    );
  } else {
    // Don't burn the cooldown on a hard failure — let it retry on the next surge.
    lastLiveAt.set(bot.id, 0);
    logBotLive(bot.id, "error", `MT5 order geweigerd: ${res.error ?? "onbekende fout"}`);
  }
}

let started = false;
export function startBotLiveExec() {
  if (started || typeof window === "undefined") return;
  started = true;

  onFlow((e) => {
    // Kill-switch and connection gates up front — never read a locked vault,
    // never fire while the daily-loss stop is active.
    if (liveTradingBlocked()) return;
    if (!mt5Configured() || !isUnlocked()) return;
    const candidates = getBots().filter(
      (b) => b.live && b.enabled && b.deployed && (b.symbol === e.symbol || b.symbol === "ALL"),
    );
    for (const bot of candidates) void execute(bot, e);
  });
}
