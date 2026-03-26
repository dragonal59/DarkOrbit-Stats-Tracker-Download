-- Fix: préserver la casse DOStats des user_id dans upsert_player_full
-- Contexte: DOStats est sensible à la casse (/player/bjyyd != /player/BjYYd).
-- Le lower(trim(user_id)) provoque collisions + mélange pseudo/points + erreur:
-- "ON CONFLICT DO UPDATE command cannot affect row a second time".

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

  -- Remplacement complet par serveur pour le "new model"
  DELETE FROM public.ranking_snapshots WHERE server_id = v_server;
  DELETE FROM public.player_rankings WHERE server = v_server;

  IF p_players IS NULL OR jsonb_typeof(p_players) <> 'array' THEN
    RETURN;
  END IF;

  -- 1) Upsert player_profiles (merge) — IMPORTANT: uid conserve la casse
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
      COALESCE(NULLIF(trim(p->>'user_id'), ''), NULLIF(trim(p->>'userId'), '')) AS uid,
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
  WHERE uid IS NOT NULL
  ON CONFLICT (user_id, server) DO UPDATE SET
    pseudo = public.merge_dostats_text(player_profiles.pseudo, EXCLUDED.pseudo),
    company = public.merge_dostats_company(player_profiles.company, EXCLUDED.company),
    estimated_rp = public.merge_dostats_int(player_profiles.estimated_rp, EXCLUDED.estimated_rp),
    total_hours = public.merge_dostats_int(player_profiles.total_hours, EXCLUDED.total_hours),
    registered = public.merge_dostats_date(player_profiles.registered, EXCLUDED.registered),
    npc_kills = public.merge_dostats_int(player_profiles.npc_kills, EXCLUDED.npc_kills),
    ship_kills = public.merge_dostats_int(player_profiles.ship_kills, EXCLUDED.ship_kills),
    galaxy_gates = public.merge_dostats_int(player_profiles.galaxy_gates, EXCLUDED.galaxy_gates),
    galaxy_gates_json = public.merge_dostats_jsonb(player_profiles.galaxy_gates_json, EXCLUDED.galaxy_gates_json),
    grade = public.merge_dostats_text(player_profiles.grade, EXCLUDED.grade),
    level = public.merge_dostats_int(player_profiles.level, EXCLUDED.level),
    top_user = public.merge_dostats_bigint(player_profiles.top_user, EXCLUDED.top_user),
    experience = public.merge_dostats_bigint(player_profiles.experience, EXCLUDED.experience),
    honor = public.merge_dostats_bigint(player_profiles.honor, EXCLUDED.honor),
    dostats_updated_at = CASE
      WHEN
        public.merge_dostats_text(player_profiles.pseudo, EXCLUDED.pseudo) IS DISTINCT FROM player_profiles.pseudo
        OR public.merge_dostats_company(player_profiles.company, EXCLUDED.company) IS DISTINCT FROM player_profiles.company
        OR public.merge_dostats_int(player_profiles.estimated_rp, EXCLUDED.estimated_rp) IS DISTINCT FROM player_profiles.estimated_rp
        OR public.merge_dostats_int(player_profiles.total_hours, EXCLUDED.total_hours) IS DISTINCT FROM player_profiles.total_hours
        OR public.merge_dostats_date(player_profiles.registered, EXCLUDED.registered) IS DISTINCT FROM player_profiles.registered
        OR public.merge_dostats_int(player_profiles.npc_kills, EXCLUDED.npc_kills) IS DISTINCT FROM player_profiles.npc_kills
        OR public.merge_dostats_int(player_profiles.ship_kills, EXCLUDED.ship_kills) IS DISTINCT FROM player_profiles.ship_kills
        OR public.merge_dostats_int(player_profiles.galaxy_gates, EXCLUDED.galaxy_gates) IS DISTINCT FROM player_profiles.galaxy_gates
        OR public.merge_dostats_jsonb(player_profiles.galaxy_gates_json, EXCLUDED.galaxy_gates_json) IS DISTINCT FROM player_profiles.galaxy_gates_json
        OR public.merge_dostats_text(player_profiles.grade, EXCLUDED.grade) IS DISTINCT FROM player_profiles.grade
        OR public.merge_dostats_int(player_profiles.level, EXCLUDED.level) IS DISTINCT FROM player_profiles.level
        OR public.merge_dostats_bigint(player_profiles.top_user, EXCLUDED.top_user) IS DISTINCT FROM player_profiles.top_user
        OR public.merge_dostats_bigint(player_profiles.experience, EXCLUDED.experience) IS DISTINCT FROM player_profiles.experience
        OR public.merge_dostats_bigint(player_profiles.honor, EXCLUDED.honor) IS DISTINCT FROM player_profiles.honor
        OR public.merge_rankings_json_dostats(player_profiles.rankings_json, EXCLUDED.rankings_json) IS DISTINCT FROM player_profiles.rankings_json
      THEN NOW()
      ELSE player_profiles.dostats_updated_at
    END,
    rankings_json = public.merge_rankings_json_dostats(player_profiles.rankings_json, EXCLUDED.rankings_json),
    profile_json = public.merge_profile_json_dostats(player_profiles.profile_json, EXCLUDED.profile_json);

  -- 2) Insert player_rankings depuis rankings_json — IMPORTANT: uid conserve la casse
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
      COALESCE(NULLIF(trim(p->>'user_id'), ''), NULLIF(trim(p->>'userId'), '')) AS uid,
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

