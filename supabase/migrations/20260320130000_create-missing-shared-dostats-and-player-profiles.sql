-- This migration creates the "shared_*" and "player_profiles" tables expected by:
-- - RPCs: insert_ranking_snapshot, insert_dostats_snapshot, overwrite_player_profile_from_dostats
-- - App backend reader: src/backend/ranking.js (shared_rankings_snapshots + shared_rankings_dostats_snapshots + player_profiles)
--
-- Your DB currently only had hof_* tables, so these required relations were missing and the RPCs returned:
--   relation "public.shared_rankings_dostats_snapshots" does not exist

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) shared_rankings_snapshots (classements "Current")
CREATE TABLE IF NOT EXISTS public.shared_rankings_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  players_json JSONB NOT NULL DEFAULT '[]',
  uploaded_by UUID
);

CREATE INDEX IF NOT EXISTS idx_rankings_snapshots_server_scraped
  ON public.shared_rankings_snapshots(server_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_snapshots_scraped
  ON public.shared_rankings_snapshots(scraped_at);

ALTER TABLE public.shared_rankings_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rankings_snapshots_select" ON public.shared_rankings_snapshots;
CREATE POLICY "rankings_snapshots_select"
  ON public.shared_rankings_snapshots FOR SELECT
  USING (true);

-- 2) shared_rankings_dostats_snapshots (DOStats periods 24h/7j/30j/...)
CREATE TABLE IF NOT EXISTS public.shared_rankings_dostats_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  players_json JSONB NOT NULL DEFAULT '[]',
  uploaded_by UUID
);

CREATE INDEX IF NOT EXISTS idx_dostats_snapshots_server_scraped
  ON public.shared_rankings_dostats_snapshots(server_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_dostats_snapshots_scraped
  ON public.shared_rankings_dostats_snapshots(scraped_at);

ALTER TABLE public.shared_rankings_dostats_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dostats_snapshots_select" ON public.shared_rankings_dostats_snapshots;
CREATE POLICY "dostats_snapshots_select"
  ON public.shared_rankings_dostats_snapshots FOR SELECT
  USING (true);

-- 3) player_profiles (profiles enriched from DOStats)
CREATE TABLE IF NOT EXISTS public.player_profiles (
  user_id TEXT NOT NULL,
  server TEXT NOT NULL,
  pseudo TEXT,
  company TEXT,
  company_updated_at TIMESTAMPTZ,
  estimated_rp INTEGER,
  total_hours INTEGER,
  registered DATE,
  npc_kills INTEGER,
  ship_kills INTEGER,
  galaxy_gates INTEGER,
  galaxy_gates_json JSONB,
  grade TEXT,
  level INTEGER,
  top_user BIGINT,
  experience BIGINT,
  honor BIGINT,
  dostats_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, server)
);

ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access" ON public.player_profiles;
CREATE POLICY "Public read access"
  ON public.player_profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service insert/update" ON public.player_profiles;
CREATE POLICY "Service insert/update"
  ON public.player_profiles FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_player_profiles_server ON public.player_profiles(server);
CREATE INDEX IF NOT EXISTS idx_player_profiles_pseudo ON public.player_profiles(pseudo);
CREATE INDEX IF NOT EXISTS idx_player_profiles_updated ON public.player_profiles(dostats_updated_at);

