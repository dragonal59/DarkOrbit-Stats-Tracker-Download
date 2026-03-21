-- ============================================================
-- Voir les événements du jour (source sidebar booster)
-- ============================================================
-- La sidebar "Événements du jour" lit le STOCKAGE LOCAL (UnifiedStorage),
-- pas Supabase. Donc si tu vois le booster 50% dans l'app, les données
-- sont en local. Pour les voir ici :
--   - user_settings : après une "Synchronisation serveur" (sync push)
--   - shared_events : rempli par le scraper Electron (Collect Événement)
-- ============================================================

-- 1) shared_events : dernier enregistrement (rempli par Electron scraper)
SELECT events_json, uploaded_at
FROM shared_events
ORDER BY uploaded_at DESC
LIMIT 1;

-- 2) shared_events : une ligne par événement
SELECT
  (e.elem->>'name') AS name,
  (e.elem->>'description') AS description,
  (e.elem->>'timer') AS timer,
  s.uploaded_at
FROM shared_events s,
     jsonb_array_elements(s.events_json) AS e(elem)
ORDER BY s.uploaded_at DESC;

-- 3) user_settings : événements par user (current_events_json)
SELECT
  us.user_id,
  us.updated_at,
  elem->>'name' AS event_name,
  elem->>'description' AS event_description,
  elem->>'timer' AS timer
FROM user_settings us,
     jsonb_array_elements(COALESCE(us.current_events_json, '[]'::jsonb)) AS elem
WHERE COALESCE(us.current_events_json, '[]'::jsonb) != '[]'::jsonb
ORDER BY us.updated_at DESC, us.user_id;
