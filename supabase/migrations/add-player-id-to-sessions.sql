-- ==========================================
-- Migration : player_id dans user_sessions + limites par (user_id, player_id)
-- + RPC get_darkorbit_account_limit
-- ==========================================

-- Action 1 : Colonnes player_id, player_server, player_pseudo
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS player_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS player_server TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS player_pseudo TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_player_id
  ON user_sessions(user_id, player_id);

-- Action 2 : Vider les sessions existantes
DELETE FROM user_sessions;

-- Action 3 : upsert_user_session_secure avec player_id et limite par (user_id, player_id)
CREATE OR REPLACE FUNCTION public.upsert_user_session_secure(
  p_row JSONB,
  p_player_id TEXT DEFAULT NULL,
  p_player_server TEXT DEFAULT NULL,
  p_player_pseudo TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
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

  SELECT public.get_my_badge() INTO v_badge;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');
  v_limit := CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 10
    ELSE 1
  END;

  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count
    FROM public.user_sessions
    WHERE user_id = v_uid
      AND (player_id IS NOT DISTINCT FROM v_player_id)
      AND is_baseline = false;
    IF v_count >= v_limit THEN
      RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte pour ce compte DarkOrbit.', 'code', 'SESSION_LIMIT_PLAYER');
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Action 4 : get_user_latest_stats avec filtre optionnel player_id
CREATE OR REPLACE FUNCTION public.get_user_latest_stats(
  p_user_id UUID,
  p_player_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé aux admins';
  END IF;

  SELECT honor, xp, rank_points, current_rank, session_timestamp
  INTO v_row
  FROM public.user_sessions
  WHERE user_id = p_user_id
    AND (p_player_id IS NULL OR player_id = p_player_id)
  ORDER BY session_timestamp DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('honor', null, 'xp', null, 'rank_points', null, 'grade', null);
  END IF;

  RETURN jsonb_build_object(
    'honor', v_row.honor,
    'xp', v_row.xp,
    'rank_points', v_row.rank_points,
    'grade', v_row.current_rank
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Action 5 : get_darkorbit_account_limit
CREATE OR REPLACE FUNCTION public.get_darkorbit_account_limit()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge TEXT;
BEGIN
  SELECT COALESCE(UPPER(trim(badge)), 'FREE') INTO v_badge
  FROM public.profiles WHERE id = auth.uid();
  RETURN CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 5
    ELSE 1
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_session_secure(JSONB, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_latest_stats(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_darkorbit_account_limit() TO authenticated;

COMMENT ON FUNCTION public.upsert_user_session_secure(JSONB, TEXT, TEXT, TEXT) IS 'Upsert session avec limite par (user_id, player_id). FREE=1, PRO=10 par compte DarkOrbit.';
COMMENT ON FUNCTION public.get_user_latest_stats(UUID, TEXT) IS 'Dernière session joueur pour popup admin. Filtre optionnel par player_id.';
COMMENT ON FUNCTION public.get_darkorbit_account_limit() IS 'Limite comptes DarkOrbit : FREE=1, PRO=5, ADMIN/SUPERADMIN=illimité.';
