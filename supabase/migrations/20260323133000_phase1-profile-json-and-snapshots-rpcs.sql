-- Phase 1 (v2): modèle cible player_profiles + player_rankings + snapshots
-- Objectif:
-- - 1 joueur = 1 entrée (user_id, server) dans player_profiles
-- - JSON profil complet dans player_profiles.profile_json
-- - ranking normalisé dans player_rankings
-- - snapshots explicites (hof/profile) avec RPC begin/finalize
--
-- Cette migration est idempotente et non destructive pour les anciennes tables shared_rankings_*.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) player_profiles: JSON cible par joueur
-- ---------------------------------------------------------------------------
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS profile_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- rankings_json (ajouté en phase 1 précédente) doit exister; sécurité idempotente.
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS rankings_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_player_profiles_profile_json_gin
  ON public.player_profiles USING gin (profile_json);

-- ---------------------------------------------------------------------------
-- 2) player_rankings: colonnes v2 (points + metadata snapshot)
-- ---------------------------------------------------------------------------
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

ALTER TABLE public.player_rankings
  ADD COLUMN IF NOT EXISTS points BIGINT;

ALTER TABLE public.player_rankings
  ADD COLUMN IF NOT EXISTS snapshot_id_hof UUID;

ALTER TABLE public.player_rankings
  ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Compatibilité descendante: copier value -> points si points est vide.
UPDATE public.player_rankings
SET points = value
WHERE points IS NULL AND value IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) ranking_snapshots: métadonnées de run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ranking_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.ranking_snapshots
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'hof';

ALTER TABLE public.ranking_snapshots
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running';

ALTER TABLE public.ranking_snapshots
  ADD COLUMN IF NOT EXISTS players_count INTEGER;

ALTER TABLE public.ranking_snapshots
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_server_kind_scraped
  ON public.ranking_snapshots(server_id, kind, scraped_at DESC);

COMMIT;

-- ---------------------------------------------------------------------------
-- 4) RPCs snapshots
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.begin_server_snapshot(
  p_server TEXT,
  p_kind TEXT DEFAULT 'hof'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server TEXT;
  v_kind TEXT;
  v_id UUID;
BEGIN
  v_server := lower(trim(p_server));
  v_kind := lower(trim(COALESCE(p_kind, 'hof')));
  IF v_server IS NULL OR v_server = '' THEN
    RAISE EXCEPTION 'begin_server_snapshot: p_server is required';
  END IF;
  IF v_kind NOT IN ('hof', 'profile') THEN
    v_kind := 'hof';
  END IF;

  INSERT INTO public.ranking_snapshots (server_id, kind, scraped_at, uploaded_by, status)
  VALUES (v_server, v_kind, now(), auth.uid(), 'running')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.begin_server_snapshot(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_server_snapshot(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_server_snapshot(
  p_snapshot_id UUID,
  p_players_count INTEGER DEFAULT NULL,
  p_status TEXT DEFAULT 'success'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ranking_snapshots
  SET
    players_count = COALESCE(p_players_count, players_count),
    status = COALESCE(NULLIF(trim(p_status), ''), status),
    finished_at = now()
  WHERE id = p_snapshot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_server_snapshot(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_server_snapshot(UUID, INTEGER, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) RPC principale: upsert_player_full
-- ---------------------------------------------------------------------------
-- Signature v2:
-- - p_server: code serveur
-- - p_players: array de joueurs (1 joueur = 1 entrée)
-- - p_snapshot_hof / p_snapshot_stats: IDs de snapshots (meta)
-- - p_scraped_at: date de scrape
--
-- Format attendu p_players[i] (tolérant):
-- {
--   "user_id": "BjmHT",
--   "name": "Dragonal16012",
--   "company": "MMO",
--   "grade": "chief_colonel",
--   "level": 23,
--   "registered": "2026-01-14",
--   "stats": { ... },
--   "rankings": {
--     "rank_points": 88940767,
--     "topuser": { "alltime": { "rank": 64, "points": 88940767 }, ... },
--     "honor":   { ... },
--     "experience": { ... },
--     "ships": { ... },
--     "aliens": { ... }
--   },
--   "meta": {
--     "dostats_updated_at": "...",
--     "snapshot_id_stats": "...",
--     "snapshot_id_hof": "...",
--     "scraped_at": "..."
--   }
-- }
CREATE OR REPLACE FUNCTION public.upsert_player_full(
  p_server TEXT,
  p_players JSONB,
  p_snapshot_hof UUID DEFAULT NULL,
  p_snapshot_stats UUID DEFAULT NULL,
  p_scraped_at TIMESTAMPTZ DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server TEXT;
  v_scraped_at TIMESTAMPTZ;
BEGIN
  v_server := lower(trim(p_server));
  v_scraped_at := COALESCE(p_scraped_at, now());

  IF v_server IS NULL OR v_server = '' THEN
    RETURN;
  END IF;

  -- Complete replacement per server (règle validée).
  -- Si on push gbl5, on écrase toutes les données "nouveau modèle" liées à gbl5.
  DELETE FROM public.ranking_snapshots WHERE server_id = v_server;
  DELETE FROM public.player_rankings WHERE server = v_server;
  DELETE FROM public.player_profiles WHERE server = v_server;

  IF p_players IS NULL OR jsonb_typeof(p_players) <> 'array' THEN
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- 5.1 Insert player_profiles (colonnes + rankings_json + profile_json)
  -- -------------------------------------------------------------------------
  INSERT INTO public.player_profiles (
    user_id,
    server,
    pseudo,
    company,
    company_updated_at,
    estimated_rp,
    total_hours,
    registered,
    npc_kills,
    ship_kills,
    galaxy_gates,
    galaxy_gates_json,
    grade,
    level,
    top_user,
    experience,
    honor,
    dostats_updated_at,
    rankings_json,
    profile_json
  )
  SELECT
    uid AS user_id,
    v_server AS server,
    nm AS pseudo,
    company,
    NULL::timestamptz AS company_updated_at,
    estimated_rp,
    total_hours,
    registered,
    npc_kills,
    ship_kills,
    galaxy_gates,
    galaxy_gates_detail,
    grade,
    lvl,
    rank_points,
    experience,
    honor,
    dostats_updated_at,
    rankings_json,
    jsonb_build_object(
      'user_id', uid,
      'name', nm,
      'server', v_server,
      'company', company,
      'grade', grade,
      'level', lvl,
      'registered', registered,
      'stats', jsonb_build_object(
        'experience', experience,
        'estimated_rp', estimated_rp,
        'total_hours', total_hours,
        'npc_kills', npc_kills,
        'ship_kills', ship_kills,
        'honor', honor,
        'galaxy_gates', galaxy_gates,
        'galaxy_gates_detail', COALESCE(galaxy_gates_detail, '{}'::jsonb)
      ),
      'rankings', COALESCE(rankings_json, '{}'::jsonb) || jsonb_build_object('rank_points', rank_points),
      'meta', jsonb_build_object(
        'dostats_updated_at', dostats_updated_at,
        'snapshot_id_stats', COALESCE(snapshot_id_stats, p_snapshot_stats),
        'snapshot_id_hof', COALESCE(snapshot_id_hof, p_snapshot_hof),
        'scraped_at', COALESCE(meta_scraped_at, v_scraped_at)
      )
    ) AS profile_json
  FROM (
    SELECT
      COALESCE(NULLIF(lower(trim(p->>'user_id')), ''), NULLIF(lower(trim(p->>'userId')), '')) AS uid,
      NULLIF(trim(COALESCE(p->>'name', p->>'pseudo', p->>'game_pseudo', '')), '') AS nm,
      NULLIF(trim(COALESCE(p->>'company', p->'stats'->>'company', '')), '') AS company,
      NULLIF(trim(COALESCE(p->>'grade', p->'stats'->>'grade', '')), '') AS grade,
      NULLIF(trim(COALESCE(p->>'level', p->'stats'->>'level', '')), '')::int AS lvl,
      NULLIF(trim(COALESCE(p->>'registered', p->'stats'->>'registered', '')), '')::date AS registered,

      NULLIF(trim(COALESCE(p->'stats'->>'experience', p->>'experience', p->>'xp', '')), '')::bigint AS experience,
      NULLIF(trim(COALESCE(p->'stats'->>'estimated_rp', p->>'estimated_rp', '')), '')::bigint AS estimated_rp,
      NULLIF(trim(COALESCE(p->'stats'->>'total_hours', p->>'total_hours', '')), '')::bigint AS total_hours,
      NULLIF(trim(COALESCE(p->'stats'->>'npc_kills', p->>'npc_kills', '')), '')::bigint AS npc_kills,
      NULLIF(trim(COALESCE(p->'stats'->>'ship_kills', p->>'ship_kills', '')), '')::bigint AS ship_kills,
      NULLIF(trim(COALESCE(p->'stats'->>'honor', p->>'honor', '')), '')::bigint AS honor,
      NULLIF(trim(COALESCE(p->'stats'->>'galaxy_gates', p->>'galaxy_gates', '')), '')::bigint AS galaxy_gates,
      COALESCE(p->'stats'->'galaxy_gates_detail', p->'galaxy_gates_json', '{}'::jsonb) AS galaxy_gates_detail,

      NULLIF(trim(COALESCE(p->'rankings'->>'rank_points', p->>'rank_points', p->>'top_user', '')), '')::bigint AS rank_points,
      COALESCE(
        CASE WHEN jsonb_typeof(p->'rankings') = 'object' THEN p->'rankings' ELSE NULL END,
        CASE WHEN jsonb_typeof(p->'rankings_json') = 'object' THEN p->'rankings_json' ELSE NULL END,
        '{}'::jsonb
      ) AS rankings_json,

      NULLIF(trim(COALESCE(p->'meta'->>'dostats_updated_at', p->>'dostats_updated_at', '')), '')::timestamptz AS dostats_updated_at,
      NULLIF(trim(COALESCE(p->'meta'->>'snapshot_id_stats', '')), '')::uuid AS snapshot_id_stats,
      NULLIF(trim(COALESCE(p->'meta'->>'snapshot_id_hof', '')), '')::uuid AS snapshot_id_hof,
      NULLIF(trim(COALESCE(p->'meta'->>'scraped_at', '')), '')::timestamptz AS meta_scraped_at
    FROM jsonb_array_elements(p_players) p
  ) src
  WHERE uid IS NOT NULL;

  -- -------------------------------------------------------------------------
  -- 5.2 Insert player_rankings depuis rankings_json (format objet uniquement)
  -- -------------------------------------------------------------------------
  INSERT INTO public.player_rankings (
    user_id,
    server,
    hof_type,
    period,
    rank,
    points,
    value,
    snapshot_id_hof,
    scraped_at
  )
  SELECT
    src.uid AS user_id,
    v_server AS server,
    jt.hof_type,
    jp.period,
    NULLIF(trim(jp.val->>'rank'), '')::int AS rank,
    NULLIF(trim(COALESCE(jp.val->>'points', jp.val->>'value', '')), '')::bigint AS points,
    NULLIF(trim(COALESCE(jp.val->>'points', jp.val->>'value', '')), '')::bigint AS value,
    COALESCE(src.snapshot_id_hof, p_snapshot_hof) AS snapshot_id_hof,
    COALESCE(src.meta_scraped_at, v_scraped_at) AS scraped_at
  FROM (
    SELECT
      COALESCE(NULLIF(lower(trim(p->>'user_id')), ''), NULLIF(lower(trim(p->>'userId')), '')) AS uid,
      COALESCE(
        CASE WHEN jsonb_typeof(p->'rankings') = 'object' THEN p->'rankings' ELSE NULL END,
        CASE WHEN jsonb_typeof(p->'rankings_json') = 'object' THEN p->'rankings_json' ELSE NULL END,
        '{}'::jsonb
      ) AS rankings_json,
      NULLIF(trim(COALESCE(p->'meta'->>'snapshot_id_hof', '')), '')::uuid AS snapshot_id_hof,
      NULLIF(trim(COALESCE(p->'meta'->>'scraped_at', '')), '')::timestamptz AS meta_scraped_at
    FROM jsonb_array_elements(p_players) p
  ) src
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(src.rankings_json) = 'object' THEN src.rankings_json ELSE '{}'::jsonb END
  ) AS jt(hof_type, hof_data)
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(jt.hof_data) = 'object' THEN jt.hof_data ELSE '{}'::jsonb END
  ) AS jp(period, val)
  WHERE src.uid IS NOT NULL
    AND jt.hof_type IN ('topuser', 'honor', 'experience', 'ships', 'aliens')
    AND jp.period IN ('alltime', 'daily', 'weekly', 'monthly', 'last_90d', 'last_365d');
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_player_full(TEXT, JSONB, UUID, UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_player_full(TEXT, JSONB, UUID, UUID, TIMESTAMPTZ) TO service_role;

