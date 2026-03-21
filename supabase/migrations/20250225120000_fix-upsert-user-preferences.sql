-- Fix upsert_user_preferences : signature alignée sur user-preferences-api.js (ligne 38)
-- Paramètres : p_active_player_id, p_active_player_server, p_events_hidden, p_ranking_favorite_server

DROP FUNCTION IF EXISTS public.upsert_user_preferences(TEXT, TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_active_player_id TEXT DEFAULT NULL,
  p_active_player_server TEXT DEFAULT NULL,
  p_events_hidden JSONB DEFAULT NULL,
  p_ranking_favorite_server TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  INSERT INTO public.user_preferences (user_id, active_player_id, active_player_server, events_hidden, ranking_favorite_server, updated_at)
  VALUES (v_uid, NULLIF(trim(COALESCE(p_active_player_id, '')), ''), NULLIF(trim(COALESCE(p_active_player_server, '')), ''), COALESCE(p_events_hidden, '[]'::jsonb), NULLIF(trim(COALESCE(p_ranking_favorite_server, '')), ''))
  ON CONFLICT (user_id) DO UPDATE SET
    active_player_id = CASE WHEN p_active_player_id IS NOT NULL THEN NULLIF(trim(p_active_player_id), '') ELSE user_preferences.active_player_id END,
    active_player_server = CASE WHEN p_active_player_server IS NOT NULL THEN NULLIF(trim(p_active_player_server), '') ELSE user_preferences.active_player_server END,
    events_hidden = COALESCE(p_events_hidden, user_preferences.events_hidden),
    ranking_favorite_server = CASE WHEN p_ranking_favorite_server IS NOT NULL THEN NULLIF(trim(p_ranking_favorite_server), '') ELSE user_preferences.ranking_favorite_server END,
    updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_preferences(TEXT, TEXT, JSONB, TEXT) TO authenticated;
