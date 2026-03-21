-- Overwrite strict player_profiles ONLY for writes coming from DOStats scraper.
-- Raison : le RPC existant `upsert_player_profile` est aussi utilisé par le CDP client launcher
-- et doit préserver les métriques DOStats quand le client n'envoie pas ces champs.

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
BEGIN
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
    p_company,
    p_company_updated_at,
    p_estimated_rp,
    p_total_hours,
    p_registered,
    p_npc_kills,
    p_ship_kills,
    CASE
      WHEN p_galaxy_gates IS NOT NULL THEN p_galaxy_gates
      WHEN p_galaxy_gates_json IS NOT NULL AND jsonb_typeof(p_galaxy_gates_json) = 'object'
        THEN (
          SELECT NULLIF(COALESCE(SUM((value)::int), 0), 0)
          FROM jsonb_each_text(p_galaxy_gates_json)
          WHERE value ~ '^\d+$'
        )
      ELSE NULL
    END,
    p_galaxy_gates_json,
    NULLIF(TRIM(p_grade), ''),
    p_level,
    p_top_user,
    p_experience,
    p_honor,
    NOW()
  )
  ON CONFLICT (user_id, server) DO UPDATE SET
    pseudo = EXCLUDED.pseudo,
    company = EXCLUDED.company,
    company_updated_at = EXCLUDED.company_updated_at,
    estimated_rp = EXCLUDED.estimated_rp,
    total_hours = EXCLUDED.total_hours,
    registered = EXCLUDED.registered,
    npc_kills = EXCLUDED.npc_kills,
    ship_kills = EXCLUDED.ship_kills,
    galaxy_gates = CASE
      WHEN EXCLUDED.galaxy_gates IS NOT NULL THEN EXCLUDED.galaxy_gates
      WHEN EXCLUDED.galaxy_gates_json IS NOT NULL AND jsonb_typeof(EXCLUDED.galaxy_gates_json) = 'object'
        THEN (
          SELECT NULLIF(COALESCE(SUM((value)::int), 0), 0)
          FROM jsonb_each_text(EXCLUDED.galaxy_gates_json)
          WHERE value ~ '^\d+$'
        )
      ELSE NULL
    END,
    galaxy_gates_json = EXCLUDED.galaxy_gates_json,
    grade = EXCLUDED.grade,
    level = EXCLUDED.level,
    top_user = EXCLUDED.top_user,
    experience = EXCLUDED.experience,
    honor = EXCLUDED.honor,
    dostats_updated_at = NOW();
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

-- (optionnel) service_role si disponible
GRANT EXECUTE ON FUNCTION public.overwrite_player_profile_from_dostats(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ,
  INTEGER, INTEGER, DATE,
  INTEGER, INTEGER,
  INTEGER, JSONB,
  TEXT, INTEGER,
  BIGINT, BIGINT, BIGINT
) TO service_role;

