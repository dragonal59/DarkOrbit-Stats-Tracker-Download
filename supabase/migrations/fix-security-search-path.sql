-- Action 1 : SET search_path = public sur les fonctions
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.safe_bigint(TEXT) SET search_path = public;
ALTER FUNCTION public.admin_unban_user(UUID) SET search_path = public;
ALTER FUNCTION public.admin_change_badge(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.admin_change_role(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.admin_add_note(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.is_superadmin() SET search_path = public;
ALTER FUNCTION public.admin_update_profile(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, TEXT, INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION public.get_user_admin_logs(UUID) SET search_path = public;
ALTER FUNCTION public.get_admin_logs(INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION public.admin_send_message(UUID, TEXT, TEXT) SET search_path = public;
-- Action 2 : RLS player_profiles plus strict
DROP POLICY IF EXISTS "Public read access" ON public.player_profiles;
DROP POLICY IF EXISTS "Service insert/update" ON public.player_profiles;

CREATE POLICY "Authenticated read" ON public.player_profiles
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Service write" ON public.player_profiles
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
