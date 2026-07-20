// Store a browser's Web Push subscription so the server can notify it when the
// app is closed. Called by the client right after the user enables
// notifications (and a VAPID public key is configured).

import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type Body = {
  ownerKey?: string;
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  userAgent?: string;
};

export const Route = createFileRoute("/api/push/subscribe")({
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
        const owner = body.ownerKey;
        const sub = body.subscription;
        if (!owner || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
          return json({ ok: false, error: "missing fields" }, 400);
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as unknown as SupabaseClient;
          const { error } = await db.from("push_subscriptions").upsert(
            {
              owner_key: owner,
              endpoint: sub.endpoint,
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth,
              user_agent: body.userAgent ?? null,
            },
            { onConflict: "endpoint" },
          );
          if (error) throw new Error(error.message);
          return json({ ok: true });
        } catch (err) {
          console.error("[push-subscribe]", (err as Error).message);
          return json({ ok: false, error: "storage unavailable" }, 502);
        }
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
