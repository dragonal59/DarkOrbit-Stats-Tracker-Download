-- RLS shared_events : lecture publique (événements du jour partagés)
ALTER TABLE public.shared_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_events_select_all" ON public.shared_events;
CREATE POLICY "shared_events_select_all"
  ON public.shared_events FOR SELECT
  USING (true);
