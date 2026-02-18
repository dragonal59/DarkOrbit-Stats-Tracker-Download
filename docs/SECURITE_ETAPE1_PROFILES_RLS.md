# Sécurité — Étape 1 : Policies strictes sur la table profiles

**Date :** février 2026  
**Objectif :** Corriger les policies permissives et limiter la lecture aux utilisateurs eux-mêmes et aux administrateurs.

---

## Contexte

La table `profiles` contient des données sensibles : email, metadata, is_suspect, status, role, etc.  
Une policy `USING (true)` permet à tout utilisateur authentifié de lire tous les profils.

---

## Fichiers modifiés / créés

| Fichier | Action |
|---------|--------|
| `supabase/migrations/security-step1-profiles-rls-strict.sql` | **Nouveau** — Migration corrective standalone |
| `src/backend/supabase-fix-profiles-rls.sql` | **Modifié** — `profiles_select_all` remplacé par `profiles_select_own` + `profiles_select_admin` |
| `supabase/migrations/fix-profiles-rls-sensitive-fields.sql` | **Modifié** — Script rendu idempotent (DROP IF EXISTS avant CREATE) |

---

## Procédure d'exécution

### Option A : Projet existant (base déjà configurée)

1. Ouvrir le **Dashboard Supabase** → **SQL Editor**
2. Copier-coller le contenu de `supabase/migrations/security-step1-profiles-rls-strict.sql`
3. Exécuter le script
4. Vérifier qu'aucune erreur n'apparaît

### Option B : Nouvelle installation

Les scripts `supabase-fix-profiles-rls.sql` et `fix-profiles-rls-sensitive-fields.sql` créent désormais directement des policies strictes. Exécuter dans l’ordre habituel (voir docs de déploiement).

---

## Vérification post-migration

### 1. Vérifier l’absence de policy permissive

```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles'
  AND schemaname = 'public';
```

- **À confirmer :** Aucune policy ne doit avoir `qual = 'true'` ou une expression équivalente.
- **Policies attendues :** `profiles_select_own`, `profiles_select_admin`, `profiles_update_own`, `profiles_update_admin`, `profiles_insert_own`.

### 2. Vérifier la vue `profiles_public`

```sql
SELECT * FROM profiles_public LIMIT 1;
```

La vue doit exister et retourner uniquement : id, username, game_pseudo, server, company, badge, created_at.

### 3. Test fonctionnel

- **Utilisateur normal :** Lecture uniquement de son propre profil via `profiles`.
- **Admin :** Lecture de tous les profils via le dashboard.
- **Classement :** Utilise `profiles_public` (pas de modification attendue si déjà en place).

---

## Récapitulatif des policies après migration

| Policy | Opération | Condition |
|--------|-----------|-----------|
| `profiles_select_own` | SELECT | `auth.uid() = id` |
| `profiles_select_admin` | SELECT | `get_my_profile_role/badge IN ('ADMIN','SUPERADMIN')` |
| `profiles_update_own` | UPDATE | `auth.uid() = id` |
| `profiles_update_admin` | UPDATE | Admin/SuperAdmin |
| `profiles_insert_own` | INSERT | `auth.uid() = id` |

**Aucune policy avec `USING (true)`.**

---

## Validation

- [ ] Script exécuté sans erreur
- [ ] Vérification SQL effectuée (aucune policy permissive)
- [ ] Test connexion utilisateur OK
- [ ] Test dashboard admin OK (si applicable)
- [ ] Classement fonctionne (utilise `profiles_public`)

---

**Passer à l’étape 2 uniquement après validation humaine.**
