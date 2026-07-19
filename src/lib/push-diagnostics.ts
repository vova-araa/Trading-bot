// Tracks recent push/notification activity for the debug panel.

export type DeliveryEntry = {
  ts: number;
  title: string;
  kind: string;
  via: "sw" | "fallback";
};

export type ErrorEntry = { ts: number; where: string; message: string };

const KEY_DELIV = "ara.push.deliveries.v1";
const KEY_ERR = "ara.push.errors.v1";
const EVT = "ara-push-diag-change";
const MAX = 20;

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key) || "[]") as T[]; } catch { return []; }
}
function write<T>(key: string, list: T[]) {
  localStorage.setItem(key, JSON.stringify(list.slice(0, MAX)));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function recordDelivery(e: Omit<DeliveryEntry, "ts">) {
  if (typeof window === "undefined") return;
  const list = read<DeliveryEntry>(KEY_DELIV);
  list.unshift({ ts: Date.now(), ...e });
  write(KEY_DELIV, list);
}

export function recordError(where: string, err: unknown) {
  if (typeof window === "undefined") return;
  const list = read<ErrorEntry>(KEY_ERR);
  list.unshift({
    ts: Date.now(),
    where,
    message: err instanceof Error ? err.message : String(err),
  });
  write(KEY_ERR, list);
}

export function getDeliveries(): DeliveryEntry[] { return read<DeliveryEntry>(KEY_DELIV); }
export function getErrors(): ErrorEntry[] { return read<ErrorEntry>(KEY_ERR); }

export function clearDiagnostics() {
  localStorage.removeItem(KEY_DELIV);
  localStorage.removeItem(KEY_ERR);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function onDiagChange(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

export type SwSnapshot = {
  supported: boolean;
  registered: boolean;
  scope?: string;
  scriptURL?: string;
  state?: string;             // installing/waiting/active state of controller
  controller: boolean;        // page controlled by SW
  pushSupported: boolean;
  pushSubscribed: boolean;
  permission: NotificationPermission | "unsupported";
  standalone: boolean;
};

export async function snapshotServiceWorker(): Promise<SwSnapshot> {
  const permission: NotificationPermission | "unsupported" =
    typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const standalone = typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  if (!supported) {
    return { supported: false, registered: false, controller: false, pushSupported: false, pushSubscribed: false, permission, standalone };
  }
  const reg = (await navigator.serviceWorker.getRegistration("/sw.js")) ||
    (await navigator.serviceWorker.getRegistration());
  const worker = reg?.active || reg?.waiting || reg?.installing || null;
  const pushSupported = typeof window !== "undefined" && "PushManager" in window;
  let pushSubscribed = false;
  if (reg && pushSupported) {
    try { pushSubscribed = !!(await reg.pushManager.getSubscription()); } catch { pushSubscribed = false; }
  }
  return {
    supported: true,
    registered: !!reg,
    scope: reg?.scope,
    scriptURL: worker?.scriptURL,
    state: worker?.state,
    controller: !!navigator.serviceWorker.controller,
    pushSupported,
    pushSubscribed,
    permission,
    standalone,
  };
}
