# État de la migration localStorage → Supabase

> ℹ **Statut : état au 25 février 2026 (partiellement dépassé).**  
> Ce rapport reflète la migration à cette date. Depuis, certains points ont été corrigés (ex. `messages-api.js`, doublon `unified-storage.js`, session RPCs canoniques, snapshots HoF) et des rapports plus récents (`RAPPORT_PHASE2_CORRECTIONS.md`, `RAPPORT_PHASE3_CORRECTIONS.md`) complètent cette vue.  
> Garder ce fichier comme photographie intermédiaire ; se référer aux rapports de phase 2/3 pour l’état actuel complet.

**Date :** 25 février 2026  
**Contrainte :** Aucune modification de code avant validation du plan.

---

## 1. Ce qui est déjà migré vers Supabase

### Tables Supabase existantes (vérifiées)
https://supabase.com/dashboard/project/cxqdzipcgpbqmjzjrijg/sql/da9079bd-a658-42f5-8c8b-b95074328fc4?schema=public
| Table | Usage | RLS |
|-------|-------|-----|
| **profiles** | Utilisateurs, badge, statut, game_pseudo, server, company, initial_*, metadata | Oui |
| **user_sessions** | Sessions de jeu (honor, xp, rank_points, baseline, player_id) | Oui |
| **user_events** | Événements personnalisés (event_data JSONB) | Oui |
| **user_settings** | settings_json, links_json, booster_config_json, current_stats_json, imported_rankings_json, theme, view_mode, language, theme_auto | Oui |
| **user_preferences** | active_player_id, active_player_server, events_hidden, ranking_favorite_server | Oui |
| **user_darkorbit_accounts** | Comptes DarkOrbit (player_id, pseudo, server, is_active) | Oui |
| **shared_rankings_snapshots** | Classements scrapés par serveur (players_json) | Oui |
| **shared_events** | Événements scrapés du jour (une ligne, remplacée à chaque scan) | Oui |
| **admin_logs** | Logs d’actions admin | Oui |
| **admin_messages** | Messages admin → utilisateurs | Oui |
| **permissions_config** | Badge → features, tabs | Oui |
| **booster_predictions** | Historique prédictions boosters | Oui |
| **player_profiles** | Stats DoStats (npc_kills, galaxy_gates, etc.) | Oui |
| **bug_reports** | Rapports de bugs | Oui |

### RPC Supabase utilisées

| RPC | Usage |
|-----|-------|
| `get_user_permissions` | Permissions (badge, limites sessions) |
| `insert_user_session_secure` / `upsert_user_session_secure` | Sessions (limites FREE=1, PRO=10) |
| `get_ranking` / `get_ranking_with_profiles` | Classement |
| `get_shared_events` / `upsert_shared_events` | Événements scrapés |
| `get_user_preferences` / `upsert_user_preferences` | Préférences (active_player, events_hidden, ranking_favorite) |
| `get_user_darkorbit_accounts` / `upsert_user_darkorbit_account` / `delete_user_darkorbit_account` | Comptes DarkOrbit |
| `get_visible_events` / `upsert_sidebar_events` / `delete_event_by_id` | Événements sidebar |
| `get_my_messages` / `get_unread_messages_count` | Messages admin |
| `admin_send_message` / `admin_send_global_message` | Envoi messages |
| `admin_update_profile` / `admin_ban_user` / `admin_unban_user` / `admin_change_badge` / `admin_add_note` | Admin |
| `get_user_admin_logs` / `get_admin_logs` / `get_security_events` | Logs admin |
| `activate_license_key` / `insert_license_keys` | Licences |
| `update_last_seen` | Heartbeat |
| `update_paypal_subscription` | Abonnement PayPal |
| `insert_bug_report` | Bug reports |
| `delete_player_sessions` | Suppression sessions par player_id |
| `get_darkorbit_account_limit` | Limite comptes |
| `activate_trial_key` | Essai |
| `get_dashboard_stats` / `get_user_latest_stats` | Dashboard admin |
| `clear_all_rankings` | Admin |
| `admin_update_admin_permissions` / `get_admin_permissions_config` | Permissions admin |

### Composants / flux migrés

| Composant | État |
|-----------|------|
| **DataSync** (sync-manager.js) | migrateIfNeeded, pull, sync, queueSync, syncSettingsOnly |
| **UnifiedStorage** | Écriture locale + DataSync.queueSync sur SYNC_KEYS |
| **Auth** | Supabase Auth (login, register, reset password) |
| **UserPreferencesAPI** | user_preferences + user_darkorbit_accounts (remplace localStorage pour active_player, events_hidden, ranking_favorite) |
| **Sessions** | Insertion via RPC, suppression via Supabase |
| **Événements personnels** | user_events (upsert, delete) |
| **Événements scrapés** | shared_events (scraper Electron) |
| **Classement** | shared_rankings_snapshots + RPC get_ranking |
| **Paramètres** | user_settings (theme, view_mode, language, settings, links, boosters, current_stats, imported_rankings) |
| **Comptes DarkOrbit** | user_darkorbit_accounts (via UserPreferencesAPI) |

---

## 2. Ce qui reste en localStorage / stockage local

### Clés STORAGE_KEYS (config/keys.js)

| Clé | Sync Supabase ? | Détail |
|-----|-----------------|--------|
| **darkOrbitSessions** | ✅ Oui | user_sessions |
| **darkOrbitEvents** | ✅ Oui | user_events |
| **darkOrbitSettings** | ✅ Oui | user_settings.settings_json |
| **darkOrbitCustomLinks** | ✅ Oui | user_settings.links_json |
| **darkOrbitBoosters** | ✅ Oui | user_settings.booster_config_json |
| **darkOrbitCurrentStats** | ✅ Oui | user_settings.current_stats_json |
| **darkOrbitImportedRankings** | ✅ Oui | user_settings.imported_rankings_json |
| **darkOrbitCurrentEvents** | ⚠️ Partiel | Dans SYNC_KEYS mais sync-manager écrit `[]` ; pull ne restaure pas. Scraper Electron écrit directement dans user_settings |
| **darkOrbitTheme** | ✅ Oui | user_settings.theme (localStorage direct dans sync) |
| **darkOrbitViewMode** | ✅ Oui | user_settings.view_mode |
| **darkOrbitThemeAuto** | ✅ Oui | user_settings.theme_auto |
| **darkOrbitLanguage** | ✅ Oui | user_settings.language |
 ❌ Non | Jamais synced. user_settings a booster_learning_json mais sync-manager ne l’utilise pas |
| **darkOrbitCustomIcons** | ❌ Non | Pas dans SYNC_KEYS |
| **darkOrbitScrapingConfig** | ❌ Non | Config Electron, pas dans SYNC_KEYS |
| **darkOrbitVersionBadge** | ❌ Non | Fallback local si RPC indisponible |
| **darkOrbitProfileCache** | ❌ Non | Cache local profil |
| **darkOrbitDataMigrated** | ❌ Non | Flag migration (local uniquement) |
| **darkOrbitLastSync** | ❌ Non | Timestamp local |
| **darkOrbitPendingSync** | ❌ Non | Flag sync en attente |
| **darkOrbitAdminUsers** | ❌ Non | Fallback admin si RPC indisponible |
| **darkOrbitAdminActionLogs** | ❌ Non | Fallback admin |
| **darkOrbitRememberMe** | ❌ Non | Email mémorisé (auth) |
| **darkOrbitRankingServerSavedAt** | ❌ Non | Timestamp local |
| **pending_baseline_scan** | ❌ Non | Flag temporaire auth |
| **pendingReloadToast** | ❌ Non | Flag UI |
| **SETTINGS_MODIFIED_KEY** | ❌ Non | Flag dirty settings |
| **darkOrbitSessionsCleared** | ❌ Non | Flag suppression sessions |
| **darkOrbit_lastUserId** | ❌ Non | Dernier user connecté |

### Usages localStorage directs (hors UnifiedStorage)

| Fichier | Clé | Usage |
|---------|-----|-------|
| auto-theme.js | darkOrbitTheme, darkOrbitThemeAuto | Lecture/écriture thème |
| auth.js | darkOrbitRememberMe, pending_baseline_scan | Mémorisation email, scan baseline |
| script.js | pendingReloadToast, pending_baseline_scan | Toast, scan |
| settings.js | SETTINGS_MODIFIED_KEY | Dirty flag |
| sessions.js | darkOrbitSessionsCleared | Flag clear |
| auth-manager.js | pending_baseline_scan, darkOrbit_lastUserId | Auth |
| i18n.js | darkOrbitLanguage | Langue |
| version-badges.js | darkOrbitVersionBadge | Fallback badge |
| confirm-email.html, reset-password.html | darkOrbitTheme | Thème avant chargement |
| main.js | darkOrbitScrapingConfig | Config scraping (Electron) |
| ranking-import.js | darkOrbitImportedRankings | Lecture (UnifiedStorage) |

---

## 3. Tableau récapitulatif : fait / reste à faire

| Domaine | Fait | Reste à faire |
|---------|------|---------------|
| **Tables Supabase** | profiles, user_sessions, user_events, user_settings, user_preferences, user_darkorbit_accounts, shared_rankings, shared_events, admin_logs, admin_messages, permissions_config, booster_predictions, player_profiles, bug_reports | Vérifier contrainte UNIQUE(user_id, local_id) sur user_sessions si erreur 400 |
| **Sync sessions** | Migration, push, pull, RPC insert/upsert | — |
| **Sync événements personnels** | user_events (push, pull, delete) | — |
| **Sync paramètres** | settings, links, boosters, current_stats, imported_rankings, theme, view_mode, language, theme_auto | — |
| **current_events_json** | Colonne dans user_settings ; scraper Electron écrit | sync-manager : _migrateSettings écrit `[]` ; pull ne restaure pas. darkOrbitCurrentEvents dans SYNC_KEYS mais non synchronisé |
| **custom_icons** | — | Pas migré (localStorage uniquement) |
| **scraping_config** | — | Config Electron, reste local (choix possible) |
| ** Préférences (active_player, events_hidden, ranking_favorite)** | UserPreferencesAPI → user_preferences | — |
| **Comptes DarkOrbit** | UserPreferencesAPI → user_darkorbit_accounts | — |
| **Fallbacks admin** | darkOrbitAdminUsers, darkOrbitAdminActionLogs | Restent en localStorage (fallback si RPC indisponible) |
| **Clés techniques** | MIGRATION_DONE, LAST_SYNC, PENDING_SYNC, etc. | Restent locales (normal) |

---

## 4. Plan d’action proposé pour terminer la migration

### Phase 1 — Corrections critiques (sync incomplet)

| # | Tâche | Fichier(s) | Action |
|---|-------|------------|--------|
| 1 | **current_events_json** | sync-manager.js | Dans `_migrateSettings`, lire `UnifiedStorage.get(sk.CURRENT_EVENTS, [])` et l’écrire dans `current_events_json` au lieu de `[]`. Dans `pull()`, restaurer `settingsRow.current_events_json` vers `UnifiedStorage.set(sk.CURRENT_EVENTS, ...)`. |
 keys.js, sync-manager.js | Ajouter `BOOSTER_LEARNING` à `SYNC_KEYS`. Dans `_migrateSettings`, lire `UnifiedStorage.get(sk.BOOSTER_LEARNING, {})` et l’écrire dans `booster_config_json` ou `booster_learning_json` (selon schéma). Dans `pull()`, restaurer `booster_learning_json` vers `UnifiedStorage.set(sk.BOOSTER_LEARNING, ...)`. |

### Phase 2 — Migrations optionnelles (selon priorité)

| # | Tâche | Fichier(s) | Action |
|---|-------|------------|--------|
| 3 | **custom_icons** | keys.js, sync-manager.js, settings.js | Ajouter à SYNC_KEYS. Créer colonne `custom_icons_json` dans user_settings (migration SQL) ou l’inclure dans `settings_json`. Adapter _migrateSettings et pull. |
| 4 | **scraping_config** | — | Décision : rester local (config machine) ou migrer dans user_settings. Si migration : colonne dédiée ou champ dans settings_json. |

### Phase 3 — Vérifications Supabase

| # | Tâche | Action |
|---|-------|--------|
| 5 | **Contrainte user_sessions** | Si erreur 400 à l’upsert : `ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_user_id_local_id_key UNIQUE (user_id, local_id);` |
| 6 | **Colonnes user_settings** | Vérifier présence de `current_events_json`, `language`, `theme_auto` (migrations add-current-events-json, add-language-theme-auto). |

### Phase 4 — Nettoyage et robustesse

| # | Tâche | Fichier(s) | Action |
|---|-------|------------|--------|
| 7 | **messages-api.js** | messages-api.js | Vérifier `(await supabase.auth.getUser()).data.user` avant d’utiliser `.id` dans markAsRead et deleteMessage (éviter `.eq('user_id', undefined)`). |
| 8 | **Doublon unified-storage** | index.html | Supprimer une des deux inclusions de unified-storage.js. |

### Ordre recommandé

1. Phase 1 (current_events)  
2. Phase 3 (vérifications Supabase)  
3. Phase 4 (messages-api, doublon)  
4. Phase 2 (custom_icons, scraping_config) si souhaité  

---

## 5. Schéma des flux actuels

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DONNÉES UTILISATEUR                              │
├─────────────────────────────────────────────────────────────────────────┤
│ localStorage (UnifiedStorage)     │  Supabase                           │
│ ─────────────────────────────────│────────────────────────────────────  │
│ darkOrbitSessions        ──────────┼──► user_sessions (RPC)                │
│ darkOrbitEvents         ──────────┼──► user_events                       │
│ darkOrbitSettings       ──────────┼──► user_settings.settings_json       │
│ darkOrbitCustomLinks    ──────────┼──► user_settings.links_json         │
│ darkOrbitBoosters       ──────────┼──► user_settings.booster_config_json│
│ darkOrbitCurrentStats   ──────────┼──► user_settings.current_stats_json │
│ darkOrbitImportedRankings─────────┼──► user_settings.imported_rankings   │
│ darkOrbitCurrentEvents  ──────────┼──► user_settings.current_events_json│
│ darkOrbitTheme, ViewMode, etc.    ─┼──► user_settings (colonnes)         │
│ darkOrbitCustomIcons    ──────────┼──► (non migré)                      │
│ darkOrbitScrapingConfig ──────────┼──► (non migré, Electron)           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    PRÉFÉRENCES (UserPreferencesAPI)                     │
├─────────────────────────────────────────────────────────────────────────┤
│ active_player, events_hidden, ranking_favorite  ──► user_preferences      │
│ Comptes DarkOrbit (pseudo, server)            ──► user_darkorbit_accounts│
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    DONNÉES PARTAGÉES (lecture publique)                 │
├─────────────────────────────────────────────────────────────────────────┤
│ shared_rankings   ← Scraper Electron (classements par serveur)          │
│ shared_events     ← Scraper Electron (événements du jour)               │
│ (shared_manual_events supprimée — événements scrapés via shared_events)   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

*Document généré à partir de l’analyse du code. Aucune modification n’a été appliquée.*
