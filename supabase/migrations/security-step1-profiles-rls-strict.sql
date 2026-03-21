-- ==========================================
-- SÉCURITÉ ÉTAPE 1 — Policies strictes sur la table profiles
-- Date : février 2026
-- Objectif : Supprimer toute policy permissive (USING true) et limiter
--            la lecture aux utilisateurs eux-mêmes et aux administrateurs.
--
-- PRÉREQUIS : Table profiles existante, avec colonnes id, role, badge.
-- À exécuter dans le SQL Editor Supabase.
-- ==========================================

-- 1. Fonctions SECURITY DEFINER (évitent la récursion RLS)
CREATE OR REPLACE FUNCTION public.get_my_profile_role()
RETURNS TEXT AS $$
  SELECT COALESCE(role, 'USER') FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

CREATE OR REPLACE FUNCTION public.get_my_profile_badge()
RETURNS TEXT AS $$
  SELECT COALESCE(badge, 'FREE') FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- 2. Supprimer la policy permissive (si elle existe)
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;

-- 3. Supprimer les anciennes policies de lecture (au cas où)
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read for users" ON profiles;
DROP POLICY IF EXISTS "Enable read for admins to all profiles" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

-- 4. Créer les policies STRICTES de lecture
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  USING (
    get_my_profile_role() IN ('ADMIN', 'SUPERADMIN')
    OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN')
  );

-- 5. S'assurer que les policies UPDATE et INSERT existent
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update_own') THEN
    CREATE POLICY "profiles_update_own"
      ON profiles FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update_admin') THEN
    CREATE POLICY "profiles_update_admin"
      ON profiles FOR UPDATE
      USING (get_my_profile_role() IN ('ADMIN', 'SUPERADMIN') OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN'))
      WITH CHECK (get_my_profile_role() IN ('ADMIN', 'SUPERADMIN') OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_insert_own') THEN
    CREATE POLICY "profiles_insert_own"
      ON profiles FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 6. Vue publique (données non sensibles pour classement, etc.)
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

COMMENT ON VIEW profiles_public IS 'Champs publics des profils. Utiliser pour classement, listing. Table profiles pour son profil ou dashboard admin.';

GRANT SELECT ON profiles_public TO authenticated;
GRANT SELECT ON profiles_public TO anon;

-- 7. Activer RLS (au cas où)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
