-- ==========================================
-- RPC Supabase — Permissions centralisées (Phase 4)
-- Source de vérité côté serveur
-- À exécuter dans l'éditeur SQL Supabase
-- ==========================================

-- Table de config permissions (badge → features, tabs, limits)
-- Permet de modifier les droits sans changer le code
CREATE TABLE IF NOT EXISTS permissions_config (
  badge TEXT PRIMARY KEY,
  features JSONB NOT NULL DEFAULT '{}',
  tabs TEXT[] NOT NULL DEFAULT '{}'
);

-- Insertion config par défaut (alignée sur version-badges.js)
INSERT INTO permissions_config (badge, features, tabs) VALUES
('FREE', '{
  "statsPersonal": true, "progressionPersonal": true, "historyPersonal": true,
  "eventsSidebarReadOnly": true, "notificationsWindows": false, "boosterDisplay": false,
  "usefulLinks": false, "autoSave": false, "streakCounter": false, "eventsTab": false,
  "eventsCreateEdit": false, "eventsSidebarAddButton": false, "eventsSidebarViewAllButton": false,
  "dashboardTab": false, "dashboardAdmin": false, "dashboardBanUnban": false,
  "dashboardPromoteDemote": false, "dashboardViewAdminLogs": false,
  "advancedStats": false, "customThemes": false, "dataExport": false
}'::jsonb, ARRAY['stats','progression','history','settings']),
('PRO', '{
  "statsPersonal": true, "progressionPersonal": true, "historyPersonal": true,
  "eventsSidebarReadOnly": true, "notificationsWindows": true, "boosterDisplay": true,
  "usefulLinks": true, "autoSave": true, "streakCounter": true, "eventsTab": false,
  "eventsCreateEdit": false, "eventsSidebarAddButton": false, "eventsSidebarViewAllButton": false,
  "dashboardTab": false, "dashboardAdmin": false, "dashboardBanUnban": false,
  "dashboardPromoteDemote": false, "dashboardViewAdminLogs": false,
  "advancedStats": true, "customThemes": true, "dataExport": true
}'::jsonb, ARRAY['stats','progression','history','settings']),
('ADMIN', '{
  "statsPersonal": true, "progressionPersonal": true, "historyPersonal": true,
  "eventsSidebarReadOnly": true, "notificationsWindows": true, "boosterDisplay": true,
  "usefulLinks": true, "autoSave": true, "streakCounter": true, "eventsTab": true,
  "eventsCreateEdit": true, "eventsSidebarAddButton": true, "eventsSidebarViewAllButton": true,
  "dashboardTab": true, "dashboardAdmin": true, "dashboardBanUnban": true,
  "dashboardPromoteDemote": false, "dashboardViewAdminLogs": false,
  "advancedStats": true, "customThemes": true, "dataExport": true
}'::jsonb, ARRAY['stats','progression','history','events','settings','superadmin']),
('SUPERADMIN', '{
  "statsPersonal": true, "progressionPersonal": true, "historyPersonal": true,
  "eventsSidebarReadOnly": true, "notificationsWindows": true, "boosterDisplay": true,
  "usefulLinks": true, "autoSave": true, "streakCounter": true, "eventsTab": true,
  "eventsCreateEdit": true, "eventsSidebarAddButton": true, "eventsSidebarViewAllButton": true,
  "dashboardTab": true, "dashboardAdmin": true, "dashboardBanUnban": true,
  "dashboardPromoteDemote": true, "dashboardViewAdminLogs": true,
  "advancedStats": true, "customThemes": true, "dataExport": true
}'::jsonb, ARRAY['stats','progression','history','events','settings','superadmin'])
ON CONFLICT (badge) DO UPDATE SET
  features = EXCLUDED.features,
  tabs = EXCLUDED.tabs;

-- RPC get_user_permissions : retourne badge, role, status, features, tabs, limits
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_profile RECORD;
  v_cfg RECORD;
  v_features JSONB;
  v_tabs TEXT[];
  v_limits JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": 10, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT id, badge, role, status INTO v_profile
  FROM profiles WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": 10, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT features, tabs INTO v_cfg
  FROM permissions_config
  WHERE badge = COALESCE(NULLIF(v_profile.badge, ''), 'FREE');

  IF NOT FOUND THEN
    SELECT features, tabs INTO v_cfg FROM permissions_config WHERE badge = 'FREE';
  END IF;

  v_features := COALESCE(v_cfg.features, '{}'::jsonb);
  v_tabs := COALESCE(v_cfg.tabs, ARRAY['stats','progression','history','settings']);

  -- Limits selon badge
  v_limits := CASE
    WHEN v_profile.badge IN ('ADMIN','SUPERADMIN') THEN
      '{"maxSessions": -1, "exportFormats": ["json","csv"]}'::jsonb
    WHEN v_profile.badge = 'PRO' THEN
      '{"maxSessions": -1, "exportFormats": ["json","csv"]}'::jsonb
    ELSE
      '{"maxSessions": 10, "exportFormats": ["json"]}'::jsonb
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
