-- Fix get_ranking_with_profiles join: do NOT match player_profiles user_id case-insensitively.
-- Two different players can have userId that differs only by casing (e.g. BjYYd vs BjYYD).
-- Using LOWER(...) caused the same player_profiles row to be applied to both, making grade/company incorrect.

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
      'top_user', pp.top_user,
      'experience', pp.experience,
      'honor', pp.honor,
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
    ON pp.user_id = COALESCE(p.player->>'userId', p.player->>'user_id')
    AND LOWER(pp.server) = LOWER(p_server);

  RETURN jsonb_build_object(
    'server', p_server,
    'players', COALESCE(v_players, '[]'::jsonb),
    'scraped_at', v_scraped_at
  );
END;
$$;

