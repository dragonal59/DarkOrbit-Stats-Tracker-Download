-- Consolidation : RPC admin (src/backend/supabase-rpc-admin.sql)
-- Nécessite : admin_logs, profiles. admin_update_profile dans extend-admin-update-profile-game-fields.
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role IN ('ADMIN','SUPERADMIN') OR badge IN ('ADMIN','SUPERADMIN')));
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'SUPERADMIN' OR badge = 'SUPERADMIN'));
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_ban_user(p_target_id UUID)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid(); v_target RECORD;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN RETURN jsonb_build_object('success', false, 'error', 'Non autorisé'); END IF;
  UPDATE public.profiles SET status = 'banned', updated_at = now() WHERE id = p_target_id RETURNING * INTO v_target;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable'); END IF;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details) VALUES (v_admin_id, p_target_id, 'ban', jsonb_build_object('email', v_target.email));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_unban_user(p_target_id UUID)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid(); v_target RECORD;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN RETURN jsonb_build_object('success', false, 'error', 'Non autorisé'); END IF;
  UPDATE public.profiles SET status = 'active', updated_at = now() WHERE id = p_target_id RETURNING * INTO v_target;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable'); END IF;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details) VALUES (v_admin_id, p_target_id, 'unban', jsonb_build_object('email', v_target.email));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_change_badge(p_target_id UUID, p_new_badge TEXT)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid(); v_target RECORD;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN RETURN jsonb_build_object('success', false, 'error', 'Non autorisé'); END IF;
  IF p_new_badge NOT IN ('FREE','PRO','ADMIN','SUPERADMIN') THEN RETURN jsonb_build_object('success', false, 'error', 'Badge invalide'); END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable'); END IF;
  UPDATE public.profiles SET badge = p_new_badge, updated_at = now() WHERE id = p_target_id;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details) VALUES (v_admin_id, p_target_id, 'badge_change', jsonb_build_object('old', v_target.badge, 'new', p_new_badge));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- [MANUAL] Usage manuel uniquement, pas d'UI associée.
CREATE OR REPLACE FUNCTION public.admin_change_role(p_target_id UUID, p_new_role TEXT)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid(); v_target RECORD;
BEGIN
  IF NOT public.is_superadmin() THEN RETURN jsonb_build_object('success', false, 'error', 'Réservé aux SuperAdmin'); END IF;
  IF p_new_role IS NOT NULL AND p_new_role NOT IN ('USER','ADMIN','SUPERADMIN') THEN RETURN jsonb_build_object('success', false, 'error', 'Rôle invalide'); END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable'); END IF;
  UPDATE public.profiles SET role = NULLIF(p_new_role, 'USER'), updated_at = now() WHERE id = p_target_id;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details) VALUES (v_admin_id, p_target_id, 'role_change', jsonb_build_object('old', v_target.role, 'new', p_new_role));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_add_note(p_target_id UUID, p_note TEXT)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid(); v_meta JSONB; v_notes JSONB;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN RETURN jsonb_build_object('success', false, 'error', 'Non autorisé'); END IF;
  SELECT metadata INTO v_meta FROM public.profiles WHERE id = p_target_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable'); END IF;
  v_notes := COALESCE(v_meta->'admin_notes', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('admin_id', v_admin_id, 'content', p_note, 'ts', now()));
  UPDATE public.profiles SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{admin_notes}', v_notes), updated_at = now() WHERE id = p_target_id;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details) VALUES (v_admin_id, p_target_id, 'add_note', jsonb_build_object('preview', left(p_note, 50)));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_admin_logs(p_target_id UUID)
RETURNS TABLE(id UUID, admin_id UUID, action TEXT, details JSONB, created_at TIMESTAMPTZ) AS $$
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN RETURN; END IF;
  RETURN QUERY SELECT al.id, al.admin_id, al.action, al.details, al.created_at FROM public.admin_logs al WHERE al.target_user_id = p_target_id ORDER BY al.created_at DESC LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_admin_logs(p_limit INT DEFAULT 100, p_offset INT DEFAULT 0)
RETURNS TABLE(id UUID, admin_id UUID, target_user_id UUID, action TEXT, details JSONB, created_at TIMESTAMPTZ) AS $$
BEGIN
  IF NOT public.is_superadmin() THEN RETURN; END IF;
  RETURN QUERY SELECT al.id, al.admin_id, al.target_user_id, al.action, al.details, al.created_at FROM public.admin_logs al ORDER BY al.created_at DESC LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
