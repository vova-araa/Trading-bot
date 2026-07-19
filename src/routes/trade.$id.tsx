import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { findCachedSetup } from "@/lib/setup-cache";
import { armSetupAlerts } from "@/lib/alerts";
import { currentPrice, onTick } from "@/lib/market-data";
import { getConfirmTrade, setConfirmTrade, onConfirmTradeChange } from "@/lib/trade-confirm";
import type { Setup } from "@/lib/strategies";
import { TradeShareCard } from "@/components/TradeShareCard";

type Search = { action?: "take"; src?: string };

export const Route = createFileRoute("/trade/$id")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    action: search.action === "take" ? "take" : undefined,
    src: typeof search.src === "string" ? search.src : undefined,
  }),
  component: TradePage,
});

function TradePage() {
  const { id } = Route.useParams();
  const search = useSearch({ from: "/trade/$id" }) as Search;
  const [setup, setSetup] = useState<Setup | null>(() => findCachedSetup(id));
  const [price, setPrice] = useState<number>(() => (setup ? currentPrice(setup.symbol) : 0));
  const [taken, setTaken] = useState(false);
  const [confirmRequired, setConfirmRequiredLocal] = useState<boolean>(() => getConfirmTrade());
  // "pending" = user came from a notification but must review before executing
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!setup) return;
    setPrice(currentPrice(setup.symbol));
    const off = onTick((sym, p) => { if (sym === setup.symbol) setPrice(p); });
    return () => { off(); };
  }, [setup]);

  useEffect(() => onConfirmTradeChange(() => setConfirmRequiredLocal(getConfirmTrade())), []);

  // Coming from notification "Neem trade" action
  useEffect(() => {
    if (!setup || taken) return;
    if (search.action !== "take") return;
    if (confirmRequired) setPending(true);
    else take();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, search.action]);

  const distance = useMemo(() => {
    if (!setup || !price) return null;
    return ((price - setup.entry) / setup.entry) * 100;
  }, [setup, price]);

  function take() {
    if (!setup) return;
    armSetupAlerts({
      id: setup.id,
      symbol: setup.symbol,
      side: setup.side,
      entry: setup.entry,
      stop: setup.stop,
      target: setup.target,
    });
    setPending(false);
    setTaken(true);
  }


  if (!setup) {
    return (
      <main className="min-h-screen bg-background text-foreground p-6 pb-24">
        <div className="max-w-md mx-auto space-y-4">
          <Link to="/" className="text-sm text-muted-foreground">← Terug</Link>
          <h1 className="text-2xl font-bold">Signaal niet gevonden</h1>
          <p className="text-muted-foreground">Dit signaal is verlopen of nog niet geladen. Open de app en wacht op de volgende.</p>
          <Link to="/" className="inline-block rounded-lg bg-primary text-primary-foreground px-4 py-3 font-semibold">Naar signalen</Link>
        </div>
      </main>
    );
  }

  const arrow = setup.side === "long" ? "▲" : "▼";
  const color = setup.side === "long" ? "text-green-500" : "text-red-500";

  return (
    <main className="min-h-screen bg-background text-foreground pb-24">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground">← Terug</Link>
          <span className="text-[11px] text-muted-foreground mono">via {search.src ?? "app"}</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-3xl font-black ${color}`}>{arrow}</span>
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wider">{setup.side === "long" ? "KOOP" : "VERKOOP"}</div>
              <div className="text-2xl font-bold">{setup.symbol}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[11px] text-muted-foreground">Nu</div>
              <div className="mono text-lg font-semibold">{price ? price.toFixed(4) : "…"}</div>
              {distance !== null && (
                <div className={`text-[11px] mono ${Math.abs(distance) < 0.1 ? "text-amber-500" : "text-muted-foreground"}`}>
                  {distance >= 0 ? "+" : ""}{distance.toFixed(2)}% van entry
                </div>
              )}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">{setup.reason}</div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="🎯 Koop bij" value={setup.entry.toFixed(4)} tone="primary" />
          <Stat label="🛑 Stop" value={setup.stop.toFixed(4)} tone="danger" />
          <Stat label="💰 Winst" value={setup.target.toFixed(4)} tone="success" />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Risk/Reward</span>
          <span className="mono font-semibold">1 : {setup.rr.toFixed(2)}</span>
          <span className="text-muted-foreground">Zekerheid</span>
          <span className="mono font-semibold">{setup.confidence}%</span>
        </div>

        {taken ? (
          <>
            <div className="rounded-2xl border-2 border-green-500 bg-green-500/10 p-5 text-center space-y-1">
              <div className="text-3xl">✅</div>
              <div className="text-lg font-bold">Trade opgepakt</div>
              <div className="text-sm text-muted-foreground">
                Alarmen gezet voor entry, TP en SL. Je krijgt push wanneer de prijs aangetikt wordt.
              </div>
              <Link to="/" className="mt-2 inline-block text-sm text-primary underline">Terug naar signalen</Link>
            </div>
            <TradeShareCard
              symbol={setup.symbol}
              side={setup.side}
              entry={setup.entry}
              stop={setup.stop}
              target={setup.target}
              currentExit={price || setup.entry}
            />
          </>
        ) : pending ? (
          <div className="rounded-2xl border-2 border-amber-500 bg-amber-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="text-base font-bold">Controleer voordat je bevestigt</div>
                <div className="text-xs text-muted-foreground">
                  Kwam binnen via notificatie — check entry, SL en TP hierboven.
                </div>
              </div>
            </div>
            <ul className="text-xs space-y-1">
              <li className="flex justify-between"><span className="text-muted-foreground">Richting</span><span className="font-semibold">{setup.side === "long" ? "KOOP" : "VERKOOP"} {setup.symbol}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">🎯 Entry</span><span className="mono font-semibold">{setup.entry.toFixed(4)}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">🛑 Stop</span><span className="mono font-semibold">{setup.stop.toFixed(4)}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">💰 Winst</span><span className="mono font-semibold">{setup.target.toFixed(4)}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Risk/Reward</span><span className="mono font-semibold">1 : {setup.rr.toFixed(2)}</span></li>
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPending(false)}
                className="rounded-xl border border-border bg-muted/40 py-3 text-sm font-semibold active:scale-[0.98] transition"
              >
                Annuleer
              </button>
              <button
                onClick={take}
                className="rounded-xl bg-primary text-primary-foreground py-3 text-sm font-bold active:scale-[0.98] transition"
              >
                ✅ Bevestig trade
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => (confirmRequired ? setPending(true) : take())}
            className="w-full rounded-2xl bg-primary text-primary-foreground py-5 text-lg font-bold shadow-lg active:scale-[0.98] transition"
          >
            🎯 Neem deze trade — {confirmRequired ? "controleer eerst" : "1 tap"}
          </button>
        )}

        <label className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs">
          <span>
            <span className="font-semibold">Bevestiging vereist</span>
            <span className="ml-1 text-muted-foreground">— check entry/SL/TP na notificatie</span>
          </span>
          <input
            type="checkbox"
            checked={confirmRequired}
            onChange={(e) => {
              setConfirmTrade(e.target.checked);
              if (!e.target.checked && pending) { setPending(false); take(); }
            }}
            className="h-4 w-4 accent-primary"
          />
        </label>

        <p className="text-[11px] text-muted-foreground text-center px-4">
          Deze knop zet automatisch alarmen op entry, take-profit en stop-loss.
          Echte order-uitvoering loopt via je gekoppelde broker (Brokers tab).
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "primary" | "danger" | "success" }) {
  const bg = tone === "primary" ? "bg-primary/10 border-primary/40" : tone === "danger" ? "bg-red-500/10 border-red-500/40" : "bg-green-500/10 border-green-500/40";
  return (
    <div className={`rounded-xl border ${bg} p-3 text-center`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mono text-sm font-bold mt-1">{value}</div>
    </div>
  );
}
