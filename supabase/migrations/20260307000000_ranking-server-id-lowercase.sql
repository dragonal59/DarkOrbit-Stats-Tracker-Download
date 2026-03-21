-- Normalisation server_id en minuscules pour cohérence scraper / app (PostgreSQL sensible à la casse).
-- 1. Normaliser les lignes existantes
-- 2. RPC insert_dostats_snapshot : stocker et supprimer par server_id en minuscules

-- Données existantes : mettre server_id en minuscules
UPDATE public.shared_rankings_dostats_snapshots
SET server_id = lower(trim(server_id))
WHERE server_id IS NOT NULL AND server_id != lower(trim(server_id));

UPDATE public.shared_rankings_snapshots
SET server_id = lower(trim(server_id))
WHERE server_id IS NOT NULL AND server_id != lower(trim(server_id));

-- insert_dostats_snapshot : toujours stocker et supprimer en minuscules
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
        v_server TEXT;
BEGIN
  v_server := lower(trim(p_server_id));
  IF v_server = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_SERVER', 'id', null);
  END IF;
  IF jsonb_typeof(p_players) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PLAYERS', 'id', null);
  END IF;

  DELETE FROM public.shared_rankings_dostats_snapshots WHERE server_id = v_server;

  INSERT INTO public.shared_rankings_dostats_snapshots (server_id, players_json, uploaded_by)
  VALUES (v_server, COALESCE(p_players, '[]'::jsonb), auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'DB_ERROR', 'error', SQLERRM, 'id', null);
END;
$$;
