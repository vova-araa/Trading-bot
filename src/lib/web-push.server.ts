// Web Push sender (VAPID + aes128gcm), implemented with Web Crypto so it runs on
// Cloudflare Workers with no Node deps. Follows RFC 8291 (encryption) + RFC 8292
// (VAPID). Requires env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (base64url), and
// VAPID_SUBJECT (mailto: or https URL).
//
// NOTE: this path could not be verified in the build sandbox (push endpoints are
// unreachable there). Generate a VAPID keypair, set the env vars, and test on a
// real device via /api/push/test.

export type PushSubscription = { endpoint: string; p256dh: string; auth: string };

// Own an ArrayBuffer (never Shared) so Web Crypto's BufferSource params accept it.
type Bytes = Uint8Array<ArrayBuffer>;

function b64urlToBytes(s: string): Bytes {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs: Uint8Array[]): Bytes {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
const utf8 = (s: string): Bytes => {
  const b = new TextEncoder().encode(s);
  return new Uint8Array(b); // re-wrap to guarantee an ArrayBuffer backing
};

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// Build the VAPID Authorization header for a push endpoint origin.
async function vapidAuth(audience: string): Promise<string> {
  const pub = process.env.VAPID_PUBLIC_KEY!;
  const priv = process.env.VAPID_PRIVATE_KEY!;
  const sub = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  const pubBytes = b64urlToBytes(pub); // 65 bytes, 0x04||X||Y
  const x = bytesToB64url(pubBytes.slice(1, 33));
  const y = bytesToB64url(pubBytes.slice(33, 65));
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x, y, d: priv, ext: true };
  const signKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = bytesToB64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    utf8(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signKey,
    utf8(signingInput),
  );
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${pub}`;
}

// Encrypt a payload for a subscription using aes128gcm (RFC 8291/8188).
async function encrypt(payload: Bytes, p256dh: string, auth: string): Promise<{ body: Bytes }> {
  const uaPublic = b64urlToBytes(p256dh); // 65 bytes
  const authSecret = b64urlToBytes(auth); // 16 bytes

  // Ephemeral ECDH keypair (application server).
  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256),
  );

  // IKM = HKDF(salt=auth, ikm=ecdhSecret, info="WebPush: info"\0 || uaPub || asPub)
  const keyInfo = concat(utf8("WebPush: info"), new Uint8Array([0]), uaPublic, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    concat(utf8("Content-Encoding: aes128gcm"), new Uint8Array([0])),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    concat(utf8("Content-Encoding: nonce"), new Uint8Array([0])),
    12,
  );

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  // Last (and only) record: append the 0x02 delimiter, no extra padding.
  const plaintext = concat(payload, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext),
  );

  // aes128gcm header: salt(16) || rs(4, uint32 BE) || idlen(1) || keyid(asPub 65)
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  const idlen = new Uint8Array([asPublicRaw.length]);
  const body = concat(salt, rs, idlen, asPublicRaw, ciphertext);
  return { body };
}

/** Send one Web Push message. Returns the HTTP status from the push service. */
export async function sendWebPush(
  sub: PushSubscription,
  payload: unknown,
  ttl = 60,
): Promise<number> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error("VAPID keys not configured");
  }
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const auth = await vapidAuth(audience);
  const { body } = await encrypt(utf8(JSON.stringify(payload)), sub.p256dh, sub.auth);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
    },
    body,
  });
  return res.status; // 201 = accepted; 404/410 = gone (prune the sub)
}
