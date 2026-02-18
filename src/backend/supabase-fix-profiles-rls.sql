-- ==========================================
-- CORRECTION RLS PROFILES - Suppression boucle infinie
-- À exécuter dans l'éditeur SQL Supabase
--
-- Prérequis : La table profiles doit exister avec les colonnes id, role, badge
-- (créée par défaut avec Supabase Auth ou votre schéma)
-- ==========================================

-- ÉTAPE A : Supprimer TOUTES les policies existantes sur profiles
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read for users" ON profiles;
DROP POLICY IF EXISTS "Enable read for admins to all profiles" ON profiles;
DROP POLICY IF EXISTS "Enable update for admins" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
-- Tenter de supprimer toute policy dont le nom contient "profile" (au cas où)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', r.policyname);
    RAISE NOTICE 'Dropped policy: %', r.policyname;
  END LOOP;
END $$;

-- ÉTAPE B : Créer une fonction SECURITY DEFINER pour éviter la récursion
-- Cette fonction lit profiles SANS déclencher RLS (droit du propriétaire)
CREATE OR REPLACE FUNCTION public.get_my_profile_role()
RETURNS TEXT AS $$
  SELECT COALESCE(role, 'USER') FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

CREATE OR REPLACE FUNCTION public.get_my_profile_badge()
RETURNS TEXT AS $$
  SELECT COALESCE(badge, 'FREE') FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- ÉTAPE C : Recréer les policies STRICTES (sécurité maximale)
-- Policy 1 : Lecture - uniquement son propre profil OU admins/superadmins
-- ATTENTION : Ne pas utiliser USING (true) — exposition des données sensibles (email, metadata).
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  USING (
    get_my_profile_role() IN ('ADMIN', 'SUPERADMIN')
    OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN')
  );

-- Policy 2 : Mise à jour de son propre profil
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 3 : Admin peut tout modifier - utilise la fonction (pas de SELECT direct sur profiles)
CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE
  USING (get_my_profile_role() IN ('ADMIN', 'SUPERADMIN') OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN'))
  WITH CHECK (get_my_profile_role() IN ('ADMIN', 'SUPERADMIN') OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN'));

-- Policy 4 : Insertion - utilisateur peut créer son propre profil (trigger signup)
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- S'assurer que RLS est activé
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
