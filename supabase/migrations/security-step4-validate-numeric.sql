-- ==========================================
-- SÉCURITÉ ÉTAPE 4 — Validation stricte des valeurs numériques
-- Date : février 2026
-- Objectif : Rejeter les valeurs aberrantes (négatives, hors plage)
--            dans les RPC critiques (sessions, inscription).
--
-- Plages DarkOrbit plausibles :
--   honor, xp, rank_points, next_rank_points : 0 à BIGINT max
--   session_timestamp : 0 à année 2100 (ms)
-- À exécuter APRÈS security-step3-rate-limit-rpcs.sql
-- ==========================================

-- Helper : extraction BIGINT sécurisée (évite exception sur chaîne invalide)
CREATE OR REPLACE FUNCTION safe_bigint(p_val TEXT)
RETURNS BIGINT AS $$
BEGIN
  RETURN COALESCE(NULLIF(trim(COALESCE(p_val, '')), '')::BIGINT, 0);
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Constantes de validation (BIGINT max = 2^63 - 1)
-- session_timestamp : max année 2100 ≈ 4102444800000 ms
CREATE OR REPLACE FUNCTION validate_session_row(p_row JSONB)
RETURNS VOID AS $$
DECLARE
  v_honor BIGINT;
  v_xp BIGINT;
  v_rank_points BIGINT;
  v_next_rank_points BIGINT;
  v_ts BIGINT;
  v_max_bigint BIGINT := 9223372036854775807;
  v_max_ts BIGINT := 4102444800000;  -- ~année 2100
BEGIN
  -- Extraction sécurisée via safe_bigint
  v_honor := safe_bigint(p_row->>'honor');
  v_xp := safe_bigint(p_row->>'xp');
  v_rank_points := safe_bigint(p_row->>'rank_points');
  v_next_rank_points := safe_bigint(p_row->>'next_rank_points');
  v_ts := safe_bigint(p_row->>'session_timestamp');
  IF v_ts = 0 THEN
    v_ts := (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT;
  END IF;

  -- Vérifications
  IF v_honor < 0 OR v_honor > v_max_bigint THEN
    RAISE EXCEPTION 'Valeur honor invalide : %', v_honor USING ERRCODE = 'check_violation';
  END IF;
  IF v_xp < 0 OR v_xp > v_max_bigint THEN
    RAISE EXCEPTION 'Valeur xp invalide : %', v_xp USING ERRCODE = 'check_violation';
  END IF;
  IF v_rank_points < 0 OR v_rank_points > v_max_bigint THEN
    RAISE EXCEPTION 'Valeur rank_points invalide : %', v_rank_points USING ERRCODE = 'check_violation';
  END IF;
  IF v_next_rank_points < 0 OR v_next_rank_points > v_max_bigint THEN
    RAISE EXCEPTION 'Valeur next_rank_points invalide : %', v_next_rank_points USING ERRCODE = 'check_violation';
  END IF;
  IF v_ts < 0 OR v_ts > v_max_ts THEN
    RAISE EXCEPTION 'Valeur session_timestamp invalide : %', v_ts USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
