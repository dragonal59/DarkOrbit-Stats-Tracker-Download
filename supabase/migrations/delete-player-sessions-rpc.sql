-- ==========================================
-- RPC : Supprimer les sessions d'un player_id pour l'utilisateur courant
-- ==========================================
CREATE OR REPLACE FUNCTION public.delete_player_sessions(p_player_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_sessions
  WHERE user_id = auth.uid()
    AND (player_id IS NOT DISTINCT FROM p_player_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_player_sessions(TEXT) TO authenticated;

COMMENT ON FUNCTION public.delete_player_sessions(TEXT) IS 'Supprime les sessions du player_id pour l''utilisateur connecté.';
