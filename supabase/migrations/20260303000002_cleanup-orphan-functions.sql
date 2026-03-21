-- Migration : suppression des fonctions SQL orphelines
--
-- handle_updated_at() : trigger créé pour shared_rankings (table supprimée par
--   20260225120013_migrate-rankings-to-snapshots.sql avec DROP TABLE ... CASCADE).
--   Le CASCADE a supprimé le trigger mais pas la fonction — orpheline depuis lors.
--
-- upsert_shared_ranking(TEXT, JSONB) : RPC qui écrivait dans shared_rankings
--   (table supprimée). La fonction existe potentiellement encore en base mais
--   crasherait avec "relation shared_rankings does not exist" si appelée.
--   Remplacée par insert_ranking_snapshot (20260225120011).

DROP FUNCTION IF EXISTS public.handle_updated_at();
DROP FUNCTION IF EXISTS public.upsert_shared_ranking(TEXT, JSONB);
