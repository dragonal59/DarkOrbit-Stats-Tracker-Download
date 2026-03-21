-- Ajoute 'classement' aux tabs de permissions_config (20260225120004 n'inclut pas classement)
UPDATE public.permissions_config
SET tabs = array_append(tabs, 'classement')
WHERE NOT ('classement' = ANY(tabs));
