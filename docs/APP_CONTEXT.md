# APP_CONTEXT.md — DarkOrbit Stats Tracker Pro

## Description générale

Application desktop Electron pour joueurs de **DarkOrbit** (jeu navigateur). Suivi des statistiques de progression (honneur, XP, points de grade, grade actuel), comparaison de sessions, historique, alertes boosters/événements, classements serveur. Synchronisation des données entre appareils via Supabase. Différenciation des droits par badge (FREE / PRO / ADMIN / SUPERADMIN). Collecte automatique des stats via scraper intégré (BrowserWindow + Supabase direct).

---

## Stack technique

- **Frontend** : HTML, CSS, JavaScript (ES5/ES6), Chart.js 4.4.0, canvas-confetti 1.9.2 (CDN)
- **Backend** : Pas de serveur Node séparé — logique métier dans `src/backend/` (renderer)
- **Desktop** : Electron ^28.1.0
- **Base de données** : Supabase (PostgreSQL) — @supabase/supabase-js ^2.95.3
- **Auth** : Supabase Auth (email/password)
- **Autres** : dotenv ^17.2.4, chrome-remote-interface ^0.33.3, node-html-parser ^7.0.2, javascript-obfuscator ^4.1.1 (build)

---

## Architecture des fichiers

```
DarkOrbit Tracker - v2.5/
├── main.js                    # Point d'entrée Electron : fenêtre, tray, IPC, scheduler 00h/12h, deep links
├── package.json               # Scripts start/prebuild/build, deps
├── .env.example               # Template : SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_REDIRECT_BASE
│
├── electron/                  # Processus principal Electron (Node.js)
│   ├── darkorbit-accounts.js          # CRUD comptes DarkOrbit (chiffrés safeStorage)
│   ├── session-scraper.js             # Scraper sessions + HoF/classements + événements (BrowserWindow → Supabase)
│   ├── events-scraper-standalone.js   # Scraper événements (BrowserWindow dédié, planificateur)
│   ├── dostats-scraper.js             # Collecte DOStats (HoF / périodes selon config)
│   ├── dostats-profile-scraper.js     # Profils joueurs DOStats (SUPERADMIN)
│   ├── client-launcher.js             # Lancement client jeu + CDP / persistance profils
│   ├── scraper-bridge.js              # Pont IPC / helpers partagés scrapers
│   ├── player-stats-scraper.js        # Stats joueur (contexte scraping)
│   ├── player-stats-credentials.js
│   ├── do-events-credentials.js
│   ├── scraping-config.js             # Constantes / URLs scraping
│   └── auto-updater.js                # Mises à jour Electron (electron-updater)
│
├── src/                       # Renderer (HTML/CSS/JS)
│   ├── index.html             # App principale (après auth) — layout + scripts
│   ├── auth.html              # Connexion / Inscription
│   ├── pending-verification.html
│   ├── confirm-email.html     # Cible deep link confirmation email
│   ├── preload.js             # contextBridge : SUPABASE_CONFIG, electronScraper, electronAPI, etc.
│   ├── electron-fix.js       # Mock chrome.* (chargé en premier)
│   │
│   ├── config/keys.js         # STORAGE_KEYS + SYNC_KEYS (localStorage / sync Supabase)
│   │
│   ├── backend/               # Logique métier
│   │   ├── supabase-config.js, supabase-client.js
│   │   ├── auth-manager.js    # Login, register, logout, getValidSession
│   │   ├── api.js             # loadUserProfile, getPermissions, cache profil/badge
│   │   ├── unified-storage.js # Stockage unifié (get/set/remove + compression)
│   │   ├── sync-manager.js    # DataSync : migrateIfNeeded, pull, sync, queueSync
│   │   ├── config.js          # LIMITS, RANKS_DATA, SERVERS_LIST (incl. Global 2 (Ganymede)), etc.
│   │   ├── version-badges.js  # BADGES, BADGE_TABS, BADGE_FEATURES
│   │   ├── guards.js          # canAccessRoute, guardRoute
│   │   ├── sessions.js        # saveSession, getSessions, deleteSession, limites
│   │   ├── stats.js           # getCurrentStats, setCurrentStats, loadCurrentStats
│   │   ├── history.js         # renderHistory, groupSessionsByPeriod, export
│   │   ├── progression.js     # Calculs progression, barres, grades
│   │   ├── events.js          # Événements scrapés, timers, table events Supabase
│   │   ├── events-manual.js   # Événements manuels (ajoutés par l'utilisateur)
│   │   ├── ranking.js         # Classement : import local, snapshots partagés, DOStats période, RPC get_ranking / comparaison
│   │   ├── ranking-import.js  # Import / fusion classements scrapés
│   │   ├── links.js            # Liens personnalisés
│   │   ├── settings.js         # Paramètres utilisateur
│   │   ├── reset.js            # Réinitialisation données
│   │   ├── super-admin.js     # Dashboard admin
│   │   ├── messages-api.js    # Messages admin / inbox
│   │   ├── bug-report.js      # RPC insert_bug_report
│   │   ├── paypal-buttons.js  # Boutons Soutenir / Acheter PRO
│   │   ├── account-panel.js   # UI compte utilisateur
│   │   ├── license-activation.js
│   │   ├── boosters.js        # Config boosters, alertes sidebar
│   │   ├── darkorbit-accounts-ui.js
│   │   ├── server-mappings.js
│   │   ├── stats-collect-auto.js
│   │   ├── utils.js, timer.js, comparaison.js
│   │   ├── translations.js   # Dictionnaire 6 langues
│   │   └── i18n.js           # applyTranslations, persist language
│   │
│   ├── frontend/
│   │   ├── script.js          # Point d'entrée frontend
│   │   ├── tabs.js            # Onglets (stats, progression, history, events, classement, settings, superadmin)
│   │   ├── theme.js, auto-theme.js
│   │   ├── charts.js          # Chart.js
│   │   ├── gadgets.js, dropdown.js
│   │   ├── permissions-ui.js  # applyPermissionsUI, visibilité onglets/boutons
│   │   ├── ranking-ui.js, messages.js
│   │   ├── keyboard-shortcuts.js, shortcuts-help-modal.js
│   │   ├── ui-improvements.js
│   │   └── auth.js            # Logique formulaires auth.html
│   │
│   ├── multillingues_events/  # JSON par événement (noms, descriptions, keywords)
│   │   └── *.json             # agatus_breach.json, xp_day.json, honor_day.json, etc.
│   │
│   ├── img/                   # Images (ranks, events, icon_app, country_flags)
│   └── data/                  # darkorbit-grades-mapping.json
│
├── build/                     # Sortie obfuscation + config Supabase injectée
│   └── src/                   # Copie src avec config.supabase.prod.js
│
├── scripts/
│   ├── obfuscate-build.js     # Prépare build/src (obfuscation)
│   └── inject-supabase-config.js # Génère config depuis .env
│
├── supabase/migrations/       # SQL — ordre dans docs/MIGRATION_ORDER.md
├── gh-pages/                  # reset-password.html (redirect auth)
└── docs/                      # Documentation technique
```

---

## Features implémentées

- **Auth** : Inscription, connexion, déconnexion, reset password, confirmation email (deep link)
- **Sessions** : Saisie manuelle, sauvegarde, suppression, historique, export JSON/CSV
- **Progression** : Barres de progression, calcul niveau, grades, baseline (rappel de sauvegarde masqué pour PRO+ avec compte DO actif)
- **Stats** : Stats actuelles, remplissage depuis dernière session, fusion stats scrapées, collecte auto depuis le jeu (desktop) avec aide contextuelle selon badge/compte DO
- **Historique** : Groupement par période, export, mise en évidence de la session baseline (label « Seuil de départ »)
- **Événements scrapés** : Chargement shared_events / events table, timers temps réel, suppression auto à expiration
- **Événements manuels** : Ajout, modification, suppression, masquer/afficher sidebar, compléter
- **Sidebar** : Événements du jour (scrapés), En cours / À venir (manuels), booster 50% (XP/Honneur)
- **Classement** : `loadRanking()` s’appuie sur **`normalizeRankingFilters`** + **`resolveRankingLoadRoute`** puis chargeurs dédiés — détail des priorités : **`docs/RANKING_SOURCES.md`**. En bref : modes période → DOStats snapshots ou `get_ranking_comparison` ; mode standard → import local puis `loadSharedRanking` ; `get_ranking` seulement si exception sur les snapshots. Filtre firme (MMO/EIC/VRU) côté UI. Filtre serveur depuis `SERVER_CODE_TO_DISPLAY` (24 serveurs). UI : `initRankingTab()` idempotent (throttle global `refreshRanking`).
- **Liens personnalisés** : Ajout, validation URL, emoji
- **Paramètres** : Thème (dark/light/auto), vue détaillée, notifications Windows, auto-save, streak (sans section dédiée « Gestion des données » dans cet onglet)
- **Sync Supabase** : Sessions (migration initiale et import via RPC bulk `upsert_user_sessions_bulk`), events, user_settings, merge par local_id ; `DataSync.pull()` invalide le cache mémoire **par clé** (pas de `invalidateCache()` global)
- **Badges** : FREE, PRO, ADMIN, SUPERADMIN — onglets et features par badge
- **Scraper** : `session-scraper.js` (classements + profils DOStats) et `events-scraper-standalone.js` (événements) via BrowserWindow, scheduler 00h/12h et planificateur dashboard
- **Comptes DarkOrbit** : CRUD chiffrés, assignation serveurs
- **Admin** : Dashboard, ban/unban, changement badge, messages, logs, rapports bug
- **Licences** : Activation clé PRO (RPC activate_license_key)
- **i18n** : 6 langues (fr, de, ru, es, en, tr)
- **Toasts** : showToast(message, type)

---

## Features en cours / backlog

- **Feedback sync** : Toast en cas d'échec `queueSync` (encore partiellement silencieux)
- **Compression réelle** : stockage volumineux en Base64 côté `unified-storage.js`, pas de compression binaire
- Voir aussi `docs/BUGS_TODO_ELECTRON_PYTHSCRAP.md` pour la dette scraper / ranking multi-sources

---

## Features prévues / dette doc

- Centralisation / documentation explicite de la matrice « merge » sync (dernier écrit gagne)
- CSP optionnelle (Content-Security-Policy)

---

## Base de données Supabase

### Configuration JWT (durée de vie des sessions)

Pour les collectes DOStats longues (24 serveurs, > 1 h), le token Supabase peut expirer. L’app gère le refresh (avant chaque run, toutes les 5 serveurs, et retry sur erreur JWT). En complément, on peut augmenter la durée de vie du JWT dans le dashboard Supabase :

- **Authentication** → **Configuration** → **Sessions**
- **JWT expiry** : passer de `3600` (1 h) à `7200` (2 h) ou `10800` (3 h)

Ce n’est pas une correction définitive (le refresh reste la solution robuste) mais cela réduit la fréquence des refresh pendant une collecte.

### Tables

| Table | Champs principaux |
|-------|-------------------|
| **auth.users** | Géré par Supabase Auth |
| **profiles** | id, username, email, game_pseudo, server, company, badge, role, status, is_suspect, metadata, verification_status, last_login, last_stats_collected_at, initial_honor, initial_xp, initial_rank, initial_rank_points, next_rank_points, created_at, updated_at |
| **user_sessions** | id, user_id, local_id, honor, xp, rank_points, next_rank_points, current_rank, note, session_date, session_timestamp, updated_at. UNIQUE(user_id, local_id) |
| **user_events** | id, user_id, local_id, event_data (JSONB), created_at, updated_at. UNIQUE(user_id, local_id) |
| **user_settings** | user_id, settings_json, links_json, booster_config_json, current_stats_json, imported_rankings_json, current_events_json, theme, view_mode, updated_at |
| **permissions_config** | badge, features (JSONB), tabs (array) |
| **admin_logs** | id, admin_id, target_user_id, action, details, old_value, new_value, notes, created_at |
| **admin_messages** | id, admin_id, user_id, subject, message, is_read, created_at, deleted_by_user |
| **bug_reports** | id, user_id, category, description, image_url, created_at |
| **license_keys** | key, badge, used_by, used_at, created_at |
| **shared_rankings_snapshots** | server_id, players_json (JSONB), scraped_at, uploaded_by |
| **shared_rankings_dostats_snapshots** | server_id, players_json (JSONB), scraped_at — classements DOStats par période (24h/7j/30j) |
| **shared_events** | id (UUID fixe), events_json (JSONB), uploaded_at, uploaded_by |
| **player_profiles** | user_id, server, pseudo, grade, level, honor, experience, top_user, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, estimated_rp, total_hours, registered, company, dostats_updated_at, … |
| **events** | id (TEXT PK), visible, expires_at, created_at, event_data (JSONB) |
| **booster_predictions** | id, user_id, prediction_date, actual_date, predicted_type, actual_type, accuracy, created_at |
| **user_sessions** (add-player-id) | player_id (optionnel) |
| **rate_limit_tracker** | (optionnel) |
| **security_events** | (optionnel) |

### RPC principales

- **Auth/Permissions** : get_user_permissions, get_my_badge, is_admin_or_superadmin, is_superadmin
- **Sessions** : insert_user_session_secure, upsert_user_session_secure, **upsert_user_sessions_bulk** (plusieurs lignes en un appel), **delete_all_sessions_for_current_user** (reset / post-inscription baseline), delete_player_sessions
- **Rankings** : get_ranking, get_ranking_with_profiles, insert_ranking_snapshot, get_ranking_latest_per_server(p_limit INT DEFAULT 24)
- **Events** : get_shared_events, upsert_shared_events, get_visible_events, upsert_sidebar_events, delete_event_by_id (**ne supprime que si `expires_at IS NOT NULL`** côté SQL), cleanup_expired_events
- **Admin** : admin_ban_user, admin_unban_user, admin_change_badge, admin_update_profile, admin_add_note, admin_send_message, admin_send_global_message, get_admin_logs, get_user_admin_logs, get_security_events, get_dashboard_stats, get_user_latest_stats, admin_update_admin_permissions, get_admin_permissions_config
- **Autres** : insert_bug_report, activate_license_key, insert_license_keys, get_my_messages, get_unread_messages_count, update_last_seen, get_darkorbit_account_limit

---

## Système d'événements

### Trois sources

1. **Événements scrapés (shared_events)**  
   - Source : RPC get_shared_events, ou IPC events-updated (scraper)  
   - Stockage : shared_events.events_json (une ligne, remplacée à chaque scan)  
   - Affichage : #sidebarScrapedEvents (Événements du jour)  
   - Enrichissement : multillingues_events/*.json (match par keywords)  
   - Timer : format HH:MM:SS + scrapedAt → getEndTimestamp  

2. **Table events (sidebar avec timer)**  
   - Source : RPC get_visible_events (visible=true, expires_at > now ou null)  
   - Stockage : table events (id, visible, expires_at, event_data)  
   - Sync : upsert_sidebar_events quand scraped events reçus  
   - À expiration (timer connu) : `deleteExpiredEvent` → RPC `delete_event_by_id` ; côté client on **n’appelle pas** la suppression pour les évènements sans échéance (`getEndTimestamp` null). Côté SQL, `delete_event_by_id` **ignore** les lignes avec `expires_at IS NULL`.  
   - Cron optionnel : cleanup_expired_events (uniquement `expires_at < now()`)  

3. **Événements manuels**  
   - Stockage : darkOrbitEvents (UnifiedStorage), user_events (Supabase)  
   - Affichage : #sidebarEventsCarouselCurrent, #sidebarEventsCarouselUpcoming  
   - Sync : DataSync → user_events  

### Flux

```
session-scraper.js / events-scraper-standalone.js
  → upsert_shared_events(p_events) (Supabase, table shared_events)
  → IPC "events-updated" (payload: { events, eventsCount })
  → events.js :
      setScrapedEventsFromIPC(events)   [cache immédiat + upsert_sidebar_events → table events]
      refreshEventsFromSupabase(true)   [sync Supabase]
  → get_visible_events() (priorité, table events)
  → fallback get_shared_events() si aucun événement visible
  → renderScrapedEvents() → #sidebarScrapedEvents

Timer = 0 → deleteExpiredEvent(id, ev) → retrait cache + delete_event_by_id (si évènement daté ; jamais les permanents)
```

---

## Système de notifications

- **Notifications Windows** : Feature notificationsWindows (PRO+), Notification.requestPermission(), sendNotification(title, body)
- **Messages admin** : admin_messages, get_my_messages, badge unread, inbox modal
- **Toasts** : showToast(message, type) — success, error, warning, info
- **Rapports bug** : insert_bug_report → notifie ADMIN/SUPERADMIN
- **Booster** : Alerte sidebar 50% XP/Honneur (feature boosterDisplay)
- **Sync** : Pas de toast dédié en cas d'échec (à améliorer)

---

## Internationalisation (i18n)

- **Langues** : fr (défaut), de, ru, es, en, tr
- **Fichier** : src/backend/translations.js — objet T avec clés par langue
- **Usage HTML** : data-i18n="key", data-i18n-placeholder="key", data-i18n-title="key"
- **Usage JS** : window.i18nT('key') ou TRANSLATIONS.t('key', lang)
- **Stockage** : darkOrbitLanguage (localStorage)
- **Événements** : multillingues_events/*.json — names, descriptions par langue

---

## Fichiers JSON des événements

**Emplacement** : `src/multillingues_events/*.json`

**Structure type** (ex. xp_day.json) :

```json
{
  "id": "xp_day",
  "visible": true,
  "image": "img/events/xp_day_2.jpg",
  "names": { "fr": "...", "en": "...", "de": "...", "es": "...", "ru": "...", "tr": "..." },
  "descriptions": { "fr": "...", ... },
  "keywords": ["xp day", "experience day", "journée double xp", ...],
  "exclude_keywords": ["honor day", "ascend", ...]
}
```

**Champs obligatoires** : id, names (au moins fr ou en), keywords  
**Matching** : MATCH_SCORE_THRESHOLD = 2, containsWord sur titre + description normalisés

---

## Règles métier importantes

- **Limites sessions** : FREE=1, PRO=10 (RPC insert/upsert_user_session_secure). Optionnel : remove-session-limits-unlimited pour tous illimités.
- **Badges** : FREE (stats, progression, history, classement, settings — pas Événements ni Dashboard), PRO (+ events, notifications, booster, liens, auto-save, streak), ADMIN (+ Dashboard), SUPERADMIN (+ admin management).
- **Export** : FREE/PRO connectés → boutons Export masqués, message « Export uniquement disponible si données locales ». ADMIN/SUPERADMIN → export visible.
- **Sidebar** : Booster et Events masqués par défaut (display:none). Affichés si currentHasFeature('boosterDisplay') et currentCanAccessTab('events').
- **Sync** : Throttle 15 s (queueSync). Merge par local_id, dernier écrit gagne. **Isolation compte** : au logout et changement d’utilisateur, toutes les clés `STORAGE_KEYS` sont effacées sauf `LOGOUT_KEEP_STORAGE_KEYS()` (voir `docs/STORAGE_KEYS_AND_USER_ISOLATION.md`). Ban : arrêt sync périodique puis logout.
- **Events** : Ne jamais supprimer où expires_at IS NULL. Supprimer uniquement par id.
- **Profile scraping** : Seul SUPERADMIN. Ne remplit que les champs vides (company, etc.), jamais d'écrasement.
- **Licence** : Format XXXX-XXXX-XXXX-XXXX, usage unique.
 - **Scheduler scraping** : `delayBetweenServers` configurable dans le dashboard (10s, 20s, 30s, 60s, 90s, 120s), clampé entre 10 000 ms et 600 000 ms dans `main.js`

---

## Ce qu'il ne faut JAMAIS faire

- Ne jamais commiter `.env` (déjà dans .gitignore)
- Ne jamais supprimer tous les events d'un coup — uniquement celui dont le timer = 0
- Ne jamais supprimer un event avec expires_at = null
- Ne pas exécuter security-step3-rate-limit-rpcs et security-step4-validate-rpcs si on veut garder les limites FREE=1, PRO=10 (conflit)
- Ne pas exécuter create-rpc-get-ranking ET create-ranking-rpc (conflit sur get_ranking)
- Ne pas exposer nodeIntegration au renderer (preload + contextBridge uniquement)
- Ne pas afficher onglets/features FREE sans vérifier currentCanAccessTab / currentHasFeature
- Ne pas oublier d'ajouter un nouvel event JSON dans EVENTS_DB_FILES (events.js) si créé
- Ne pas modifier shared_events avec DELETE sans WHERE (Supabase bloque)
 - Ne jamais ignorer la payload `events-updated` : toujours brancher `setScrapedEventsFromIPC` pour que la sidebar reste fonctionnelle même si Supabase est indisponible
 - Garder les deux copies de `JS_EXTRACT_EVENTS` (`session-scraper.js` et `events-scraper-standalone.js`) strictement identiques à chaque évolution des sélecteurs
 - Dans les fonctions PL/pgSQL avec `RETURNS TABLE(server_id TEXT, ...)`, toujours préfixer les colonnes de la table source avec un alias explicite (`FROM shared_rankings_snapshots srs` puis `srs.server_id`) pour éviter l'ambiguïté avec les colonnes de retour déclarées (erreur Postgres `42702 column reference "server_id" is ambiguous`)
- Utiliser par défaut directement le `server_id` interne dans les URLs DOStats (`server=gbl2`, `server=gbl3`, etc.). Si DOStats introduit un serveur dont l'identifiant d'URL diffère du `server_id` interne, ajouter explicitement un mapping dédié dans le code du scraper concerné (profils ou HoF) et documenter ce cas dans ce fichier.
- **DOStats HoF (classements)** : DOStats ne propose pas de Hall-of-Fame pour tous les serveurs. Seuls fr1, de2, de4, es1, gbl1, gbl3, gbl4, gbl5 ont des données HoF confirmées. Les serveurs int*, ru*, tr*, mx1, pl3, us2 sont tentés mais peuvent retourner 0 joueurs si DOStats n'a pas de page HoF — comportement normal, aucun snapshot vide n'est sauvegardé. Consulter les logs `[DOStatsRanking] <serverId>: aucune donnée` pour diagnostiquer. Si un serveur devient disponible sur DOStats avec un ID différent, ajouter un mapping explicite dans le module de scraping DOStats concerné.
