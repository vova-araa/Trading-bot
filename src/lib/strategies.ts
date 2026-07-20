import type { Candle } from "./market-data";
import { ema, rsi, macd, bollinger, atr } from "./indicators";

export type FibLine = { label: string; price: number; color: string };
export type FibOverlay = {
  zoneTop: number; // 0.618 (higher price edge of the golden pocket)
  zoneBottom: number; // 0.786 (deeper edge)
  lines: FibLine[];
};

export type Setup = {
  id: string;
  symbol: string;
  strategy: string;
  side: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  rr: number;
  confidence: number; // 0-100
  reason: string;
  time: number;
  fib?: FibOverlay; // fib retracement to draw on the chart (OTE strategy)
};

// Golden-pocket palette (matches the shared TradingView setup).
const FIB_COLORS = {
  f618: "#f5c26b",
  f650: "#e8b84b",
  f705: "#5cc8ff",
  f786: "#22d18c",
  f886: "#ef5a5a",
} as const;

export type Strategy = {
  id: string;
  name: string;
  tagline: string;
  attribution: string;
  detect: (c: Candle[], symbol: string) => Setup | null;
};

const last = <T,>(a: T[]) => a[a.length - 1];

export const STRATEGIES: Strategy[] = [
  {
    id: "smc-ob",
    name: "SMC — Order Block Retest",
    tagline: "Smart Money Concepts: displacement + OB mitigation",
    attribution: "Inner Circle Trader / ICT school",
    detect(c, symbol) {
      if (c.length < 60) return null;
      const closes = c.map((x) => x.close);
      const e50 = ema(closes, 50);
      const a = atr(c, 14);
      const l = c.length - 1;
      const last3 = c.slice(-3);
      const displacement = last3[2].close - last3[0].open;
      const range = last3.reduce((s, k) => s + (k.high - k.low), 0);
      const atrVal = a[l] ?? 0;
      if (!atrVal) return null;
      if (Math.abs(displacement) < atrVal * 1.4) return null;
      const side: "long" | "short" = displacement > 0 ? "long" : "short";
      const trend = (e50[l] ?? closes[l]) < closes[l] ? "long" : "short";
      if (trend !== side) return null;
      const entry = c[l].close;
      const stop = side === "long" ? entry - atrVal * 1.2 : entry + atrVal * 1.2;
      const target = side === "long" ? entry + atrVal * 3 : entry - atrVal * 3;
      return {
        id: `${symbol}-smc-${c[l].time}`,
        symbol, side, entry, stop, target,
        rr: 2.5, confidence: 78,
        reason: `Displacement ${Math.abs(displacement).toFixed(5)} vs ATR ${atrVal.toFixed(5)}, in-trend`,
        time: c[l].time,
        strategy: "SMC Order Block",
      };
    },
  },
  {
    id: "faber-trend",
    name: "Faber — 200MA Trend Filter",
    tagline: "Only long above the 200SMA, only short below",
    attribution: "Meb Faber, Global Tactical Asset Allocation",
    detect(c, symbol) {
      if (c.length < 210) return null;
      const closes = c.map((x) => x.close);
      const e200 = ema(closes, 200);
      const l = c.length - 1;
      const above = closes[l] > (e200[l] ?? 0);
      const cross = closes[l - 1] <= (e200[l - 1] ?? 0) && above;
      if (!cross) return null;
      const a = atr(c, 14)[l] ?? 0;
      return {
        id: `${symbol}-faber-${c[l].time}`,
        symbol, side: "long",
        entry: closes[l], stop: closes[l] - a * 2, target: closes[l] + a * 6,
        rr: 3, confidence: 72,
        reason: "Bullish 200-EMA reclaim confirmed",
        time: c[l].time,
        strategy: "Faber Trend",
      };
    },
  },
  {
    id: "vaale-momo",
    name: "Vaale — Momentum Breakout",
    tagline: "Range compression → MACD-driven breakout",
    attribution: "Vaale-style discretionary momentum",
    detect(c, symbol) {
      if (c.length < 60) return null;
      const closes = c.map((x) => x.close);
      const m = macd(closes);
      const bb = bollinger(closes, 20, 2);
      const l = c.length - 1;
      const bandwidth = ((bb.upper[l] as number) - (bb.lower[l] as number)) / (bb.mid[l] as number);
      const prevBW = ((bb.upper[l - 5] as number) - (bb.lower[l - 5] as number)) / (bb.mid[l - 5] as number);
      const squeeze = bandwidth < prevBW * 0.7;
      const histNow = m.hist[l] ?? 0;
      const histPrev = m.hist[l - 1] ?? 0;
      if (!squeeze) return null;
      if (histPrev <= 0 && histNow > 0) {
        const a = atr(c, 14)[l] ?? 0;
        return {
          id: `${symbol}-vaale-${c[l].time}`,
          symbol, side: "long", entry: closes[l],
          stop: closes[l] - a * 1.5, target: closes[l] + a * 4.5,
          rr: 3, confidence: 74,
          reason: "BB squeeze + MACD hist cross ↑",
          time: c[l].time, strategy: "Vaale Momentum",
        };
      }
      if (histPrev >= 0 && histNow < 0) {
        const a = atr(c, 14)[l] ?? 0;
        return {
          id: `${symbol}-vaale-${c[l].time}`,
          symbol, side: "short", entry: closes[l],
          stop: closes[l] + a * 1.5, target: closes[l] - a * 4.5,
          rr: 3, confidence: 74,
          reason: "BB squeeze + MACD hist cross ↓",
          time: c[l].time, strategy: "Vaale Momentum",
        };
      }
      return null;
    },
  },
  {
    id: "rsi-div",
    name: "RSI Divergence",
    tagline: "Classic bull/bear divergence on 14-RSI",
    attribution: "Wilder, New Concepts in Technical Trading",
    detect(c, symbol) {
      if (c.length < 30) return null;
      const closes = c.map((x) => x.close);
      const r = rsi(closes, 14);
      const l = c.length - 1;
      const p1 = l - 8, p2 = l - 2;
      if (p1 < 15) return null;
      const bullish = closes[p2] < closes[p1] && (r[p2] as number) > (r[p1] as number) && (r[p2] as number) < 40;
      const bearish = closes[p2] > closes[p1] && (r[p2] as number) < (r[p1] as number) && (r[p2] as number) > 60;
      const a = atr(c, 14)[l] ?? 0;
      if (bullish) return {
        id: `${symbol}-rsi-${c[l].time}`, symbol, side: "long",
        entry: closes[l], stop: closes[l] - a * 1.2, target: closes[l] + a * 3.6,
        rr: 3, confidence: 66, reason: "Bullish RSI divergence", time: c[l].time, strategy: "RSI Divergence",
      };
      if (bearish) return {
        id: `${symbol}-rsi-${c[l].time}`, symbol, side: "short",
        entry: closes[l], stop: closes[l] + a * 1.2, target: closes[l] - a * 3.6,
        rr: 3, confidence: 66, reason: "Bearish RSI divergence", time: c[l].time, strategy: "RSI Divergence",
      };
      return null;
    },
  },
  {
    id: "liquidity-sweep",
    name: "Liquidity Sweep Reversal",
    tagline: "Stop-hunt of 20-bar high/low then reject",
    attribution: "ICT / Wyckoff spring & upthrust",
    detect(c, symbol) {
      if (c.length < 25) return null;
      const l = c.length - 1;
      const window = c.slice(l - 21, l - 1);
      const hi = Math.max(...window.map((x) => x.high));
      const lo = Math.min(...window.map((x) => x.low));
      const k = c[l];
      const a = atr(c, 14)[l] ?? 0;
      if (k.high > hi && k.close < hi) {
        return { id: `${symbol}-sweep-${k.time}`, symbol, side: "short",
          entry: k.close, stop: k.high + a * 0.2, target: k.close - a * 3,
          rr: 2.6, confidence: 70, reason: "Swept 20-bar high, closed back below",
          time: k.time, strategy: "Liquidity Sweep" };
      }
      if (k.low < lo && k.close > lo) {
        return { id: `${symbol}-sweep-${k.time}`, symbol, side: "long",
          entry: k.close, stop: k.low - a * 0.2, target: k.close + a * 3,
          rr: 2.6, confidence: 70, reason: "Swept 20-bar low, closed back above",
          time: k.time, strategy: "Liquidity Sweep" };
      }
      return null;
    },
  },
  {
    id: "ote-golden",
    name: "OTE — Golden Pocket",
    tagline: "Impuls + retrace in de 0.618–0.786 fib-zone, entry op 0.705",
    attribution: "Inner Circle Trader — Optimal Trade Entry (Fibonacci golden pocket)",
    detect(c, symbol) {
      if (c.length < 40) return null;
      const l = c.length - 1;
      const atrVal = atr(c, 14)[l] ?? 0;
      if (!atrVal) return null;

      // Most recent swing high/low via k-bar fractals over a bounded lookback.
      const k = 2;
      const lb = Math.min(60, c.length - 2);
      const w = c.slice(c.length - lb);
      let hi: { i: number; p: number } | null = null;
      let lo: { i: number; p: number } | null = null;
      for (let i = k; i < w.length - k; i++) {
        let isHi = true;
        let isLo = true;
        for (let j = i - k; j <= i + k; j++) {
          if (j === i) continue;
          if (w[j].high >= w[i].high) isHi = false;
          if (w[j].low <= w[i].low) isLo = false;
        }
        if (isHi) hi = { i, p: w[i].high };
        if (isLo) lo = { i, p: w[i].low };
      }
      if (!hi || !lo) return null;

      const price = c[l].close;
      const range = Math.abs(hi.p - lo.p);
      if (range < atrVal * 2.5) return null; // require a real impulse leg

      // Bullish OTE: swing low → swing high (up impulse), price retraced down
      // into the golden pocket. Fib measured from the high (0.0) to the low (1.0).
      if (lo.i < hi.i) {
        const H = hi.p;
        const r = H - lo.p;
        const zTop = H - 0.618 * r; // shallow edge of the zone
        const zBot = H - 0.786 * r; // deep edge of the zone
        const eq = H - 0.705 * r; // equilibrium entry (0.705)
        const f886 = H - 0.886 * r; // invalidation level
        if (price <= zTop && price >= zBot) {
          const entry = eq;
          const stop = f886 - atrVal * 0.2;
          const target = H;
          const rr = (target - entry) / (entry - stop);
          if (!(rr >= 1.8)) return null;
          return {
            id: `${symbol}-ote-${c[l].time}`,
            symbol,
            side: "long",
            entry,
            stop,
            target,
            rr: Number(rr.toFixed(1)),
            confidence: 77,
            reason: "Retrace in golden pocket (0.618–0.786) — long richting swing high",
            time: c[l].time,
            strategy: "OTE Golden Pocket",
            fib: {
              zoneTop: zTop,
              zoneBottom: zBot,
              lines: [
                { label: "0.618", price: zTop, color: FIB_COLORS.f618 },
                { label: "0.65", price: H - 0.65 * r, color: FIB_COLORS.f650 },
                { label: "0.705", price: eq, color: FIB_COLORS.f705 },
                { label: "0.786", price: zBot, color: FIB_COLORS.f786 },
                { label: "0.886", price: f886, color: FIB_COLORS.f886 },
              ],
            },
          };
        }
      }

      // Bearish OTE: swing high → swing low (down impulse), price retraced up
      // into the golden pocket. Fib measured from the low (0.0) to the high (1.0).
      if (hi.i < lo.i) {
        const L = lo.p;
        const r = hi.p - L;
        const zBot = L + 0.618 * r;
        const zTop = L + 0.786 * r;
        const eq = L + 0.705 * r;
        const f886 = L + 0.886 * r;
        if (price >= zBot && price <= zTop) {
          const entry = eq;
          const stop = f886 + atrVal * 0.2;
          const target = L;
          const rr = (entry - target) / (stop - entry);
          if (!(rr >= 1.8)) return null;
          return {
            id: `${symbol}-ote-${c[l].time}`,
            symbol,
            side: "short",
            entry,
            stop,
            target,
            rr: Number(rr.toFixed(1)),
            confidence: 77,
            reason: "Retrace in golden pocket (0.618–0.786) — short richting swing low",
            time: c[l].time,
            strategy: "OTE Golden Pocket",
            fib: {
              zoneTop: zTop,
              zoneBottom: zBot,
              lines: [
                { label: "0.618", price: zBot, color: FIB_COLORS.f618 },
                { label: "0.65", price: L + 0.65 * r, color: FIB_COLORS.f650 },
                { label: "0.705", price: eq, color: FIB_COLORS.f705 },
                { label: "0.786", price: zTop, color: FIB_COLORS.f786 },
                { label: "0.886", price: f886, color: FIB_COLORS.f886 },
              ],
            },
          };
        }
      }

      return null;
    },
  },
];
