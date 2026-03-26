-- DOStats push : ne mettre à jour que les champs dont la valeur scrapée diffère
-- de ce qui est déjà en base (pas d'écrasement par NULL, pas de rewrite identique).
-- - delete_dostats_shared_data_for_server : ne supprime plus player_profiles
-- - overwrite_player_profile_from_dostats : merge par colonne
-- - upsert_player_full : ne supprime plus player_profiles ; INSERT avec ON CONFLICT merge

-- ---------------------------------------------------------------------------
-- Helpers (IMMUTABLE / STABLE pour usage dans UPDATE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.merge_dostats_text(old_t text, new_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN new_t IS NULL THEN old_t
    WHEN btrim(new_t) = '' THEN old_t
    WHEN btrim(new_t) IS DISTINCT FROM old_t THEN btrim(new_t)
    ELSE old_t
  END;
$$;

CREATE OR REPLACE FUNCTION public.merge_dostats_company(old_t text, new_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN new_t IS NULL THEN old_t
    WHEN btrim(new_t) = '' THEN old_t
    WHEN upper(btrim(new_t)) IN ('MMO', 'EIC', 'VRU')
         AND upper(btrim(new_t)) IS DISTINCT FROM old_t
      THEN upper(btrim(new_t))
    WHEN upper(btrim(new_t)) IS DISTINCT FROM old_t THEN old_t
    ELSE old_t
  END;
$$;

CREATE OR REPLACE FUNCTION public.merge_dostats_bigint(old_n bigint, new_n bigint)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN new_n IS NULL THEN old_n
    WHEN new_n IS DISTINCT FROM old_n THEN new_n
    ELSE old_n
  END;
$$;

CREATE OR REPLACE FUNCTION public.merge_dostats_int(old_n integer, new_n integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN new_n IS NULL THEN old_n
    WHEN new_n IS DISTINCT FROM old_n THEN new_n
    ELSE old_n
  END;
$$;

CREATE OR REPLACE FUNCTION public.merge_dostats_date(old_d date, new_d date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN new_d IS NULL THEN old_d
    WHEN new_d IS DISTINCT FROM old_d THEN new_d
    ELSE old_d
  END;
$$;

CREATE OR REPLACE FUNCTION public.merge_dostats_timestamptz(old_t timestamptz, new_t timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN new_t IS NULL THEN old_t
    WHEN new_t IS DISTINCT FROM old_t THEN new_t
    ELSE old_t
  END;
$$;

CREATE OR REPLACE FUNCTION public.merge_dostats_jsonb(old_j jsonb, new_j jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN new_j IS NULL THEN old_j
    WHEN jsonb_typeof(new_j) = 'object' AND new_j = '{}'::jsonb THEN old_j
    WHEN new_j IS DISTINCT FROM old_j THEN new_j
    ELSE old_j
  END;
$$;

CREATE OR REPLACE FUNCTION public.merge_rankings_json_dostats(old_j jsonb, new_j jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result jsonb := COALESCE(old_j, '{}'::jsonb);
  hof_k text;
  per_k text;
  old_v jsonb;
  new_v jsonb;
BEGIN
  IF new_j IS NULL OR jsonb_typeof(new_j) <> 'object' THEN
    RETURN result;
  END IF;
  FOR hof_k IN SELECT jsonb_object_keys(new_j)
  LOOP
    CONTINUE WHEN jsonb_typeof(new_j->hof_k) <> 'object';
    FOR per_k IN SELECT jsonb_object_keys(new_j->hof_k)
    LOOP
      new_v := new_j->hof_k->per_k;
      old_v := result->hof_k->per_k;
      CONTINUE WHEN new_v IS NULL;
      IF new_v IS DISTINCT FROM old_v THEN
        result := jsonb_set(result, ARRAY[hof_k, per_k], new_v, true);
      END IF;
    END LOOP;
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_profile_json_dostats(old_j jsonb, new_j jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result jsonb := COALESCE(old_j, '{}'::jsonb);
  k text;
BEGIN
  IF new_j IS NULL OR jsonb_typeof(new_j) <> 'object' THEN
    RETURN result;
  END IF;
  FOR k IN SELECT jsonb_object_keys(new_j)
  LOOP
    IF jsonb_typeof(new_j->k) = 'object' AND jsonb_typeof(result->k) = 'object' THEN
      result := jsonb_set(result, ARRAY[k], public.merge_profile_json_dostats(result->k, new_j->k), true);
    ELSIF new_j->k IS DISTINCT FROM result->k THEN
      result := jsonb_set(result, ARRAY[k], new_j->k, true);
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Vidage snapshots uniquement (conserve player_profiles)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_dostats_shared_data_for_server(p_server TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server TEXT;
BEGIN
  v_server := lower(trim(p_server));
  IF v_server = '' THEN
    RETURN;
  END IF;
  DELETE FROM public.shared_rankings_dostats_snapshots WHERE server_id = v_server;
  DELETE FROM public.shared_rankings_snapshots WHERE server_id = v_server;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_dostats_shared_data_for_server(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_dostats_shared_data_for_server(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) overwrite_player_profile_from_dostats — merge
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.overwrite_player_profile_from_dostats(
  p_user_id TEXT,
  p_server TEXT,
  p_pseudo TEXT,
  p_company TEXT DEFAULT NULL,
  p_company_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_estimated_rp INTEGER DEFAULT NULL,
  p_total_hours INTEGER DEFAULT NULL,
  p_registered DATE DEFAULT NULL,
  p_npc_kills INTEGER DEFAULT NULL,
  p_ship_kills INTEGER DEFAULT NULL,
  p_galaxy_gates INTEGER DEFAULT NULL,
  p_galaxy_gates_json JSONB DEFAULT NULL,
  p_grade TEXT DEFAULT NULL,
  p_level INTEGER DEFAULT NULL,
  p_top_user BIGINT DEFAULT NULL,
  p_experience BIGINT DEFAULT NULL,
  p_honor BIGINT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_galaxy_int integer;
  v_grade text;
BEGIN
  v_grade := NULLIF(btrim(p_grade), '');
  v_galaxy_int := CASE
    WHEN p_galaxy_gates IS NOT NULL THEN p_galaxy_gates
    WHEN p_galaxy_gates_json IS NOT NULL AND jsonb_typeof(p_galaxy_gates_json) = 'object' THEN (
      SELECT NULLIF(COALESCE(SUM((value)::int), 0), 0)
      FROM jsonb_each_text(p_galaxy_gates_json)
      WHERE value ~ '^\d+$'
    )
    ELSE NULL
  END;

  INSERT INTO public.player_profiles (
    user_id, server, pseudo, company, company_updated_at,
    estimated_rp, total_hours, registered,
    npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, grade, level,
    top_user, experience, honor, dostats_updated_at
  )
  VALUES (
    p_user_id,
    p_server,
    p_pseudo,
    CASE WHEN p_company IS NOT NULL AND upper(btrim(p_company)) IN ('MMO', 'EIC', 'VRU') THEN upper(btrim(p_company)) ELSE NULL END,
    p_company_updated_at,
    p_estimated_rp,
    p_total_hours,
    p_registered,
    p_npc_kills,
    p_ship_kills,
    v_galaxy_int,
    p_galaxy_gates_json,
    v_grade,
    p_level,
    p_top_user,
    p_experience,
    p_honor,
    NOW()
  )
  ON CONFLICT (user_id, server) DO UPDATE SET
    pseudo = public.merge_dostats_text(player_profiles.pseudo, EXCLUDED.pseudo),
    company = public.merge_dostats_company(player_profiles.company, EXCLUDED.company),
    company_updated_at = CASE
      WHEN public.merge_dostats_company(player_profiles.company, EXCLUDED.company)
           IS DISTINCT FROM player_profiles.company
        THEN public.merge_dostats_timestamptz(
          player_profiles.company_updated_at,
          COALESCE(EXCLUDED.company_updated_at, now())
        )
      ELSE player_profiles.company_updated_at
    END,
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
      THEN NOW()
      ELSE player_profiles.dostats_updated_at
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.overwrite_player_profile_from_dostats(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ,
  INTEGER, INTEGER, DATE,
  INTEGER, INTEGER,
  INTEGER, JSONB,
  TEXT, INTEGER,
  BIGINT, BIGINT, BIGINT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.overwrite_player_profile_from_dostats(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ,
  INTEGER, INTEGER, DATE,
  INTEGER, INTEGER,
  INTEGER, JSONB,
  TEXT, INTEGER,
  BIGINT, BIGINT, BIGINT
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) upsert_player_full — ne supprime plus player_profiles ; ON CONFLICT merge
-- ---------------------------------------------------------------------------

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

  DELETE FROM public.ranking_snapshots WHERE server_id = v_server;
  DELETE FROM public.player_rankings WHERE server = v_server;

  IF p_players IS NULL OR jsonb_typeof(p_players) <> 'array' THEN
    RETURN;
  END IF;

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
