-- Migration : ajouter is_baseline à user_sessions
-- Exécuter dans l'éditeur SQL Supabase si la colonne n'existe pas

ALTER TABLE user_sessions
ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN DEFAULT false;

-- Index pour requêtes filtrant sur baseline
CREATE INDEX IF NOT EXISTS idx_user_sessions_baseline ON user_sessions(user_id, is_baseline) WHERE is_baseline = true;
