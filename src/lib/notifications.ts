// Browser Notification API wrapper — fires push-style notifications for new signals.
// Full 24/7 background push needs a service worker; this covers the tab-open case
// and gives users a real system notification prompt.

const KEY = "ara-notify-enabled-v1";

export function notifyPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function notifyEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1" && notifyPermission() === "granted";
}

export async function enableNotifications(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  const ok = perm === "granted";
  localStorage.setItem(KEY, ok ? "1" : "0");
  window.dispatchEvent(new Event("ara-notify-change"));
  if (ok) {
    new Notification("ARA TRADES", {
      body: "Push notificaties staan aan. Je krijgt een seintje bij nieuwe trade signalen.",
      icon: "/favicon.ico",
      tag: "ara-welcome",
    });
    void subscribePush(); // register for background push if VAPID is configured
  }
  return ok;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Subscribe this device for background Web Push (needs VITE_VAPID_PUBLIC_KEY). */
export async function subscribePush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapid) return false; // no keys configured → in-app notifications only
  try {
    const reg = await getSwRegistration();
    if (!reg) return false;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      }));
    const { ownerKey } = await import("./bot-sync");
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerKey: ownerKey(),
        subscription: sub.toJSON(),
        userAgent: navigator.userAgent,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[push] subscribe failed", (err as Error).message);
    return false;
  }
}

/** Fire a test push to this device's subscriptions (via the server). */
export async function sendTestPush(): Promise<{ ok: boolean; sent?: number; error?: string }> {
  try {
    const { ownerKey } = await import("./bot-sync");
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerKey: ownerKey() }),
    });
    return (await res.json()) as { ok: boolean; sent?: number; error?: string };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function disableNotifications() {
  localStorage.setItem(KEY, "0");
  window.dispatchEvent(new Event("ara-notify-change"));
}

import { shouldNotify, type NotifyKind } from "./notify-prefs";
import { playAlert } from "./alert-sound";

import { getSwRegistration } from "./pwa";
import { recordDelivery, recordError } from "./push-diagnostics";

export function pushSignal(
  title: string,
  body: string,
  tag?: string,
  opts?: {
    kind?: NotifyKind;
    symbol?: string;
    url?: string;
    setupId?: string;
    /** Skip the default kind-based sound (caller already played a per-alert sound). */
    silent?: boolean;
    /** "high" → requireInteraction + no auto-dismiss on the OS. */
    priority?: "low" | "normal" | "high";
  },
) {
  if (!notifyEnabled()) return;
  const kind = opts?.kind ?? "other";
  if (!shouldNotify(kind, opts?.symbol)) return;
  if (!opts?.silent) playAlert(kind);

  const isTradeSignal = kind === "entry" || kind === "pump";
  const url = opts?.url ?? (opts?.setupId ? `/trade/${opts.setupId}` : "/");
  const actions = isTradeSignal
    ? [
        { action: "take", title: "🎯 Neem trade" },
        { action: "skip", title: "Skip" },
      ]
    : undefined;

  // Prefer the service worker (works when tab is backgrounded / PWA closed
  // and supports action buttons). Fall back to a plain Notification.
  void getSwRegistration()
    .then((reg) => {
      if (reg?.active) {
        try {
          reg.active.postMessage({
            type: "SHOW_NOTIFICATION",
            payload: { title, body, tag, url, actions, priority: opts?.priority ?? "normal" },
          });
          recordDelivery({ title, kind, via: "sw" });
        } catch (err) {
          recordError("sw.postMessage", err);
        }
        return;
      }
      try {
        new Notification(title, {
          body,
          icon: "/icon-192.png",
          tag,
          badge: "/icon-192.png",
          requireInteraction: opts?.priority === "high",
        });
        recordDelivery({ title, kind, via: "fallback" });
      } catch (err) {
        recordError("Notification()", err);
      }
    })
    .catch((err) => recordError("getSwRegistration", err));
}
