-- ==========================================
-- RPC Supabase — Actions Admin Dashboard
-- À exécuter dans l'éditeur SQL Supabase
-- ==========================================

-- Fonction helper : vérifier si l'appelant est ADMIN ou SUPERADMIN
CREATE OR REPLACE FUNCTION is_admin_or_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role IN ('ADMIN', 'SUPERADMIN') OR badge IN ('ADMIN', 'SUPERADMIN'))
  );
$$;

-- Fonction helper : vérifier si l'appelant est SUPERADMIN
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role = 'SUPERADMIN' OR badge = 'SUPERADMIN')
  );
$$;

-- admin_ban_user
CREATE OR REPLACE FUNCTION admin_ban_user(p_target_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_target RECORD;
BEGIN
  IF NOT is_admin_or_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorisé');
  END IF;
  UPDATE profiles SET status = 'banned', updated_at = now() WHERE id = p_target_id RETURNING * INTO v_target;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;
  INSERT INTO admin_logs (admin_id, target_user_id, action, details)
  VALUES (v_admin_id, p_target_id, 'ban', jsonb_build_object('email', v_target.email));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- admin_unban_user
CREATE OR REPLACE FUNCTION admin_unban_user(p_target_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_target RECORD;
BEGIN
  IF NOT is_admin_or_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorisé');
  END IF;
  UPDATE profiles SET status = 'active', updated_at = now() WHERE id = p_target_id RETURNING * INTO v_target;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;
  INSERT INTO admin_logs (admin_id, target_user_id, action, details)
  VALUES (v_admin_id, p_target_id, 'unban', jsonb_build_object('email', v_target.email));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- admin_change_badge
CREATE OR REPLACE FUNCTION admin_change_badge(p_target_id UUID, p_new_badge TEXT)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_target RECORD;
BEGIN
  IF NOT is_admin_or_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorisé');
  END IF;
  IF p_new_badge NOT IN ('FREE', 'PRO', 'ADMIN', 'SUPERADMIN') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Badge invalide');
  END IF;
  SELECT * INTO v_target FROM profiles WHERE id = p_target_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;
  UPDATE profiles SET badge = p_new_badge, updated_at = now() WHERE id = p_target_id;
  INSERT INTO admin_logs (admin_id, target_user_id, action, details)
  VALUES (v_admin_id, p_target_id, 'badge_change', jsonb_build_object('old', v_target.badge, 'new', p_new_badge));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- [MANUAL] Usage manuel uniquement, pas d'UI associée.
-- admin_change_role
CREATE OR REPLACE FUNCTION admin_change_role(p_target_id UUID, p_new_role TEXT)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_target RECORD;
BEGIN
  IF NOT is_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Réservé aux SuperAdmin');
  END IF;
  IF p_new_role IS NOT NULL AND p_new_role NOT IN ('USER', 'ADMIN', 'SUPERADMIN') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rôle invalide');
  END IF;
  SELECT * INTO v_target FROM profiles WHERE id = p_target_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;
  UPDATE profiles SET role = NULLIF(p_new_role, 'USER'), updated_at = now() WHERE id = p_target_id;
  INSERT INTO admin_logs (admin_id, target_user_id, action, details)
  VALUES (v_admin_id, p_target_id, 'role_change', jsonb_build_object('old', v_target.role, 'new', p_new_role));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- admin_add_note
CREATE OR REPLACE FUNCTION admin_add_note(p_target_id UUID, p_note TEXT)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_meta JSONB;
  v_notes JSONB;
BEGIN
  IF NOT is_admin_or_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorisé');
  END IF;
  SELECT metadata INTO v_meta FROM profiles WHERE id = p_target_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;
  v_notes := COALESCE(v_meta->'admin_notes', '[]'::jsonb) ||
    jsonb_build_array(jsonb_build_object('admin_id', v_admin_id, 'content', p_note, 'ts', now()));
  UPDATE profiles SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{admin_notes}', v_notes), updated_at = now() WHERE id = p_target_id;
  INSERT INTO admin_logs (admin_id, target_user_id, action, details)
  VALUES (v_admin_id, p_target_id, 'add_note', jsonb_build_object('preview', left(p_note, 50)));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- admin_update_profile (status, email, is_suspect, + champs jeu : pseudo, serveur, firme, stats initiales)
-- Version étendue : voir aussi supabase/migrations/extend-admin-update-profile-game-fields.sql
CREATE OR REPLACE FUNCTION admin_update_profile(p_target_id UUID, p_status TEXT DEFAULT NULL, p_is_suspect BOOLEAN DEFAULT NULL, p_email TEXT DEFAULT NULL, p_game_pseudo TEXT DEFAULT NULL, p_server TEXT DEFAULT NULL, p_company TEXT DEFAULT NULL, p_initial_honor BIGINT DEFAULT NULL, p_initial_xp BIGINT DEFAULT NULL, p_initial_rank TEXT DEFAULT NULL, p_initial_rank_points INT DEFAULT NULL, p_next_rank_points INT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  IF NOT is_admin_or_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorisé');
  END IF;
  UPDATE profiles SET
    status = COALESCE(p_status, status),
    is_suspect = COALESCE(p_is_suspect, is_suspect),
    email = COALESCE(p_email, email),
    game_pseudo = CASE WHEN p_game_pseudo IS NOT NULL THEN p_game_pseudo ELSE game_pseudo END,
    server = CASE WHEN p_server IS NOT NULL THEN p_server ELSE server END,
    company = CASE WHEN p_company IS NOT NULL THEN p_company ELSE company END,
    initial_honor = CASE WHEN p_initial_honor IS NOT NULL THEN p_initial_honor ELSE initial_honor END,
    initial_xp = CASE WHEN p_initial_xp IS NOT NULL THEN p_initial_xp ELSE initial_xp END,
    initial_rank = CASE WHEN p_initial_rank IS NOT NULL THEN p_initial_rank ELSE initial_rank END,
    initial_rank_points = CASE WHEN p_initial_rank_points IS NOT NULL THEN p_initial_rank_points ELSE initial_rank_points END,
    next_rank_points = CASE WHEN p_next_rank_points IS NOT NULL THEN p_next_rank_points ELSE next_rank_points END,
    updated_at = now()
  WHERE id = p_target_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;
  INSERT INTO admin_logs (admin_id, target_user_id, action, details)
  VALUES (v_admin_id, p_target_id, 'edit', jsonb_build_object('status', p_status, 'email', p_email));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_user_admin_logs (ADMIN+ peut voir les logs d'un utilisateur)
CREATE OR REPLACE FUNCTION get_user_admin_logs(p_target_id UUID)
RETURNS TABLE(id UUID, admin_id UUID, action TEXT, details JSONB, created_at TIMESTAMPTZ) AS $$
BEGIN
  IF NOT is_admin_or_superadmin() THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT al.id, al.admin_id, al.action, al.details, al.created_at
  FROM admin_logs al
  WHERE al.target_user_id = p_target_id
  ORDER BY al.created_at DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_admin_logs (SUPERADMIN uniquement)
CREATE OR REPLACE FUNCTION get_admin_logs(p_limit INT DEFAULT 100, p_offset INT DEFAULT 0)
RETURNS TABLE(id UUID, admin_id UUID, target_user_id UUID, action TEXT, details JSONB, created_at TIMESTAMPTZ) AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT al.id, al.admin_id, al.target_user_id, al.action, al.details, al.created_at
  FROM admin_logs al
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
