-- ==========================================
-- RLS PROFILES — Restriction des champs sensibles (Option A : vue publique)
-- À exécuter APRÈS supabase-fix-profiles-rls.sql (get_my_profile_role/get_my_profile_badge doivent exister)
--
-- Objectif : les utilisateurs normaux ne voient plus tous les champs de tous les profils.
-- - Vue profiles_public : champs publics uniquement, lisible par tous (authenticated).
-- - Table profiles : SELECT complet uniquement pour soi-même (auth.uid() = id) ou pour admins/superadmins.
--
-- Champs PUBLIC (visibles via profiles_public pour tout le monde) :
--   id, username, game_pseudo, server, company, badge, created_at
--
-- Champs SENSIBLES (table profiles, réservés à soi-même ou aux admins) :
--   email, metadata, is_suspect, verification_status, verified_by, verified_at, last_login, status,
--   role, initial_honor, initial_xp, initial_rank, initial_rank_points, next_rank_points, updated_at
--
-- Changements frontend recommandés (à faire dans l'app, pas dans ce script) :
-- - api.js loadUserProfile() : garder from('profiles').select('*').eq('id', user.id) → profil complet pour soi (inchangé).
-- - super-admin.js loadUsers() : garder from('profiles').select(...) → admins voient tout (inchangé).
-- - auth-manager.js : garder from('profiles') pour .select().eq('id', user.id) et .update() sur son profil (inchangé).
-- - Tout appel qui listerait des profils "pour affichage public" (ex. classement, recherche joueur) : utiliser
--   from('profiles_public') au lieu de from('profiles') pour n'exposer que les colonnes publiques.
-- ==========================================

-- ---------------------------------------------------------------------------
-- 1. Vue publique (colonnes non sensibles uniquement)
-- Exécutée avec les droits du propriétaire → contourne RLS sur profiles
-- pour retourner toutes les lignes avec uniquement les champs publics.
-- ---------------------------------------------------------------------------
-- Vue exécutée avec les droits du propriétaire → lecture complète de profiles (contourne RLS)
DROP VIEW IF EXISTS profiles_public;
CREATE VIEW profiles_public AS
SELECT
  id,
  username,
  game_pseudo,
  server,
  company,
  badge,
  created_at
FROM public.profiles;

COMMENT ON VIEW profiles_public IS 'Champs publics des profils (RLS). Pour listing public utiliser cette vue ; pour son profil ou dashboard admin utiliser la table profiles.';

-- Lecture autorisée pour les rôles Supabase (authenticated = utilisateurs connectés)
GRANT SELECT ON profiles_public TO authenticated;
GRANT SELECT ON profiles_public TO anon;

-- ---------------------------------------------------------------------------
-- 2. RLS sur la table profiles : remplacer "tout le monde voit tout" par règles ciblées
-- ---------------------------------------------------------------------------

-- Supprimer les policies de lecture existantes
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;

-- SELECT : uniquement son propre profil (tous les champs)
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- SELECT : admins et superadmins voient tous les profils (tous les champs)
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  USING (
    get_my_profile_role() IN ('ADMIN', 'SUPERADMIN')
    OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN')
  );

-- Les policies UPDATE, INSERT existantes (profiles_update_own, profiles_update_admin, profiles_insert_own)
-- ne sont pas modifiées par ce script.
