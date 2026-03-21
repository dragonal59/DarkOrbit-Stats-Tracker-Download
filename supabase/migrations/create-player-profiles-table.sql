-- ==========================================
-- TABLE player_profiles — Profils joueurs DOStats
-- user_id = userId DarkOrbit, server = serveur (gbl5, fr1, etc.)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.player_profiles (
  user_id TEXT NOT NULL,
  server TEXT NOT NULL,
  pseudo TEXT,
  company TEXT,
  company_updated_at TIMESTAMPTZ,
  estimated_rp INTEGER,
  total_hours INTEGER,
  registered DATE,
  npc_kills INTEGER,
  ship_kills INTEGER,
  galaxy_gates INTEGER,
  dostats_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, server)
);

ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.player_profiles;
CREATE POLICY "Public read access" ON public.player_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service insert/update" ON public.player_profiles;
CREATE POLICY "Service insert/update" ON public.player_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_player_profiles_server ON public.player_profiles(server);
CREATE INDEX IF NOT EXISTS idx_player_profiles_pseudo ON public.player_profiles(pseudo);
CREATE INDEX IF NOT EXISTS idx_player_profiles_updated ON public.player_profiles(dostats_updated_at);

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
  p_galaxy_gates INTEGER DEFAULT NULL
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
    npc_kills, ship_kills, galaxy_gates, dostats_updated_at
  )
  VALUES (
    p_user_id, p_server, p_pseudo, p_company, p_company_updated_at,
    p_estimated_rp, p_total_hours, p_registered,
    p_npc_kills, p_ship_kills, p_galaxy_gates, NOW()
  )
  ON CONFLICT (user_id, server) DO UPDATE SET
    pseudo = EXCLUDED.pseudo,
    estimated_rp = EXCLUDED.estimated_rp,
    total_hours = EXCLUDED.total_hours,
    npc_kills = EXCLUDED.npc_kills,
    ship_kills = EXCLUDED.ship_kills,
    galaxy_gates = EXCLUDED.galaxy_gates,
    dostats_updated_at = NOW(),
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

GRANT EXECUTE ON FUNCTION public.upsert_player_profile(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, DATE, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_player_profile(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, DATE, INTEGER, INTEGER, INTEGER) TO service_role;
