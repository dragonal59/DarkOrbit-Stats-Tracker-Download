-- ==========================================
-- SÉCURITÉ ÉTAPE 5 (suite) — Logging des refus + RPC export
-- À exécuter APRÈS security-step5-security-events.sql
-- Modifie check_rate_limit et validate_session_row pour enregistrer les refus.
-- ==========================================

-- check_rate_limit : log avant RAISE
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_rpc_name TEXT,
  p_max_per_minute INTEGER DEFAULT 60
)
RETURNS VOID AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_bucket TIMESTAMPTZ := date_trunc('minute', now());
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    v_uid := '00000000-0000-0000-0000-000000000000'::UUID;
    p_max_per_minute := LEAST(p_max_per_minute, 30);
  END IF;

  INSERT INTO rate_limit_tracker (user_id, rpc_name, bucket_ts, call_count)
  VALUES (v_uid, p_rpc_name, v_bucket, 1)
  ON CONFLICT (user_id, rpc_name, bucket_ts)
  DO UPDATE SET call_count = rate_limit_tracker.call_count + 1
  RETURNING call_count INTO v_count;

  IF v_count > p_max_per_minute THEN
    PERFORM log_security_event('RATE_LIMIT_EXCEEDED', v_uid, p_rpc_name,
      jsonb_build_object('count', v_count, 'max', p_max_per_minute));
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: trop d''appels à %. Réessayez dans une minute.', p_rpc_name
      USING ERRCODE = 'resource_exhausted';
  END IF;

  DELETE FROM rate_limit_tracker
  WHERE bucket_ts < now() - interval '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- validate_session_row : log avant RAISE
CREATE OR REPLACE FUNCTION validate_session_row(p_row JSONB)
RETURNS VOID AS $$
DECLARE
  v_honor BIGINT;
  v_xp BIGINT;
  v_rank_points BIGINT;
  v_next_rank_points BIGINT;
  v_ts BIGINT;
  v_max_bigint BIGINT := 9223372036854775807;
  v_max_ts BIGINT := 4102444800000;
BEGIN
  v_honor := safe_bigint(p_row->>'honor');
  v_xp := safe_bigint(p_row->>'xp');
  v_rank_points := safe_bigint(p_row->>'rank_points');
  v_next_rank_points := safe_bigint(p_row->>'next_rank_points');
  v_ts := safe_bigint(p_row->>'session_timestamp');
  IF v_ts = 0 THEN
    v_ts := (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT;
  END IF;

  IF v_honor < 0 OR v_honor > v_max_bigint THEN
    PERFORM log_security_event('VALIDATION_FAILED', auth.uid(), 'insert/upsert_user_session_secure',
      jsonb_build_object('field', 'honor', 'value', v_honor));
    RAISE EXCEPTION 'Valeur honor invalide : %', v_honor USING ERRCODE = 'check_violation';
  END IF;
  IF v_xp < 0 OR v_xp > v_max_bigint THEN
    PERFORM log_security_event('VALIDATION_FAILED', auth.uid(), 'insert/upsert_user_session_secure',
      jsonb_build_object('field', 'xp', 'value', v_xp));
    RAISE EXCEPTION 'Valeur xp invalide : %', v_xp USING ERRCODE = 'check_violation';
  END IF;
  IF v_rank_points < 0 OR v_rank_points > v_max_bigint THEN
    PERFORM log_security_event('VALIDATION_FAILED', auth.uid(), 'insert/upsert_user_session_secure',
      jsonb_build_object('field', 'rank_points', 'value', v_rank_points));
    RAISE EXCEPTION 'Valeur rank_points invalide : %', v_rank_points USING ERRCODE = 'check_violation';
  END IF;
  IF v_next_rank_points < 0 OR v_next_rank_points > v_max_bigint THEN
    PERFORM log_security_event('VALIDATION_FAILED', auth.uid(), 'insert/upsert_user_session_secure',
      jsonb_build_object('field', 'next_rank_points', 'value', v_next_rank_points));
    RAISE EXCEPTION 'Valeur next_rank_points invalide : %', v_next_rank_points USING ERRCODE = 'check_violation';
  END IF;
  IF v_ts < 0 OR v_ts > v_max_ts THEN
    PERFORM log_security_event('VALIDATION_FAILED', auth.uid(), 'insert/upsert_user_session_secure',
      jsonb_build_object('field', 'session_timestamp', 'value', v_ts));
    RAISE EXCEPTION 'Valeur session_timestamp invalide : %', v_ts USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC : récupérer les événements de sécurité (SUPERADMIN uniquement)
CREATE OR REPLACE FUNCTION get_security_events(
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0,
  p_event_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  user_id UUID,
  rpc_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT se.id, se.event_type, se.user_id, se.rpc_name, se.details, se.created_at
  FROM security_events se
  WHERE (p_event_type IS NULL OR se.event_type = p_event_type)
  ORDER BY se.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC : export admin_logs (SUPERADMIN, pour monitoring externe)
CREATE OR REPLACE FUNCTION get_admin_logs_export(
  p_limit INT DEFAULT 500,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  admin_id UUID,
  target_user_id UUID,
  action TEXT,
  details JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT al.id, al.admin_id, al.target_user_id, al.action, al.details, al.created_at
  FROM admin_logs al
  WHERE (p_since IS NULL OR al.created_at >= p_since)
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
