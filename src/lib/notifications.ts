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
  }
  return ok;
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
  void getSwRegistration().then((reg) => {
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
  }).catch((err) => recordError("getSwRegistration", err));
}



