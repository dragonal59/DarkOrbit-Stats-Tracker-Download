-- Corrige upsert_shared_events : supprime DELETE (bloqué par Supabase "DELETE requires WHERE clause")
-- Doit s'exécuter APRÈS shared-events-replace-all.sql
CREATE OR REPLACE FUNCTION public.upsert_shared_events(p_events JSONB DEFAULT '[]'::jsonb, p_uploaded_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EVENTS', 'count', 0);
  END IF;
  v_count := jsonb_array_length(p_events);
  INSERT INTO public.shared_events (id, events_json, uploaded_at, uploaded_by)
  VALUES (v_id, p_events, now(), p_uploaded_by)
  ON CONFLICT (id) DO UPDATE SET
    events_json = EXCLUDED.events_json,
    uploaded_at = EXCLUDED.uploaded_at,
    uploaded_by = COALESCE(EXCLUDED.uploaded_by, public.shared_events.uploaded_by);
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO service_role;
