-- ==========================================
-- ⚠️ SCRIPT DESTRUCTEUR — NE PAS EXÉCUTER EN PRODUCTION
-- ==========================================
--
-- Cas d'usage légitime : reset total des policies RLS en DÉVELOPPEMENT uniquement
-- (ex. schéma local ou base de test à réinitialiser). À ne jamais exécuter en
-- production : supprime TOUTES les policies de toutes les tables public sans
-- confirmation ni contrainte d'environnement.
--
-- Pour utiliser ce script, tu dois d'abord renommer ce fichier en :
--   RUN_FIRST_drop_policies.CONFIRMED.sql
-- puis SUPPRIMER ou commenter le bloc DO $$ ci-dessous (lignes 18-23).
-- Sans cette action manuelle, ce script lève une erreur immédiate.
--
-- ==========================================

DO $$
BEGIN
  RAISE EXCEPTION
    'SÉCURITÉ : Renomme ce fichier en RUN_FIRST_drop_policies.CONFIRMED.sql et supprime ce bloc DO avant exécution';
END $$;

-- 1. Drop policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2. Drop get_ranking (conflit INTEGER vs BIGINT)
DROP FUNCTION IF EXISTS public.get_ranking(text, text[], text, integer);
DROP FUNCTION IF EXISTS public.get_ranking(text, text[], text, int);
