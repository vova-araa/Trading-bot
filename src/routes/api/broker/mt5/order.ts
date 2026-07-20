// Place a REAL MT5 market order via MetaApi. Creds arrive in the body (from the
// user's encrypted vault) or fall back to server env. Read + trade only.

import { createFileRoute } from "@tanstack/react-router";
import { resolveCreds, placeOrder } from "@/lib/metaapi.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type Body = {
  token?: string;
  accountId?: string;
  region?: string;
  symbol?: string;
  side?: "long" | "short";
  volume?: number;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
};

export const Route = createFileRoute("/api/broker/mt5/order")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ ok: false, error: "bad json" }, 400);
        }
        const creds = resolveCreds(body);
        if (!creds) return json({ ok: false, error: "MetaApi token/account ontbreekt" }, 400);
        if (!body.symbol || !body.side || !body.volume || body.volume <= 0) {
          return json({ ok: false, error: "symbol, side en volume zijn verplicht" }, 400);
        }

        const r = await placeOrder(creds, {
          symbol: body.symbol,
          side: body.side,
          volume: body.volume,
          stopLoss: body.stopLoss,
          takeProfit: body.takeProfit,
          comment: body.comment,
        });
        if (!r.ok)
          return json({ ok: false, error: r.error ?? "order geweigerd", status: r.status }, 502);
        return json({ ok: true, result: r.data });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
