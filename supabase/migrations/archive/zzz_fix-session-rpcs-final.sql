-- Impose la version finale des RPC sessions : player_id support + sessions illimitées (maxSessions -1)
-- À exécuter APRÈS add-player-id-to-sessions (préfixe zzz pour ordre lexicographique)
-- insert_user_session_secure : player_id optionnel depuis p_row
-- upsert_user_session_secure : structure add-player-id, sans vérification de limite
CREATE OR REPLACE FUNCTION public.insert_user_session_secure(p_row JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_player_id TEXT := NULLIF(trim(p_row->>'player_id'), '');
  v_player_server TEXT := NULLIF(trim(p_row->>'player_server'), '');
  v_player_pseudo TEXT := NULLIF(trim(p_row->>'player_pseudo'), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;
  PERFORM validate_session_row(p_row);

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
