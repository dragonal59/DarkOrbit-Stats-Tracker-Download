-- ==========================================
-- SCHÉMA DONNÉES APPLICATIVES (Phase 5)
-- À exécuter dans l'éditeur SQL Supabase
-- ==========================================

-- user_sessions : sessions de jeu
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id TEXT, -- ID local (Date.now) pour dédup / migration
  honor BIGINT NOT NULL DEFAULT 0,
  xp BIGINT NOT NULL DEFAULT 0,
  rank_points BIGINT NOT NULL DEFAULT 0,
  next_rank_points BIGINT NOT NULL DEFAULT 0,
  current_rank TEXT,
  note TEXT,
  session_date TEXT,
  session_timestamp BIGINT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_timestamp ON user_sessions(session_timestamp DESC);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own sessions" ON user_sessions
  FOR ALL USING (auth.uid() = user_id);

-- user_events : événements personnalisés
CREATE TABLE IF NOT EXISTS user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id TEXT,
  event_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_user_events_user ON user_events(user_id);

ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own events" ON user_events
  FOR ALL USING (auth.uid() = user_id);

-- user_settings : préférences (settings, links, booster config, current stats, etc.)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings_json JSONB NOT NULL DEFAULT '{}',
  links_json JSONB DEFAULT '[]',
  booster_config_json JSONB DEFAULT '{}',
  current_stats_json JSONB DEFAULT '{}',
  theme TEXT DEFAULT 'dark',
  view_mode TEXT DEFAULT 'detailed',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);

-- booster_predictions : historique des prédictions (pour accuracy)
CREATE TABLE IF NOT EXISTS booster_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prediction_date DATE NOT NULL,
  actual_date DATE NOT NULL,
  predicted_type TEXT,
  actual_type TEXT,
  accuracy BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booster_predictions_user ON booster_predictions(user_id);

ALTER TABLE booster_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own predictions" ON booster_predictions
  FOR ALL USING (auth.uid() = user_id);
