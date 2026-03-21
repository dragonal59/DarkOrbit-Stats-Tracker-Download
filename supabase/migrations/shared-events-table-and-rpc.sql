-- Table shared_events : un seul enregistrement (événements du jour), remplacé à chaque scan.
CREATE TABLE IF NOT EXISTS public.shared_events (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  events_json JSONB NOT NULL DEFAULT '[]',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID
);
-- Ajouter uploaded_by si la table existait sans (nullable pour compat).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shared_events' AND column_name = 'uploaded_by') THEN
    ALTER TABLE public.shared_events ADD COLUMN uploaded_by UUID;
  END IF;
END $$;

-- RPC : remplace entièrement les événements. p_uploaded_by = user_id du scraper (obligatoire si colonne NOT NULL).
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
