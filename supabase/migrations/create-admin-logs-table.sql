-- ==========================================
-- TABLE ADMIN_LOGS — Journal des actions admin
-- Référencée par les RPC : admin_ban_user, admin_unban_user, admin_change_badge,
-- admin_change_role, admin_add_note, admin_update_profile, get_user_admin_logs, get_admin_logs
-- À exécuter dans l'éditeur SQL Supabase (avant ou avec supabase-rpc-admin.sql)
-- ==========================================

CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  old_value JSONB,
  new_value JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour les requêtes des RPC get_user_admin_logs et get_admin_logs
CREATE INDEX IF NOT EXISTS idx_admin_logs_target_user ON admin_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

-- SELECT : uniquement les utilisateurs dont le rôle ou le badge est ADMIN ou SUPERADMIN
-- (utilise les fonctions SECURITY DEFINER existantes pour éviter récursion RLS sur profiles)
DROP POLICY IF EXISTS "admin_logs_select_admin_superadmin" ON admin_logs;
CREATE POLICY "admin_logs_select_admin_superadmin"
  ON admin_logs FOR SELECT
  USING (
    get_my_profile_role() IN ('ADMIN', 'SUPERADMIN')
    OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN')
  );

-- Pas de policy INSERT : l'insertion se fait uniquement via les RPC SECURITY DEFINER
-- (admin_ban_user, admin_unban_user, admin_change_badge, etc.)
-- Pas de policy UPDATE/DELETE : les logs sont immuables côté utilisateur
