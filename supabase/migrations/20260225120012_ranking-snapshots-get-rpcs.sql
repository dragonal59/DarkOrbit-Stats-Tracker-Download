-- get_ranking_snapshot : dernier snapshot pour un serveur (avec profiles)
-- get_ranking_snapshots_for_comparison : snapshots depuis une date (pour H24/7j/30j)

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
  FROM (
    SELECT jsonb_array_elements(v_players) AS player
  ) p
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

CREATE OR REPLACE FUNCTION public.get_ranking_snapshots_for_comparison(
  p_server_id TEXT,
  p_since TIMESTAMPTZ
)
RETURNS TABLE(id UUID, scraped_at TIMESTAMPTZ, players_json JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.scraped_at, s.players_json
  FROM shared_rankings_snapshots s
  WHERE s.server_id = p_server_id AND s.scraped_at >= p_since
  ORDER BY s.scraped_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ranking_latest_per_server(p_limit INT DEFAULT 24)
RETURNS TABLE(server_id TEXT, scraped_at TIMESTAMPTZ, players_json JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.server_id, s.scraped_at, s.players_json
  FROM (
    SELECT DISTINCT ON (srs.server_id) srs.server_id, srs.scraped_at, srs.players_json
    FROM shared_rankings_snapshots srs
    ORDER BY srs.server_id, srs.scraped_at DESC
  ) s
  ORDER BY s.scraped_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranking_snapshot(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_snapshot(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ranking_snapshots_for_comparison(TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_snapshots_for_comparison(TEXT, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ranking_latest_per_server(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_latest_per_server(INT) TO anon;
