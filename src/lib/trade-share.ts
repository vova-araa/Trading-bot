// Deel-resultaat van een afgesloten trade: bereken pnl% + absolute winst/verlies,
// bouw een nette tekst en share via Web Share API of clipboard.

export type TradeSide = "long" | "short";

export type TradeResult = {
  symbol: string;
  side: TradeSide;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  size?: number;        // notional in account currency (optional)
  leverage?: number;    // for leveraged pnl%
  reason?: string;
  outcome: "tp" | "sl" | "manual";
  pnlPct: number;       // % on price move (already leveraged if leverage given)
  pnlAbs: number;       // absolute currency, only if size given
  rr: number;           // realized R multiple
};

export function computeResult(input: {
  symbol: string;
  side: TradeSide;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  size?: number;
  leverage?: number;
  reason?: string;
}): TradeResult {
  const { entry, exit, stop, target, side } = input;
  const dir = side === "long" ? 1 : -1;
  const move = ((exit - entry) / entry) * dir;
  const lev = Math.max(1, input.leverage ?? 1);
  const pnlPct = move * 100 * lev;
  const pnlAbs = input.size ? input.size * move * lev : 0;
  const risk = Math.abs(entry - stop);
  const gain = (exit - entry) * dir;
  const rr = risk > 0 ? gain / risk : 0;
  const nearTp = Math.abs(exit - target) / Math.max(1e-9, Math.abs(target - entry)) < 0.05;
  const nearSl = Math.abs(exit - stop) / Math.max(1e-9, Math.abs(entry - stop)) < 0.05;
  const outcome: TradeResult["outcome"] = nearTp ? "tp" : nearSl ? "sl" : "manual";
  return { ...input, pnlPct, pnlAbs, rr, outcome };
}

export function shareText(r: TradeResult): string {
  const win = r.pnlPct >= 0;
  const emoji = win ? "🟢" : "🔴";
  const sign = win ? "+" : "";
  const arrow = r.side === "long" ? "▲ LONG" : "▼ SHORT";
  const lines = [
    `${emoji} ${arrow} ${r.symbol}`,
    `${sign}${r.pnlPct.toFixed(2)}%  ·  ${r.rr >= 0 ? "+" : ""}${r.rr.toFixed(2)}R`,
    r.pnlAbs ? `${sign}$${r.pnlAbs.toFixed(2)}` : "",
    `Entry ${r.entry} → Exit ${r.exit}`,
    r.outcome === "tp" ? "🎯 Take-profit geraakt" : r.outcome === "sl" ? "🛑 Stop-loss geraakt" : "✋ Handmatig gesloten",
    "",
    "via ARA TRADES",
  ].filter(Boolean);
  return lines.join("\n");
}

export async function shareResult(r: TradeResult, url?: string): Promise<"shared" | "copied" | "failed"> {
  const text = shareText(r);
  const title = `${r.pnlPct >= 0 ? "Winst" : "Verlies"} ${r.symbol} ${r.pnlPct >= 0 ? "+" : ""}${r.pnlPct.toFixed(2)}%`;
  try {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      await (navigator as Navigator).share({ title, text, url });
      return "shared";
    }
  } catch { /* fall through to clipboard */ }
  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return "copied";
  } catch {
    return "failed";
  }
}
