-- Ajout de la feature couponsTab dans permissions_config (PRO, ADMIN, SUPERADMIN = true, FREE = false)

UPDATE public.permissions_config
SET features = features || '{"couponsTab": true}'::jsonb
WHERE badge IN ('PRO', 'ADMIN', 'SUPERADMIN');

UPDATE public.permissions_config
SET features = features || '{"couponsTab": false}'::jsonb
WHERE badge = 'FREE';
