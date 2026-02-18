# Migrations Supabase — Ordre et doublons

## Ordre d’exécution recommandé

1. **Schéma de base** : `create-profiles-table.sql`, `create-profiles-trigger.sql`, `fix-profiles-rls-sensitive-fields.sql`
2. **Permissions** : `fix-rpc-get-user-permissions-security.sql`
3. **Sessions et limites** : `session-limits-rpc-and-rls.sql`, `fix-get-user-permissions-session-limits.sql`
4. **Admin** : `create-admin-logs-table.sql`
5. **Classement** : utiliser **un seul** des deux fichiers RPC classement (voir ci‑dessous)
6. **Permissions onglets** : `add-classement-to-permissions.sql`

## Doublon RPC classement

- **create-rpc-get-ranking.sql** : version **canonique** (paramètres `p_server`, `p_companies`, `p_type`, `p_limit`, cohérente avec `ranking.js`). À exécuter.
- **create-ranking-rpc.sql** : **doublon** ; même RPC `get_ranking` avec une structure légèrement différente. Ne pas exécuter si `create-rpc-get-ranking.sql` est déjà appliqué. Conserver pour référence ou supprimer après migration.

## Vérification

Après application des migrations des limites de sessions, exécuter **verify-session-limits-structure.sql** (lecture seule) pour vérifier table, RLS et présence des fonctions.
