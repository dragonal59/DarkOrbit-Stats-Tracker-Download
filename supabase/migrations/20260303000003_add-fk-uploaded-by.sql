-- Migration : ajout des foreign keys sur la colonne uploaded_by
-- Ces colonnes référencent des utilisateurs sans FK formelle.
-- ON DELETE SET NULL : si l'utilisateur est supprimé, la traçabilité est
-- conservée (ligne gardée) mais l'attributeur devient NULL.

ALTER TABLE public.shared_rankings_snapshots
  ADD CONSTRAINT fk_snapshots_uploaded_by
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.shared_rankings_dostats_snapshots
  ADD CONSTRAINT fk_dostats_snapshots_uploaded_by
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.shared_events
  ADD CONSTRAINT fk_shared_events_uploaded_by
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
