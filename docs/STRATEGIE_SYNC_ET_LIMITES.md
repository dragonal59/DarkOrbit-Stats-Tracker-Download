# Stratégie de sync (pull/merge) et limites par badge

> ⚠ **Mise à jour — limites de sessions.**  
> La section 3 ci‑dessous décrit l’ancienne stratégie « FREE=1 session, PRO=10 sessions » côté Supabase.  
> Depuis la migration `remove-session-limits-unlimited.sql` documentée dans `CORRECTIONS_VERSION_FREE.md`, les RPC `insert_user_session_secure` / `upsert_user_session_secure` n’appliquent plus ces quotas et `get_user_permissions` renvoie `maxSessions: -1` pour tous les badges.  
> La partie **sync / merge** reste valable, mais les informations de quota doivent être lues comme **historiques**.

**Document Phase 3 — DarkOrbit Stats Tracker Pro**

---

## 1. DataSync.pull()

### Déclenchement

- Au chargement de l'app (après auth) : `index.html` → `DataSync.pull()`
- Après mise à jour des classements (scraper) : `super-admin.js` → `DataSync.pull()`
- Après résolution CAPTCHA manuel (rafraîchissement des données)

### Rôle

Récupère les données Supabase (sessions, événements, paramètres) et les fusionne avec le localStorage.

### Stratégie de merge

| Entité | Stratégie | Détail |
|--------|-----------|--------|
| **Sessions** | Dernier écrit gagne | Pour chaque `local_id`, la version avec le `session_timestamp` le plus récent l'emporte. Si le serveur a une version plus récente, elle remplace le local. |
| **Événements** | Fusion par `local_id` | Même logique que les sessions. |
| **Paramètres** | Serveur prioritaire | Sauf si `isSettingsDirty()` est true (modifications locales non sauvegardées), les paramètres serveur écrasent le local. |
| **Classements importés** | Merge intelligent | Les entrées serveur sont fusionnées avec le local ; les entrées locales avec `fusion: true` sont conservées. |

### Risques

En cas d'édition concurrente sur deux appareils, les modifications les plus anciennes peuvent être perdues (pas de merge 3-way).

### Après le pull

L'UI est rafraîchie : `renderHistory()`, `updateEventsDisplay()`, `updateProgressionTab()`, `loadCurrentStats()`, `initBaselineSetup()`, `refreshRanking()`, etc.

---

## 2. DataSync.sync()

### Déclenchement

- Périodiquement : `SYNC_INTERVAL_MS` (5 min) via `startPeriodicSync()`
- Après modification : `queueSync()` (throttle 15 s minimum)
- Explicite : sauvegarde session, modification paramètres, etc.

### Rôle

Envoie les données locales vers Supabase (push). Appelle `_migrateSessions`, `_migrateEvents`, `_migrateSettings`.

### Flux

1. Vérification `isReady()` et `!_migrating`
2. Récupération `user_id` via `getUserId()`
3. Migration sessions → `upsert_user_session_secure`
4. Migration événements → upsert `user_events`
5. Migration paramètres → upsert `user_settings`
6. Mise à jour `LAST_SYNC_KEY`

---

## 3. Limites de sessions par badge (côté serveur)

Les limites sont **imposées côté serveur** via les RPC Supabase (`insert_user_session_secure`, `upsert_user_session_secure`). Un client modifié ne peut pas contourner ces limites.

| Badge | Limite sessions | RPC |
|-------|-----------------|-----|
| **FREE** | 1 session max | `SESSION_LIMIT_FREE` si dépassement |
| **PRO** | 10 sessions max | `SESSION_LIMIT_PRO` si dépassement |
| **ADMIN** | Illimité | — |
| **SUPERADMIN** | Illimité | — |

### Fichiers SQL

- `src/backend/supabase-rpc-session-limits.sql` : définitions des fonctions
- `docs/RUN_MIGRATIONS_SESSION_LIMITS.sql` : script d'exécution

### Messages utilisateur

- FREE : *"Limite atteinte : les utilisateurs FREE ne peuvent avoir qu'1 session. Passez en PRO pour plus de sessions."*
- PRO : *"Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN."*

### Côté client

- `sessions.js` : vérifie le badge (FREE/PRO) avant d'autoriser l'ajout d'une session
- L'UI masque ou désactive le bouton d'ajout si la limite est atteinte
- La contrainte réelle est côté RPC ; le client applique une vérification préalable pour une meilleure UX

---

## 4. Références

- `src/backend/sync-manager.js` : implémentation `pull`, `sync`, `_mergeSessions`, `_mergeEvents`
- `src/backend/supabase-rpc-session-limits.sql` : RPC serveur
- `src/backend/api.js` : `get_user_permissions` (badge, limites)
