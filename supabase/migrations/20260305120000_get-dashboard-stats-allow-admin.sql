-- get_dashboard_stats : autoriser aussi le badge ADMIN (pas seulement SUPERADMIN).
-- Utilise is_admin_or_superadmin() au lieu de is_superadmin().

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
  IF NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé aux ADMIN et SUPERADMIN';
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

COMMENT ON FUNCTION public.get_dashboard_stats() IS 'Stats dashboard. connected_users = last_seen_at > now()-3min. ADMIN et SUPERADMIN.';
