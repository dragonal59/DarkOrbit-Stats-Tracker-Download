-- Preserve npc_kills, ship_kills, galaxy_gates, estimated_rp, total_hours when caller passes NULL
-- (saveClientScrapedData only has company; DOStats profile scraper has full stats)

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
  p_galaxy_gates_json JSONB DEFAULT NULL
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
    npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, dostats_updated_at
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
    dostats_updated_at = CASE
      WHEN EXCLUDED.npc_kills IS NOT NULL OR EXCLUDED.ship_kills IS NOT NULL OR EXCLUDED.galaxy_gates IS NOT NULL OR (EXCLUDED.galaxy_gates_json IS NOT NULL AND jsonb_typeof(EXCLUDED.galaxy_gates_json) = 'object') THEN NOW()
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
