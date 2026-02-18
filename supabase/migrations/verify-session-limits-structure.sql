-- ==========================================
-- VÉRIFICATION STRUCTURELLE (à exécuter après les 3 migrations)
-- Ne modifie rien ; uniquement des SELECT pour valider la config.
-- ==========================================

-- 1. Table user_sessions existe
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'user_sessions'
) AS "table_user_sessions_exists";

-- 2. RLS activé sur user_sessions
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname = 'user_sessions' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 3. Policies sur user_sessions (aucune policy INSERT)
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_sessions'
ORDER BY policyname;
-- Attendu : uniquement SELECT, UPDATE, DELETE (pas de ligne avec cmd = 'INSERT' ou '*' incluant INSERT)

-- 4. Fonctions RPC existent
SELECT proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname IN ('insert_user_session_secure', 'upsert_user_session_secure', 'get_user_permissions', 'get_my_badge')
ORDER BY proname;

-- 5. Résumé : nombre de policies par type sur user_sessions
SELECT cmd, COUNT(*) AS count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_sessions'
GROUP BY cmd;
