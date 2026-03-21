-- ==========================================
-- RPC bulk : plusieurs sessions en un aller-retour HTTP
-- Réutilise upsert_user_session_secure (limites FREE/PRO, validate_session_row).
-- ==========================================

CREATE OR REPLACE FUNCTION public.upsert_user_sessions_bulk(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  elem jsonb;
  v_res jsonb;
  v_ok integer := 0;
  v_fail integer := 0;
  v_first_err text;
  v_first_code text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'p_rows doit être un tableau JSON',
      'code', 'INVALID_INPUT',
      'upserted', 0,
      'failed', 0
    );
  END IF;

  FOR elem IN SELECT j FROM jsonb_array_elements(p_rows) AS t(j)
  LOOP
    BEGIN
      v_res := public.upsert_user_session_secure(elem);
      IF COALESCE((v_res->>'success')::boolean, false) THEN
        v_ok := v_ok + 1;
      ELSE
        v_fail := 1;
        v_first_err := COALESCE(v_res->>'error', 'upsert_failed');
        v_first_code := v_res->>'code';
        EXIT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fail := 1;
      v_first_err := SQLERRM;
      v_first_code := 'exception';
      EXIT;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', v_fail = 0,
    'upserted', v_ok,
    'failed', v_fail,
    'error', v_first_err,
    'code', v_first_code
  );
END;
$$;

COMMENT ON FUNCTION public.upsert_user_sessions_bulk(jsonb) IS
  'Upsert séquentiel de plusieurs sessions (même payload que upsert_user_session_secure par élément). Arrêt au premier échec.';

GRANT EXECUTE ON FUNCTION public.upsert_user_sessions_bulk(jsonb) TO authenticated;
