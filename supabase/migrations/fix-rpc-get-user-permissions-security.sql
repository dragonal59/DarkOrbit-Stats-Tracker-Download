-- ==========================================
-- SÉCURISATION RPC get_user_permissions
-- Empêche un utilisateur de consulter les permissions d'un autre utilisateur
-- sauf si l'appelant est ADMIN ou SUPERADMIN.
--
-- Règle : l'appelant ne peut demander que ses propres permissions (p_user_id = auth.uid())
--         ou être admin/superadmin pour interroger n'importe quel p_user_id.
--
-- Frontend : api.js appelle déjà get_user_permissions(user.id) avec l'utilisateur courant.
-- Cette fonction ne doit être appelée qu'avec auth.uid() côté client pour un utilisateur normal.
-- ==========================================

-- Helper (créée si pas déjà présente, ex. par supabase-rpc-admin.sql)
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (role IN ('ADMIN', 'SUPERADMIN') OR badge IN ('ADMIN', 'SUPERADMIN'))
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- RPC get_user_permissions : même signature et logique, avec contrôle d'accès en tête
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
  -- Vérifier que l'utilisateur demande ses propres permissions OU est admin/superadmin
  IF v_uid IS NOT NULL AND v_uid != auth.uid() AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès non autorisé aux permissions d''un autre utilisateur';
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT id, badge, role, status INTO v_profile
  FROM public.profiles WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb,
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

  -- FREE = 1 session, PRO = 10 sessions, ADMIN/SUPERADMIN = illimité
  v_limits := CASE
    WHEN v_profile.badge IN ('ADMIN','SUPERADMIN') THEN
      '{"maxSessions": -1, "exportFormats": ["json","csv"]}'::jsonb
    WHEN v_profile.badge = 'PRO' THEN
      '{"maxSessions": 10, "exportFormats": ["json","csv"]}'::jsonb
    ELSE
      '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb
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
