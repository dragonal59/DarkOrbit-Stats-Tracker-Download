# Rapport — RLS events et player_profiles

## 1. Vérification des policies actives (à exécuter par vous sur Supabase)

Les requêtes suivantes doivent être exécutées dans le SQL Editor Supabase pour connaître l’état actuel des policies.

### Table `events`

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'events';
```

**Si le résultat contient encore** `events_insert_anon`, `events_update_anon`, `events_delete_anon` avec `qual` / `with_check` permissifs (`true` ou équivalent), alors la migration **20260302130001** n’a pas été appliquée (ou a été exécutée avant la création de ces policies). Dans ce cas, exécutez **20260303000007_fix-rls-events-final.sql**.

**Si ces trois policies n’apparaissent plus** (déjà supprimées par 20260302130001), vous pouvez quand même exécuter 20260303000007 : les `DROP POLICY IF EXISTS` sont sans effet, et la migration ajoute des policies explicites (INSERT authentifié, UPDATE/DELETE sur `uploaded_by = auth.uid()`).

### Table `player_profiles`

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'player_profiles';
```

**Si le résultat contient** la policy `"Service insert/update"` avec `qual = true` (ou équivalent), exécutez **20260303000008_fix-rls-player-profiles.sql**.

---

## 2. Migrations créées

### 20260303000007_fix-rls-events-final.sql

- **DROP** : `events_insert_anon`, `events_update_anon`, `events_delete_anon`.
- **Colonne** : `uploaded_by UUID` ajoutée sur `public.events` si elle n’existe pas (nécessaire pour les policies UPDATE/DELETE basées sur le propriétaire).
- **CREATE** :
  - `events_insert_auth` : INSERT pour `authenticated`, `WITH CHECK (auth.uid() IS NOT NULL)`.
  - `events_update_own` : UPDATE pour `authenticated`, `USING (uploaded_by = auth.uid())`.
  - `events_delete_own` : DELETE pour `authenticated`, `USING (uploaded_by = auth.uid())`.

**Policies actives après correction (events)** :  
`events_select_visible` (SELECT), `events_insert_auth`, `events_update_own`, `events_delete_own`.

**Note** : Si vous aviez choisi de ne pas autoriser d’écriture directe sur `events` (uniquement via RPC SECURITY DEFINER, comme dans 20260302130001), cette migration réintroduit des policies d’écriture pour les utilisateurs authentifiés. Les RPC existantes continuent de fonctionner (SECURITY DEFINER).

### 20260303000008_fix-rls-player-profiles.sql

- **DROP** : `"Service insert/update"` sur `public.player_profiles`.
- **CREATE** : `player_profiles_service_write` — FOR ALL, `USING (auth.role() = 'service_role')` et `WITH CHECK (auth.role() = 'service_role')`.

**Policies actives après correction (player_profiles)** :  
`"Public read access"` (SELECT), `player_profiles_service_write` (INSERT/UPDATE/DELETE réservés au `service_role`).  
Les écritures depuis l’app (client Supabase avec JWT) passent par la RPC `upsert_player_profile` (SECURITY DEFINER), qui n’est pas bloquée par cette policy.

---

## 3. Résumé

| Fichier | Action |
|--------|--------|
| `20260303000007_fix-rls-events-final.sql` | Créé. À exécuter si les policies permissives sur `events` sont encore présentes (ou pour imposer des policies explicites INSERT/UPDATE/DELETE avec `uploaded_by`). |
| `20260303000008_fix-rls-player-profiles.sql` | Créé. À exécuter si la policy `"Service insert/update"` (USING true) est encore active sur `player_profiles`. |

**Résultat des SELECT pg_policies** : à récupérer par vous dans le SQL Editor Supabase (requêtes ci-dessus). Les migrations sont idempotentes (`DROP POLICY IF EXISTS` / `ADD COLUMN IF NOT EXISTS`).
