-- ==========================================
-- upsert_sidebar_events : après upsert, retirer les lignes dont l'id n'est plus
-- dans le lot scrapé (sinon la table `events` accumule les anciens évènements).
-- Pruning uniquement si au moins un id valide dans p_events (évite wipe sur []).
-- ==========================================

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
  v_valid_count INTEGER;
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
    INSERT INTO public.events (id, visible, expires_at, event_data)
    VALUES (v_id, COALESCE((ev->>'visible')::boolean, true), v_expires_at, v_event_data)
    ON CONFLICT (id) DO UPDATE SET
      visible = EXCLUDED.visible,
      expires_at = EXCLUDED.expires_at,
      event_data = EXCLUDED.event_data;
  END LOOP;

  SELECT count(*)::INTEGER INTO v_valid_count
  FROM jsonb_array_elements(p_events) AS ev2
  WHERE nullif(trim(ev2->>'id'), '') IS NOT NULL;

  IF v_valid_count > 0 THEN
    DELETE FROM public.events AS e
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_events) AS ev3
      WHERE nullif(trim(ev3->>'id'), '') IS NOT NULL
        AND e.id = nullif(trim(ev3->>'id'), '')
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'count', jsonb_array_length(p_events));
END;
$$;

COMMENT ON FUNCTION public.upsert_sidebar_events(JSONB) IS
  'Upsert évènements sidebar depuis le scrape ; supprime les ids absents du payload (sync complète).';

GRANT EXECUTE ON FUNCTION public.upsert_sidebar_events(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_sidebar_events(JSONB) TO anon;
