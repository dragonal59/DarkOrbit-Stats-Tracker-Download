-- RPC : upsert événements (scraper/client). event_data contient name, description, imageUrl, etc.
CREATE OR REPLACE FUNCTION public.upsert_sidebar_events(p_events JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev JSONB;
  v_id TEXT;
  v_expires_at TIMESTAMPTZ;
  v_event_data JSONB;
BEGIN
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'count', 0);
  END IF;
  FOR ev IN SELECT * FROM jsonb_array_elements(p_events)
  LOOP
    v_id := nullif(trim(ev->>'id'), '');
    IF v_id IS NULL THEN CONTINUE; END IF;
    v_expires_at := NULL;
    IF (ev->>'expires_at') IS NOT NULL AND (ev->>'expires_at') != '' THEN
      v_expires_at := (ev->>'expires_at')::timestamptz;
    END IF;
    v_event_data := COALESCE(ev->'event_data', ev - 'id' - 'expires_at' - 'visible');
    INSERT INTO events (id, visible, expires_at, event_data)
    VALUES (v_id, COALESCE((ev->>'visible')::boolean, true), v_expires_at, v_event_data)
    ON CONFLICT (id) DO UPDATE SET
      visible = EXCLUDED.visible,
      expires_at = EXCLUDED.expires_at,
      event_data = EXCLUDED.event_data;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'count', jsonb_array_length(p_events));
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_sidebar_events(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_sidebar_events(JSONB) TO anon;

-- RPC : récupérer les événements visibles (non expirés si expires_at présent)
CREATE OR REPLACE FUNCTION public.get_visible_events()
RETURNS SETOF public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM events
  WHERE visible = true
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY expires_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_events() TO anon;

-- RPC : supprimer un événement par id (appelé par le client quand timer = 0)
CREATE OR REPLACE FUNCTION public.delete_event_by_id(p_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM events WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_event_by_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_by_id(TEXT) TO anon;

-- Fonction de nettoyage : supprime les événements expirés (cron horaire)
-- Ne jamais supprimer où expires_at IS NULL
CREATE OR REPLACE FUNCTION public.cleanup_expired_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM events
    WHERE expires_at IS NOT NULL AND expires_at < now()
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_deleted FROM deleted;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_events() TO service_role;
