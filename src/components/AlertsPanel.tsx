import { useEffect, useMemo, useState } from "react";
import {
  addAlert,
  clearTriggered,
  getAlerts,
  removeAlert,
  subscribeAlerts,
  toggleAlert,
  type Alert,
  type AlertKind,
} from "@/lib/alerts";
import { currentPrice, formatPrice, onTick, SYMBOLS } from "@/lib/market-data";
import { AlertHistoryPanel } from "./AlertHistoryPanel";
import { AlertPresetsManager } from "./AlertPresetsManager";

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>(() => getAlerts());
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => { const off = subscribeAlerts(setAlerts); return () => { off(); }; }, []);
  useEffect(() => { const off = onTick((id, p) => setPrices((prev) => ({ ...prev, [id]: p }))); return () => { off(); }; }, []);

  const armed = alerts.filter((a) => a.status === "armed");
  const triggered = alerts.filter((a) => a.status === "triggered");
  const paused = alerts.filter((a) => a.status === "paused");

  return (
    <div className="flex flex-col gap-4">
      {/* CTA */}
      <div className="panel flex items-center justify-between gap-3 p-4">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Prijs alarmen</div>
          <div className="text-lg font-black tracking-tight">🔔 {armed.length} actief · {triggered.length} geraakt</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Krijg een seintje + geluid zodra de prijs jouw level raakt of vlakbij komt.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="mono shrink-0 rounded-lg bg-primary px-4 py-2 text-[11px] font-black uppercase tracking-wider text-primary-foreground shadow-lg hover:brightness-110"
        >
          + Nieuw alarm
        </button>
      </div>

      {triggered.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="mono text-[10px] font-black uppercase tracking-wider text-primary">🔥 Geraakt</div>
            <button onClick={clearTriggered} className="mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
              Wissen
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {triggered.map((a) => (
              <AlertRow key={a.id} alert={a} live={prices[a.symbol] ?? currentPrice(a.symbol)} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 mono text-[10px] font-black uppercase tracking-wider text-muted-foreground">Actief</div>
        {armed.length === 0 ? (
          <div className="panel flex flex-col items-center gap-2 p-6 text-center">
            <span className="text-3xl">🔔</span>
            <p className="text-[12px] text-muted-foreground">Geen actieve alarmen. Zet er een op je favoriete koers.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {armed.map((a) => (
              <AlertRow key={a.id} alert={a} live={prices[a.symbol] ?? currentPrice(a.symbol)} />
            ))}
          </div>
        )}
      </div>

      {paused.length > 0 && (
        <div>
          <div className="mb-2 mono text-[10px] font-black uppercase tracking-wider text-muted-foreground">Gepauzeerd</div>
          <div className="flex flex-col gap-2">
            {paused.map((a) => (
              <AlertRow key={a.id} alert={a} live={prices[a.symbol] ?? currentPrice(a.symbol)} />
            ))}
          </div>
        </div>
      )}

      <AlertPresetsManager />

      <AlertHistoryPanel />

      {open && <AlertEditor onClose={() => setOpen(false)} />}
    </div>
  );
}

function AlertRow({ alert, live }: { alert: Alert; live: number }) {
  const dist = live - alert.price;
  const pct = Math.abs(dist / alert.price) * 100;
  const kindLabel: Record<AlertKind, string> = {
    above: "≥ boven",
    below: "≤ onder",
    cross: "⇅ kruist",
    near: "≈ vlakbij",
  };
  const tone =
    alert.status === "triggered" ? "border-primary/60 bg-primary/10"
    : alert.status === "paused" ? "opacity-60"
    : "";
  return (
    <div className={`panel flex items-center gap-3 p-3 ${tone}`}>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-panel-border/70 text-lg">
        {alert.status === "triggered" ? "🔥" : alert.kind === "near" ? "⚡" : "🔔"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="mono text-sm font-black tracking-tight">{alert.symbol}</span>
          <span className="mono rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            {kindLabel[alert.kind]}
          </span>
        </div>
        <div className="mono text-[11px] tabular-nums">
          <span className="font-black">{formatPrice(alert.symbol, alert.price)}</span>
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className={dist >= 0 ? "text-bear" : "text-bull"}>
            nu {formatPrice(alert.symbol, live)} ({dist >= 0 ? "+" : ""}{pct.toFixed(2)}%)
          </span>
        </div>
        {alert.note && <div className="truncate text-[10px] text-muted-foreground">{alert.note}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          onClick={() => toggleAlert(alert.id)}
          className="mono rounded-md border border-panel-border px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground hover:text-foreground"
        >
          {alert.status === "armed" ? "Pauze" : alert.status === "paused" ? "Actief" : "Herstart"}
        </button>
        <button
          onClick={() => removeAlert(alert.id)}
          className="mono rounded-md border border-panel-border px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground hover:border-bear/50 hover:text-bear"
        >
          Verwijder
        </button>
      </div>
    </div>
  );
}

function AlertEditor({ onClose }: { onClose: () => void }) {
  const [symbol, setSymbol] = useState("EURUSD");
  const [kind, setKind] = useState<AlertKind>("near");
  const live = currentPrice(symbol);
  const [price, setPrice] = useState<string>(() => live.toString());
  const [proxPct, setProxPct] = useState<number>(0.1); // % van prijs
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState(false);

  useEffect(() => { setPrice(currentPrice(symbol).toString()); }, [symbol]);

  const parsedPrice = parseFloat(price);
  const proximity = useMemo(() => (parsedPrice * proxPct) / 100, [parsedPrice, proxPct]);

  const submit = () => {
    if (!parsedPrice || !symbol) return;
    addAlert({
      symbol,
      kind,
      price: parsedPrice,
      proximity: kind === "near" ? proximity : undefined,
      note: note.trim() || undefined,
      repeat,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="panel w-full max-w-md rounded-t-2xl sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-panel-border/60 px-4 py-3">
          <div className="text-lg font-black tracking-tight">🔔 Nieuw alarm</div>
          <button onClick={onClose} className="mono text-[10px] uppercase tracking-wider text-muted-foreground">Sluit</button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <Field label="Valuta / koers">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="mono w-full rounded-md border border-panel-border bg-background px-3 py-2 text-sm font-bold"
            >
              {SYMBOLS.map((s) => (
                <option key={s.id} value={s.id}>{s.id} — {s.name}</option>
              ))}
            </select>
            <div className="mono mt-1 text-[10px] text-muted-foreground">
              Nu: <span className="font-black tabular-nums text-foreground">{formatPrice(symbol, live)}</span>
            </div>
          </Field>

          <Field label="Type alarm">
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { id: "near", label: "⚡ Vlakbij", hint: "Pre-entry" },
                { id: "cross", label: "🎯 Kruist", hint: "Level geraakt" },
                { id: "above", label: "▲ Boven", hint: "≥ prijs" },
                { id: "below", label: "▼ Onder", hint: "≤ prijs" },
              ] as { id: AlertKind; label: string; hint: string }[]).map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className={`rounded-md border px-2 py-2 text-center transition-colors ${
                    kind === k.id ? "border-primary bg-primary/10 text-primary" : "border-panel-border text-muted-foreground"
                  }`}
                >
                  <div className="mono text-[10px] font-black">{k.label}</div>
                  <div className="mono text-[8px] uppercase tracking-wider opacity-70">{k.hint}</div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Prijs">
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mono flex-1 rounded-md border border-panel-border bg-background px-3 py-2 text-base font-black tabular-nums"
              />
              <button
                onClick={() => setPrice(currentPrice(symbol).toString())}
                className="mono shrink-0 rounded-md border border-panel-border px-3 py-2 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
              >
                = live
              </button>
            </div>
          </Field>

          {kind === "near" && (
            <Field label={`Trigger als binnen ${proxPct}% (= ± ${formatPrice(symbol, proximity)})`}>
              <input
                type="range" min={0.02} max={2} step={0.02}
                value={proxPct}
                onChange={(e) => setProxPct(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="mono flex justify-between text-[9px] text-muted-foreground">
                <span>0.02%</span><span>1%</span><span>2%</span>
              </div>
            </Field>
          )}

          <Field label="Notitie (optioneel)">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Entry mijn EURUSD long setup"
              className="w-full rounded-md border border-panel-border bg-background px-3 py-2 text-sm"
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-panel-border px-3 py-2">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            <span className="text-[12px]">Herhalend (blijft actief na trigger)</span>
          </label>

          <button
            onClick={submit}
            className="mono w-full rounded-lg bg-primary py-3 text-sm font-black uppercase tracking-wider text-primary-foreground shadow-lg hover:brightness-110"
          >
            🔔 Alarm activeren
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
