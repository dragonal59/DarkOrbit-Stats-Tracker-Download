-- ==========================================
-- SÉCURITÉ ÉTAPE 5 — Journal des événements de sécurité
-- Date : février 2026
-- Objectif : Enregistrer les dépassements de rate limit et les échecs de
--            validation pour surveillance et détection d'abus.
--
-- À exécuter APRÈS security-step4.
-- ==========================================

-- Table des événements de sécurité
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID,
  rpc_name TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Aucune policy : accès uniquement via RPC SECURITY DEFINER (SUPERADMIN)

-- Fonction : enregistrer un événement de sécurité
CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_rpc_name TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO security_events (event_type, user_id, rpc_name, details)
  VALUES (p_event_type, COALESCE(p_user_id, auth.uid()), p_rpc_name, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
