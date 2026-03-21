# Rapport — RLS license_keys

## 1. Vérification de l’état actuel (à exécuter sur Supabase)

Dans le SQL Editor Supabase :

```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'license_keys';
```

**Avant correction** (schéma `create-license-keys.sql`) on trouve typiquement :
- `license_keys_select` — `cmd = 'SELECT'`, `qual = 'true'` → exposition de toutes les lignes aux authentifiés.
- `license_keys_insert_superadmin`, `license_keys_update_superadmin`, `license_keys_delete_superadmin` (inchangées).

Si une policy nommée `"Users can view license keys"` existe (autre migration ou ancien schéma), elle est également supprimée par la migration.

---

## 2. Migration créée

**Fichier** : `supabase/migrations/20260303000009_fix-rls-license-keys.sql`

- **DROP** : `license_keys_select`, `"Users can view license keys"` (si présentes).
- **CREATE** : `license_keys_select_own` — `FOR SELECT TO authenticated` avec `USING (activated_by = auth.uid())`.

---

## 3. Policies avant / après

| Avant | Après |
|-------|--------|
| **SELECT** : `license_keys_select` → `USING (true)` (toutes les lignes visibles par tout authentifié). | **SELECT** : `license_keys_select_own` → `USING (activated_by = auth.uid())` (un utilisateur ne voit que les lignes qu’il a activées). |
| INSERT/UPDATE/DELETE : réservés au SUPERADMIN (inchangé). | Inchangé. |

---

## 4. Confirmation sécurité

- Un **utilisateur lambda** ne peut plus lister les clés des autres ni voir les clés non utilisées (`is_used = false`, `activated_by = NULL`). Il ne voit que les enregistrements où `activated_by` est son propre `auth.uid()`.
- **Activation** : elle passe par la RPC `activate_license_key` (SECURITY DEFINER), qui lit et met à jour `license_keys` en contournant RLS. Aucun accès direct à la table n’est nécessaire côté client pour activer une clé.
- **SUPERADMIN** : les policies INSERT/UPDATE/DELETE restent limitées au SUPERADMIN ; la lecture directe de la table par un SUPERADMIN n’est pas couverte par une policy dédiée (accès possible via service_role ou RPC SECURITY DEFINER si besoin).

---

## 5. Résumé

| Élément | Détail |
|--------|--------|
| Migration | `20260303000009_fix-rls-license-keys.sql` créée. |
| Policies supprimées | `license_keys_select`, `"Users can view license keys"` (si existante). |
| Nouvelle policy | `license_keys_select_own` : SELECT limité à `activated_by = auth.uid()`. |
| Utilisateur lambda | Ne peut plus lister les clés des autres ni les clés non utilisées. |
