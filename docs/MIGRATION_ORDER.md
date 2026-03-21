# Ordre d'application des migrations Supabase

> **Référence code (sessions)** : les RPC **`insert_user_session_secure`** / **`upsert_user_session_secure`** canoniques sont dans `supabase/migrations/20260303000010_final-session-rpcs-canonical.sql` — limites **FREE = 1** et **PRO = 10** sessions (hors baseline), **ADMIN / SUPERADMIN** illimité.  
> La migration **`remove-session-limits-unlimited.sql`** est un **chemin optionnel** qui supprime ces limites pour tous les badges : ne l’appliquer **que** si le produit doit être en mode sessions illimitées (sinon garder les RPC canoniques ci-dessus).  
> Les classements partagés utilisent notamment **`shared_rankings_snapshots`** et **`shared_rankings_dostats_snapshots`** (migrations `20260225…` et suivantes). Voir aussi **`docs/APP_CONTEXT.md`** pour l’état fonctionnel de l’app.

**Prérequis obligatoires :** Le projet doit disposer des tables et schémas de base créés par les scripts dans `src/backend/` :

- `permissions_config` (supabase-rpc-permissions.sql)
- `user_settings` (supabase-schema-data.sql)
- `admin_messages` (supabase-schema-messages.sql)
- `auth.users` (géré par Supabase Auth)
- Fonction `is_superadmin()` (supabase-rpc-admin.sql) — requise par `security-step5-logging-and-export.sql`

Si ces éléments n'existent pas, exécuter d'abord les scripts SQL de `src/backend/` avant les migrations.

---

## 1. Ordre recommandé d'application

| # | Fichier | Description |
|---|---------|-------------|
| 1 | `create-profiles-table.sql` | Crée la table `profiles` (référence auth.users) |
| 2 | `create-profiles-trigger.sql` | Trigger `on_auth_user_created` pour créer un profil à l'inscription |
| 3 | `security-step1-profiles-rls-strict.sql` | RLS profiles, fonctions `get_my_profile_role`/`get_my_profile_badge`, vue `profiles_public` |
| 4 | `create-admin-logs-table.sql` | Table `admin_logs` (nécessite les fonctions créées en 3) |
| 5 | `fix-profiles-rls-sensitive-fields.sql` | Restriction des champs sensibles ; recrée `profiles_public` |
| 6 | `fix-profiles-public-security-invoker.sql` | Vue `profiles_public` en SECURITY INVOKER |
| 7 | `create-license-keys.sql` | Table `license_keys`, RPC `activate_license_key`, `insert_license_keys` |
| 8 | `session-limits-rpc-and-rls.sql` | Table `user_sessions`, RLS, RPC `insert_user_session_secure`, `upsert_user_session_secure`, `get_my_badge` |
| 9 | `fix-rpc-get-user-permissions-security.sql` | Sécurise `get_user_permissions`, crée `is_admin_or_superadmin` |
| 10 | `fix-get-user-permissions-session-limits.sql` | Aligne `get_user_permissions` sur les limites (FREE=1, PRO=10) |
| 11 | `security-step2-permissions-config-rls.sql` | RLS sur `permissions_config`, revoke accès direct |
| 12 | **CHOIX** | Voir section 3 — `create-ranking-rpc.sql` OU `create-rpc-get-ranking.sql` |
| 13 | `add-classement-to-permissions.sql` | Ajoute l'onglet `classement` dans `permissions_config` (redondant si create-ranking-rpc/create-rpc-get-ranking exécuté ; idempotent) |
| 14 | `add-imported-rankings-to-user-settings.sql` | Colonne `imported_rankings_json` sur `user_settings` |
| 15 | `add-current-events-json-to-user-settings.sql` | Colonne `current_events_json` sur `user_settings` |
| 16 | `add-admin-send-global-message.sql` | RPC `admin_send_global_message` (nécessite `admin_messages`) |
| 17 | `security-step3-rate-limiting.sql` | Table `rate_limit_tracker`, fonction `check_rate_limit` |
| 18 | `security-step4-validate-numeric.sql` | Fonctions `safe_bigint`, `validate_session_row` |
| 19 | `security-step5-security-events.sql` | Table `security_events`, fonction `log_security_event` |
| 20 | `security-step5-logging-and-export.sql` | Logging dans `check_rate_limit` et `validate_session_row`, RPC `get_security_events`, `get_admin_logs_export` |

---

## 2. Dépendances entre migrations

```
create-profiles-table
    └── create-profiles-trigger

security-step1-profiles-rls-strict (profiles + get_my_profile_role, get_my_profile_badge)
    ├── create-admin-logs-table (utilise ces fonctions)
    ├── fix-profiles-rls-sensitive-fields (recrée profiles_public)
    │       └── fix-profiles-public-security-invoker
    └── create-license-keys (référence profiles)

session-limits-rpc-and-rls (user_sessions, get_my_badge)
    ├── fix-rpc-get-user-permissions-security (permissions_config)
    ├── fix-get-user-permissions-session-limits
    └── security-step2-permissions-config-rls

create-ranking-rpc / create-rpc-get-ranking (profiles_public, user_sessions, permissions_config)
    └── add-classement-to-permissions (optionnel si déjà fait)

add-imported-rankings-to-user-settings → user_settings
add-current-events-json-to-user-settings → user_settings
add-admin-send-global-message → admin_messages, profiles

security-step3-rate-limiting (rate_limit_tracker, check_rate_limit)
    └── security-step3-rate-limit-rpcs (⚠️ CONFLIT — voir section 3)

security-step4-validate-numeric (safe_bigint, validate_session_row)
    └── security-step4-validate-rpcs (⚠️ CONFLIT — voir section 3)

security-step5-security-events (security_events, log_security_event)
    └── security-step5-logging-and-export (modifie check_rate_limit, validate_session_row)
```

---

## 3. Migrations à risque ou en conflit

### 3.1 Conflit : `create-rpc-get-ranking.sql` vs `create-ranking-rpc.sql`

**Problème :** Les deux définissent la RPC `get_ranking` et mettent à jour `permissions_config` pour l'onglet `classement`. Exécuter les deux écrase la fonction.

**Action :** Choisir **un seul** des deux :

- **`create-ranking-rpc.sql`** : implémentation avec `LEFT JOIN LATERAL`, colonnes `rank_points`/`next_rank_points` en BIGINT.
- **`create-rpc-get-ranking.sql`** : implémentation avec `WITH latest_sessions`, colonnes en INTEGER, `p_type` inclut `'rank'`.

**Recommandation :** Utiliser `create-ranking-rpc.sql` (compatible avec les signatures utilisées dans le frontend). Ignorer `create-rpc-get-ranking.sql` si on garde l’autre.

### 3.2 Conflit : Limites de sessions vs rate limiting / validation

**Problème :** Plusieurs migrations redéfinissent `insert_user_session_secure` et `upsert_user_session_secure` :

| Migration | Limites (FREE=1, PRO=10) | Rate limiting | Validation |
|-----------|--------------------------|---------------|------------|
| `session-limits-rpc-and-rls.sql` | ✅ | ❌ | ❌ |
| `security-step3-rate-limit-rpcs.sql` | ❌ (supprimées) | ✅ | ❌ |
| `security-step4-validate-rpcs.sql` | ❌ | ✅ | ✅ |
| `remove-session-limits-unlimited.sql` | ❌ (illimité pour tous) | ❌ | ❌ |

**Incompatibilité :** `security-step3-rate-limit-rpcs` et `security-step4-validate-rpcs` remplacent les RPC et suppriment la logique des limites (FREE=1, PRO=10).

**Options :**

1. **Sessions illimitées (tous les badges)**  
   Appliquer `remove-session-limits-unlimited.sql` et **ne pas** appliquer `security-step3-rate-limit-rpcs` ni `security-step4-validate-rpcs`.

2. **Limites + rate limiting + validation**  
   Ne pas appliquer `security-step3-rate-limit-rpcs` ni `security-step4-validate-rpcs` ni `remove-session-limits-unlimited`.  
   Appliquer uniquement `security-step3-rate-limiting`, `security-step4-validate-numeric`, `security-step5-*`, puis adapter manuellement `insert_user_session_secure` et `upsert_user_session_secure` pour combiner limites + `check_rate_limit` + `validate_session_row`.

### 3.3 Migration `remove-session-limits-unlimited.sql`

**Effet :** Met `maxSessions: -1` pour tous les badges et retire la vérification des limites dans les RPC sessions.  
**À utiliser uniquement** si vous voulez explicitement des sessions illimitées pour FREE/PRO. Sinon, s’appuyer sur **`20260303000010_final-session-rpcs-canonical.sql`** (limites actives). Réappliquer les RPC canoniques après un passage par `remove-session-limits-unlimited` si vous revenez aux limites FREE/PRO.

### 3.4 Migration `verify-session-limits-structure.sql`

**Effet :** Ne modifie rien ; uniquement des `SELECT` pour valider la structure (existence de `user_sessions`, RLS, policies, fonctions).

**Usage :** Exécuter après les migrations de sessions pour contrôler que tout est en place.

---

## 4. Résumé des migrations critiques

| Catégorie | Fichiers |
|-----------|----------|
| **Profiles** | create-profiles-table, create-profiles-trigger, security-step1, fix-profiles-rls-sensitive-fields, fix-profiles-public-security-invoker |
| **Licences** | create-license-keys |
| **Sessions** | session-limits-rpc-and-rls, (optionnel) remove-session-limits-unlimited |
| **Permissions** | fix-rpc-get-user-permissions-security, fix-get-user-permissions-session-limits, security-step2-permissions-config-rls |
| **Classement** | create-ranking-rpc (ou create-rpc-get-ranking — choisir un seul) |
| **Sécurité avancée** | security-step3-rate-limiting, security-step4-validate-numeric, security-step5-security-events, security-step5-logging-and-export |
| **Admin** | create-admin-logs-table, add-admin-send-global-message |

---

## 5. Séquence minimale recommandée (sans conflits)

1. create-profiles-table.sql  
2. create-profiles-trigger.sql  
3. security-step1-profiles-rls-strict.sql  
4. create-admin-logs-table.sql  
5. fix-profiles-rls-sensitive-fields.sql  
6. fix-profiles-public-security-invoker.sql  
7. create-license-keys.sql  
8. session-limits-rpc-and-rls.sql  
9. fix-rpc-get-user-permissions-security.sql  
10. fix-get-user-permissions-session-limits.sql  
11. security-step2-permissions-config-rls.sql  
12. create-ranking-rpc.sql *(ou create-rpc-get-ranking.sql)*  
13. add-classement-to-permissions.sql  
14. add-imported-rankings-to-user-settings.sql  
15. add-current-events-json-to-user-settings.sql  
16. add-admin-send-global-message.sql  
17. security-step3-rate-limiting.sql  
18. security-step4-validate-numeric.sql  
19. security-step5-security-events.sql  
20. security-step5-logging-and-export.sql  

**Exclure :** `security-step3-rate-limit-rpcs.sql`, `security-step4-validate-rpcs.sql` (conflits avec les limites de sessions), et `remove-session-limits-unlimited.sql` (sauf si sessions illimitées voulues).

**Conséquence :** En excluant `security-step3-rate-limit-rpcs` et `security-step4-validate-rpcs`, les RPC sessions conservent les limites (FREE=1, PRO=10) mais n'intègrent ni rate limiting ni validation des valeurs. Les tables `rate_limit_tracker`, `security_events` et les fonctions `check_rate_limit`, `validate_session_row` existent mais ne sont pas utilisées par les RPC sessions.

**Optionnel après 20 :** `verify-session-limits-structure.sql` (vérification uniquement).

---

## 6. Migrations récentes (2026-03 — alignement app)

À appliquer **après** la base existante, dans l’ordre si besoin :

| Fichier | Rôle |
|---------|------|
| `20260320130000_create-missing-shared-dostats-and-player-profiles.sql` | Tables `shared_rankings_snapshots`, `shared_rankings_dostats_snapshots`, `player_profiles` si absentes (RPC classements / profils) |
| `20260321130000_delete_event_by_id_only_if_expires_at.sql` | `delete_event_by_id` : ne supprime pas les évènements `expires_at IS NULL` |
| `20260321140000_delete_all_sessions_for_current_user.sql` | RPC `delete_all_sessions_for_current_user()` (hard reset / inscription baseline) |
| `20260321150000_upsert_user_sessions_bulk.sql` | RPC `upsert_user_sessions_bulk` (import / migration sessions en lot) |

Le code renderer appelle ces RPC : sans migration correspondante, les fonctionnalités concernées échoueront côté Supabase.
