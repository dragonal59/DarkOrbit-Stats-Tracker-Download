-- ==========================================
-- Correction des limites de sessions
-- Réécrit insert_user_session_secure et upsert_user_session_secure
-- avec les vraies limites métier (baseline exclue du total).
--
-- Règles :
-- - FREE : max 1 session (hors baseline)
-- - PRO : max 10 sessions (hors baseline)
-- - ADMIN / SUPERADMIN : illimité
-- - Badge NULL ou inconnu → limites FREE
--
-- À exécuter dans le SQL Editor Supabase.
-- ==========================================

CREATE OR REPLACE FUNCTION public.insert_user_session_secure(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT COALESCE(NULLIF(trim(badge), ''), 'FREE') INTO v_badge
  FROM public.profiles WHERE id = v_uid;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');

  v_limit := CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 10
    ELSE 1
  END;

  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count
    FROM public.user_sessions
    WHERE user_id = v_uid AND (is_baseline = false OR is_baseline IS NULL);
    IF v_count >= v_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', CASE
          WHEN v_badge = 'FREE' THEN 'Limite atteinte : les utilisateurs FREE ne peuvent avoir qu''1 session. Passez en PRO pour plus de sessions.'
          ELSE 'Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN.'
        END,
        'code', 'LIMIT_REACHED'
      );
    END IF;
  END IF;

  INSERT INTO public.user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_user_session_secure(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
  v_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE public.user_sessions SET
      honor = COALESCE((p_row->>'honor')::BIGINT, 0),
      xp = COALESCE((p_row->>'xp')::BIGINT, 0),
      rank_points = COALESCE((p_row->>'rank_points')::BIGINT, 0),
      next_rank_points = COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
      current_rank = NULLIF(trim(p_row->>'current_rank'), ''),
      note = NULLIF(trim(p_row->>'note'), ''),
      session_date = NULLIF(trim(p_row->>'session_date'), ''),
      session_timestamp = COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
      is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id');
    RETURN jsonb_build_object('success', true);
  END IF;

  SELECT COALESCE(NULLIF(trim(badge), ''), 'FREE') INTO v_badge
  FROM public.profiles WHERE id = v_uid;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');

  v_limit := CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 10
    ELSE 1
  END;

  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count
    FROM public.user_sessions
    WHERE user_id = v_uid AND (is_baseline = false OR is_baseline IS NULL);
    IF v_count >= v_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', CASE
          WHEN v_badge = 'FREE' THEN 'Limite atteinte : les utilisateurs FREE ne peuvent avoir qu''1 session. Passez en PRO pour plus de sessions.'
          ELSE 'Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN.'
        END,
        'code', 'LIMIT_REACHED'
      );
    END IF;
  END IF;

  INSERT INTO public.user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  )
  ON CONFLICT (user_id, local_id) DO UPDATE SET
    honor = EXCLUDED.honor,
    xp = EXCLUDED.xp,
    rank_points = EXCLUDED.rank_points,
    next_rank_points = EXCLUDED.next_rank_points,
    current_rank = EXCLUDED.current_rank,
    note = EXCLUDED.note,
    session_date = EXCLUDED.session_date,
    session_timestamp = EXCLUDED.session_timestamp,
    is_baseline = EXCLUDED.is_baseline,
    updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$function$;

COMMENT ON FUNCTION public.insert_user_session_secure(jsonb) IS 'Insertion session avec limite : FREE=1, PRO=10 (hors baseline), ADMIN/SUPERADMIN=illimité. Code LIMIT_REACHED si quota dépassé.';
COMMENT ON FUNCTION public.upsert_user_session_secure(jsonb) IS 'Upsert session avec limite ; mise à jour d''une session existante ne compte pas dans le quota. Baseline exclue du décompte.';
