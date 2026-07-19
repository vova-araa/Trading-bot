// Map chart symbols → relevante economische valuta's voor nieuws-overlay.
import type { NewsItem } from "./news";

export function symbolCurrencies(symbolId: string): string[] {
  const id = symbolId.toUpperCase();
  // Forex pairs: neem beide legs
  if (/^[A-Z]{6}$/.test(id) && !id.startsWith("BTC") && !id.startsWith("ETH")) {
    return [id.slice(0, 3), id.slice(3, 6)];
  }
  // Crypto & metalen quoteren tegen USD → USD-events kunnen ze bewegen
  if (id.endsWith("USD") || id.endsWith("PERP")) return ["USD"];
  // Amerikaanse indices / futures
  if (["US30", "NAS100", "SPX500", "ES", "NQ", "CL", "GC"].includes(id)) return ["USD"];
  return ["USD"];
}

export type EventVerdict = "pending" | "beat" | "miss" | "inline";
export function verdictFor(n: NewsItem): EventVerdict {
  if (n.actual === undefined || !n.forecast) return "pending";
  const a = parseFloat(n.actual);
  const f = parseFloat(n.forecast);
  if (Number.isNaN(a) || Number.isNaN(f)) return "inline";
  const diff = a - f;
  const tol = Math.max(0.05, Math.abs(f) * 0.02);
  if (Math.abs(diff) <= tol) return "inline";
  return diff > 0 ? "beat" : "miss";
}
