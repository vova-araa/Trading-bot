// Close an open MT5 position by its MetaApi position id.

import { createFileRoute } from "@tanstack/react-router";
import { resolveCreds, closePosition } from "@/lib/metaapi.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type Body = { token?: string; accountId?: string; region?: string; positionId?: string };

export const Route = createFileRoute("/api/broker/mt5/close")({
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
        if (!body.positionId) return json({ ok: false, error: "positionId ontbreekt" }, 400);

        const r = await closePosition(creds, body.positionId);
        if (!r.ok)
          return json({ ok: false, error: r.error ?? "sluiten geweigerd", status: r.status }, 502);
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
