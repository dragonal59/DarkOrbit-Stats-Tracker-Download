-- Vues popup classement : clé (serveur + user_id JEU), jour calendaire Europe/Paris.
-- L’UUID auth.profiles.id ne correspond pas au user_id des lignes classement (ID DOStats / hof).
-- p_skip_record : consultation de son propre profil → comptage sans INSERT.

DROP FUNCTION IF EXISTS public.record_ranking_profile_view(uuid);
DROP FUNCTION IF EXISTS public.list_ranking_profile_viewers(uuid);

DROP TABLE IF EXISTS public.ranking_profile_views CASCADE;

CREATE TABLE public.ranking_profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewed_server text NOT NULL,
  viewed_game_user_id text NOT NULL,
  viewer_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  day_paris date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Paris')::date)
);

CREATE INDEX idx_ranking_profile_views_lookup
  ON public.ranking_profile_views (viewed_server, viewed_game_user_id, day_paris);

CREATE INDEX idx_ranking_profile_views_viewer_day
  ON public.ranking_profile_views (viewer_user_id, day_paris);

ALTER TABLE public.ranking_profile_views ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ranking_profile_views IS 'Vues profil classement : serveur + user_id jeu, jour Paris, purge jours passés.';

REVOKE ALL ON TABLE public.ranking_profile_views FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.record_ranking_profile_view(
  p_viewed_server text,
  p_viewed_game_user_id text,
  p_skip_record boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_badge text;
  v_total bigint;
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

  IF NOT COALESCE(p_skip_record, false) THEN
    INSERT INTO public.ranking_profile_views (viewed_server, viewed_game_user_id, viewer_user_id, day_paris)
    VALUES (v_srv, v_gid, v_uid, v_day);
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.ranking_profile_views
  WHERE viewed_server = v_srv
    AND viewed_game_user_id = v_gid
    AND day_paris = v_day;

  RETURN jsonb_build_object(
    'success', true,
    'skipped', COALESCE(p_skip_record, false),
    'total', v_total,
    'day_paris', v_day
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_ranking_profile_view(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_ranking_profile_view(text, text, boolean) TO authenticated;

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
    jsonb_build_object('pseudo', sub.pseudo, 'view_count', sub.view_count)
    ORDER BY sub.view_count DESC, sub.pseudo ASC
  ), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      COALESCE(NULLIF(trim(max(p.game_pseudo)::text), ''), '—') AS pseudo,
      count(*)::bigint AS view_count
    FROM public.ranking_profile_views v
    INNER JOIN public.profiles p ON p.id = v.viewer_user_id
    WHERE v.viewed_server = v_srv
      AND v.viewed_game_user_id = v_gid
      AND v.day_paris = v_day
    GROUP BY v.viewer_user_id
  ) sub;

  RETURN jsonb_build_object('success', true, 'viewers', v_rows, 'day_paris', v_day);
END;
$$;

REVOKE ALL ON FUNCTION public.list_ranking_profile_viewers(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_ranking_profile_viewers(text, text) TO authenticated;

COMMENT ON FUNCTION public.record_ranking_profile_view(text, text, boolean) IS 'Compteur vues profil (serveur + id jeu), jour Paris ; skip_record = auto-consultation.';
COMMENT ON FUNCTION public.list_ranking_profile_viewers(text, text) IS 'Liste visiteurs (pseudo, vues) pour le jour Paris en cours.';
