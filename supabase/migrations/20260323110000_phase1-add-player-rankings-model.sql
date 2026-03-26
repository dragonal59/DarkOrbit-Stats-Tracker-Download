-- Phase 1: Ajouter le modèle normalisé (player_rankings + ranking_snapshots)
-- Objectif: ne casser aucune fonctionnalité existante (pas de DROP des tables shared_rankings_*).
-- Prochaine étape prévue: refactor du scraper/push (main.js) + lecture (src/backend/ranking.js).

BEGIN;

-- 1) player_profiles: ajouter un champ rankings_json (agrégat par joueur)
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS rankings_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2) player_rankings: 1 ligne par (user_id, server, hof_type, period)
CREATE TABLE IF NOT EXISTS public.player_rankings (
  user_id TEXT NOT NULL,
  server TEXT NOT NULL,
  hof_type TEXT NOT NULL,
  period TEXT NOT NULL,
  rank INTEGER NULL,
  value BIGINT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, server, hof_type, period)
);

CREATE INDEX IF NOT EXISTS idx_player_rankings_server_hof_period
  ON public.player_rankings(server, hof_type, period);

CREATE INDEX IF NOT EXISTS idx_player_rankings_server_hof_period_value
  ON public.player_rankings(server, hof_type, period, value DESC);

ALTER TABLE public.player_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_rankings_select" ON public.player_rankings;
CREATE POLICY "player_rankings_select"
  ON public.player_rankings FOR SELECT
  USING (true);

-- Autoriser les écritures via fonctions RPC (les écritures directes depuis le client
-- seront bloquées si les grants ne sont pas accordés).
DROP POLICY IF EXISTS "player_rankings_service_rw" ON public.player_rankings;
CREATE POLICY "player_rankings_service_rw"
  ON public.player_rankings FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.player_rankings TO anon, authenticated;

-- 3) ranking_snapshots: 1 ligne par scrape/push (métadonnées)
CREATE TABLE IF NOT EXISTS public.ranking_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_server_scraped
  ON public.ranking_snapshots(server_id, scraped_at DESC);

ALTER TABLE public.ranking_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ranking_snapshots_select" ON public.ranking_snapshots;
CREATE POLICY "ranking_snapshots_select"
  ON public.ranking_snapshots FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "ranking_snapshots_service_rw" ON public.ranking_snapshots;
CREATE POLICY "ranking_snapshots_service_rw"
  ON public.ranking_snapshots FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.ranking_snapshots TO anon, authenticated;

COMMIT;

-- 4) RPC: upsert_player_full(p_server, p_players)
-- Remplacement complet côté serveur:
-- - DELETE player_rankings + player_profiles pour server
-- - INSERT player_profiles + player_rankings depuis p_players
-- - INSERT 1 ranking_snapshots (métadonnées du push)
--
-- Format attendu pour p_players (tableau JSON):
-- [
--   {
--     "user_id": "BjYYd",
--     "pseudo": "pseudo",
--     "company": "VRU",
--     "company_updated_at": "2026-03-23T09:48:06.739Z",
--     "estimated_rp": 123,
--     "total_hours": 456,
--     "registered": "2026-03-01",
--     "npc_kills": 1,
--     "ship_kills": 2,
--     "galaxy_gates": 3,
--     "galaxy_gates_json": {...},
--     "grade": "Lieutenant",
--     "level": 55,
--     "top_user": 999,
--     "experience": 888,
--     "honor": 777,
--     "dostats_updated_at": "2026-03-23T09:48:06.739Z",
--     "rankings_json": {
--       "topuser": {
--         "alltime": { "rank": 1, "value": 123456 },
--         "daily":   { "rank": null, "value": null }
--       },
--       "honor": {
--         "weekly": { "rank": 2, "value": 333 }
--       }
--     }
--   }
-- ]

CREATE OR REPLACE FUNCTION public.upsert_player_full(
  p_server TEXT,
  p_players JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server TEXT;
  v_uploaded_by UUID;
BEGIN
  v_server := lower(trim(p_server));
  IF v_server IS NULL OR v_server = '' THEN
    RETURN;
  END IF;

  v_uploaded_by := auth.uid();

  -- Complete replacement per server
  DELETE FROM public.player_rankings WHERE server = v_server;
  DELETE FROM public.player_profiles WHERE server = v_server;
  DELETE FROM public.ranking_snapshots WHERE server_id = v_server;

  IF p_players IS NULL OR jsonb_typeof(p_players) <> 'array' THEN
    INSERT INTO public.ranking_snapshots (server_id, scraped_at, uploaded_by)
    VALUES (v_server, now(), v_uploaded_by);
    RETURN;
  END IF;

  -- 1) Insert player_profiles
  INSERT INTO public.player_profiles (
    user_id, server, pseudo, company, company_updated_at,
    estimated_rp, total_hours, registered,
    npc_kills, ship_kills, galaxy_gates, galaxy_gates_json,
    grade, level, top_user, experience, honor,
    dostats_updated_at, rankings_json
  )
  SELECT
    COALESCE(NULLIF(trim(p->>'user_id'), ''), NULLIF(trim(p->>'userId'), '')) AS user_id,
    v_server AS server,
    NULLIF(trim(COALESCE(p->>'pseudo', p->>'name', p->>'game_pseudo', '')), '') AS pseudo,
    NULLIF(trim(p->>'company'), '') AS company,
    NULLIF(trim(p->>'company_updated_at'), '')::timestamptz AS company_updated_at,
    NULLIF(trim(p->>'estimated_rp'), '')::int AS estimated_rp,
    NULLIF(trim(p->>'total_hours'), '')::int AS total_hours,
    NULLIF(trim(p->>'registered'), '')::date AS registered,
    NULLIF(trim(p->>'npc_kills'), '')::int AS npc_kills,
    NULLIF(trim(p->>'ship_kills'), '')::int AS ship_kills,
    NULLIF(trim(p->>'galaxy_gates'), '')::int AS galaxy_gates,
    p->'galaxy_gates_json' AS galaxy_gates_json,
    NULLIF(trim(p->>'grade'), '') AS grade,
    NULLIF(trim(p->>'level'), '')::int AS level,
    NULLIF(trim(p->>'top_user'), '')::bigint AS top_user,
    NULLIF(trim(p->>'experience'), '')::bigint AS experience,
    NULLIF(trim(p->>'honor'), '')::bigint AS honor,
    NULLIF(trim(p->>'dostats_updated_at'), '')::timestamptz AS dostats_updated_at,
    COALESCE(p->'rankings_json', '{}'::jsonb) AS rankings_json
  FROM jsonb_array_elements(p_players) p
  WHERE COALESCE(NULLIF(trim(p->>'user_id'), ''), NULLIF(trim(p->>'userId'), '')) IS NOT NULL;

  -- 2) Insert player_rankings from rankings_json
  -- Format unique attendu (objet uniquement):
  -- rankings_json = { "<hof_type>": { "<period>": { "rank": <int|null>, "value": <bigint|null> } } }
  INSERT INTO public.player_rankings (
    user_id, server, hof_type, period, rank, value
  )
  SELECT
    pl.user_id,
    v_server AS server,
    rr.hof_type,
    rr.period,
    rr.rank,
    rr.value
  FROM (
    SELECT
      COALESCE(NULLIF(trim(p->>'user_id'), ''), NULLIF(trim(p->>'userId'), '')) AS user_id,
      p->'rankings_json' AS rankings_json
    FROM jsonb_array_elements(p_players) p
  ) pl
  CROSS JOIN LATERAL (
    SELECT
      x.hof_type,
      x.period,
      x.rank,
      x.value
    FROM (
      SELECT
        jtop.key AS hof_type,
        jper.key AS period,
        NULLIF(trim(jper.value->>'rank'), '')::int AS rank,
        NULLIF(trim(jper.value->>'value'), '')::bigint AS value
      FROM jsonb_each(
        CASE WHEN jsonb_typeof(pl.rankings_json) = 'object' THEN pl.rankings_json ELSE '{}'::jsonb END
      ) AS jtop(hof_type, hofdata)
      CROSS JOIN LATERAL jsonb_each(
        CASE WHEN jsonb_typeof(jtop.hofdata) = 'object' THEN jtop.hofdata ELSE '{}'::jsonb END
      ) AS jper(period, value)
    ) x
    WHERE x.hof_type IS NOT NULL AND x.period IS NOT NULL
  ) rr;

  -- 3) Snapshot metadata (latest)
  INSERT INTO public.ranking_snapshots (server_id, scraped_at, uploaded_by)
  VALUES (v_server, now(), v_uploaded_by);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_player_full(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_player_full(TEXT, JSONB) TO service_role;

