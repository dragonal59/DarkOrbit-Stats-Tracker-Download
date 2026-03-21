-- shared_events : remplacement total à chaque scrap (DELETE + INSERT)
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
  DELETE FROM public.shared_events;
  INSERT INTO public.shared_events (id, events_json, uploaded_at, uploaded_by)
  VALUES (v_id, p_events, now(), p_uploaded_by);
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO service_role;
