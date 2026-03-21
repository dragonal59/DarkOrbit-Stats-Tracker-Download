-- ==========================================
-- Index manquants : snapshots, player_profiles, profiles
-- À exécuter après : ranking-snapshots-tables, create-player-profiles-table,
-- add-heartbeat-last-seen (pour last_seen_at sur profiles).
-- ==========================================

-- 1. shared_rankings_snapshots : server_id TEXT, scraped_at TIMESTAMPTZ
--    (table dans 20260225120010_ranking-snapshots-tables.sql)
--    Index fonctionnel LOWER(server_id) pour éviter les seq scans (get_ranking_with_profiles, get_ranking_comparison)
CREATE INDEX IF NOT EXISTS idx_snapshots_lower_server_id
  ON public.shared_rankings_snapshots(LOWER(server_id), scraped_at DESC);

-- 2. player_profiles : user_id TEXT, server TEXT
--    (table dans create-player-profiles-table.sql)
--    Index pour les JOINs LOWER(user_id), LOWER(server) dans get_ranking_with_profiles
CREATE INDEX IF NOT EXISTS idx_player_profiles_lower_user_server
  ON public.player_profiles(LOWER(user_id), LOWER(server));

-- 3. profiles : last_seen_at TIMESTAMPTZ (colonne ajoutée dans add-heartbeat-last-seen.sql)
--    Index partiel pour get_dashboard_stats (WHERE last_seen_at > now() - interval '3 minutes')
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON public.profiles(last_seen_at DESC) WHERE last_seen_at IS NOT NULL;
