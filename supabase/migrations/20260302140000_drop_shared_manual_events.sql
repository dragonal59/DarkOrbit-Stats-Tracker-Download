-- ==========================================
-- Suppression de la table obsolète shared_manual_events
-- Les événements sont désormais scrapés directement depuis DarkOrbit (shared_events / events).
-- Dépendances : RPC upsert_shared_manual_events (à supprimer avant la table),
--               policy shared_manual_events_select_all, index idx_shared_manual_events_uploaded_at
--               → CASCADE les supprime avec la table.
-- Aucune vue, trigger ou FK d'une autre table ne référence shared_manual_events.
-- ==========================================

DROP FUNCTION IF EXISTS public.upsert_shared_manual_events(JSONB);

DROP TABLE IF EXISTS public.shared_manual_events CASCADE;
