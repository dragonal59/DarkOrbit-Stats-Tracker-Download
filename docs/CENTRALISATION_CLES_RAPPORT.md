# Rapport — Centralisation des clés et configuration critique

**Date :** 11 février 2026  
**Objectif :** Une seule source de vérité pour les clés de stockage et de synchronisation, sans valeurs sensibles en dur dans le code métier.

---

## 1. Module centralisé

**Fichier :** `src/config/keys.js`

- Expose **`window.APP_KEYS`** avec :
  - **`STORAGE_KEYS`** : objet listant toutes les clés localStorage / stockage utilisées par l’app (sessions, stats, thème, événements, paramètres, liens, boosters, badge, sync, admin, etc.).
  - **`SYNC_KEYS`** : tableau des clés qui déclenchent une synchronisation Supabase (utilisé par `unified-storage.js` et cohérent avec `sync-manager.js`).
- **Secrets (Supabase)** : inchangés, gérés par `preload.js` (env) et `supabase-config.js` (pas de clé en dur).
- Pas de `process.env` dans ce module : le frontend tourne dans le renderer Electron ; les variables d’environnement restent exposées via le preload pour Supabase uniquement.
- Valeurs par défaut : toutes les clés sont des constantes de nommage (ex. `'darkOrbitSessions'`) ; elles ne sont pas sensibles. Les fallbacks en dur dans les autres fichiers ne servent qu’en cas d’absence de `APP_KEYS` (ex. ordre de chargement ou tests).

---

## 2. Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| **src/config/keys.js** | **Créé** — Définition de `APP_KEYS.STORAGE_KEYS` et `APP_KEYS.SYNC_KEYS`. |
| **src/backend/config.js** | Utilise `APP_KEYS` pour `CONFIG.STORAGE_KEYS` et ajoute `CONFIG.SYNC_KEYS` ; fallback si `APP_KEYS` absent. |
| **src/index.html** | Chargement de `config/keys.js` après supabase-client, avant unified-storage ; un bloc de scripts utilise déjà config.js. |
| **src/auth.html** | Chargement de `config/keys.js` avant `config.js`. |
| **src/backend/sync-manager.js** | `MIGRATION_DONE_KEY`, `LAST_SYNC_KEY`, `PENDING_SYNC_KEY` et toutes les clés utilisées en lecture/écriture (sessions, events, settings, theme, viewMode, boosterLearning, etc.) passent par `APP_KEYS.STORAGE_KEYS` avec fallback. |
| **src/backend/unified-storage.js** | Liste des clés déclenchant le sync = `APP_KEYS.SYNC_KEYS` ; helpers `getCachedSessions` / `saveCachedSessions` etc. utilisent `APP_KEYS.STORAGE_KEYS`. |
| **src/backend/api.js** | Clés `VERSION_BADGE`, `MIGRATION_HINT` lues depuis `CONFIG.STORAGE_KEYS` (avec fallback). |
| **src/backend/version-badges.js** | `STORAGE_KEY_BADGE`, `STORAGE_KEY_PROFILE` = `APP_KEYS.STORAGE_KEYS.VERSION_BADGE` / `PROFILE_CACHE` + fallback. |
| **src/backend/auth-manager.js** | Suppression du badge au logout via `APP_KEYS.STORAGE_KEYS.VERSION_BADGE`. |
| **src/backend/super-admin.js** | `STORAGE_KEYS` remplacé par un getter basé sur `APP_KEYS.STORAGE_KEYS` (ADMIN_USERS, ADMIN_ACTION_LOGS). |
| **src/backend/boosters.js** | `BOOSTERS_STORAGE_KEY` = `APP_KEYS.STORAGE_KEYS.BOOSTERS` + fallback. |
| **src/backend/events.js** | `EVENTS_STORAGE_KEY` = `APP_KEYS.STORAGE_KEYS.EVENTS` + fallback. |
| **src/backend/settings.js** | `SETTINGS_STORAGE_KEY`, `CUSTOM_ICONS_STORAGE_KEY` = `APP_KEYS.STORAGE_KEYS` + fallback. |
| **src/backend/links.js** | `STORAGE_KEY_LINKS` = `APP_KEYS.STORAGE_KEYS.CUSTOM_LINKS` + fallback. |
| **src/backend/reference-session.js** | `REFERENCE_DATE_KEY` = `APP_KEYS.STORAGE_KEYS.REFERENCE_DATE` + fallback. |
| **src/backend/booster-learning.js** | `BOOSTER_LEARNING_KEY` = `APP_KEYS.STORAGE_KEYS.BOOSTER_LEARNING` + fallback. |
| **src/frontend/auto-theme.js** | Thème et thème auto : clés lues depuis `CONFIG.STORAGE_KEYS` (THEME, THEME_AUTO) avec fallback. |
| **src/compression.js** | Liste des clés pour `migrateAll()` = `APP_KEYS.STORAGE_KEYS` (SESSIONS, SETTINGS, CUSTOM_LINKS) + fallback. |
| **src/cache.js** | Wrappers get/set sessions, settings, links utilisent `APP_KEYS.STORAGE_KEYS` + fallback. |

---

## 3. Ce qui a été remplacé

- **Clés de synchronisation** : auparavant en dur dans `unified-storage.js` (`syncKeys`) et implicites dans `sync-manager.js`. Désormais définies une seule fois dans `keys.js` (`SYNC_KEYS`) et réutilisées partout avec le même ordre (sessions, events, settings, custom links, boosters, current stats, booster learning).
- **Clés de stockage** : chaque module (sessions, stats, events, settings, links, boosters, version-badges, api, auth-manager, super-admin, sync-manager, unified-storage, auto-theme, cache, compression, reference-session, booster-learning) utilisait sa propre constante ou chaîne en dur. Toutes référencent désormais `APP_KEYS.STORAGE_KEYS` ou `CONFIG.STORAGE_KEYS` (lui-même alimenté par `APP_KEYS`).
- **Aucune URL, token ou API key** n’était ajoutée dans le périmètre : Supabase reste configuré uniquement via preload + `supabase-config.js` (aucun changement pour la sécurité des secrets).

---

## 4. Vérifications

- **Clés hardcodées** : les seules chaînes du type `'darkOrbit...'` ou `'boosterLearning'` restantes sont soit dans `keys.js` (définition), soit en **fallback** (`sk.SESSIONS || 'darkOrbitSessions'`) lorsque `APP_KEYS` ou `CONFIG` est absent. Aucun nouveau secret n’a été introduit.
- **Migrations / RPC / backend Supabase** : les migrations SQL et les RPC n’utilisent pas de clés front ; elles restent inchangées. Aucune modification côté Supabase n’était nécessaire pour cette centralisation.
- **Absence de variables d’environnement** : déjà gérée pour Supabase (`isSupabaseConfigured()`, pas de fallback avec clé). Pour les clés de stockage, l’absence de `APP_KEYS` (ex. script chargé hors ordre) est gérée par les fallbacks dans chaque fichier, ce qui évite des erreurs d’exécution.

---

## 5. Impacts et sécurité

- **Maintenance** : ajout ou renommage d’une clé = modification dans `keys.js` uniquement (et éventuellement dans `sync-manager` si une nouvelle clé doit être synchronisée).
- **Sécurité** : pas de stockage de secrets dans `keys.js` ; les identifiants Supabase restent fournis par l’environnement / preload. Réduction du risque de fuite de clés par duplication dans plusieurs fichiers.
- **Cohérence** : frontend et backend partagent les mêmes noms de clés via `APP_KEYS` et `CONFIG`, ce qui limite les incohérences entre sync, storage et UI.
- **Logique métier** : aucun changement de comportement fonctionnel ; uniquement remplacement de chaînes en dur par des références au module centralisé.
