-- Web Push subscriptions (for notifications when the app/PWA is fully closed).
-- One row per browser/device endpoint, keyed by the device owner_key so the
-- server can look up who to notify.
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_key TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_push_at TIMESTAMPTZ
);
CREATE INDEX push_subscriptions_owner_idx ON public.push_subscriptions (owner_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Personal dashboard: owner_key comes from the browser. Permissive policies.
CREATE POLICY "public read push subs" ON public.push_subscriptions FOR SELECT USING (true);
CREATE POLICY "public write push subs" ON public.push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "public update push subs" ON public.push_subscriptions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete push subs" ON public.push_subscriptions FOR DELETE USING (true);
