// Preference: require confirmation before taking a trade from a notification.
const KEY = "ara.trade-confirm.v1";
const EVT = "ara-trade-confirm-change";

export function getConfirmTrade(): boolean {
  if (typeof window === "undefined") return true; // safe default
  const raw = localStorage.getItem(KEY);
  if (raw == null) return true;
  return raw === "1";
}

export function setConfirmTrade(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVT));
}

export function onConfirmTradeChange(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}
