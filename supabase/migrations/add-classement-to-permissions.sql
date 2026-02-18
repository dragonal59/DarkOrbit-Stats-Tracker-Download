-- ==========================================
-- Ajout de l'onglet 'classement' dans permissions_config
-- Idempotent : pas de doublon si exécuté plusieurs fois
-- ==========================================

UPDATE permissions_config
SET tabs = array_append(tabs, 'classement')
WHERE NOT ('classement' = ANY(tabs));

-- Vérification finale : afficher badge et tabs pour chaque ligne
SELECT badge, tabs
FROM permissions_config
ORDER BY badge;
