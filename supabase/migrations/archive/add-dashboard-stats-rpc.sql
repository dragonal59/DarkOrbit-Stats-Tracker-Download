-- ==========================================
-- RPC get_dashboard_stats : Vue générale (SUPERADMIN uniquement)
-- Retourne : total_users, free_count, pro_count, admin_count, superadmin_count, sessions_today, connected_users
-- ==========================================
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

  SELECT count(*) INTO v_connected
  FROM auth.sessions;

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

-- ==========================================
-- RPC get_user_latest_stats : Stats joueur pour popup admin (SUPERADMIN/ADMIN)
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_user_latest_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé aux admins';
  END IF;

  SELECT honor, xp, rank_points, current_rank, session_timestamp
  INTO v_row
  FROM public.user_sessions
  WHERE user_id = p_user_id
  ORDER BY session_timestamp DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('honor', null, 'xp', null, 'rank_points', null, 'grade', null);
  END IF;

  RETURN jsonb_build_object(
    'honor', v_row.honor,
    'xp', v_row.xp,
    'rank_points', v_row.rank_points,
    'grade', v_row.current_rank
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_dashboard_stats() IS 'Stats dashboard vue générale. SUPERADMIN uniquement.';
COMMENT ON FUNCTION public.get_user_latest_stats(UUID) IS 'Dernière session joueur pour popup admin.';
