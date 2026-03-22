-- Remplace le vidage par serveur : avant un run DOStats complet, vider entièrement
-- player_profiles + les deux tables de snapshots (un seul TRUNCATE atomique).

DROP FUNCTION IF EXISTS public.delete_player_profiles_for_server(TEXT);

CREATE OR REPLACE FUNCTION public.truncate_dostats_shared_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE TABLE
    public.player_profiles,
    public.shared_rankings_dostats_snapshots,
    public.shared_rankings_snapshots
  RESTART IDENTITY CASCADE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.truncate_dostats_shared_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION public.truncate_dostats_shared_tables() TO service_role;
