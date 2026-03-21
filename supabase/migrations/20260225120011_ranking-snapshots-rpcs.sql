-- RPCs pour snapshots classement + DOStats

-- 1. insert_ranking_snapshot — INSERT uniquement (pas de merge)
CREATE OR REPLACE FUNCTION public.insert_ranking_snapshot(
  p_server_id TEXT,
  p_players JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_server_id IS NULL OR trim(p_server_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_SERVER', 'id', null);
  END IF;
  IF jsonb_typeof(p_players) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PLAYERS', 'id', null);
  END IF;

  INSERT INTO public.shared_rankings_snapshots (server_id, players_json, uploaded_by)
  VALUES (p_server_id, COALESCE(p_players, '[]'::jsonb), auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'DB_ERROR', 'error', SQLERRM, 'id', null);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_ranking_snapshot(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_ranking_snapshot(TEXT, JSONB) TO anon;

-- 2. insert_dostats_snapshot
CREATE OR REPLACE FUNCTION public.insert_dostats_snapshot(
  p_server_id TEXT,
  p_players JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_server_id IS NULL OR trim(p_server_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_SERVER', 'id', null);
  END IF;
  IF jsonb_typeof(p_players) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PLAYERS', 'id', null);
  END IF;

  INSERT INTO public.shared_rankings_dostats_snapshots (server_id, players_json, uploaded_by)
  VALUES (p_server_id, COALESCE(p_players, '[]'::jsonb), auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'DB_ERROR', 'error', SQLERRM, 'id', null);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_dostats_snapshot(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_dostats_snapshot(TEXT, JSONB) TO anon;
