import { useEffect, useMemo, useState } from "react";
import { currentPrice, formatPrice, onTick, SYMBOLS } from "@/lib/market-data";
import { openPosition, type Side } from "@/lib/positions";
import { createBotFromTrade } from "@/lib/bots";
import { mt5Configured, mt5PlaceOrder, mt5Positions } from "@/lib/mt5";
import { isUnlocked } from "@/lib/broker-vault";
import { liveTradingBlocked } from "@/lib/kill-switch";
import { getRiskSettings } from "@/lib/risk-settings";
import { computeLot } from "@/lib/position-sizing";

type ExecMode = "paper" | "mt5";

// Order ticket — place a live-tracked paper trade straight from the chart.
// Buy/Sell, lot size, and stop-loss / take-profit (as % or exact price). The
// position then marks to market on every tick and auto-closes on SL/TP.
export function TradeTicket({
  symbolId,
  onPlaced,
  onLevels,
}: {
  symbolId: string;
  onPlaced?: () => void;
  onLevels?: (l: { side: Side; sl: number; tp: number }) => void;
}) {
  const [side, setSide] = useState<Side>("long");
  const [size, setSize] = useState(0.5);
  const [slPct, setSlPct] = useState(0.5);
  const [tpPct, setTpPct] = useState(1.0);
  const [price, setPrice] = useState(() => currentPrice(symbolId));
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  const [mode, setMode] = useState<ExecMode>("paper");
  const [mt5Ready, setMt5Ready] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPrice(currentPrice(symbolId));
    const off = onTick((id, p) => {
      if (id === symbolId) setPrice(p);
    });
    return () => {
      off();
    };
  }, [symbolId]);

  // Track whether real MT5 execution is available (creds saved + vault unlocked).
  useEffect(() => {
    const sync = () => setMt5Ready(mt5Configured() && isUnlocked());
    sync();
    window.addEventListener("ara-brokers-change", sync);
    window.addEventListener("ara-vault-change", sync);
    return () => {
      window.removeEventListener("ara-brokers-change", sync);
      window.removeEventListener("ara-vault-change", sync);
    };
  }, []);

  // Reset the confirm step whenever the order changes underneath it.
  useEffect(() => {
    setConfirming(false);
  }, [side, size, slPct, tpPct, mode, symbolId]);

  const dir = side === "long" ? 1 : -1;
  const sl = useMemo(() => price * (1 - (slPct / 100) * dir), [price, slPct, dir]);
  const tp = useMemo(() => price * (1 + (tpPct / 100) * dir), [price, tpPct, dir]);
  const notional = size * 1000;
  const riskUsd = (notional * slPct) / 100;
  const rewardUsd = (notional * tpPct) / 100;
  const rr = slPct > 0 ? tpPct / slPct : 0;
  const sym = SYMBOLS.find((s) => s.id === symbolId);

  // Report the draft SL/TP up so the chart can draw them live.
  useEffect(() => {
    onLevels?.({ side, sl, tp });
  }, [side, sl, tp, onLevels]);

  function placePaper() {
    openPosition({ symbol: symbolId, side, size, sl, tp });
    setFlash({
      ok: true,
      msg: `${side === "long" ? "▲ Long" : "▼ Short"} ${size.toFixed(2)} ${symbolId} geplaatst @ ${formatPrice(symbolId, price)}`,
    });
    setTimeout(() => setFlash(null), 2600);
    onPlaced?.();
  }

  // Fill the lot size from your risk settings (risk % of balance ÷ SL distance).
  // Uses the live MT5 balance when connected, else the manual balance.
  async function applyRiskSize() {
    const rs = getRiskSettings();
    let balance = rs.manualBalance;
    let source = "handmatig saldo";
    if (mt5Configured() && isUnlocked()) {
      const acc = await mt5Positions();
      const bal = Number((acc.account as { balance?: unknown } | undefined)?.balance);
      if (acc.ok && Number.isFinite(bal) && bal > 0) {
        balance = bal;
        source = "MT5-saldo";
      }
    }
    const res = computeLot({
      symbol: symbolId,
      balance,
      riskPct: rs.riskPerTradePct,
      entry: price,
      stopLoss: sl,
      maxLot: rs.maxLot,
    });
    if (!res) {
      setFlash({ ok: false, msg: "Kan lot niet berekenen — check SL en risk-instellingen." });
      setTimeout(() => setFlash(null), 3000);
      return;
    }
    setSize(res.lot);
    setFlash({
      ok: true,
      msg: `Lot ${res.lot.toFixed(2)} · risk ≈ $${res.riskUsd.toFixed(2)} (${rs.riskPerTradePct}% van $${balance.toLocaleString("en-US")} ${source})${res.confident ? "" : " · ⚠ benaderd"}`,
    });
    setTimeout(() => setFlash(null), 4000);
  }

  // Real MT5 order — only after the explicit confirm step (see the button area).
  async function placeReal() {
    if (liveTradingBlocked()) {
      setConfirming(false);
      setFlash({
        ok: false,
        msg: "🛑 Kill-switch actief — live orders geblokkeerd. Reset in Risk-paneel.",
      });
      setTimeout(() => setFlash(null), 5000);
      return;
    }
    setBusy(true);
    setFlash(null);
    const res = await mt5PlaceOrder({
      symbol: symbolId,
      side,
      volume: size,
      stopLoss: sl,
      takeProfit: tp,
      comment: "ARA",
    });
    setBusy(false);
    setConfirming(false);
    if (res.ok) {
      setFlash({
        ok: true,
        msg: `⚡ ECHTE ${side === "long" ? "long" : "short"} ${size.toFixed(2)} ${symbolId} order verstuurd naar MT5`,
      });
      onPlaced?.();
    } else {
      setFlash({ ok: false, msg: `MT5 order geweigerd: ${res.error ?? "onbekende fout"}` });
    }
    setTimeout(() => setFlash(null), 6000);
  }

  function onPrimary() {
    if (mode === "paper") {
      placePaper();
    } else if (!confirming) {
      setConfirming(true); // arm the "echt geld" confirmation
    } else {
      void placeReal();
    }
  }

  function makeBot() {
    createBotFromTrade({ symbol: symbolId, side, size, slPct, tpPct });
    setFlash({
      ok: true,
      msg: `🤖 24/7 ${side === "long" ? "long" : "short"} bot op ${symbolId} aangezet — zie de Bots-tab`,
    });
    setTimeout(() => setFlash(null), 3200);
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black">🎯 Order</span>
          <span className="mono text-[10px] text-muted-foreground">{sym?.name ?? symbolId}</span>
        </div>
        <span className="mono text-[12px] font-black tabular-nums">
          {formatPrice(symbolId, price)}
        </span>
      </div>

      <div className="grid gap-2.5 p-3">
        {/* Side */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide("long")}
            className={`mono rounded-md py-2 text-[12px] font-black uppercase tracking-wider transition-colors ${
              side === "long"
                ? "bg-bull text-background"
                : "border border-panel-border text-muted-foreground hover:text-foreground"
            }`}
          >
            ▲ Koop / Long
          </button>
          <button
            onClick={() => setSide("short")}
            className={`mono rounded-md py-2 text-[12px] font-black uppercase tracking-wider transition-colors ${
              side === "short"
                ? "bg-bear text-background"
                : "border border-panel-border text-muted-foreground hover:text-foreground"
            }`}
          >
            ▼ Verkoop / Short
          </button>
        </div>

        {/* Size */}
        <div>
          <div className="mono mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Grootte (lot)</span>
            <span className="text-foreground">≈ ${notional.toLocaleString("en-US")}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={size}
              onChange={(e) => setSize(Math.max(0.01, Number(e.target.value) || 0.01))}
              className="mono w-20 rounded-md border border-panel-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary/60"
            />
            <div className="flex gap-1">
              {[0.1, 0.5, 1, 2].map((v) => (
                <button
                  key={v}
                  onClick={() => setSize(v)}
                  className={`mono rounded px-2 py-1 text-[10px] font-bold ${
                    size === v
                      ? "bg-primary text-primary-foreground"
                      : "border border-panel-border text-muted-foreground"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={() => void applyRiskSize()}
              title="Bereken de lot uit je risk% en stop-loss (Risk-paneel op de Bots-tab)"
              className="mono ml-auto rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/15"
            >
              🎯 Risk%
            </button>
          </div>
        </div>

        {/* SL / TP */}
        <div className="grid grid-cols-2 gap-2">
          <RiskInput
            label="🛑 Stop-loss"
            pct={slPct}
            onPct={setSlPct}
            price={sl}
            symbolId={symbolId}
            usd={riskUsd}
            tone="bear"
          />
          <RiskInput
            label="💰 Take-profit"
            pct={tpPct}
            onPct={setTpPct}
            price={tp}
            symbolId={symbolId}
            usd={rewardUsd}
            tone="bull"
          />
        </div>

        <div className="mono flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            Risk <span className="font-black text-bear">${riskUsd.toFixed(2)}</span> · Reward{" "}
            <span className="font-black text-bull">${rewardUsd.toFixed(2)}</span>
          </span>
          <span className="rounded bg-panel-border/40 px-1.5 py-0.5 font-black text-foreground">
            R:R {rr.toFixed(1)}
          </span>
        </div>

        {/* Execution mode: paper (simulated) vs real MT5 order */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode("paper")}
            className={`mono rounded-md py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
              mode === "paper"
                ? "bg-primary/20 text-primary ring-1 ring-primary/50"
                : "border border-panel-border text-muted-foreground hover:text-foreground"
            }`}
          >
            📝 Paper
          </button>
          <button
            onClick={() => setMode("mt5")}
            className={`mono rounded-md py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
              mode === "mt5"
                ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50"
                : "border border-panel-border text-muted-foreground hover:text-foreground"
            }`}
          >
            ⚡ Echt · MT5
          </button>
        </div>

        {mode === "paper" ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={onPrimary}
              className={`mono col-span-2 rounded-md py-2.5 text-[12px] font-black uppercase tracking-wider text-background ${
                side === "long" ? "bg-bull hover:brightness-110" : "bg-bear hover:brightness-110"
              }`}
            >
              {side === "long" ? "▲ Plaats koop-order" : "▼ Plaats verkoop-order"}
            </button>
            <button
              onClick={makeBot}
              title="Maak hier een 24/7 bot van met dezelfde instellingen"
              className="mono rounded-md border border-primary/50 bg-primary/10 py-2.5 text-[11px] font-black uppercase tracking-wider text-primary hover:bg-primary/20"
            >
              🤖 Bot
            </button>
          </div>
        ) : !mt5Ready ? (
          <div className="mono rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-snug text-amber-400">
            MT5 nog niet klaar. Koppel je <b>MetaApi-token</b> in de <b>Brokers</b>-tab en
            ontgrendel de vault — dan schiet deze knop echte orders je MT5-account in.
          </div>
        ) : confirming ? (
          <div className="grid gap-2">
            <div className="mono rounded-md border border-bear/60 bg-bear/10 px-2.5 py-2 text-[11px] leading-snug text-bear">
              ⚠️ <b>Echte order, echt geld.</b> {side === "long" ? "KOOP" : "VERKOOP"}{" "}
              {size.toFixed(2)} lot {symbolId} @ ~{formatPrice(symbolId, price)} · SL{" "}
              {formatPrice(symbolId, sl)} · TP {formatPrice(symbolId, tp)}.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="mono rounded-md border border-panel-border py-2.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground disabled:opacity-50"
              >
                Annuleer
              </button>
              <button
                onClick={onPrimary}
                disabled={busy}
                className="mono rounded-md bg-bear py-2.5 text-[11px] font-black uppercase tracking-wider text-background hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Versturen…" : "✅ Bevestig echte order"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onPrimary}
            className={`mono w-full rounded-md py-2.5 text-[12px] font-black uppercase tracking-wider text-background ${
              side === "long" ? "bg-bull hover:brightness-110" : "bg-bear hover:brightness-110"
            }`}
          >
            ⚡ {side === "long" ? "Koop" : "Verkoop"} echt op MT5
          </button>
        )}

        {flash && (
          <div
            className={`mono rounded-md border px-2 py-1.5 text-[11px] ${
              flash.ok
                ? "border-bull/50 bg-bull/10 text-bull"
                : "border-bear/50 bg-bear/10 text-bear"
            }`}
          >
            {flash.ok ? "✓" : "✕"} {flash.msg}
          </div>
        )}
        <p className="mono text-[9px] leading-snug text-muted-foreground">
          {mode === "paper" ? (
            <>
              Paper-trade op live koersen — volgt de markt realtime en sluit automatisch op SL/TP.
              Wissel naar <b>⚡ Echt · MT5</b> om via MetaApi een echte order te sturen.
            </>
          ) : (
            <>
              Echte order via je gekoppelde MT5-account (MetaApi). Symbool wordt als{" "}
              <b>{symbolId}</b> doorgestuurd — als je broker een suffix gebruikt (bijv. XAUUSD.r),
              pas de symboolnaam bij je broker aan. Read + trade, nooit withdraw.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function RiskInput({
  label,
  pct,
  onPct,
  price,
  symbolId,
  usd,
  tone,
}: {
  label: string;
  pct: number;
  onPct: (v: number) => void;
  price: number;
  symbolId: string;
  usd: number;
  tone: "bull" | "bear";
}) {
  return (
    <div className="rounded-md border border-panel-border/60 bg-background/40 p-2">
      <div className="mono mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="0.1"
          min="0"
          value={pct}
          onChange={(e) => onPct(Math.max(0, Number(e.target.value) || 0))}
          className="mono w-14 rounded border border-panel-border bg-background px-1.5 py-1 text-[12px] outline-none focus:border-primary/60"
        />
        <span className="mono text-[11px] text-muted-foreground">%</span>
      </div>
      <div
        className={`mono mt-1 text-[11px] font-black tabular-nums ${tone === "bull" ? "text-bull" : "text-bear"}`}
      >
        {formatPrice(symbolId, price)}
      </div>
      <div className="mono text-[9px] text-muted-foreground">${usd.toFixed(2)}</div>
    </div>
  );
}
