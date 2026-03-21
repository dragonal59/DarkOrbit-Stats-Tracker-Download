-- ==========================================
-- Version finale : get_dashboard_stats + get_user_latest_stats + heartbeat
-- Remplace add-dashboard-stats-rpc.sql et add-heartbeat-last-seen.sql (archivés).
-- - Colonne last_seen_at + RPC update_last_seen (heartbeat)
-- - get_dashboard_stats : connected_users = last_seen_at > now() - 3 min
-- - SET search_path = public sur toutes les RPC
-- ==========================================

-- Colonne et RPC heartbeat (ex-add-heartbeat-last-seen)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.update_last_seen() IS 'Heartbeat : met à jour last_seen_at de l''utilisateur connecté.';

-- Dashboard stats (version heartbeat)
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

  -- Joueurs actifs = last_seen_at dans les 3 dernières minutes (heartbeat)
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

COMMENT ON FUNCTION public.get_dashboard_stats() IS 'Stats dashboard. connected_users = last_seen_at > now()-3min. SUPERADMIN uniquement.';
COMMENT ON FUNCTION public.get_user_latest_stats(UUID) IS 'Dernière session joueur pour popup admin.';
