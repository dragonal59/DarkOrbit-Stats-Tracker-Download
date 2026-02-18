-- ==========================================
-- SÉCURITÉ ÉTAPE 4 (suite) — Injection de la validation dans les RPC
-- À exécuter APRÈS security-step4-validate-numeric.sql
-- ==========================================

-- insert_user_session_secure
CREATE OR REPLACE FUNCTION insert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  PERFORM check_rate_limit('insert_user_session_secure', 30);
  PERFORM validate_session_row(p_row);
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;
  INSERT INTO user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    GREATEST(0, LEAST(safe_bigint(p_row->>'honor'), 9223372036854775807)),
    GREATEST(0, LEAST(safe_bigint(p_row->>'xp'), 9223372036854775807)),
    GREATEST(0, LEAST(safe_bigint(p_row->>'rank_points'), 9223372036854775807)),
    GREATEST(0, LEAST(safe_bigint(p_row->>'next_rank_points'), 9223372036854775807)),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    LEAST(GREATEST(CASE WHEN safe_bigint(p_row->>'session_timestamp') = 0 THEN (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT ELSE safe_bigint(p_row->>'session_timestamp') END, 0), 4102444800000),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- upsert_user_session_secure
CREATE OR REPLACE FUNCTION upsert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
  v_honor BIGINT;
  v_xp BIGINT;
  v_rp BIGINT;
  v_nrp BIGINT;
  v_ts BIGINT;
BEGIN
  PERFORM check_rate_limit('upsert_user_session_secure', 60);
  PERFORM validate_session_row(p_row);
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  v_honor := GREATEST(0, LEAST(safe_bigint(p_row->>'honor'), 9223372036854775807));
  v_xp := GREATEST(0, LEAST(safe_bigint(p_row->>'xp'), 9223372036854775807));
  v_rp := GREATEST(0, LEAST(safe_bigint(p_row->>'rank_points'), 9223372036854775807));
  v_nrp := GREATEST(0, LEAST(safe_bigint(p_row->>'next_rank_points'), 9223372036854775807));
  v_ts := LEAST(GREATEST(CASE WHEN safe_bigint(p_row->>'session_timestamp') = 0 THEN (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT ELSE safe_bigint(p_row->>'session_timestamp') END, 0), 4102444800000);

  SELECT EXISTS (
    SELECT 1 FROM user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE user_sessions SET
      honor = v_honor,
      xp = v_xp,
      rank_points = v_rp,
      next_rank_points = v_nrp,
      current_rank = NULLIF(trim(p_row->>'current_rank'), ''),
      note = NULLIF(trim(p_row->>'note'), ''),
      session_date = NULLIF(trim(p_row->>'session_date'), ''),
      session_timestamp = v_ts,
      is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id');
    RETURN jsonb_build_object('success', true);
  END IF;

  INSERT INTO user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    v_honor, v_xp, v_rp, v_nrp,
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    v_ts,
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
