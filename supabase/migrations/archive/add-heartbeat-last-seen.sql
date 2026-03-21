-- ==========================================
-- HEARTBEAT : last_seen_at dans profiles
-- Utilisateurs "connectés" = last_seen_at > now() - 3 minutes
-- ==========================================

-- 1. Ajouter la colonne last_seen_at
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NULL;

-- 2. RPC update_last_seen : met à jour last_seen_at pour l'utilisateur connecté
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen_at = now()
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.update_last_seen() IS 'Heartbeat : met à jour last_seen_at de l''utilisateur connecté.';

-- 3. Mettre à jour get_dashboard_stats pour utiliser last_seen_at
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
  v_total INT;
  v_free INT;
  v_pro INT;
  v_admin INT;
  v_superadmin INT;
  v_sessions_today BIGINT;
  v_connected INT;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;

  SELECT count(*),
    count(*) FILTER (WHERE badge = 'FREE'),
    count(*) FILTER (WHERE badge = 'PRO'),
    count(*) FILTER (WHERE badge = 'ADMIN'),
    count(*) FILTER (WHERE badge = 'SUPERADMIN')
  INTO v_total, v_free, v_pro, v_admin, v_superadmin
  FROM public.profiles;

  SELECT count(*) INTO v_sessions_today
  FROM public.user_sessions
  WHERE session_timestamp >= (extract(epoch from current_date) * 1000)::bigint
    AND session_timestamp < (extract(epoch from current_date + interval '1 day') * 1000)::bigint;

  -- Joueurs actifs = last_seen_at dans les 3 dernières minutes
  SELECT count(*) INTO v_connected
  FROM public.profiles
  WHERE last_seen_at > now() - interval '3 minutes';

  RETURN jsonb_build_object(
    'total_users', coalesce(v_total, 0),
    'free_count', coalesce(v_free, 0),
    'pro_count', coalesce(v_pro, 0),
    'admin_count', coalesce(v_admin, 0),
    'superadmin_count', coalesce(v_superadmin, 0),
    'sessions_today', coalesce(v_sessions_today, 0),
    'connected_users', coalesce(v_connected, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_dashboard_stats() IS 'Stats dashboard. connected_users = last_seen_at > now()-3min. SUPERADMIN uniquement.';
