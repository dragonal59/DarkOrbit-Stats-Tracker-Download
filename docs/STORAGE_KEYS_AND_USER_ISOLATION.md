# Stockage local — isolation par utilisateur

## Comportement actuel (mars 2026)

### `AuthManager.logout()` et `AuthManager.ensureUserDataIsolation(user)`

- Parcours **`APP_KEYS.STORAGE_KEYS`** et appelle **`UnifiedStorage.remove(key)`** pour chaque valeur, **sauf** les clés retournées par **`APP_KEYS.LOGOUT_KEEP_STORAGE_KEYS()`** (par défaut **aucune**).
- Efface aussi **`darkOrbit_lastUserId`** au logout.
- Vide le cache sessions en mémoire, invalide le cache **UserPreferencesAPI** si présent.

### Utilisateur banni (`DataSync.startPeriodicSync` → `run`)

- Si `profile.status === 'banned'` : **`DataSync.stopPeriodicSync()`** puis **`AuthManager.logout()`** puis navigation vers `auth.html` (évite des cycles sync/heartbeat inutiles après déconnexion).

## Portée des clés (`src/config/keys.js`)

| Catégorie | Exemples | Notes |
|-----------|----------|--------|
| **Données compte** | `SESSIONS`, `EVENTS`, `SETTINGS`, `IMPORTED_RANKINGS`, `CURRENT_STATS`, … | Recréées au **`pull()`** depuis Supabase quand applicable. |
| **Local sensible non namespacé** | `FOLLOWED_PLAYERS`, `FOLLOWED_PLAYERS_STATS` | Stockées sous une clé **globale** ; **non** incluses dans `user_settings` lors du `sync()` actuel. D’où l’obligation de les **effacer** au changement de compte (sinon fuite A → B). |
| **Coupons** | `USER_COUPONS`, `USER_COUPON_HISTORY` | Commentaire dans `sync-manager.js` : local uniquement, pas de pull serveur — effacés au switch (comportement voulu). |
| **Préférences raw `localStorage`** | `THEME`, `VIEW_MODE`, `LANGUAGE`, `THEME_AUTO` | Aussi reflétées dans `user_settings` lors du sync/pull. |
| **Hors `STORAGE_KEYS`** | `sb-*` (Supabase Auth), `pending_baseline_scan`, etc. | Gérées séparément ; `signOut` gère la session Supabase. |

## Dette technique connue

- **`FOLLOWED_PLAYERS` / `FOLLOWED_PLAYERS_STATS`** sont dans **`SYNC_KEYS`** (déclenchent `queueSync`) mais **`_migrateSettings`** ne les envoie pas dans **`user_settings`**. Tant que ce n’est pas implémenté, la liste « suivis » est **perdue au logout** (acceptable vs fuite inter-comptes). Amélioration possible : champ JSON dans `user_settings` ou table dédiée.

## Extension

Pour garder des clés au logout (ex. préférences purement machine), les ajouter **explicitement** dans **`LOGOUT_KEEP_STORAGE_KEYS()`** dans `keys.js` — **jamais** de données identifiables d’un utilisateur sans namespace par `user_id`.
