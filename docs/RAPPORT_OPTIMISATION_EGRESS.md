# Rapport — Optimisation egress Supabase (Prompt #11)

## Contexte
Quota egress dépassé (6,2 GB / 5 GB). Objectif : réduire les appels fréquents sur `shared_rankings`, `shared_events`, et les RPC `get_shared_events` / `get_dashboard_stats`.

---

## Action 1 — Pagination / limite

| Fichier | Requête | Modification |
|---------|---------|---------------|
| **src/backend/ranking.js** | `.from('shared_rankings').select(...)` sans filtre serveur | Ajout `.limit(24)` quand `server` est null (max ~23 serveurs) |

**Autres requêtes vérifiées (déjà limitées) :**
- `scraper-server.js` : `.eq('server', serverId).single()` → 1 ligne
- `client-launcher.js` : `.eq('server', serverId).single()` → 1 ligne
- `main.js` : `.eq('server', server).single()` → 1 ligne
- (shared_manual_events supprimée — plus d’appel depuis sync-manager)

---

## Action 2 — Fréquence des appels (throttle / cache)

| Fichier | Fonction | Modification | Valeur |
|---------|----------|-------------|--------|
| **src/backend/events.js** | `refreshEventsFromSupabase()` | Throttle : ignore si appelée &lt; 60 s après la dernière | `REFRESH_EVENTS_THROTTLE_MS = 60000` |
| **src/frontend/ranking-ui.js** | `window.refreshRanking` | Throttle : ignore si appelée &lt; 30 s après la dernière | `REFRESH_RANKING_THROTTLE_MS = 30000` |
| **src/backend/super-admin.js** | `loadVueGeneraleStats()` | Cache : réutilise le résultat si &lt; 60 s | `VUE_GENERALE_CACHE_MS = 60000` |

**Déclencheurs existants :**
- `refreshEventsFromSupabase` : init, `DataSync.pull` (intervalle sync 5 min)
- `refreshRanking` : switch onglet classement, `DataSync.pull`, super-admin, `electronClientLauncher.onSaveSuccess` (debounce 3 s déjà en place)
- `loadVueGeneraleStats` : ouverture panel Vue générale (switch onglet super-admin)

---

## Action 3 — RPC SQL (colonnes retournées)

| RPC | Fichier migration | État |
|-----|-------------------|------|
| **get_shared_events** | `get-shared-events-rpc.sql` | OK — `jsonb_build_object('events_json', events_json, 'uploaded_at', uploaded_at)` + `LIMIT 1` |
| **get_dashboard_stats** | `add-dashboard-stats-rpc.sql` | OK — Retourne uniquement `jsonb_build_object(total_users, free_count, pro_count, ...)` |

Aucun `SELECT *` détecté.

---

## Résumé des fichiers modifiés

1. **src/backend/ranking.js** — `.limit(24)` sur `shared_rankings` sans filtre serveur
2. **src/backend/events.js** — Throttle 60 s sur `refreshEventsFromSupabase`
3. **src/frontend/ranking-ui.js** — Throttle 30 s sur `refreshRanking`
4. **src/backend/super-admin.js** — Cache 60 s sur `loadVueGeneraleStats` (RPC `get_dashboard_stats`)
