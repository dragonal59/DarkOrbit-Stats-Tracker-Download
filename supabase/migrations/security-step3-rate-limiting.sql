-- ==========================================
-- SÉCURITÉ ÉTAPE 3 — Rate limiting sur les RPC sensibles
-- Date : février 2026
-- Objectif : Limiter le nombre d'appels par utilisateur et par minute
--            pour éviter le spam et les abus.
--
-- PRÉREQUIS : Aucun.
-- À exécuter dans le SQL Editor Supabase.
-- ==========================================

-- Table de suivi des appels (fenêtre glissante 1 minute)
CREATE TABLE IF NOT EXISTS rate_limit_tracker (
  user_id UUID NOT NULL,
  rpc_name TEXT NOT NULL,
  bucket_ts TIMESTAMPTZ NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, rpc_name, bucket_ts)
);

-- Index pour le nettoyage
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracker_bucket
  ON rate_limit_tracker(bucket_ts);

-- RLS : seul le propriétaire (postgres) peut lire/écrire
ALTER TABLE rate_limit_tracker ENABLE ROW LEVEL SECURITY;

-- Aucune policy : seules les RPC SECURITY DEFINER peuvent accéder

-- Fonction : vérifier et enregistrer l'appel. Si limite dépassée, RAISE.
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
  -- Utilisateur anonyme : UUID nul, limite plus stricte (ex: 30/min)
  IF v_uid IS NULL THEN
    v_uid := '00000000-0000-0000-0000-000000000000'::UUID;
    p_max_per_minute := LEAST(p_max_per_minute, 30);
  END IF;

  -- Incrémenter et récupérer le compteur (atomique)
  INSERT INTO rate_limit_tracker (user_id, rpc_name, bucket_ts, call_count)
  VALUES (v_uid, p_rpc_name, v_bucket, 1)
  ON CONFLICT (user_id, rpc_name, bucket_ts)
  DO UPDATE SET call_count = rate_limit_tracker.call_count + 1
  RETURNING call_count INTO v_count;

  IF v_count > p_max_per_minute THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: trop d''appels à %. Réessayez dans une minute.', p_rpc_name
      USING ERRCODE = 'resource_exhausted';
  END IF;

  -- Nettoyage des anciennes entrées (fenêtre 5 min)
  DELETE FROM rate_limit_tracker
  WHERE bucket_ts < now() - interval '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION check_rate_limit(TEXT, INTEGER) IS 'Vérifie le quota d''appels par user et par minute. À appeler au début des RPC sensibles.';
