-- ==========================================
-- Fix get_ranking_comparison : ajout du champ company dans le JSON joueur
-- Objectif : exposer la firme/clan dans les snapshots de comparaison pour
-- permettre le filtrage par compagnie en mode progression (+24h, etc.).
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_ranking_comparison(
  p_server TEXT,
  p_hours  INT DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_id        UUID;
  v_latest_at        TIMESTAMPTZ;
  v_latest_players   JSONB;
  v_ref_id           UUID;
  v_ref_at           TIMESTAMPTZ;
  v_ref_players      JSONB;
  v_server_norm      TEXT;
  v_result_players   JSONB := '[]'::jsonb;
  v_player           JSONB;
  v_ref_player       JSONB;
  v_uid              TEXT;
  v_name             TEXT;
  v_idx              INT;
  v_ref_idx          INT;
  v_honor            NUMERIC;
  v_xp               NUMERIC;
  v_rp               NUMERIC;
  v_ref_honor        NUMERIC;
  v_ref_xp           NUMERIC;
  v_ref_rp           NUMERIC;
  v_cutoff           TIMESTAMPTZ;
BEGIN
  IF p_server IS NULL OR trim(p_server) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_SERVER');
  END IF;

  v_server_norm := lower(trim(p_server));

  -- Snapshot le plus récent pour ce serveur
  SELECT id, scraped_at, players_json
  INTO v_latest_id, v_latest_at, v_latest_players
  FROM public.shared_rankings_snapshots
  WHERE lower(trim(server_id)) = v_server_norm
  ORDER BY scraped_at DESC
  LIMIT 1;

  IF v_latest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_SNAPSHOT');
  END IF;

  -- Cutoff théorique = latest_at - p_hours heures
  v_cutoff := v_latest_at - (p_hours || ' hours')::interval;

  -- Snapshot de référence : le plus récent dans la fenêtre [cutoff - 12h ; cutoff + 12h]
  SELECT id, scraped_at, players_json
  INTO v_ref_id, v_ref_at, v_ref_players
  FROM public.shared_rankings_snapshots
  WHERE lower(trim(server_id)) = v_server_norm
    AND scraped_at >= v_cutoff - interval '12 hours'
    AND scraped_at <= v_cutoff + interval '12 hours'
  ORDER BY scraped_at DESC
  LIMIT 1;

  -- Construire le tableau de joueurs enrichis avec deltas
  -- Chaque joueur du snapshot latest reçoit son delta vs snapshot de référence
  FOR v_idx IN 0 .. jsonb_array_length(v_latest_players) - 1 LOOP
    v_player  := v_latest_players -> v_idx;
    v_uid     := coalesce(v_player ->> 'userId', v_player ->> 'user_id', '');
    v_name    := coalesce(v_player ->> 'name', v_player ->> 'game_pseudo', '');

    -- Valeurs actuelles (latest)
    v_honor := coalesce(
      (v_player ->> 'honor')::numeric,
      (v_player ->> 'honor_value')::numeric,
      (v_player ->> 'honorValue')::numeric,
      0
    );
    v_xp := coalesce(
      (v_player ->> 'experience')::numeric,
      (v_player ->> 'experience_value')::numeric,
      (v_player ->> 'experienceValue')::numeric,
      (v_player ->> 'xp')::numeric,
      0
    );
    v_rp := coalesce(
      (v_player ->> 'top_user')::numeric,
      (v_player ->> 'top_user_value')::numeric,
      (v_player ->> 'topUserValue')::numeric,
      (v_player ->> 'rank_points')::numeric,
      0
    );

    -- Chercher ce joueur dans le snapshot de référence
    v_ref_player := NULL;
    v_ref_honor  := NULL;
    v_ref_xp     := NULL;
    v_ref_rp     := NULL;
    v_ref_idx    := NULL;

    IF v_ref_players IS NOT NULL THEN
      -- Recherche par userId d'abord
      IF v_uid <> '' THEN
        FOR v_ref_idx IN 0 .. jsonb_array_length(v_ref_players) - 1 LOOP
          IF coalesce(v_ref_players -> v_ref_idx ->> 'userId',
                      v_ref_players -> v_ref_idx ->> 'user_id', '') = v_uid THEN
            v_ref_player := v_ref_players -> v_ref_idx;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      -- Fallback par nom si pas trouvé par userId
      IF v_ref_player IS NULL AND v_name <> '' THEN
        FOR v_ref_idx IN 0 .. jsonb_array_length(v_ref_players) - 1 LOOP
          IF coalesce(v_ref_players -> v_ref_idx ->> 'name',
                      v_ref_players -> v_ref_idx ->> 'game_pseudo', '') = v_name THEN
            v_ref_player := v_ref_players -> v_ref_idx;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      IF v_ref_player IS NOT NULL THEN
        v_ref_honor := coalesce(
          (v_ref_player ->> 'honor')::numeric,
          (v_ref_player ->> 'honor_value')::numeric,
          (v_ref_player ->> 'honorValue')::numeric,
          0
        );
        v_ref_xp := coalesce(
          (v_ref_player ->> 'experience')::numeric,
          (v_ref_player ->> 'experience_value')::numeric,
          (v_ref_player ->> 'experienceValue')::numeric,
          (v_ref_player ->> 'xp')::numeric,
          0
        );
        v_ref_rp := coalesce(
          (v_ref_player ->> 'top_user')::numeric,
          (v_ref_player ->> 'top_user_value')::numeric,
          (v_ref_player ->> 'topUserValue')::numeric,
          (v_ref_player ->> 'rank_points')::numeric,
          0
        );
        -- Position dans le snapshot de référence (index 0-based → pos 1-based)
        v_ref_idx := v_ref_idx + 1;
      END IF;
    END IF;

    -- Assembler le joueur enrichi
    v_result_players := v_result_players || jsonb_build_array(
      v_player ||
      jsonb_build_object(
        'company',          v_player ->> 'company',
        '_honor_delta',     CASE WHEN v_ref_honor IS NOT NULL THEN v_honor - v_ref_honor ELSE NULL END,
        '_xp_delta',        CASE WHEN v_ref_xp    IS NOT NULL THEN v_xp    - v_ref_xp    ELSE NULL END,
        '_rp_delta',        CASE WHEN v_ref_rp    IS NOT NULL THEN v_rp    - v_ref_rp    ELSE NULL END,
        '_pos_current',     v_idx + 1,
        '_pos_reference',   v_ref_idx,
        '_pos_delta',       CASE WHEN v_ref_idx IS NOT NULL THEN v_ref_idx - (v_idx + 1) ELSE NULL END,
        '_has_reference',   (v_ref_player IS NOT NULL)
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success',           true,
    'latest_scraped_at', v_latest_at,
    'ref_scraped_at',    v_ref_at,
    'has_reference',     (v_ref_id IS NOT NULL),
    'hours',             p_hours,
    'players',           v_result_players
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'DB_ERROR', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranking_comparison(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_comparison(TEXT, INT) TO anon;

