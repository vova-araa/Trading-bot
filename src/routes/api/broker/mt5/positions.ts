// Read live MT5 positions + account information via MetaApi. Doubles as the
// "Test verbinding" check for the MT5 broker card (proves token + account are
// valid and the account is deployed & connected).

import { createFileRoute } from "@tanstack/react-router";
import { resolveCreds, getPositions, getAccountInformation } from "@/lib/metaapi.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type Body = { token?: string; accountId?: string; region?: string };

export const Route = createFileRoute("/api/broker/mt5/positions")({
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

        const [pos, acc] = await Promise.all([getPositions(creds), getAccountInformation(creds)]);
        if (!pos.ok)
          return json(
            { ok: false, error: pos.error ?? "kan posities niet ophalen", status: pos.status },
            502,
          );
        return json({
          ok: true,
          positions: pos.data ?? [],
          account: acc.ok ? acc.data : null,
        });
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
