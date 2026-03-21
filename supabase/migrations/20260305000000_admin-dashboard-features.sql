-- Ajout des features dashboard (tuiles) pour le badge ADMIN dans permissions_config.
-- Ces clés sont utilisées par initDashboardSubTabs() pour afficher ou masquer les tuiles du dashboard.

UPDATE public.permissions_config
SET features = features || '{
  "dashboardVueGenerale": false,
  "dashboardMessages": false,
  "dashboardLogsSecurite": false,
  "dashboardClesLicence": false,
  "dashboardPlanificateur": false,
  "dashboardPermissionsAdmin": false
}'::jsonb
WHERE badge = 'ADMIN';
