-- RPC : classement enrichi avec player_profiles (DOStats)
CREATE OR REPLACE FUNCTION public.get_ranking_with_profiles(p_server TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players JSONB;
BEGIN
  SELECT
    jsonb_agg(
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
    SELECT jsonb_array_elements(players_json) AS player
    FROM shared_rankings
    WHERE server = p_server
  ) p
  LEFT JOIN player_profiles pp
    ON pp.user_id = (p.player->>'userId')
    AND pp.server = p_server;

  RETURN jsonb_build_object(
    'server', p_server,
    'players', COALESCE(v_players, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranking_with_profiles(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_with_profiles(TEXT) TO anon;
