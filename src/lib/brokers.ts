// Broker & platform integrations. Credentials are stored client-side,
// encrypted with the user's master password via WebCrypto (see broker-vault.ts).
// Real order routing requires a backend — until then, ARA validates the shape
// of each credential and pings the broker's public API to verify reachability.

export type BrokerField = {
  key: string;
  label: string;
  type?: "text" | "password";
  placeholder?: string;
  /** Optional regex; when set, the value must match to save. */
  pattern?: RegExp;
  patternHint?: string;
};

export type Broker = {
  id: string;
  name: string;
  logo: string;
  kind: "chart" | "forex" | "crypto" | "futures";
  desc: string;
  /** URL used by "Test verbinding" — a public unauthenticated endpoint that
   *  proves the broker's API host is reachable from this device. */
  pingUrl?: string;
  /** How to phrase where the user creates their API key. */
  keyLocation: string;
  fields: BrokerField[];
};

export const BROKERS: Broker[] = [
  {
    id: "tradingview",
    name: "TradingView",
    logo: "📊",
    kind: "chart",
    desc: "Ontvang ARA signalen via TradingView alerts webhook.",
    keyLocation: "TradingView → Alerts → Webhook URL",
    pingUrl: "https://www.tradingview.com/",
    fields: [
      { key: "webhook", label: "Webhook URL",
        placeholder: "https://webhook.tradingview.com/...",
        pattern: /^https?:\/\/.+/i,
        patternHint: "Moet beginnen met https://" },
    ],
  },
  {
    id: "ctrader",
    name: "cTrader",
    logo: "🅲",
    kind: "forex",
    desc: "Verbind je cTrader Open API account voor auto-execute op forex & CFDs.",
    keyLocation: "cTrader ID → Applications → Open API",
    pingUrl: "https://openapi.ctrader.com/",
    fields: [
      { key: "clientId", label: "Client ID", pattern: /^[0-9]{3,}$/, patternHint: "Alleen cijfers" },
      { key: "secret", label: "Client Secret", type: "password",
        pattern: /^.{20,}$/, patternHint: "Min. 20 tekens" },
      { key: "account", label: "Account #", pattern: /^[0-9]{4,}$/, patternHint: "Alleen cijfers" },
    ],
  },
  {
    id: "mt4",
    name: "MetaTrader 4",
    logo: "Ⓜ",
    kind: "forex",
    desc: "Koppel je MT4 account via MetaAPI bridge. EA leest signalen automatisch.",
    keyLocation: "metaapi.cloud → Accounts → Add MT4",
    pingUrl: "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/",
    fields: [
      { key: "login", label: "Login", pattern: /^[0-9]{4,}$/, patternHint: "Alleen cijfers" },
      { key: "password", label: "Investor / Trade Password", type: "password" },
      { key: "server", label: "Broker Server", placeholder: "ICMarkets-Live01",
        pattern: /^[A-Za-z0-9._-]{3,}$/, patternHint: "Bijv. ICMarkets-Live01" },
    ],
  },
  {
    id: "mt5",
    name: "MetaTrader 5",
    logo: "Ⓜ",
    kind: "forex",
    desc: "MT5 met futures, forex, indices en aandelen. Auto-execute via MetaAPI.",
    keyLocation: "metaapi.cloud → Accounts → Add MT5",
    pingUrl: "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/",
    fields: [
      { key: "login", label: "Login", pattern: /^[0-9]{4,}$/, patternHint: "Alleen cijfers" },
      { key: "password", label: "Investor / Trade Password", type: "password" },
      { key: "server", label: "Broker Server", placeholder: "MetaQuotes-Demo",
        pattern: /^[A-Za-z0-9._-]{3,}$/, patternHint: "Bijv. MetaQuotes-Demo" },
    ],
  },
  {
    id: "binance",
    name: "Binance Futures",
    logo: "🟡",
    kind: "crypto",
    desc: "USDT-M futures & spot. Zet IP whitelist aan voor extra veiligheid.",
    keyLocation: "Binance → API Management → Create API",
    pingUrl: "https://fapi.binance.com/fapi/v1/ping",
    fields: [
      { key: "apiKey", label: "API Key",
        pattern: /^[A-Za-z0-9]{40,}$/, patternHint: "64 tekens alfanumeriek" },
      { key: "secret", label: "API Secret", type: "password",
        pattern: /^[A-Za-z0-9]{40,}$/, patternHint: "64 tekens alfanumeriek" },
    ],
  },
  {
    id: "bybit",
    name: "Bybit",
    logo: "🟠",
    kind: "crypto",
    desc: "Perpetuals & spot. Genereer een API key met trade rechten.",
    keyLocation: "Bybit → API → Create New Key",
    pingUrl: "https://api.bybit.com/v5/market/time",
    fields: [
      { key: "apiKey", label: "API Key",
        pattern: /^[A-Za-z0-9]{16,}$/, patternHint: "Min. 16 tekens" },
      { key: "secret", label: "API Secret", type: "password",
        pattern: /^[A-Za-z0-9]{20,}$/, patternHint: "Min. 20 tekens" },
    ],
  },
];

const KEY = "ara-brokers-v1";
type State = Record<string, { connected: boolean; connectedAt?: number; lastTest?: { ok: boolean; at: number; latencyMs?: number; message?: string } }>;

function load(): State {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function save(s: State) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("ara-brokers-change"));
}

export function getBrokerState(): State { return load(); }

export function markConnected(id: string) {
  const s = load(); s[id] = { ...(s[id] ?? {}), connected: true, connectedAt: Date.now() }; save(s);
}
export function disconnectBroker(id: string) {
  const s = load(); delete s[id]; save(s);
}
export function recordTest(id: string, ok: boolean, latencyMs?: number, message?: string) {
  const s = load();
  s[id] = { ...(s[id] ?? { connected: false }), lastTest: { ok, at: Date.now(), latencyMs, message } };
  save(s);
}

/** Test broker reachability. Uses no-cors when needed; latency proves the
 *  host answered. Does not authenticate — that requires a signing backend. */
export async function testBroker(broker: Broker): Promise<{ ok: boolean; latencyMs?: number; message: string }> {
  if (!broker.pingUrl) return { ok: true, message: "Geen test endpoint — configuratie opgeslagen." };
  const start = performance.now();
  try {
    // Binance & Bybit endpoints support CORS; others fall back to no-cors ping.
    const cors = broker.id === "binance" || broker.id === "bybit";
    const res = await fetch(broker.pingUrl, {
      method: "GET",
      mode: cors ? "cors" : "no-cors",
      cache: "no-store",
    });
    const latency = Math.round(performance.now() - start);
    if (cors) {
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      return { ok: true, latencyMs: latency, message: `API bereikbaar (${latency}ms)` };
    }
    // no-cors returns opaque; if fetch didn't throw, host is reachable.
    return { ok: true, latencyMs: latency, message: `Host bereikbaar (${latency}ms)` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Netwerkfout" };
  }
}
