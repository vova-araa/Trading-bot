// Client-side encrypted vault for broker credentials.
// AES-GCM 256 with PBKDF2-SHA256 (200k iters). Master password is kept in
// sessionStorage only for the current tab session; ciphertext lives in
// localStorage. Even a full localStorage dump reveals nothing without the
// master password.
//
// This is a real cryptographic layer — but it is not a hardware vault:
// anything typed in a browser can be observed by that browser. For true
// server-side custody, connect Lovable Cloud and move secret storage there.

const LS_KEY = "ara-vault-v1";
const SS_KEY = "ara-vault-mk";
const SALT_KEY = "ara-vault-salt";
const ITER = 200_000;

type VaultBlob = Record<string, { iv: string; ct: string; savedAt: number }>;

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getSalt(): Uint8Array {
  let s = localStorage.getItem(SALT_KEY);
  if (!s) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    s = b64(salt); localStorage.setItem(SALT_KEY, s);
    return salt;
  }
  return fromB64(s);
}

async function deriveKey(password: string): Promise<CryptoKey> {
  const salt = getSalt();
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITER, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function loadBlob(): VaultBlob {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function saveBlob(v: VaultBlob) {
  localStorage.setItem(LS_KEY, JSON.stringify(v));
  window.dispatchEvent(new Event("ara-vault-change"));
}

/* ---- session master key management ---- */

let cachedKey: CryptoKey | null = null;

export function isUnlocked(): boolean {
  return cachedKey !== null || sessionStorage.getItem(SS_KEY) !== null;
}

export function isInitialized(): boolean {
  return localStorage.getItem(SALT_KEY) !== null && Object.keys(loadBlob()).length > 0;
}

export async function unlock(password: string): Promise<boolean> {
  const key = await deriveKey(password);
  // Verify by trying to decrypt any existing entry; if none exist, accept.
  const blob = loadBlob();
  const first = Object.values(blob)[0];
  if (first) {
    try {
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromB64(first.iv) as BufferSource },
        key,
        fromB64(first.ct) as BufferSource,
      );
    } catch {
      return false;
    }
  }
  cachedKey = key;
  sessionStorage.setItem(SS_KEY, password);
  window.dispatchEvent(new Event("ara-vault-change"));
  return true;
}

export function lock() {
  cachedKey = null;
  sessionStorage.removeItem(SS_KEY);
  window.dispatchEvent(new Event("ara-vault-change"));
}

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const p = sessionStorage.getItem(SS_KEY);
  if (!p) throw new Error("Vault vergrendeld — unlock eerst.");
  cachedKey = await deriveKey(p);
  return cachedKey;
}

/* ---- per-broker credential I/O ---- */

export async function saveCredentials(brokerId: string, creds: Record<string, string>): Promise<void> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(creds)),
  );
  const blob = loadBlob();
  blob[brokerId] = { iv: b64(iv), ct: b64(ct), savedAt: Date.now() };
  saveBlob(blob);
}

export async function loadCredentials(brokerId: string): Promise<Record<string, string> | null> {
  const entry = loadBlob()[brokerId];
  if (!entry) return null;
  const key = await getKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(entry.iv) as BufferSource },
    key,
    fromB64(entry.ct) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

export function removeCredentials(brokerId: string) {
  const blob = loadBlob(); delete blob[brokerId]; saveBlob(blob);
}

export function hasCredentials(brokerId: string): boolean {
  return !!loadBlob()[brokerId];
}

export function credentialsSavedAt(brokerId: string): number | undefined {
  return loadBlob()[brokerId]?.savedAt;
}
