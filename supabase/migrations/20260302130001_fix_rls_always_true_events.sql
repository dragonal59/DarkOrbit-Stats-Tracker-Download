-- ==========================================
-- Security Advisor : RLS Policy Always True sur public.events
-- Les 3 policies (INSERT, UPDATE, DELETE) utilisaient USING (true) / WITH CHECK (true),
-- ce qui autorisait tout le monde à modifier la table.
--
-- La table events n'a pas de colonne user_id (événements sidebar, globaux).
-- Les écritures réelles passent uniquement par les RPC SECURITY DEFINER :
--   upsert_sidebar_events(), delete_event_by_id(), cleanup_expired_events().
-- On supprime les policies permissives : plus aucune policy INSERT/UPDATE/DELETE
-- pour authenticated/anon, donc les clients ne peuvent plus écrire directement.
-- Les RPC (définies avec le propriétaire de la table) contournent RLS et continuent
-- de fonctionner.
-- ==========================================

DROP POLICY IF EXISTS "events_insert_anon" ON public.events;
DROP POLICY IF EXISTS "events_update_anon" ON public.events;
DROP POLICY IF EXISTS "events_delete_anon" ON public.events;

-- Pas de nouvelle policy INSERT/UPDATE/DELETE pour les rôles client :
-- accès en écriture réservé au propriétaire (RPC SECURITY DEFINER).
