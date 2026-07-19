// Guarded service-worker registration for ARA TRADES.
// Registers only in the published production app — never in Lovable
// preview, dev, or inside iframes. Follows the Lovable PWA skill rules.

const SW_PATH = "/sw.js";

function isBlockedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.top && window.top !== window.self) return true;
  } catch { return true; /* cross-origin frame */ }
  const host = window.location.hostname;
  const url = new URL(window.location.href);
  if (url.searchParams.get("sw") === "off") return true;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  return false;
}

async function unregisterMatching() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => r.active?.scriptURL?.endsWith(SW_PATH))
      .map((r) => r.unregister())
  );
}

let registered = false;

export async function registerAraServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  if (isBlockedContext()) {
    await unregisterMatching();
    return null;
  }
  if (registered) {
    const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
    return existing ?? null;
  }
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    registered = true;
    return reg;
  } catch (err) {
    console.warn("[sw] register failed", err);
    return null;
  }
}

export async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration(SW_PATH)) ?? null;
}

// True when the app is running as an installed PWA / standalone window.
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  // iOS Safari
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mm || iosStandalone);
}
