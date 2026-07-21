// Client bridge to the real MT5 execution routes. Reads MetaApi creds from the
// encrypted vault (broker id "mt5") and forwards them to the server per call,
// so the token never lives in plaintext localStorage and never leaves over an
// unencrypted channel. The vault must be unlocked to trade.

import { hasCredentials, loadCredentials } from "./broker-vault";

export type Mt5Order = {
  symbol: string;
  side: "long" | "short";
  volume: number;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
};

export type Mt5Response = { ok: boolean; error?: string; result?: unknown };

/** True if MT5 credentials are saved (does not check the vault is unlocked). */
export function mt5Configured(): boolean {
  return hasCredentials("mt5");
}

async function creds(): Promise<{ token: string; accountId: string; region?: string } | null> {
  try {
    const c = await loadCredentials("mt5");
    if (!c?.token || !c?.accountId) return null;
    return { token: c.token, accountId: c.accountId, region: c.region || undefined };
  } catch {
    return null; // vault locked or decrypt failed
  }
}

async function post(path: string, body: Record<string, unknown>): Promise<Mt5Response> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Mt5Response;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Place a real market order on the connected MT5 account. */
export async function mt5PlaceOrder(order: Mt5Order): Promise<Mt5Response> {
  const c = await creds();
  if (!c)
    return {
      ok: false,
      error: "MT5 niet gekoppeld of vault vergrendeld — koppel via de Brokers-tab en ontgrendel.",
    };
  return post("/api/broker/mt5/order", { ...c, ...order });
}

/** Read live positions + account info from MT5. */
export async function mt5Positions(): Promise<{
  ok: boolean;
  error?: string;
  positions?: unknown[];
  account?: unknown;
}> {
  const c = await creds();
  if (!c) return { ok: false, error: "MT5 niet gekoppeld of vault vergrendeld." };
  try {
    const res = await fetch("/api/broker/mt5/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(c),
    });
    return (await res.json()) as {
      ok: boolean;
      error?: string;
      positions?: unknown[];
      account?: unknown;
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Close a position by its MetaApi position id. */
export async function mt5Close(positionId: string): Promise<Mt5Response> {
  const c = await creds();
  if (!c) return { ok: false, error: "MT5 niet gekoppeld of vault vergrendeld." };
  return post("/api/broker/mt5/close", { ...c, positionId });
}

/** Close every open MT5 position. Returns how many closed vs total. */
export async function mt5CloseAll(): Promise<{
  ok: boolean;
  closed: number;
  total: number;
  error?: string;
}> {
  const list = await mt5Positions();
  if (!list.ok) return { ok: false, closed: 0, total: 0, error: list.error };
  const rows = (list.positions as { id: string }[]) ?? [];
  let closed = 0;
  for (const p of rows) {
    const r = await mt5Close(p.id);
    if (r.ok) closed++;
  }
  return { ok: closed === rows.length, closed, total: rows.length };
}

/** Verify a candidate credential set (used by the Brokers card "Test verbinding"). */
export async function mt5TestConnection(values: {
  token: string;
  accountId: string;
  region?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/broker/mt5/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: values.token,
        accountId: values.accountId,
        region: values.region || undefined,
      }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      error?: string;
      positions?: unknown[];
      account?: { balance?: number; currency?: string } | null;
    };
    if (!data.ok) return { ok: false, message: data.error ?? "Verbinding mislukt" };
    const bal = data.account?.balance;
    const cur = data.account?.currency ?? "";
    const open = Array.isArray(data.positions) ? data.positions.length : 0;
    return {
      ok: true,
      message:
        bal != null
          ? `Verbonden — saldo ${bal} ${cur}, ${open} open positie(s)`
          : `Verbonden — ${open} open positie(s)`,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
