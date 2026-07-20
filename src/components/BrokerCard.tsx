import { useEffect, useState } from "react";
import {
  BROKERS, disconnectBroker, getBrokerState, markConnected, recordTest, testBroker,
  type Broker,
} from "@/lib/brokers";
import {
  hasCredentials, isUnlocked, loadCredentials, lock, removeCredentials,
  saveCredentials, unlock,
} from "@/lib/broker-vault";
import { TradingViewWebhookCard } from "@/components/TradingViewWebhookCard";

export function BrokerList() {
  const [state, setState] = useState(() => getBrokerState());
  const [unlocked, setUnlocked] = useState(() => isUnlocked());
  const [showUnlock, setShowUnlock] = useState(false);

  useEffect(() => {
    const sync = () => { setState(getBrokerState()); setUnlocked(isUnlocked()); };
    window.addEventListener("ara-brokers-change", sync);
    window.addEventListener("ara-vault-change", sync);
    return () => {
      window.removeEventListener("ara-brokers-change", sync);
      window.removeEventListener("ara-vault-change", sync);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <TradingViewWebhookCard />
      <div className="panel px-3 py-2.5">
        <div className="mono text-[10px] uppercase tracking-widest text-primary">
          Zo werkt koppelen
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          <b className="text-bull">Marktdata</b> is live gekoppeld (Yahoo/Stooq).{" "}
          <b className="text-foreground">TradingView</b> voert automatisch uit via de webhook
          hierboven — jouw gedeployde bots pikken elk alert op.{" "}
          <b className="text-bull">MetaTrader 5</b> voert nu <b>echte orders</b> uit: koppel je
          MetaApi-token hieronder, en in de chart-order-ticket zet je met <b>⚡ Echt · MT5</b> een
          live order (read + trade, geen withdraw). cTrader/MT4 slaan de keys versleuteld op; hun
          executie loopt via de webhook-route.
        </p>
      </div>
      <VaultBar unlocked={unlocked} onUnlockClick={() => setShowUnlock(true)} onLock={lock} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BROKERS.map((b) => (
          <BrokerCard
            key={b.id}
            broker={b}
            connected={!!state[b.id]?.connected}
            lastTest={state[b.id]?.lastTest}
            unlocked={unlocked}
            onNeedUnlock={() => setShowUnlock(true)}
          />
        ))}
      </div>
      {showUnlock && (
        <UnlockModal
          onClose={() => setShowUnlock(false)}
          onUnlocked={() => { setShowUnlock(false); setUnlocked(true); }}
        />
      )}
    </div>
  );
}

function VaultBar({ unlocked, onUnlockClick, onLock }: { unlocked: boolean; onUnlockClick: () => void; onLock: () => void }) {
  return (
    <div className="panel flex items-center gap-3 px-3 py-2.5">
      <span className="text-xl">{unlocked ? "🔓" : "🔒"}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-black">
          {unlocked ? "Vault ontgrendeld" : "Vault vergrendeld"}
        </div>
        <div className="text-[10px] text-muted-foreground">
          API keys worden lokaal versleuteld met AES-256-GCM + PBKDF2 (200k iters). Alleen jouw master-wachtwoord kan ze ontsleutelen.
        </div>
      </div>
      <button
        onClick={unlocked ? onLock : onUnlockClick}
        className={`mono shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
          unlocked ? "bg-bear/15 text-bear hover:bg-bear/25" : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
      >
        {unlocked ? "Lock" : "Unlock"}
      </button>
    </div>
  );
}

function UnlockModal({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setErr("Min. 8 tekens."); return; }
    setBusy(true); setErr(null);
    const ok = await unlock(pw);
    setBusy(false);
    if (!ok) { setErr("Wachtwoord komt niet overeen met bestaande vault."); return; }
    onUnlocked();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="panel w-full max-w-sm p-5">
        <div className="mb-1 text-lg font-black">🔐 Master wachtwoord</div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Kies één sterk wachtwoord om al je broker API keys te versleutelen. ARA slaat het <b>nooit</b> op; alleen jij kent het. Vergeet je het? Je moet elke broker opnieuw koppelen.
        </p>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Min. 8 tekens"
          className="mono w-full rounded-md border border-panel-border bg-background px-3 py-2 text-[12px] outline-none focus:border-primary/60"
        />
        {err && <div className="mt-2 text-[11px] text-bear">{err}</div>}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onClose} className="mono flex-1 rounded-md border border-panel-border py-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
            Annuleer
          </button>
          <button type="submit" disabled={busy} className="mono flex-1 rounded-md bg-primary py-2 text-[11px] font-black uppercase tracking-wider text-primary-foreground disabled:opacity-50">
            {busy ? "…" : "Ontgrendel"}
          </button>
        </div>
      </form>
    </div>
  );
}

type TestState = { ok: boolean; at: number; latencyMs?: number; message?: string } | undefined;

function BrokerCard({
  broker, connected, lastTest, unlocked, onNeedUnlock,
}: { broker: Broker; connected: boolean; lastTest: TestState; unlocked: boolean; onNeedUnlock: () => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  const kindLabel: Record<Broker["kind"], string> = {
    chart: "Charts", forex: "Forex", crypto: "Crypto", futures: "Futures",
  };

  async function openEditor() {
    if (!unlocked) { onNeedUnlock(); return; }
    if (hasCredentials(broker.id)) {
      try {
        const c = await loadCredentials(broker.id);
        if (c) setValues(c);
      } catch { /* ignore */ }
    } else {
      setValues({});
    }
    setOpen(true);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const f of broker.fields) {
      const v = (values[f.key] ?? "").trim();
      if (!v) {
        if (!f.optional) errs[f.key] = "Verplicht";
      } else if (f.pattern && !f.pattern.test(v)) {
        errs[f.key] = f.patternHint ?? "Ongeldig formaat";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onTest() {
    if (!validate()) return;
    setTesting(true); setFlash(null);
    // MT5 does a real MetaApi round-trip (account info) — proves the token,
    // account id and deployment are actually live, not just host reachability.
    if (broker.id === "mt5") {
      const { mt5TestConnection } = await import("@/lib/mt5");
      const r = await mt5TestConnection({
        token: values.token ?? "",
        accountId: values.accountId ?? "",
        region: values.region,
      });
      setTesting(false);
      recordTest(broker.id, r.ok, undefined, r.message);
      setFlash({ ok: r.ok, msg: r.message });
      return;
    }
    const r = await testBroker(broker);
    setTesting(false);
    recordTest(broker.id, r.ok, r.latencyMs, r.message);
    setFlash({ ok: r.ok, msg: r.message });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await saveCredentials(broker.id, values);
      markConnected(broker.id);
      setOpen(false);
      setFlash(null);
    } catch (err) {
      setFlash({ ok: false, msg: err instanceof Error ? err.message : "Opslaan mislukt" });
    }
    setSaving(false);
  }

  function onDisconnect() {
    removeCredentials(broker.id);
    disconnectBroker(broker.id);
    setValues({}); setOpen(false);
  }

  return (
    <div className={`panel overflow-hidden ${connected ? "ring-1 ring-bull/60" : ""}`}>
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-panel-border/40 text-2xl">
          {broker.logo}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black">{broker.name}</span>
            <span className="mono rounded bg-panel-border/50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
              {kindLabel[broker.kind]}
            </span>
          </div>
          <div className="line-clamp-2 text-[11px] text-muted-foreground">{broker.desc}</div>
          {lastTest && (
            <div className={`mono mt-1 text-[10px] ${lastTest.ok ? "text-bull" : "text-bear"}`}>
              {lastTest.ok ? "✓" : "✕"} laatste test: {lastTest.message}
              {lastTest.latencyMs !== undefined && ` · ${lastTest.latencyMs}ms`}
            </div>
          )}
        </div>
        {connected && <span className="mono shrink-0 text-[10px] font-black text-bull">🔒 GEKOPPELD</span>}
      </div>

      {open && (
        <form onSubmit={onSave} className="grid gap-2 border-t border-panel-border/60 bg-panel-border/20 p-3">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            💡 Vind je keys hier: <span className="text-foreground">{broker.keyLocation}</span>
          </div>
          {broker.fields.map((f) => (
            <label key={f.key} className="grid gap-1">
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{f.label}</span>
              <input
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
                className={`mono rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary/60 ${
                  errors[f.key] ? "border-bear/60" : "border-panel-border"
                }`}
              />
              {errors[f.key] && <span className="mono text-[10px] text-bear">{errors[f.key]}</span>}
            </label>
          ))}

          {flash && (
            <div className={`mono rounded-md border px-2 py-1.5 text-[11px] ${
              flash.ok ? "border-bull/50 bg-bull/10 text-bull" : "border-bear/50 bg-bear/10 text-bear"
            }`}>
              {flash.ok ? "✓" : "✕"} {flash.msg}
            </div>
          )}

          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={onTest}
              disabled={testing}
              className="mono flex-1 rounded-md border border-panel-border bg-background py-2 text-[11px] font-black uppercase tracking-wider text-foreground hover:border-primary/50 disabled:opacity-50"
            >
              {testing ? "Testen…" : "🛰 Test verbinding"}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="mono flex-1 rounded-md bg-primary py-2 text-[11px] font-black uppercase tracking-wider text-primary-foreground disabled:opacity-50"
            >
              {saving ? "…" : connected ? "Bijwerken" : "🔒 Versleutel & koppel"}
            </button>
          </div>

          <p className="mono text-[9px] text-muted-foreground">
            Keys worden versleuteld met je master-wachtwoord en blijven op dit apparaat. Zet <b>read + trade</b> aan, laat <b>withdraw</b> uit, en whitelist je IP indien mogelijk.
          </p>
        </form>
      )}

      <div className="flex border-t border-panel-border/60">
        <button
          onClick={openEditor}
          className={`mono flex-1 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
            connected ? "bg-panel-border/20 text-foreground hover:bg-panel-border/40" : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {connected ? "⚙ Beheer" : open ? "Sluit" : "+ Verbind account"}
        </button>
        {connected && (
          <button
            onClick={onDisconnect}
            className="mono border-l border-panel-border/60 bg-bear/10 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-bear hover:bg-bear/20"
          >
            Ontkoppel
          </button>
        )}
      </div>
    </div>
  );
}
