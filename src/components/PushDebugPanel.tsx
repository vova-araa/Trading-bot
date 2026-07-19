import { useEffect, useState } from "react";
import {
  clearDiagnostics,
  getDeliveries,
  getErrors,
  onDiagChange,
  snapshotServiceWorker,
  type DeliveryEntry,
  type ErrorEntry,
  type SwSnapshot,
} from "@/lib/push-diagnostics";
import { pushSignal } from "@/lib/notifications";
import { registerAraServiceWorker } from "@/lib/pwa";

function fmt(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString() + " · " + d.toLocaleDateString();
}
function ago(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s geleden`;
  if (s < 3600) return `${Math.floor(s / 60)}m geleden`;
  if (s < 86400) return `${Math.floor(s / 3600)}u geleden`;
  return `${Math.floor(s / 86400)}d geleden`;
}

export function PushDebugPanel() {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<SwSnapshot | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryEntry[]>([]);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setSnap(await snapshotServiceWorker());
    setDeliveries(getDeliveries());
    setErrors(getErrors());
    setRefreshing(false);
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
    const off = onDiagChange(() => {
      setDeliveries(getDeliveries());
      setErrors(getErrors());
    });
    const t = setInterval(() => { void refresh(); }, 5000);
    return () => { off(); clearInterval(t); };
  }, [open]);

  const last = deliveries[0];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-40 rounded-full border border-white/15 bg-black/70 px-3 py-2 text-[11px] font-semibold text-white/80 backdrop-blur hover:bg-black/90"
        title="Push & Service Worker debug"
      >
        🩺 Push debug
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0b0f14] p-4 text-white sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Push & Service Worker</h2>
                <p className="text-[11px] text-white/50">Diagnose van je notificatie-pipeline.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-xl leading-none">×</button>
            </div>

            <section className="mb-4 space-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
              <Row k="Service worker" v={<Pill on={!!snap?.registered} label={snap?.registered ? (snap?.state || "actief") : "niet geregistreerd"} />} />
              <Row k="Beheert deze pagina" v={<Pill on={!!snap?.controller} label={snap?.controller ? "ja" : "nee"} />} />
              <Row k="Notificatie-permissie" v={<Pill on={snap?.permission === "granted"} label={String(snap?.permission ?? "…")} />} />
              <Row k="Push API" v={<Pill on={!!snap?.pushSupported} label={snap?.pushSupported ? (snap.pushSubscribed ? "geabonneerd" : "geen abonnement") : "niet ondersteund"} />} />
              <Row k="Installed / standalone" v={<Pill on={!!snap?.standalone} label={snap?.standalone ? "PWA" : "browser tab"} />} />
              {snap?.scriptURL && (
                <Row k="Script" v={<span className="mono truncate text-[10px] text-white/50">{snap.scriptURL.replace(location.origin, "")}</span>} />
              )}
              {snap?.scope && (
                <Row k="Scope" v={<span className="mono text-[10px] text-white/50">{snap.scope.replace(location.origin, "") || "/"}</span>} />
              )}
              <Row
                k="Laatste levering"
                v={last ? <span className="text-white/80">{ago(last.ts)} <span className="text-white/40">· {last.via}</span></span> : <span className="text-white/40">nog geen</span>}
              />
            </section>

            <div className="mb-4 grid grid-cols-3 gap-2">
              <button
                onClick={() => refresh()}
                disabled={refreshing}
                className="rounded-lg bg-white/10 py-2 text-xs font-semibold hover:bg-white/15 disabled:opacity-50"
              >
                {refreshing ? "Ververst…" : "Ververs"}
              </button>
              <button
                onClick={async () => {
                  await registerAraServiceWorker();
                  await refresh();
                }}
                className="rounded-lg bg-white/10 py-2 text-xs font-semibold hover:bg-white/15"
              >
                Registreer SW
              </button>
              <button
                onClick={() => pushSignal("ARA test", "Testmelding uit debug-paneel", `debug-${Date.now()}`, { kind: "other", priority: "low" })}
                className="rounded-lg bg-primary text-primary-foreground py-2 text-xs font-semibold"
              >
                🔔 Test push
              </button>
            </div>

            <section className="mb-4">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold">Recente leveringen</span>
                <span className="text-white/40">{deliveries.length}</span>
              </div>
              <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02] text-xs">
                {deliveries.length === 0 && <li className="p-3 text-white/40">Nog niets afgeleverd.</li>}
                {deliveries.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 p-2">
                    <span className="mt-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-white/60">{d.kind}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{d.title}</div>
                      <div className="text-[10px] text-white/40">{fmt(d.ts)} · via {d.via}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mb-2">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold">Fouten</span>
                <span className="text-white/40">{errors.length}</span>
              </div>
              <ul className="divide-y divide-white/5 rounded-xl border border-red-500/20 bg-red-500/5 text-xs">
                {errors.length === 0 && <li className="p-3 text-white/40">Geen fouten geregistreerd. ✅</li>}
                {errors.map((e, i) => (
                  <li key={i} className="p-2">
                    <div className="text-red-300">{e.message}</div>
                    <div className="text-[10px] text-white/40">{fmt(e.ts)} · {e.where}</div>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-3 flex justify-end">
              <button onClick={clearDiagnostics} className="text-[11px] text-white/50 underline">Wis geschiedenis</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/60">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
function Pill({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${on ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60"}`}>
      {on ? "●" : "○"} {label}
    </span>
  );
}
