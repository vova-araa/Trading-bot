import { useCallback, useEffect, useState } from "react";
import { mt5Close, mt5Configured, mt5Positions } from "@/lib/mt5";
import { isUnlocked } from "@/lib/broker-vault";

// Live MT5 account panel — shows your REAL open positions from MetaApi with
// balance/equity, and lets you close a position straight from the app. Renders
// nothing unless MT5 is connected (so the paper flow stays clean for everyone
// who hasn't linked a broker).

type Mt5Position = {
  id: string;
  symbol: string;
  type?: string; // POSITION_TYPE_BUY | POSITION_TYPE_SELL
  volume?: number;
  openPrice?: number;
  currentPrice?: number;
  profit?: number;
  stopLoss?: number;
  takeProfit?: number;
};

type Mt5Account = {
  balance?: number;
  equity?: number;
  currency?: string;
  profit?: number;
};

const POLL_MS = 6000;

export function Mt5PositionsPanel() {
  const [available, setAvailable] = useState(false);
  const [positions, setPositions] = useState<Mt5Position[]>([]);
  const [account, setAccount] = useState<Mt5Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);

  // Track connection + vault state.
  useEffect(() => {
    const sync = () => setAvailable(mt5Configured() && isUnlocked());
    sync();
    window.addEventListener("ara-brokers-change", sync);
    window.addEventListener("ara-vault-change", sync);
    return () => {
      window.removeEventListener("ara-brokers-change", sync);
      window.removeEventListener("ara-vault-change", sync);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!mt5Configured() || !isUnlocked()) return;
    setLoading(true);
    const res = await mt5Positions();
    setLoading(false);
    if (res.ok) {
      setPositions((res.positions as Mt5Position[]) ?? []);
      setAccount((res.account as Mt5Account) ?? null);
      setError(null);
    } else {
      setError(res.error ?? "kan MT5 niet bereiken");
    }
  }, []);

  useEffect(() => {
    if (!available) return;
    void refresh();
    const iv = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(iv);
  }, [available, refresh]);

  async function close(id: string) {
    setClosing(id);
    const res = await mt5Close(id);
    setClosing(null);
    if (res.ok) {
      setPositions((ps) => ps.filter((p) => p.id !== id));
      void refresh();
    } else {
      setError(res.error ?? "sluiten mislukt");
    }
  }

  if (!available) return null;

  const totalProfit = positions.reduce((s, p) => s + (p.profit ?? 0), 0);
  const cur = account?.currency ?? "";

  return (
    <div className="panel overflow-hidden ring-1 ring-amber-500/40">
      <div className="flex items-center justify-between border-b border-panel-border/60 bg-amber-500/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black">⚡ MT5 live</span>
          {account?.balance != null && (
            <span className="mono text-[10px] text-muted-foreground">
              saldo {fmt(account.balance)} {cur}
              {account.equity != null && <> · equity {fmt(account.equity)}</>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`mono text-[12px] font-black tabular-nums ${totalProfit >= 0 ? "text-bull" : "text-bear"}`}
          >
            {totalProfit >= 0 ? "+" : ""}
            {fmt(totalProfit)} {cur}
          </span>
          <button
            onClick={() => void refresh()}
            title="Ververs"
            className="mono rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mono border-b border-panel-border/60 bg-bear/10 px-3 py-1.5 text-[10px] text-bear">
          ✕ {error}
        </div>
      )}

      {positions.length === 0 ? (
        <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
          Geen open MT5-posities. Plaats er één via <b>⚡ Echt · MT5</b> in de order-ticket
          hierboven, of laat een live bot 'm openen.
        </div>
      ) : (
        <div className="divide-y divide-panel-border/60">
          {positions.map((p) => {
            const buy = (p.type ?? "").includes("BUY");
            const up = (p.profit ?? 0) >= 0;
            return (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                <span
                  className={`mono shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black ${buy ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"}`}
                >
                  {buy ? "▲ BUY" : "▼ SELL"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-black">
                    {p.symbol}{" "}
                    <span className="mono text-[10px] font-normal text-muted-foreground">
                      {(p.volume ?? 0).toFixed(2)} lot
                    </span>
                  </div>
                  <div className="mono text-[10px] text-muted-foreground">
                    in {fmt(p.openPrice)} · nu {fmt(p.currentPrice)}
                    {p.stopLoss ? <> · SL {fmt(p.stopLoss)}</> : null}
                    {p.takeProfit ? <> · TP {fmt(p.takeProfit)}</> : null}
                  </div>
                </div>
                <div
                  className={`mono shrink-0 text-right text-[13px] font-black tabular-nums ${up ? "text-bull" : "text-bear"}`}
                >
                  {up ? "+" : ""}
                  {fmt(p.profit)} {cur}
                </div>
                <button
                  onClick={() => void close(p.id)}
                  disabled={closing === p.id}
                  className="mono shrink-0 rounded-md border border-panel-border px-2 py-1 text-[10px] font-black uppercase tracking-wider hover:border-bear/60 hover:text-bear disabled:opacity-50"
                >
                  {closing === p.id ? "…" : "Sluit"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmt(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
