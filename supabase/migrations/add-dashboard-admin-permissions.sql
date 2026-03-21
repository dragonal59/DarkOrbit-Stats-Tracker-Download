-- ==========================================
-- Permissions dashboard par rôle
-- ADMIN : sous-onglets contrôlés par permissions_config.features
-- SUPERADMIN : accès total
-- ==========================================

-- Étendre les features ADMIN avec les clés dashboard (sans écraser les existantes)
UPDATE permissions_config
SET features = features || '{
  "dashboardViewUsers": true,
  "dashboardEditBadges": false,
  "dashboardBanUnban": false,
  "dashboardGenerateKeys": false,
  "dashboardCollectRankings": false,
  "dashboardDarkOrbitAccounts": false,
  "dashboardViewSecurityLogs": false
}'::jsonb
WHERE badge = 'ADMIN';

-- RPC : retourne les features du badge ADMIN (SUPERADMIN uniquement)
CREATE OR REPLACE FUNCTION public.get_admin_permissions_config()
RETURNS JSONB AS $$
DECLARE
  v_features JSONB;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;
  SELECT features INTO v_features FROM public.permissions_config WHERE badge = 'ADMIN';
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN COALESCE(v_features, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC : met à jour les features du badge ADMIN (SUPERADMIN uniquement)
CREATE OR REPLACE FUNCTION public.admin_update_admin_permissions(p_features JSONB)
RETURNS JSONB AS $$
DECLARE
  v_current JSONB;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;
  SELECT features INTO v_current FROM public.permissions_config WHERE badge = 'ADMIN';
  IF NOT FOUND THEN
    INSERT INTO public.permissions_config (badge, features, tabs)
    VALUES ('ADMIN', p_features, ARRAY['stats','progression','history','events','settings','superadmin'])
    ON CONFLICT (badge) DO UPDATE SET features = EXCLUDED.features;
  ELSE
    UPDATE public.permissions_config SET features = p_features WHERE badge = 'ADMIN';
  END IF;
  RETURN (SELECT features FROM public.permissions_config WHERE badge = 'ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_admin_permissions_config() IS 'Retourne les features du badge ADMIN. SUPERADMIN uniquement.';
COMMENT ON FUNCTION public.admin_update_admin_permissions(JSONB) IS 'Met à jour les features du badge ADMIN. SUPERADMIN uniquement.';
