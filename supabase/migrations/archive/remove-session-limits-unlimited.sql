-- ==========================================
-- Supprimer les limites de sessions : illimité pour FREE, PRO, ADMIN, SUPERADMIN.
-- Conserve le code et la structure existants (clés, RPC) au cas où.
-- ==========================================

-- 1) get_user_permissions : renvoyer maxSessions -1 pour tous les badges
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_profile RECORD;
  v_cfg RECORD;
  v_features JSONB;
  v_tabs TEXT[];
  v_limits JSONB;
BEGIN
  IF v_uid IS NOT NULL AND v_uid != auth.uid() AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès non autorisé aux permissions d''un autre utilisateur';
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": -1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT id, badge, role, status INTO v_profile
  FROM public.profiles WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": -1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT features, tabs INTO v_cfg
  FROM public.permissions_config
  WHERE badge = COALESCE(NULLIF(v_profile.badge, ''), 'FREE');

  IF NOT FOUND THEN
    SELECT features, tabs INTO v_cfg FROM public.permissions_config WHERE badge = 'FREE';
  END IF;

  v_features := COALESCE(v_cfg.features, '{}'::jsonb);
  v_tabs := COALESCE(v_cfg.tabs, ARRAY['stats','progression','history','settings']);

  -- Illimité pour tous les badges
  v_limits := CASE
    WHEN v_profile.badge = 'FREE' THEN '{"maxSessions": -1, "exportFormats": ["json"]}'::jsonb
    ELSE '{"maxSessions": -1, "exportFormats": ["json","csv"]}'::jsonb
  END;

  RETURN jsonb_build_object(
    'badge', COALESCE(NULLIF(v_profile.badge, ''), 'FREE'),
    'role', COALESCE(NULLIF(v_profile.role, ''), 'USER'),
    'status', COALESCE(NULLIF(v_profile.status, ''), 'active'),
    'features', v_features,
    'tabs', to_jsonb(v_tabs),
    'limits', v_limits,
    'source', 'supabase'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2) insert_user_session_secure : ne plus bloquer par limite (v_limit = -1 pour tous)
CREATE OR REPLACE FUNCTION insert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  INSERT INTO user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3) upsert_user_session_secure : ne plus bloquer par limite (v_limit = -1 pour tous)
CREATE OR REPLACE FUNCTION upsert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE user_sessions SET
      honor = COALESCE((p_row->>'honor')::BIGINT, 0),
      xp = COALESCE((p_row->>'xp')::BIGINT, 0),
      rank_points = COALESCE((p_row->>'rank_points')::BIGINT, 0),
      next_rank_points = COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
      current_rank = NULLIF(trim(p_row->>'current_rank'), ''),
      note = NULLIF(trim(p_row->>'note'), ''),
      session_date = NULLIF(trim(p_row->>'session_date'), ''),
      session_timestamp = COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
      is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id');
    RETURN jsonb_build_object('success', true);
  END IF;

  INSERT INTO user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
