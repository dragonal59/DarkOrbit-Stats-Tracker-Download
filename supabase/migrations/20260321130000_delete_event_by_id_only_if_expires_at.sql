-- ==========================================
-- delete_event_by_id : suppression uniquement si expires_at IS NOT NULL
--
-- Les évènements sidebar « permanents » (pas de fin / expires_at NULL) ne doivent
-- pas être effacés par cet RPC — aligné avec cleanup_expired_events() et les règles
-- applicatives (timer = 0 → delete pour les évènements datés uniquement).
-- ==========================================

CREATE OR REPLACE FUNCTION public.delete_event_by_id(p_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.events
  WHERE id = p_id
    AND expires_at IS NOT NULL;
  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.delete_event_by_id(TEXT) IS
  'Supprime un évènement sidebar par id seulement si expires_at est défini (ignore les permanents).';

GRANT EXECUTE ON FUNCTION public.delete_event_by_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_by_id(TEXT) TO anon;
