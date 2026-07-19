// Bot preview simulator — bereken entry/SL/TP/risico op basis van template + waarden
// vóór installatie. Werkt per template-kind (scalper, grid, dca, smc, trend, arb).

import { currentPrice, formatPrice, SYMBOLS } from "@/lib/market-data";
import type { BotTemplate } from "@/lib/bot-marketplace";

export type SimSide = "long" | "short" | "both";

export type SimResult = {
  symbol: string;
  side: SimSide;
  entry: number;
  entryStr: string;
  sl: number | null;
  slStr: string | null;
  tp: number | null;
  tpStr: string | null;
  riskUsd: number;      // verlies bij SL-hit
  rewardUsd: number;    // winst bij TP-hit
  rr: number;           // reward / risk
  exposureUsd: number;  // totaal kapitaal in de markt worst-case
  drawdownPct: number;  // % van $10k account bij max verlies
  notes: string[];      // uitleg / waarschuwingen
  breakdown: { label: string; value: string }[]; // extra regels per bot-kind
};

const ACCOUNT_SIZE = 10_000;

function kindOf(sym: string) {
  return SYMBOLS.find((s) => s.id === sym)?.kind ?? "forex";
}

// $ per pip per 1.0 lot (100k units voor forex). Sterk vereenvoudigd.
function pipValuePerLot(sym: string): number {
  const k = kindOf(sym);
  if (k === "forex") return sym.endsWith("JPY") ? 6.5 : 10;
  if (k === "metal") return 10;      // XAUUSD 1.0 lot ~ $10/pip (0.1 = 1 pip)
  return 10;
}
function pipSize(sym: string): number {
  const k = kindOf(sym);
  if (k === "forex") return sym.endsWith("JPY") ? 0.01 : 0.0001;
  if (k === "metal") return 0.1;
  return 0.01;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export function defaultValues(tpl: BotTemplate): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const p of tpl.params) out[p.key] = p.default;
  return out;
}

export function simulate(
  tpl: BotTemplate,
  values: Record<string, number | string | boolean>,
  symbol: string,
): SimResult {
  const entry = currentPrice(symbol) || 1;
  const k = kindOf(symbol);
  const notes: string[] = [];
  const breakdown: { label: string; value: string }[] = [];

  let side: SimSide = "long";
  let sl: number | null = null;
  let tp: number | null = null;
  let riskUsd = 0;
  let rewardUsd = 0;
  let exposureUsd = 0;

  switch (tpl.kind) {
    case "scalper": {
      const lot = num(values.lot);
      const slPips = num(values.sl);
      const tpPips = num(values.tp);
      const maxT = num(values.maxTrades, 1);
      const pv = pipValuePerLot(symbol);
      const ps = pipSize(symbol);
      sl = entry - slPips * ps;
      tp = entry + tpPips * ps;
      riskUsd = lot * pv * slPips;
      rewardUsd = lot * pv * tpPips;
      exposureUsd = lot * 100_000 * (k === "forex" ? entry : 1) * maxT * 0.01; // margin schatting 1%
      breakdown.push(
        { label: "Lot × pip-waarde", value: `${lot} × $${pv.toFixed(1)}` },
        { label: "SL / TP", value: `${slPips} / ${tpPips} pips` },
        { label: "Max gelijktijdige trades", value: `${maxT}` },
      );
      if (values.trailing) notes.push("Trailing stop actief — winst kan hoger uitvallen dan TP.");
      break;
    }
    case "smc": {
      const risk = num(values.risk); // %
      const rr = num(values.rr, 2);
      riskUsd = (ACCOUNT_SIZE * risk) / 100;
      rewardUsd = riskUsd * rr;
      // SMC gebruikt ATR-achtige stop; toon een 0.5% move als indicatieve SL
      const slPct = 0.5;
      sl = entry * (1 - slPct / 100);
      tp = entry * (1 + (slPct * rr) / 100);
      exposureUsd = riskUsd / (slPct / 100);
      breakdown.push(
        { label: "Risico per trade", value: `${risk}% van $${ACCOUNT_SIZE.toLocaleString()}` },
        { label: "R:R", value: `1 : ${rr}` },
        { label: "Sessie", value: String(values.session ?? "-") },
      );
      if (values.confluence) notes.push("Confluence-filter aan — minder maar sterkere setups.");
      break;
    }
    case "trend": {
      const lev = num(values.leverage, 1);
      const emaF = num(values.emaFast, 20);
      const emaS = num(values.emaSlow, 50);
      const stake = 500; // aanname per positie
      exposureUsd = stake * lev;
      // dynamische SL ~ 3% × leverage
      const slPct = 3;
      const tpPct = 6;
      sl = entry * (1 - slPct / 100);
      tp = entry * (1 + tpPct / 100);
      riskUsd = exposureUsd * (slPct / 100);
      rewardUsd = exposureUsd * (tpPct / 100);
      breakdown.push(
        { label: "EMA cross", value: `${emaF} / ${emaS}` },
        { label: "Positie × hefboom", value: `$${stake} × ${lev}x = $${exposureUsd.toFixed(0)}` },
        { label: "RSI cap", value: `${values.rsiMax}` },
      );
      if (emaF >= emaS) notes.push("⚠ EMA snel ≥ langzaam — geen geldige crossover.");
      break;
    }
    case "grid": {
      const step = num(values.gridStep); // %
      const levels = num(values.gridLevels);
      const size = num(values.orderSize);
      side = (values.direction as SimSide) ?? "both";
      exposureUsd = size * levels * (side === "both" ? 2 : 1);
      // Worst case: prijs beweegt tegen alle levels
      const worstPct = step * levels;
      riskUsd = exposureUsd * (worstPct / 100) * 0.5;
      rewardUsd = size * (step / 100) * (levels * (levels + 1)) / 2; // som van winsten
      sl = entry * (1 - worstPct / 100);
      tp = entry * (1 + (step * 2) / 100);
      breakdown.push(
        { label: "Grid", value: `${levels} levels × ${step}%` },
        { label: "Order grootte", value: `$${size}` },
        { label: "Richting", value: side === "both" ? "Long + Short" : side === "long" ? "Long" : "Short" },
        { label: "Worst-case afstand", value: `${worstPct.toFixed(1)}%` },
      );
      if (worstPct > 20) notes.push("⚠ Bereik >20% — bij trending markt margin call mogelijk.");
      break;
    }
    case "dca": {
      const base = num(values.baseOrder);
      const safety = num(values.safetyOrder);
      const maxS = num(values.maxSafety);
      const dev = num(values.deviation);
      const tpPct = num(values.tp);
      exposureUsd = base + safety * maxS;
      const worstPct = dev * maxS;
      sl = entry * (1 - worstPct / 100);
      tp = entry * (1 + tpPct / 100);
      riskUsd = exposureUsd * (worstPct / 100);
      rewardUsd = exposureUsd * (tpPct / 100) * 0.6; // avg entry beter dan start
      breakdown.push(
        { label: "Basis + Safety", value: `$${base} + ${maxS} × $${safety}` },
        { label: "Deviation", value: `${dev}% per stap` },
        { label: "TP van avg entry", value: `${tpPct}%` },
        { label: "Max afstand", value: `${worstPct.toFixed(1)}% onder entry` },
      );
      if (safety > base * 2) notes.push("⚠ Safety >> base = martingale — snelle drawdown mogelijk.");
      break;
    }
    case "arbitrage": {
      const minSp = num(values.minSpread);
      const maxSlip = num(values.maxSlippage);
      const size = num(values.orderSize);
      const pv = pipValuePerLot(symbol);
      sl = null; tp = null; // arb heeft geen klassieke SL/TP
      rewardUsd = size * pv * (minSp - maxSlip);
      riskUsd = size * pv * maxSlip;
      exposureUsd = size * 100_000 * 0.01;
      breakdown.push(
        { label: "Min spread", value: `${minSp} pips` },
        { label: "Max slippage", value: `${maxSlip} pips` },
        { label: "Netto per trade", value: `~$${rewardUsd.toFixed(2)}` },
      );
      if (maxSlip >= minSp) notes.push("⚠ Slippage ≥ spread — kans op verlies per trade.");
      break;
    }
  }

  const rr = riskUsd > 0 ? rewardUsd / riskUsd : 0;
  const drawdownPct = (riskUsd / ACCOUNT_SIZE) * 100;

  if (drawdownPct > 5) notes.push(`⚠ ${drawdownPct.toFixed(1)}% drawdown-risico op $10k account — hoog.`);
  if (rr > 0 && rr < 1) notes.push(`⚠ R:R ${rr.toFixed(2)} < 1 — winrate moet >50% zijn om winst te maken.`);
  if (kindOf(symbol) === "crypto" && (tpl.kind === "grid" || tpl.kind === "dca")) {
    notes.push("Crypto is volatiel — overweeg kleinere levels of hogere deviation.");
  }

  return {
    symbol,
    side,
    entry,
    entryStr: formatPrice(symbol, entry),
    sl,
    slStr: sl != null ? formatPrice(symbol, sl) : null,
    tp,
    tpStr: tp != null ? formatPrice(symbol, tp) : null,
    riskUsd,
    rewardUsd,
    rr,
    exposureUsd,
    drawdownPct,
    notes,
    breakdown,
  };
}
