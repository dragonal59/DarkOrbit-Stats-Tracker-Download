-- Level (Niveau) DOStats dans player_profiles

ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.upsert_player_profile(
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
  p_level INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.player_profiles (
    user_id, server, pseudo, company, company_updated_at,
    estimated_rp, total_hours, registered,
    npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, grade, level, dostats_updated_at
  )
  VALUES (
    p_user_id, p_server, p_pseudo, p_company, p_company_updated_at,
    p_estimated_rp, p_total_hours, p_registered,
    p_npc_kills, p_ship_kills,
    CASE
      WHEN p_galaxy_gates IS NOT NULL THEN p_galaxy_gates
      WHEN p_galaxy_gates_json IS NOT NULL AND jsonb_typeof(p_galaxy_gates_json) = 'object' THEN (SELECT COALESCE(SUM((value)::int), 0) FROM jsonb_each_text(p_galaxy_gates_json) WHERE value ~ '^\d+$')
      ELSE NULL
    END,
    p_galaxy_gates_json,
    NULLIF(TRIM(p_grade), ''),
    p_level,
    NOW()
  )
  ON CONFLICT (user_id, server) DO UPDATE SET
    pseudo = COALESCE(EXCLUDED.pseudo, player_profiles.pseudo),
    estimated_rp = COALESCE(EXCLUDED.estimated_rp, player_profiles.estimated_rp),
    total_hours = COALESCE(EXCLUDED.total_hours, player_profiles.total_hours),
    npc_kills = COALESCE(EXCLUDED.npc_kills, player_profiles.npc_kills),
    ship_kills = COALESCE(EXCLUDED.ship_kills, player_profiles.ship_kills),
    galaxy_gates = CASE
      WHEN EXCLUDED.galaxy_gates IS NOT NULL THEN EXCLUDED.galaxy_gates
      WHEN EXCLUDED.galaxy_gates_json IS NOT NULL AND jsonb_typeof(EXCLUDED.galaxy_gates_json) = 'object' THEN (SELECT COALESCE(SUM((value)::int), 0) FROM jsonb_each_text(EXCLUDED.galaxy_gates_json) WHERE value ~ '^\d+$')
      ELSE player_profiles.galaxy_gates
    END,
    galaxy_gates_json = COALESCE(EXCLUDED.galaxy_gates_json, player_profiles.galaxy_gates_json),
    grade = COALESCE(NULLIF(TRIM(EXCLUDED.grade), ''), player_profiles.grade),
    level = COALESCE(EXCLUDED.level, player_profiles.level),
    dostats_updated_at = CASE
      WHEN EXCLUDED.npc_kills IS NOT NULL OR EXCLUDED.ship_kills IS NOT NULL OR EXCLUDED.galaxy_gates IS NOT NULL OR (EXCLUDED.galaxy_gates_json IS NOT NULL AND jsonb_typeof(EXCLUDED.galaxy_gates_json) = 'object') OR EXCLUDED.grade IS NOT NULL OR EXCLUDED.level IS NOT NULL THEN NOW()
      ELSE player_profiles.dostats_updated_at
    END,
    company = CASE
      WHEN EXCLUDED.company IS NOT NULL AND (
        player_profiles.company IS NULL OR
        player_profiles.company_updated_at IS NULL OR
        player_profiles.company_updated_at < NOW() - INTERVAL '30 days'
      ) THEN EXCLUDED.company
      ELSE player_profiles.company
    END,
    company_updated_at = CASE
      WHEN EXCLUDED.company IS NOT NULL AND (
        player_profiles.company IS NULL OR
        player_profiles.company_updated_at IS NULL OR
        player_profiles.company_updated_at < NOW() - INTERVAL '30 days'
      ) THEN NOW()
      ELSE player_profiles.company_updated_at
    END,
    registered = CASE
      WHEN player_profiles.registered IS NULL THEN EXCLUDED.registered
      ELSE player_profiles.registered
    END;
END;
$$;

-- Merge level from player_profiles dans get_ranking
CREATE OR REPLACE FUNCTION public.get_ranking_with_profiles(p_server TEXT, p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_players JSONB; v_scraped_at TIMESTAMPTZ;
BEGIN
  SELECT s.players_json, s.scraped_at INTO v_players, v_scraped_at
  FROM shared_rankings_snapshots s
  WHERE LOWER(s.server_id) = LOWER(p_server)
    AND (p_since IS NULL OR s.scraped_at >= p_since)
  ORDER BY s.scraped_at DESC
  LIMIT 1;

  IF v_players IS NULL THEN
    RETURN jsonb_build_object('server', p_server, 'players', '[]'::jsonb, 'scraped_at', null);
  END IF;

  SELECT jsonb_agg(
    p.player || jsonb_build_object(
      'grade', COALESCE(NULLIF(TRIM(p.player->>'grade'), ''), pp.grade, p.player->>'grade'),
      'level', pp.level,
      'estimated_rp', pp.estimated_rp,
      'total_hours', pp.total_hours,
      'registered', pp.registered,
      'npc_kills', pp.npc_kills,
      'ship_kills', pp.ship_kills,
      'galaxy_gates', pp.galaxy_gates,
      'galaxy_gates_json', pp.galaxy_gates_json,
      'company_from_dostats', pp.company,
      'dostats_updated_at', pp.dostats_updated_at
    )
  )
  INTO v_players
  FROM (SELECT jsonb_array_elements(v_players) AS player) p
  LEFT JOIN player_profiles pp
    ON LOWER(pp.user_id) = LOWER(COALESCE(p.player->>'userId', p.player->>'user_id'))
    AND LOWER(pp.server) = LOWER(p_server);

  RETURN jsonb_build_object(
    'server', p_server,
    'players', COALESCE(v_players, '[]'::jsonb),
    'scraped_at', v_scraped_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ranking_snapshot(p_server_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_players JSONB; v_scraped_at TIMESTAMPTZ;
BEGIN
  SELECT s.players_json, s.scraped_at INTO v_players, v_scraped_at
  FROM shared_rankings_snapshots s
  WHERE s.server_id = p_server_id
  ORDER BY s.scraped_at DESC
  LIMIT 1;

  IF v_players IS NULL THEN
    RETURN jsonb_build_object('server', p_server_id, 'players', '[]'::jsonb, 'scraped_at', null);
  END IF;

  SELECT jsonb_agg(
    p.player || jsonb_build_object(
      'grade', COALESCE(NULLIF(TRIM(p.player->>'grade'), ''), pp.grade, p.player->>'grade'),
      'level', pp.level,
      'estimated_rp', pp.estimated_rp,
      'total_hours', pp.total_hours,
      'registered', pp.registered,
      'npc_kills', pp.npc_kills,
      'ship_kills', pp.ship_kills,
      'galaxy_gates', pp.galaxy_gates,
      'galaxy_gates_json', pp.galaxy_gates_json,
      'company_from_dostats', pp.company,
      'dostats_updated_at', pp.dostats_updated_at
    )
  )
  INTO v_players
  FROM (SELECT jsonb_array_elements(v_players) AS player) p
  LEFT JOIN player_profiles pp
    ON pp.user_id = (p.player->>'userId')
    AND pp.server = p_server_id;

  RETURN jsonb_build_object(
    'server', p_server_id,
    'players', COALESCE(v_players, '[]'::jsonb),
    'scraped_at', v_scraped_at
  );
END;
$$;
