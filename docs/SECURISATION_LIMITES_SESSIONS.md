# Sécurisation des limites de sessions côté backend

> ⚠ **Statut : document historique (obsolète pour la version actuelle).**  
> Depuis la mise à jour décrite dans `CORRECTIONS_VERSION_FREE.md`, les limites FREE=1 / PRO=10 ont été **désactivées** côté serveur via la migration `remove-session-limits-unlimited.sql`.  
> Ce fichier décrit donc l’ancienne configuration « sessions limitées » et ne doit plus être appliqué tel quel sur une base qui utilise la version actuelle de l’app.

**Date (configuration historique) :** 11 février 2026  
**Règles métier à l’époque :** FREE = 1 session max | PRO = 10 sessions max | ADMIN/SUPERADMIN = illimité

---

## 1. Modifications effectuées

### 1.1 Backend Supabase (migrations)

- **`supabase/migrations/session-limits-rpc-and-rls.sql`** (nouveau)
  - Création de la table `user_sessions` si elle n’existe pas (avec `is_baseline`).
  - Ajout de la colonne `is_baseline` si la table existait sans elle.
  - Fonction **`get_my_badge()`** : retourne le badge de l’utilisateur courant (depuis `profiles`).
  - RPC **`insert_user_session_secure(p_row JSONB)`** :
    - Récupère le badge (FREE/PRO/ADMIN/SUPERADMIN).
    - Compte les sessions existantes pour l’utilisateur.
    - FREE → bloque si `count >= 1`.
    - PRO → bloque si `count >= 10`.
    - ADMIN/SUPERADMIN → pas de limite.
    - Retourne `{ success: false, error: '...', code: 'SESSION_LIMIT_FREE' | 'SESSION_LIMIT_PRO' }` si quota dépassé.
    - Sinon insère et retourne `{ success: true }`.
  - RPC **`upsert_user_session_secure(p_row JSONB)`** :
    - Si une session avec le même `(user_id, local_id)` existe → UPDATE (ne compte pas dans le quota).
    - Sinon → même logique de limite que l’insert, puis INSERT.
  - **RLS** : suppression de la policy « CRUD » sur `user_sessions`, création de trois policies :
    - **SELECT** : `auth.uid() = user_id`
    - **UPDATE** : `auth.uid() = user_id`
    - **DELETE** : `auth.uid() = user_id`
  - **Aucune policy INSERT** : l’insertion ne peut se faire que via les RPC (SECURITY DEFINER), ce qui impose la vérification du quota.
  - `GRANT EXECUTE` sur les deux RPC pour le rôle `authenticated`.

- **`supabase/migrations/fix-get-user-permissions-session-limits.sql`** (nouveau)
  - Remplace `get_user_permissions` pour que le champ `limits.maxSessions` soit cohérent avec le serveur :
    - **FREE** → `maxSessions: 1`
    - **PRO** → `maxSessions: 10`
    - **ADMIN/SUPERADMIN** → `maxSessions: -1` (illimité).
  - Les valeurs par défaut (utilisateur inconnu / profil non trouvé) passent à `maxSessions: 1`.

- **`supabase/migrations/fix-rpc-get-user-permissions-security.sql`** (modifié)
  - Mise à jour des mêmes limites dans cette version de la RPC (par défaut et dans le `CASE` sur le badge) : FREE = 1, PRO = 10, défaut = 1.

### 1.2 Frontend

- **`src/backend/api.js`**
  - **`_buildPermissionsFallback()`** : 
    - FREE → `maxSessions: 1`
    - PRO → `maxSessions: 10`
    - ADMIN/SUPERADMIN → `maxSessions: -1`
  - Objet **default** (pas de permissions) : `maxSessions: 1` au lieu de 10.

Aucune autre modification du frontend. La limitation côté client reste basée sur **`BackendAPI.getSessionLimit()`** (données venant de la RPC `get_user_permissions` ou du fallback), ce qui garde une cohérence d’affichage (bouton désactivé, message « limite atteinte ») tout en ayant la **vraie contrainte côté serveur**.

- **`src/backend/sessions.js`** : inchangé ; continue d’utiliser `BackendAPI.getSessionLimit()` avant d’ajouter une session (évite des appels inutiles quand la limite est déjà atteinte).
- **`src/backend/sync-manager.js`** : inchangé ; appelle déjà `upsert_user_session_secure` / `insert_user_session_secure` et gère les réponses `success: false` avec `code` `SESSION_LIMIT_FREE` / `SESSION_LIMIT_PRO` (toast utilisateur).

---

## 2. Fichiers impactés

| Fichier | Action |
|--------|--------|
| `supabase/migrations/session-limits-rpc-and-rls.sql` | **Créé** – table, RPCs, RLS |
| `supabase/migrations/fix-get-user-permissions-session-limits.sql` | **Créé** – limites dans `get_user_permissions` |
| `supabase/migrations/fix-rpc-get-user-permissions-security.sql` | **Modifié** – maxSessions FREE=1, PRO=10, défaut=1 |
| `src/backend/api.js` | **Modifié** – fallback et défaut maxSessions 1 / 10 / -1 |

---

## 3. Confirmation des règles

- **FREE ne peut jamais dépasser 1 session**  
  Les RPC `insert_user_session_secure` et `upsert_user_session_secure` lisent le badge dans `profiles`, comptent les lignes dans `user_sessions` pour `auth.uid()`, et refusent toute nouvelle insertion si le compte est FREE et qu’il existe déjà au moins 1 session. Aucun INSERT direct n’est possible grâce aux policies RLS (pas de policy INSERT).

- **PRO ne peut jamais dépasser 10 sessions**  
  Même logique : pour un badge PRO, les RPC refusent l’insertion si `count >= 10`. Les mises à jour d’une session existante (même `user_id` + `local_id`) ne sont pas comptées.

- **Règle entièrement côté serveur**  
  Toute insertion de session passe par les deux RPC (SECURITY DEFINER), qui appliquent les quotas. Les policies RLS sur `user_sessions` n’autorisent que SELECT, UPDATE et DELETE pour `auth.uid() = user_id`, et n’autorisent aucun INSERT direct.

---

## 4. Déploiement

1. Exécuter les migrations Supabase dans l’ordre (ou via l’outil de migration du projet), en particulier :
   - `session-limits-rpc-and-rls.sql`
   - `fix-get-user-permissions-session-limits.sql`  
   Si `fix-rpc-get-user-permissions-security.sql` a déjà été exécuté, `fix-get-user-permissions-session-limits.sql` met à jour `get_user_permissions` avec les bonnes limites.
2. Si la table `user_sessions` a été créée manuellement (ex. via `supabase-schema-data.sql`), la migration ajoute la colonne `is_baseline` si nécessaire et applique les nouvelles policies RLS (suppression de la policy « CRUD », création SELECT/UPDATE/DELETE uniquement).
3. Aucune commande (npm, build, etc.) n’est requise pour le frontend ; recharger l’app après déploiement des migrations.
