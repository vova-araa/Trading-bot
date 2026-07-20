import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/market-data";
import {
  startSmartMoney,
  onWhale,
  onLiquidation,
  recentWhales,
  recentLiquidations,
  whaleFlow,
  aggregateBias,
  WHALE_MIN_USD,
  type WhaleTrade,
  type Liquidation,
} from "@/lib/smart-money";
import { PredictionMarkets } from "@/components/PredictionMarkets";

const CRYPTO = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "AVAXUSD", "LINKUSD"];

function usd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}u`;
}

// "Smart money" edge surface: real whale prints + liquidations from Binance,
// aggregate bias, and prediction-market odds (the outcome before the news).
export function EdgeTab() {
  const [, force] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    startSmartMoney();
    let gotData = false;
    const bump = () => {
      gotData = true;
      force((n) => n + 1);
    };
    const offW = onWhale(bump);
    const offL = onLiquidation(bump);
    const iv = setInterval(() => {
      setConnected(gotData);
      force((n) => n + 1);
    }, 1000);
    return () => {
      offW();
      offL();
      clearInterval(iv);
    };
  }, []);

  const bias = aggregateBias();
  const total = bias.buyUsd + bias.sellUsd;
  const buyPct = total > 0 ? (bias.buyUsd / total) * 100 : 50;
  const whales = recentWhales(30);
  const liquidations = recentLiquidations(24);

  return (
    <div className="flex flex-col gap-3">
      {/* Aggregate smart-money bias */}
      <div className="panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-black">🐋 Smart-money bias</div>
            <div className="mono text-[10px] text-muted-foreground">
              Netto walvis-flow (5 min) over alle crypto
            </div>
          </div>
          <span
            className={`mono flex items-center gap-1 text-[10px] ${connected ? "text-bull" : "text-warn"}`}
          >
            <span
              className={`live-dot inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-bull" : "bg-warn"}`}
            />
            {connected ? "LIVE" : "verbinden…"}
          </span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-panel-border/40">
          <div className="bg-bull transition-all" style={{ width: `${buyPct}%` }} />
          <div className="bg-bear transition-all" style={{ width: `${100 - buyPct}%` }} />
        </div>
        <div className="mono mt-1 flex items-center justify-between text-[10px]">
          <span className="font-black text-bull">▲ kopen {usd(bias.buyUsd)}</span>
          <span className={`font-black ${bias.net >= 0 ? "text-bull" : "text-bear"}`}>
            netto {bias.net >= 0 ? "+" : "−"}
            {usd(Math.abs(bias.net))}
          </span>
          <span className="font-black text-bear">verkopen {usd(bias.sellUsd)} ▼</span>
        </div>
      </div>

      {/* Per-symbol whale flow */}
      <div className="panel overflow-hidden">
        <div className="border-b border-panel-border/60 px-3 py-2 text-sm font-black">
          Walvis-flow per munt
        </div>
        <div className="divide-y divide-panel-border/60">
          {CRYPTO.map((sym) => {
            const f = whaleFlow(sym);
            const t = f.buyUsd + f.sellUsd;
            const bp = t > 0 ? (f.buyUsd / t) * 100 : 50;
            return (
              <div key={sym} className="flex items-center gap-2 px-3 py-1.5">
                <span className="mono w-16 shrink-0 text-[11px] font-black">{sym}</span>
                <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-panel-border/40">
                  <div className="bg-bull" style={{ width: `${bp}%` }} />
                  <div className="bg-bear" style={{ width: `${100 - bp}%` }} />
                </div>
                <span
                  className={`mono w-20 shrink-0 text-right text-[10px] font-black tabular-nums ${f.net >= 0 ? "text-bull" : "text-bear"}`}
                >
                  {f.net >= 0 ? "+" : "−"}
                  {usd(Math.abs(f.net))}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mono border-t border-panel-border/60 px-3 py-1.5 text-[9px] text-muted-foreground">
          Trades ≥ {usd(WHALE_MIN_USD)} tellen als walvis · bron Binance aggTrade
        </div>
      </div>

      {/* Whale tape + liquidations side by side on desktop */}
      <div className="grid gap-3 sm:grid-cols-2">
        <WhaleTape whales={whales} />
        <LiquidationFeed liqs={liquidations} />
      </div>

      {/* Prediction markets — outcome before the news */}
      <PredictionMarkets />
    </div>
  );
}

function WhaleTape({ whales }: { whales: WhaleTrade[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-panel-border/60 px-3 py-2 text-sm font-black">
        🐋 Walvis-tape
      </div>
      {whales.length === 0 ? (
        <div className="p-4 text-center text-[11px] text-muted-foreground">
          Wachten op grote trades…
        </div>
      ) : (
        <div className="max-h-[320px] divide-y divide-panel-border/60 overflow-y-auto">
          {whales.map((w) => (
            <div key={w.id} className="flex items-center gap-2 px-3 py-1.5">
              <span
                className={`mono shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black ${w.side === "buy" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"}`}
              >
                {w.side === "buy" ? "▲ KOOP" : "▼ VERK"}
              </span>
              <span className="mono w-16 shrink-0 text-[11px] font-black">{w.symbol}</span>
              <span className="min-w-0 flex-1 truncate">
                {w.mega && <span className="mr-1">💥</span>}
                <span
                  className={`mono text-[12px] font-black tabular-nums ${w.side === "buy" ? "text-bull" : "text-bear"}`}
                >
                  {usd(w.usd)}
                </span>
                <span className="mono ml-1 text-[9px] text-muted-foreground">
                  @ {formatPrice(w.symbol, w.price)}
                </span>
              </span>
              <span className="mono shrink-0 text-[9px] text-muted-foreground">{ago(w.time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiquidationFeed({ liqs }: { liqs: Liquidation[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-panel-border/60 px-3 py-2 text-sm font-black">
        💥 Liquidaties
      </div>
      {liqs.length === 0 ? (
        <div className="p-4 text-center text-[11px] text-muted-foreground">
          Wachten op liquidaties…
        </div>
      ) : (
        <div className="max-h-[320px] divide-y divide-panel-border/60 overflow-y-auto">
          {liqs.map((l) => (
            <div key={l.id} className="flex items-center gap-2 px-3 py-1.5">
              <span
                className={`mono shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black ${l.side === "long" ? "bg-bear/15 text-bear" : "bg-bull/15 text-bull"}`}
              >
                {l.side === "long" ? "LONG REKT" : "SHORT REKT"}
              </span>
              <span className="mono w-16 shrink-0 text-[11px] font-black">{l.symbol}</span>
              <span className="mono min-w-0 flex-1 truncate text-[12px] font-black tabular-nums">
                {usd(l.usd)}
                <span className="mono ml-1 text-[9px] font-normal text-muted-foreground">
                  @ {formatPrice(l.symbol, l.price)}
                </span>
              </span>
              <span className="mono shrink-0 text-[9px] text-muted-foreground">{ago(l.time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
