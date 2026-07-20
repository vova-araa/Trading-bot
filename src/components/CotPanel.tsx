import { useEffect, useState } from "react";

// CFTC Commitment of Traders — weekly bank/institutional net positioning.
// Commercials = producers/banks/hedgers (smart money); large specs = funds.
type CotRow = {
  code: string;
  label: string;
  flag: string;
  commercialNet: number;
  commercialLongPct: number;
  specNet: number;
  weeklyChange: number;
  openInterest: number;
  reportDate: string;
};

function compact(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`;
  return `${s}${a.toFixed(0)}`;
}

export function CotPanel() {
  const [rows, setRows] = useState<CotRow[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/edge/cot");
        const j = (await res.json()) as { rows?: CotRow[] };
        if (!alive) return;
        setRows(j.rows ?? []);
        setState(j.rows?.length ? "ok" : "empty");
      } catch {
        if (alive) setState("empty");
      }
    };
    void load();
    const iv = setInterval(load, 3600_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  if (state === "empty") return null;
  if (state === "loading") {
    return (
      <div className="panel animate-pulse p-4 text-center text-[12px] text-muted-foreground">
        Bank-positionering (COT) laden…
      </div>
    );
  }
  if (!rows) return null;
  const date = rows[0]?.reportDate;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border/60 px-3 py-2">
        <div>
          <div className="text-sm font-black">🏦 Bank-positionering (COT)</div>
          <div className="mono text-[10px] text-muted-foreground">
            Netto futures-positie van commercials (banken/hedgers) — CFTC
          </div>
        </div>
        {date && <span className="mono text-[9px] text-muted-foreground">{date}</span>}
      </div>
      <div className="divide-y divide-panel-border/60">
        {rows.map((r) => {
          const longBias = r.commercialLongPct >= 50;
          const chUp = r.weeklyChange >= 0;
          return (
            <div key={r.code} className="flex items-center gap-2 px-3 py-2">
              <span className="shrink-0 text-lg">{r.flag}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-black">{r.label}</div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-bear/40">
                  <div
                    className="h-full rounded-full bg-bull"
                    style={{ width: `${Math.max(2, Math.min(98, r.commercialLongPct))}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={`mono text-[12px] font-black tabular-nums ${longBias ? "text-bull" : "text-bear"}`}
                >
                  {longBias ? "▲ NET LONG" : "▼ NET SHORT"}
                </div>
                <div className="mono text-[9px] text-muted-foreground">
                  {compact(r.commercialNet)} ·{" "}
                  <span className={chUp ? "text-bull" : "text-bear"}>
                    {chUp ? "+" : ""}
                    {compact(r.weeklyChange)} wk
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mono border-t border-panel-border/60 px-3 py-1.5 text-[9px] leading-snug text-muted-foreground">
        Commercials zijn vaak de "slimme" hedgers. Extreem net-long op de bodem of net-short op de
        top gaat vaak vooraf aan een draai. Wekelijkse data (CFTC, dinsdag-stand).
      </div>
    </div>
  );
}
