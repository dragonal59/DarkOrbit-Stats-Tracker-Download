-- ==========================================
-- RLS public.events : remplace les policies permissives (WITH CHECK true / USING true)
-- par des policies restreignant l'écriture aux utilisateurs authentifiés et au propriétaire.
-- À exécuter si les policies events_*_anon sont encore actives (ex. 20260302130001 non appliquée).
-- ==========================================

-- Colonne uploaded_by requise pour events_update_own / events_delete_own
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS uploaded_by UUID;

DROP POLICY IF EXISTS events_insert_anon ON public.events;
DROP POLICY IF EXISTS events_update_anon ON public.events;
DROP POLICY IF EXISTS events_delete_anon ON public.events;

CREATE POLICY events_insert_auth ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY events_update_own ON public.events
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid());

CREATE POLICY events_delete_own ON public.events
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());
