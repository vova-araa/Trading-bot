import { useEffect, useMemo, useState } from "react";
import { formatPrice, currentPrice } from "@/lib/market-data";
import { addAlert } from "@/lib/alerts";
import type { Setup } from "@/lib/strategies";

type LevelKey = "entry" | "tp" | "sl" | "custom";
type Unit = "pips" | "percent" | "price";

function pipSize(symbol: string): number {
  if (/JPY$/.test(symbol)) return 0.01;
  if (/^[A-Z]{6}$/.test(symbol)) return 0.0001;
  return 1; // crypto / index / metal — treat "pip" as 1 unit
}

export function NearEntryAlertWizard({
  setup,
  onClose,
}: {
  setup: Setup;
  onClose: () => void;
}) {
  const [level, setLevel] = useState<LevelKey>("entry");
  const [unit, setUnit] = useState<Unit>("pips");
  const [amount, setAmount] = useState<number>(10);
  const [customPrice, setCustomPrice] = useState<number>(setup.entry);
  const [side, setSide] = useState<"either" | "above" | "below">("either");
  const [repeat, setRepeat] = useState(false);
  const [live, setLive] = useState(() => currentPrice(setup.symbol));

  useEffect(() => {
    const i = setInterval(() => setLive(currentPrice(setup.symbol)), 500);
    return () => clearInterval(i);
  }, [setup.symbol]);

  const targetPrice = useMemo(() => {
    if (level === "entry") return setup.entry;
    if (level === "tp") return setup.target;
    if (level === "sl") return setup.stop;
    return customPrice;
  }, [level, setup, customPrice]);

  const proximity = useMemo(() => {
    if (unit === "pips") return amount * pipSize(setup.symbol);
    if (unit === "percent") return (targetPrice * amount) / 100;
    return amount;
  }, [unit, amount, targetPrice, setup.symbol]);

  const distNow = Math.abs(live - targetPrice);
  const willFireNow = distNow <= proximity;

  const levelLabels: Record<LevelKey, string> = {
    entry: `🎯 Entry (${formatPrice(setup.symbol, setup.entry)})`,
    tp: `💰 Take profit (${formatPrice(setup.symbol, setup.target)})`,
    sl: `🛑 Stop loss (${formatPrice(setup.symbol, setup.stop)})`,
    custom: `✏️ Eigen prijs`,
  };

  function submit() {
    const noteLevel = level === "entry" ? "entry" : level === "tp" ? "TP" : level === "sl" ? "SL" : "prijs";
    if (side === "either") {
      addAlert({
        symbol: setup.symbol,
        kind: "near",
        price: targetPrice,
        proximity,
        note: `⚡ Vlakbij ${noteLevel} (${amount}${unit === "pips" ? "p" : unit === "percent" ? "%" : ""})`,
        linkedSetupId: setup.id,
        repeat,
      });
    } else {
      // Directional: fire when crossing into the zone from one side
      const zonePrice = side === "above" ? targetPrice + proximity : targetPrice - proximity;
      addAlert({
        symbol: setup.symbol,
        kind: "cross",
        price: zonePrice,
        note: `⚡ ${side === "above" ? "Van boven" : "Van onder"} vlakbij ${noteLevel}`,
        linkedSetupId: setup.id,
        repeat,
      });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="panel w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-panel-border/60 px-4 py-3">
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Alarm wizard</div>
            <div className="text-lg font-black">Vlakbij prijs op {setup.symbol}</div>
          </div>
          <button onClick={onClose} className="mono text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {/* Level type */}
          <div>
            <div className="mono mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Level</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(levelLabels) as LevelKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setLevel(k)}
                  className={`mono rounded-md border px-2 py-2 text-left text-[11px] font-bold transition-colors ${
                    level === k ? "border-primary bg-primary/15 text-primary" : "border-panel-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {levelLabels[k]}
                </button>
              ))}
            </div>
            {level === "custom" && (
              <input
                type="number"
                step="any"
                value={customPrice}
                onChange={(e) => setCustomPrice(parseFloat(e.target.value) || 0)}
                className="mono mt-2 w-full rounded-md border border-panel-border bg-background px-3 py-2 text-sm tabular-nums"
                placeholder="Eigen prijs"
              />
            )}
          </div>

          {/* Distance */}
          <div>
            <div className="mono mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Afstand tot level</span>
              <span className="tabular-nums text-foreground">≈ {formatPrice(setup.symbol, proximity)}</span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="mono w-24 rounded-md border border-panel-border bg-background px-3 py-2 text-sm tabular-nums"
              />
              <div className="grid flex-1 grid-cols-3 gap-1">
                {(["pips", "percent", "price"] as Unit[]).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnit(u)}
                    className={`mono rounded-md border px-1 py-2 text-[10px] font-bold uppercase transition-colors ${
                      unit === u ? "border-primary bg-primary/15 text-primary" : "border-panel-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {u === "pips" ? "Pips" : u === "percent" ? "%" : "Prijs"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(unit === "pips" ? [5, 10, 20, 50] : unit === "percent" ? [0.1, 0.25, 0.5, 1] : [0.0005, 0.001, 0.01, 0.1]).map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className="mono rounded border border-panel-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground hover:border-primary hover:text-primary"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Direction */}
          <div>
            <div className="mono mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Richting</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { k: "either", l: "Elke kant" },
                { k: "above", l: "Van boven ↓" },
                { k: "below", l: "Van onder ↑" },
              ].map((o) => (
                <button
                  key={o.k}
                  onClick={() => setSide(o.k as typeof side)}
                  className={`mono rounded-md border px-2 py-2 text-[11px] font-bold transition-colors ${
                    side === o.k ? "border-primary bg-primary/15 text-primary" : "border-panel-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Repeat */}
          <label className="mono flex items-center justify-between rounded-md border border-panel-border px-3 py-2 text-[11px] font-bold">
            <span>🔁 Herhaal alarm</span>
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          </label>

          {/* Preview */}
          <div className="rounded-md border border-panel-border bg-muted/20 px-3 py-2 text-[11px]">
            <div className="mono flex justify-between text-muted-foreground">
              <span>Nu prijs</span>
              <span className="tabular-nums text-foreground">{formatPrice(setup.symbol, live)}</span>
            </div>
            <div className="mono flex justify-between text-muted-foreground">
              <span>Target level</span>
              <span className="tabular-nums text-foreground">{formatPrice(setup.symbol, targetPrice)}</span>
            </div>
            <div className="mono flex justify-between text-muted-foreground">
              <span>Afstand nu</span>
              <span className={`tabular-nums ${willFireNow ? "text-primary font-bold" : "text-foreground"}`}>
                {formatPrice(setup.symbol, distNow)} {willFireNow && "· 🔥 in zone"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-panel-border/60 px-4 py-3">
          <button
            onClick={onClose}
            className="mono rounded-md border border-panel-border py-2.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Annuleer
          </button>
          <button
            onClick={submit}
            disabled={!targetPrice || !proximity}
            className="mono rounded-md bg-primary py-2.5 text-[11px] font-black uppercase tracking-wider text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            🔔 Zet alarm
          </button>
        </div>
      </div>
    </div>
  );
}
