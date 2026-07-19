
-- Bots table
CREATE TABLE public.bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_key TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  symbol TEXT NOT NULL,
  running BOOLEAN NOT NULL DEFAULT false,
  deployed BOOLEAN NOT NULL DEFAULT false,
  pnl NUMERIC NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  last_tick_at TIMESTAMPTZ,
  last_action TEXT,
  last_action_at TIMESTAMPTZ,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bots_owner_idx ON public.bots (owner_key);
CREATE INDEX bots_deployed_idx ON public.bots (deployed) WHERE deployed = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bots TO authenticated;
GRANT ALL ON public.bots TO service_role;
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;

-- Permissive policies: personal dashboard, owner_key from browser
CREATE POLICY "public read bots" ON public.bots FOR SELECT USING (true);
CREATE POLICY "public write bots" ON public.bots FOR INSERT WITH CHECK (true);
CREATE POLICY "public update bots" ON public.bots FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete bots" ON public.bots FOR DELETE USING (true);

-- Bot alerts log
CREATE TABLE public.bot_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_key TEXT NOT NULL,
  bot_id UUID REFERENCES public.bots(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bot_alerts_owner_idx ON public.bot_alerts (owner_key, created_at DESC);
CREATE INDEX bot_alerts_bot_idx ON public.bot_alerts (bot_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_alerts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_alerts TO authenticated;
GRANT ALL ON public.bot_alerts TO service_role;
ALTER TABLE public.bot_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read alerts" ON public.bot_alerts FOR SELECT USING (true);
CREATE POLICY "public write alerts" ON public.bot_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "public update alerts" ON public.bot_alerts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete alerts" ON public.bot_alerts FOR DELETE USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER bots_touch_updated_at BEFORE UPDATE ON public.bots
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.bots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_alerts;
ALTER TABLE public.bots REPLICA IDENTITY FULL;
ALTER TABLE public.bot_alerts REPLICA IDENTITY FULL;
