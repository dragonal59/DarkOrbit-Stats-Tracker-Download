-- ==========================================
-- RPC : supprimer toutes les sessions de l'utilisateur connecté
-- Remplace les DELETE directs côté client (auth-manager, hard reset).
-- SECURITY DEFINER : auth.uid() uniquement, pas de paramètre user_id (anti abus).
-- ==========================================

CREATE OR REPLACE FUNCTION public.delete_all_sessions_for_current_user()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_n integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  DELETE FROM public.user_sessions
  WHERE user_id = v_uid;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'deleted', v_n);
END;
$$;

COMMENT ON FUNCTION public.delete_all_sessions_for_current_user() IS
  'Supprime toutes les lignes user_sessions pour auth.uid().';

GRANT EXECUTE ON FUNCTION public.delete_all_sessions_for_current_user() TO authenticated;
