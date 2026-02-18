-- ==========================================
-- SÉCURITÉ ÉTAPE 2 — RLS sur la table permissions_config
-- Date : février 2026
-- Objectif : Bloquer tout accès direct à la table. L'accès se fait
--            uniquement via la RPC get_user_permissions (SECURITY DEFINER).
--
-- PRÉREQUIS : Table permissions_config et RPC get_user_permissions existantes.
-- À exécuter dans le SQL Editor Supabase.
-- ==========================================

-- 1. Révoquer tout accès direct aux rôles clients Supabase
REVOKE ALL ON permissions_config FROM anon;
REVOKE ALL ON permissions_config FROM authenticated;

-- 2. Activer RLS (aucune policy = accès refusé par défaut)
ALTER TABLE permissions_config ENABLE ROW LEVEL SECURITY;

-- 3. Ne pas créer de policy permissive
-- La table n'est lue que par les RPC SECURITY DEFINER (get_user_permissions,
-- et éventuellement d'autres fonctions serveur qui s'exécutent avec les droits
-- du propriétaire et contournent RLS).
-- Les migrations (UPDATE permissions_config) s'exécutent en tant que postgres
-- et contournent également RLS.

COMMENT ON TABLE permissions_config IS 'Configuration des permissions par badge. Accès UNIQUEMENT via RPC get_user_permissions. RLS activé, pas de policy = accès direct refusé.';
