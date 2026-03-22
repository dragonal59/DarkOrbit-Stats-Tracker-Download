-- Avant un push DOStats par serveur : supprimer les lignes player_profiles de ce serveur,
-- puis réinsertion via overwrite_player_profile_from_dostats (même logique que les snapshots).

CREATE OR REPLACE FUNCTION public.delete_player_profiles_for_server(p_server TEXT)
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
  DELETE FROM public.player_profiles WHERE server = v_server;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_player_profiles_for_server(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_player_profiles_for_server(TEXT) TO service_role;
