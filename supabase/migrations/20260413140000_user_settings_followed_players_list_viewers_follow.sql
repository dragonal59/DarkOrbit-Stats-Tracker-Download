-- Suivis : stockage cloud (user_settings) pour RPC list_ranking_profile_viewers (colonne « Suivi »).

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS followed_players_json JSONB NULL;

COMMENT ON COLUMN public.user_settings.followed_players_json IS 'Liste suivis (client). NULL = jamais poussé ; RPC traite NULL comme [].';

CREATE OR REPLACE FUNCTION public.list_ranking_profile_viewers(
  p_viewed_server text,
  p_viewed_game_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_badge text;
  v_rows jsonb;
  v_day date := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Paris')::date;
  v_srv text := lower(trim(p_viewed_server));
  v_gid text := trim(p_viewed_game_user_id);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF v_srv = '' OR v_gid = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_target');
  END IF;

  SELECT COALESCE(NULLIF(trim(badge::text), ''), 'FREE') INTO v_badge
  FROM public.profiles WHERE id = v_uid;
  IF v_badge IS NULL THEN
    v_badge := 'FREE';
  END IF;
  IF v_badge = 'FREE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  DELETE FROM public.ranking_profile_views WHERE day_paris < v_day;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'pseudo', fo.pseudo,
      'view_count', fo.view_count,
      'follows_target', fo.follows_target
    )
    ORDER BY fo.view_count DESC, fo.pseudo ASC
  ), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      sub.pseudo,
      sub.view_count,
      EXISTS (
        SELECT 1
        FROM public.user_settings us
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(us.followed_players_json, '[]'::jsonb)) AS elem
        WHERE us.user_id = sub.viewer_user_id
          AND lower(trim(COALESCE(elem->> '_server', elem->> 'server', ''))) = v_srv
          AND trim(COALESCE(elem->> 'user_id', elem->> 'userId', '')) = v_gid
      ) AS follows_target
    FROM (
      SELECT
        v.viewer_user_id,
        COALESCE(NULLIF(trim(max(p.game_pseudo)::text), ''), '—') AS pseudo,
        count(*)::bigint AS view_count
      FROM public.ranking_profile_views v
      INNER JOIN public.profiles p ON p.id = v.viewer_user_id
      WHERE v.viewed_server = v_srv
        AND v.viewed_game_user_id = v_gid
        AND v.day_paris = v_day
      GROUP BY v.viewer_user_id
    ) sub
  ) fo;

  RETURN jsonb_build_object('success', true, 'viewers', v_rows, 'day_paris', v_day);
END;
$$;

REVOKE ALL ON FUNCTION public.list_ranking_profile_viewers(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_ranking_profile_viewers(text, text) TO authenticated;

COMMENT ON FUNCTION public.list_ranking_profile_viewers(text, text) IS 'Visiteurs du jour (pseudo, vues, suit la cible id jeu + serveur).';
