import type { Candle } from "./market-data";

export function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (prev === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = Math.max(diff, 0), l = Math.max(-diff, 0);
    if (i <= period) {
      gain += g; loss += l;
      if (i === period) {
        gain /= period; loss /= period;
        out.push(100 - 100 / (1 + gain / (loss || 1e-9)));
      } else out.push(null);
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out.push(100 - 100 / (1 + gain / (loss || 1e-9)));
    }
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalP = 9) {
  const ef = ema(values, fast), es = ema(values, slow);
  const line = values.map((_, i) => (ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null));
  const cleanLine = line.map((v) => v ?? 0);
  const sig = ema(cleanLine, signalP);
  const hist = line.map((v, i) => (v != null && sig[i] != null ? v - (sig[i] as number) : null));
  return { line, signal: sig, hist };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { upper.push(null); lower.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += (values[j] - (mid[i] as number)) ** 2;
    const sd = Math.sqrt(sum / period);
    upper.push((mid[i] as number) + mult * sd);
    lower.push((mid[i] as number) - mult * sd);
  }
  return { mid, upper, lower };
}

export function atr(c: Candle[], period = 14): (number | null)[] {
  const tr: number[] = [];
  for (let i = 0; i < c.length; i++) {
    if (i === 0) { tr.push(c[i].high - c[i].low); continue; }
    tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
  }
  return ema(tr, period);
}

/** Volume-by-price profile (POC + value area) */
export function volumeProfile(c: Candle[], bins = 24) {
  if (!c.length) return { bins: [], poc: 0, vah: 0, val: 0 };
  const min = Math.min(...c.map((x) => x.low));
  const max = Math.max(...c.map((x) => x.high));
  const step = (max - min) / bins || 1;
  const arr = Array.from({ length: bins }, (_, i) => ({ price: min + step * (i + 0.5), volume: 0 }));
  c.forEach((k) => {
    const mid = (k.high + k.low) / 2;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((mid - min) / step)));
    arr[idx].volume += k.volume;
  });
  const total = arr.reduce((s, b) => s + b.volume, 0);
  let pocIdx = 0;
  arr.forEach((b, i) => { if (b.volume > arr[pocIdx].volume) pocIdx = i; });
  // Value area: expand from POC until 70% of volume
  let lo = pocIdx, hi = pocIdx, acc = arr[pocIdx].volume;
  while (acc / total < 0.7 && (lo > 0 || hi < bins - 1)) {
    const l = lo > 0 ? arr[lo - 1].volume : -1;
    const h = hi < bins - 1 ? arr[hi + 1].volume : -1;
    if (h >= l) { hi++; acc += arr[hi].volume; } else { lo--; acc += arr[lo].volume; }
  }
  return { bins: arr, poc: arr[pocIdx].price, vah: arr[hi].price, val: arr[lo].price };
}
