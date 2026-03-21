-- ==========================================
-- Source de vérité unique — insert_user_session_secure / upsert_user_session_secure
-- Archiver tous les autres fichiers session RPCs (security-step3, remove-session-limits-unlimited,
-- fix-session-limits, zzz_fix-session-rpcs-final, RUN_MIGRATIONS_SESSION_LIMITS,
-- supabase-rpc-session-limits, 20250225120001, session-limits-rpc-and-rls, add-player-id-to-sessions).
--
-- Contient : limites FREE=1 / PRO=10 (hors baseline), validate_session_row intégré,
-- support player_id/player_server/player_pseudo, SET search_path = public.
-- ==========================================

-- Ordre : upsert (1 arg puis 4 args) puis insert, pour éviter ambiguïté
DROP FUNCTION IF EXISTS public.upsert_user_session_secure(JSONB);
DROP FUNCTION IF EXISTS public.upsert_user_session_secure(JSONB, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.insert_user_session_secure(JSONB);

CREATE OR REPLACE FUNCTION public.insert_user_session_secure(p_row JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
  v_player_id TEXT := NULLIF(trim(p_row->>'player_id'), '');
  v_player_server TEXT := NULLIF(trim(p_row->>'player_server'), '');
  v_player_pseudo TEXT := NULLIF(trim(p_row->>'player_pseudo'), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;
  PERFORM validate_session_row(p_row);

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
    current_rank, note, session_date, session_timestamp, is_baseline,
    player_id, player_server, player_pseudo
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
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
    v_player_id,
    v_player_server,
    v_player_pseudo
  );
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_user_session_secure(
  p_row JSONB,
  p_player_id TEXT DEFAULT NULL,
  p_player_server TEXT DEFAULT NULL,
  p_player_pseudo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
  v_exists BOOLEAN;
  v_player_id TEXT := COALESCE(NULLIF(trim(p_player_id), ''), NULLIF(trim(p_row->>'player_id'), ''));
  v_player_server TEXT := COALESCE(NULLIF(trim(p_player_server), ''), NULLIF(trim(p_row->>'player_server'), ''));
  v_player_pseudo TEXT := COALESCE(NULLIF(trim(p_player_pseudo), ''), NULLIF(trim(p_row->>'player_pseudo'), ''));
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;
  PERFORM validate_session_row(p_row);

  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
      AND (player_id IS NOT DISTINCT FROM v_player_id)
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
      player_id = v_player_id,
      player_server = v_player_server,
      player_pseudo = v_player_pseudo,
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
      AND (player_id IS NOT DISTINCT FROM v_player_id);
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
    current_rank, note, session_date, session_timestamp, is_baseline,
    player_id, player_server, player_pseudo
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
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
    v_player_id,
    v_player_server,
    v_player_pseudo
  );
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_user_session_secure(JSONB) TO authenticated;
-- Une seule signature en base : (JSONB, TEXT, TEXT, TEXT) ; appel possible avec 1 ou 4 args
GRANT EXECUTE ON FUNCTION public.upsert_user_session_secure(JSONB, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.insert_user_session_secure(JSONB) IS 'Insertion session avec limite : FREE=1, PRO=10 (hors baseline), ADMIN/SUPERADMIN=illimité. validate_session_row intégré. Code LIMIT_REACHED si quota dépassé.';
COMMENT ON FUNCTION public.upsert_user_session_secure(JSONB, TEXT, TEXT, TEXT) IS 'Upsert session avec limite ; mise à jour d''une session existante ne compte pas dans le quota. Baseline exclue du décompte. Appel avec 1 arg (p_row) ou 4 args (p_row, p_player_id, p_player_server, p_player_pseudo).';
