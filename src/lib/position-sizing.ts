// Risk-based position sizing. Turns "risk X% of my balance with this stop-loss"
// into a concrete MT5 lot size. Sizing depends on the instrument's contract
// size (how many $ one full lot gains per 1.0 of price move), so we keep a
// table of STANDARD specs. Brokers vary — especially on index/CFD multipliers —
// so the UI always shows the resulting $-risk for a sanity check, and flags
// low-confidence instruments.

// $ gained by 1.0 lot for a 1.0 move in PRICE, on a USD account, for USD-quoted
// instruments. (EURUSD: 100k units × $1 = $100,000 per 1.0; XAUUSD: 100oz ×
// $1 = $100 per $1; index CFDs are ~$1/point/lot but very broker-specific.)
const VALUE_PER_PRICE_PER_LOT: Record<string, number> = {
  EURUSD: 100_000,
  GBPUSD: 100_000,
  AUDUSD: 100_000,
  NZDUSD: 100_000,
  XAUUSD: 100,
  XAGUSD: 5_000,
  US30: 1,
  NAS100: 1,
  SPX500: 1,
  CL: 1_000,
  GC: 100,
  ES: 50,
  NQ: 20,
};

// Instruments where the standard multiplier is broker-dependent → warn the user.
const LOW_CONFIDENCE = new Set(["US30", "NAS100", "SPX500", "CL", "ES", "NQ"]);

export type PriceValue = { value: number; confident: boolean; note?: string };

/** $ value of a 1.0 price move for 1.0 lot. `price` is used for quote≠USD pairs. */
export function valuePerPricePerLot(symbol: string, price: number): PriceValue {
  const s = symbol.toUpperCase();
  if (s in VALUE_PER_PRICE_PER_LOT) {
    return {
      value: VALUE_PER_PRICE_PER_LOT[s],
      confident: !LOW_CONFIDENCE.has(s),
      note: LOW_CONFIDENCE.has(s)
        ? "Index/CFD-multiplier verschilt per broker — check je contract."
        : undefined,
    };
  }
  // USD-base FX (USDJPY, USDCHF, USDCAD): 100k base units, quote ≠ USD →
  // value per 1.0 move ≈ 100000 / price USD.
  if (/^USD(JPY|CHF|CAD)$/.test(s) && price > 0) {
    return { value: 100_000 / price, confident: false, note: "Benaderd (quote-valuta ≠ USD)." };
  }
  // JPY-cross pairs (EURJPY, GBPJPY): quote is JPY; without a live USDJPY rate we
  // can only roughly approximate. Signal low confidence.
  if (/JPY$/.test(s) && price > 0) {
    return {
      value: 100_000 / price,
      confident: false,
      note: "Ruwe benadering voor JPY-cross — verifieer de lot.",
    };
  }
  return { value: 0, confident: false, note: "Onbekend instrument — voer de lot handmatig in." };
}

export type SizeResult = {
  lot: number; // rounded DOWN to 0.01
  riskUsd: number; // actual $ at risk at this lot (≤ target)
  targetUsd: number; // the intended risk (balance × risk%)
  confident: boolean;
  note?: string;
};

/** Compute a lot size for a target risk. Rounds DOWN so risk never overshoots. */
export function computeLot(opts: {
  symbol: string;
  balance: number;
  riskPct: number;
  entry: number;
  stopLoss: number;
  maxLot: number;
}): SizeResult | null {
  const stopDist = Math.abs(opts.entry - opts.stopLoss);
  if (!(stopDist > 0) || !(opts.balance > 0) || !(opts.riskPct > 0)) return null;

  const targetUsd = (opts.balance * opts.riskPct) / 100;
  const v = valuePerPricePerLot(opts.symbol, opts.entry);
  if (!(v.value > 0)) return null;

  const rawLot = targetUsd / (stopDist * v.value);
  const lot = Math.max(0.01, Math.min(opts.maxLot, Math.floor(rawLot * 100) / 100));
  const riskUsd = lot * stopDist * v.value;
  return { lot, riskUsd, targetUsd, confident: v.confident, note: v.note };
}
