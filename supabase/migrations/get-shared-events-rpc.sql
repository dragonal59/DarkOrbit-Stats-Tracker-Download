-- RPC lecture shared_events (contourne RLS, toujours fonctionnel)
CREATE OR REPLACE FUNCTION public.get_shared_events()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('events_json', events_json, 'uploaded_at', uploaded_at)
     FROM public.shared_events ORDER BY uploaded_at DESC LIMIT 1),
    '{"events_json":[],"uploaded_at":null}'::jsonb
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_shared_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_events() TO anon;
