-- ============================================================
-- RLS : Toutes les tables lisibles/modifiables uniquement par toi
-- ============================================================
-- 1. Remplace TON_EMAIL@exemple.com par ton email Supabase Auth
-- 2. Exécute ce script dans l'éditeur SQL Supabase (Dashboard → SQL Editor)
-- 3. Les RPC (get_visible_events, get_shared_events, etc.) s'exécutent avec
--    le rôle de l'appelant : seuls les lignes autorisées par RLS seront vues.
-- ============================================================

-- À faire avant d'exécuter : remplacer 'TON_EMAIL@exemple.com' par ton email Supabase Auth
-- (Rechercher / Remplacer dans ce fichier : TON_EMAIL@exemple.com → ton@email.com)
--
-- Alternative par UUID : remplacer USING/WITH CHECK par
--   auth.uid() = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid

-- ========== Étape 1 : Supprimer toutes les politiques existantes (schéma public) ==========
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ========== Étape 2 : Activer RLS sur chaque table (si la table existe) ==========
DO $$
DECLARE
  tbl TEXT;
  tables_to_secure TEXT[] := ARRAY[
    'profiles',
    'user_sessions',
    'user_events',
    'user_settings',
    'user_preferences',
    'booster_predictions',
    'admin_messages',
    'admin_logs',
    'permissions_config',
    'player_profiles',
    'shared_rankings_snapshots',
    'shared_rankings_dostats_snapshots',
    'hof_rankings_snapshots',
    'hof_player_profiles',
    'shared_events',
    'events'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_secure
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      RAISE NOTICE 'RLS activé sur public.%', tbl;
    END IF;
  END LOOP;
END $$;

-- ========== Étape 3 : Politique "propriétaire seul" sur chaque table existante ==========
-- Modifie uniquement la ligne owner_email ci-dessous avec ton email Supabase Auth.
DO $$
DECLARE
  tbl TEXT;
  owner_email TEXT := 'TON_EMAIL@exemple.com';  -- <-- Remplace par ton email
  tables_to_secure TEXT[] := ARRAY[
    'profiles', 'user_sessions', 'user_events', 'user_settings', 'user_preferences',
    'booster_predictions', 'admin_messages', 'admin_logs', 'permissions_config',
    'player_profiles', 'shared_rankings_snapshots', 'shared_rankings_dostats_snapshots',
    'hof_rankings_snapshots', 'hof_player_profiles', 'shared_events', 'events'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_secure
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS "owner_only" ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY "owner_only" ON public.%I FOR ALL TO authenticated USING (auth.jwt() ->> ''email'' = %L) WITH CHECK (auth.jwt() ->> ''email'' = %L)',
        tbl, owner_email, owner_email
      );
      RAISE NOTICE 'Politique owner_only appliquée sur public.%', tbl;
    END IF;
  END LOOP;
END $$;
