-- Étend admin_update_profile pour permettre aux admins de modifier pseudo, serveur, firme et stats initiales

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id UUID,
  p_status TEXT DEFAULT NULL,
  p_is_suspect BOOLEAN DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_game_pseudo TEXT DEFAULT NULL,
  p_server TEXT DEFAULT NULL,
  p_company TEXT DEFAULT NULL,
  p_initial_honor BIGINT DEFAULT NULL,
  p_initial_xp BIGINT DEFAULT NULL,
  p_initial_rank TEXT DEFAULT NULL,
  p_initial_rank_points INT DEFAULT NULL,
  p_next_rank_points INT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorisé');
  END IF;
  UPDATE public.profiles SET
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
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details)
  VALUES (v_admin_id, p_target_id, 'edit', jsonb_build_object('status', p_status, 'email', p_email));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
