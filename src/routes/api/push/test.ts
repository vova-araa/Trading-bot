// Send a test Web Push to all of an owner's stored subscriptions. Use this to
// verify VAPID keys + delivery on a real device before wiring auto-triggers.
// Prunes subscriptions the push service reports as gone (404/410).

import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWebPush, type PushSubscription } from "@/lib/web-push.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type Row = { id: string; endpoint: string; p256dh: string; auth: string };

export const Route = createFileRoute("/api/push/test")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        let ownerKey = "";
        try {
          ownerKey = ((await request.json()) as { ownerKey?: string }).ownerKey ?? "";
        } catch {
          /* ignore */
        }
        if (!ownerKey) return json({ ok: false, error: "missing ownerKey" }, 400);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as unknown as SupabaseClient;
          const { data, error } = await db
            .from("push_subscriptions")
            .select("id, endpoint, p256dh, auth")
            .eq("owner_key", ownerKey);
          if (error) throw new Error(error.message);
          const rows = (data ?? []) as Row[];
          if (!rows.length) return json({ ok: false, error: "no subscriptions" }, 404);

          const payload = {
            title: "🔔 ARA TRADES — test",
            body: "Push werkt! Je krijgt nu meldingen, ook met de app dicht.",
            url: "/?tab=edge",
          };
          let sent = 0;
          for (const r of rows) {
            const sub: PushSubscription = { endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth };
            try {
              const status = await sendWebPush(sub, payload);
              if (status === 201 || status === 200) sent++;
              else if (status === 404 || status === 410) {
                await db.from("push_subscriptions").delete().eq("id", r.id);
              }
            } catch (e) {
              console.warn("[push-test] send failed", (e as Error).message);
            }
          }
          return json({ ok: true, sent, total: rows.length });
        } catch (err) {
          console.error("[push-test]", (err as Error).message);
          return json({ ok: false, error: (err as Error).message }, 502);
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
