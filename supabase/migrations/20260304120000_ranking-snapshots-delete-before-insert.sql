-- Un seul snapshot par serveur : suppression des anciens enregistrements avant insertion.
-- Aligné avec la logique deleteOldSnapshotsForServer() dans src/backend/ranking.js.

-- 1. insert_ranking_snapshot : supprimer les anciens snapshots du serveur puis insérer
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

  DELETE FROM public.shared_rankings_snapshots WHERE server_id = p_server_id;

  INSERT INTO public.shared_rankings_snapshots (server_id, players_json, uploaded_by)
  VALUES (p_server_id, COALESCE(p_players, '[]'::jsonb), auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'DB_ERROR', 'error', SQLERRM, 'id', null);
END;
$$;

-- 2. insert_dostats_snapshot : supprimer les anciens snapshots DOStats du serveur puis insérer
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

  DELETE FROM public.shared_rankings_dostats_snapshots WHERE server_id = p_server_id;

  INSERT INTO public.shared_rankings_dostats_snapshots (server_id, players_json, uploaded_by)
  VALUES (p_server_id, COALESCE(p_players, '[]'::jsonb), auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'DB_ERROR', 'error', SQLERRM, 'id', null);
END;
$$;
