-- Fusion des permissions ADMIN au lieu de remplacement total.
-- Le frontend n'envoie que les 7 cases du panneau Permissions Admin ;
-- sans merge, les autres features (dashboardAdmin, etc.) étaient perdues.
CREATE OR REPLACE FUNCTION public.admin_update_admin_permissions(p_features JSONB)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;
  INSERT INTO public.permissions_config (badge, features, tabs)
  VALUES (
    'ADMIN',
    p_features,
    ARRAY['stats','progression','history','events','settings','superadmin']
  )
  ON CONFLICT (badge) DO UPDATE SET
    features = permissions_config.features || EXCLUDED.features;
  RETURN (SELECT features FROM public.permissions_config WHERE badge = 'ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
