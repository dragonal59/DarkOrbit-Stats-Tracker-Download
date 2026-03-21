-- Table shared_manual_events : événements manuels partagés (admin)
-- Une ligne par push admin, pull récupère la plus récente (order by uploaded_at desc limit 1)
CREATE TABLE IF NOT EXISTS public.shared_manual_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  events_json JSONB NOT NULL DEFAULT '[]',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_manual_events_uploaded_at
  ON public.shared_manual_events(uploaded_at DESC);

ALTER TABLE public.shared_manual_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_manual_events_select_all" ON public.shared_manual_events;
CREATE POLICY "shared_manual_events_select_all"
  ON public.shared_manual_events FOR SELECT
  USING (true);

-- RPC : upsert (INSERT nouvelle ligne) — ADMIN/SUPERADMIN uniquement
-- sync-manager attend : { success: true, count: N }
CREATE OR REPLACE FUNCTION public.upsert_shared_manual_events(p_events JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated', 'count', 0);
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (badge IN ('ADMIN', 'SUPERADMIN') OR role IN ('ADMIN', 'SUPERADMIN'))
  ) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_required', 'count', 0);
  END IF;
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EVENTS', 'count', 0);
  END IF;
  v_count := jsonb_array_length(p_events);
  INSERT INTO public.shared_manual_events (events_json) VALUES (p_events);
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_shared_manual_events(JSONB) TO authenticated;
