// MetaApi (metaapi.cloud) bridge — REAL MT5 order execution over REST. No Node
// deps, so it runs on Cloudflare Workers. Talks to MetaApi's client REST API,
// which relays orders to your provisioned MT5 account at your broker.
//
// Auth model: the MetaApi token + account id come EITHER from the request body
// (forwarded from the user's encrypted broker vault, per call over HTTPS) OR
// from server env (METAAPI_TOKEN / METAAPI_ACCOUNT_ID / METAAPI_REGION). Body
// wins so a signed-in user can trade their own account without a redeploy.
//
// Scope: read + trade only. It never requests withdrawals. Because MetaApi is a
// paid third-party service whose hosts are unreachable from the build sandbox,
// this path is not exercised in CI — set a token and test on a live/demo MT5.

export type MetaCreds = { token: string; accountId: string; region: string };

export type OrderInput = {
  symbol: string;
  side: "long" | "short";
  volume: number; // lots
  stopLoss?: number; // absolute price
  takeProfit?: number; // absolute price
  comment?: string;
};

export type MetaResult<T = unknown> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
};

/** Resolve creds from a request body, falling back to server env. */
export function resolveCreds(body: {
  token?: string;
  accountId?: string;
  region?: string;
}): MetaCreds | null {
  const token = (body.token || process.env.METAAPI_TOKEN || "").trim();
  const accountId = (body.accountId || process.env.METAAPI_ACCOUNT_ID || "").trim();
  const region = (body.region || process.env.METAAPI_REGION || "new-york").trim();
  if (!token || !accountId) return null;
  return { token, accountId, region };
}

function clientBase(region: string): string {
  return `https://mt-client-api-v1.${region}.agiliumtrade.ai`;
}

async function metaFetch<T = unknown>(
  creds: MetaCreds,
  path: string,
  init?: RequestInit,
): Promise<MetaResult<T>> {
  const url = `${clientBase(creds.region)}/users/current/accounts/${creds.accountId}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "auth-token": creds.token,
        "content-type": "application/json",
        accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      if (parsed && typeof parsed === "object") {
        const o = parsed as { message?: unknown; error?: unknown };
        if (o.message) msg = String(o.message);
        else if (o.error) msg = String(o.error);
      } else if (typeof parsed === "string" && parsed) {
        msg = parsed;
      }
      return { ok: false, status: res.status, error: msg, data: parsed as T };
    }
    return { ok: true, status: res.status, data: parsed as T };
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message || "network error" };
  }
}

/** Place a market order with optional SL/TP. */
export async function placeOrder(
  creds: MetaCreds,
  input: OrderInput,
): Promise<
  MetaResult<{ orderId?: string; positionId?: string; numericCode?: number; message?: string }>
> {
  const body: Record<string, unknown> = {
    actionType: input.side === "long" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL",
    symbol: input.symbol,
    volume: input.volume,
    comment: (input.comment || "ARA").slice(0, 26),
  };
  if (input.stopLoss && input.stopLoss > 0) body.stopLoss = input.stopLoss;
  if (input.takeProfit && input.takeProfit > 0) body.takeProfit = input.takeProfit;
  return metaFetch(creds, "/trade", { method: "POST", body: JSON.stringify(body) });
}

/** Close an open position by its MetaApi position id. */
export async function closePosition(creds: MetaCreds, positionId: string): Promise<MetaResult> {
  return metaFetch(creds, "/trade", {
    method: "POST",
    body: JSON.stringify({ actionType: "POSITION_CLOSE_ID", positionId }),
  });
}

export async function getPositions(creds: MetaCreds): Promise<MetaResult<unknown[]>> {
  return metaFetch(creds, "/positions", { method: "GET" });
}

export async function getAccountInformation(creds: MetaCreds): Promise<MetaResult> {
  return metaFetch(creds, "/account-information", { method: "GET" });
}
