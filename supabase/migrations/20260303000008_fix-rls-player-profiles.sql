-- ==========================================
-- RLS public.player_profiles : remplace la policy "Service insert/update"
-- (FOR ALL USING (true)) par une policy limitée au rôle service_role.
-- À exécuter si la policy permissive est encore active.
-- ==========================================

DROP POLICY IF EXISTS "Service insert/update" ON public.player_profiles;

CREATE POLICY player_profiles_service_write ON public.player_profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
