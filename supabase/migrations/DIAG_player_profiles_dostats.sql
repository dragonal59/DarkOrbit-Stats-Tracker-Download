-- Vérifier si player_profiles contient npc_kills, ship_kills, galaxy_gates
-- Exécuter dans Supabase SQL Editor pour diagnostiquer

SELECT user_id, server, pseudo, company,
  npc_kills, ship_kills, galaxy_gates,
  dostats_updated_at
FROM player_profiles
WHERE server = 'gbl5'
  AND (npc_kills IS NOT NULL OR ship_kills IS NOT NULL OR galaxy_gates IS NOT NULL)
ORDER BY dostats_updated_at DESC
LIMIT 20;
