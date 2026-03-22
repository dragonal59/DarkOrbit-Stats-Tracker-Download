-- Vidage par serveur uniquement (les autres univers restent en base).

DROP FUNCTION IF EXISTS public.truncate_dostats_shared_tables();

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
  DELETE FROM public.player_profiles WHERE server = v_server;
  DELETE FROM public.shared_rankings_dostats_snapshots WHERE server_id = v_server;
  DELETE FROM public.shared_rankings_snapshots WHERE server_id = v_server;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_dostats_shared_data_for_server(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_dostats_shared_data_for_server(TEXT) TO service_role;
