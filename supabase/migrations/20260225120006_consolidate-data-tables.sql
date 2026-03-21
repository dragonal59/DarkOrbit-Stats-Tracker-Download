-- Consolidation : user_events, user_settings, booster_predictions (src/backend/supabase-schema-data.sql)
-- user_sessions créé par session-limits-rpc-and-rls / RUN_MIGRATIONS_SESSION_LIMITS

CREATE TABLE IF NOT EXISTS public.user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id TEXT,
  event_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_user_events_user ON public.user_events(user_id);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can CRUD own events" ON public.user_events;
CREATE POLICY "Users can CRUD own events" ON public.user_events FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings_json JSONB NOT NULL DEFAULT '{}',
  links_json JSONB DEFAULT '[]',
  booster_config_json JSONB DEFAULT '{}',
  current_stats_json JSONB DEFAULT '{}',
  theme TEXT DEFAULT 'dark',
  view_mode TEXT DEFAULT 'detailed',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can CRUD own settings" ON public.user_settings;
CREATE POLICY "Users can CRUD own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.booster_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prediction_date DATE NOT NULL,
  actual_date DATE NOT NULL,
  predicted_type TEXT,
  actual_type TEXT,
  accuracy BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booster_predictions_user ON public.booster_predictions(user_id);

ALTER TABLE public.booster_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can CRUD own predictions" ON public.booster_predictions;
CREATE POLICY "Users can CRUD own predictions" ON public.booster_predictions FOR ALL USING (auth.uid() = user_id);
