# Sécurité — Étape 2 : Sécurisation de la table permissions_config

**Date :** février 2026  
**Objectif :** Bloquer tout accès direct à `permissions_config`. L'accès se fait uniquement via les RPC sécurisées.

---

## Contexte

La table `permissions_config` définit les droits (features, tabs, limits) par badge.  
Un accès direct permettrait d’énumérer toutes les configurations sans contrôle.

---

## Fichier créé

| Fichier | Description |
|---------|-------------|
| `supabase/migrations/security-step2-permissions-config-rls.sql` | Migration : RLS + révocation des accès directs |

---

## Procédure d'exécution

1. Ouvrir le **Dashboard Supabase** → **SQL Editor**
2. Copier-coller le contenu de `supabase/migrations/security-step2-permissions-config-rls.sql`
3. Exécuter le script
4. Vérifier qu’aucune erreur n’apparaît  
   (avertissement possible si des privilèges n’étaient pas accordés — sans impact)

---

## Vérification post-migration

### 1. Accès direct refusé

En tant qu’utilisateur authentifié (client ou SQL Editor avec un rôle limité) :

```sql
SELECT * FROM permissions_config;
```

Comportement attendu : aucune ligne retournée (ou message d’erreur de permission).

### 2. RPC toujours fonctionnelle

L’appel à `get_user_permissions` doit continuer à fonctionner :

```sql
SELECT get_user_permissions(auth.uid());
```

Comportement attendu : JSON avec badge, features, tabs, limits.

La RPC est en `SECURITY DEFINER` et s’exécute avec les droits du propriétaire, donc elle contourne le RLS et garde accès à `permissions_config`.

### 3. Application

- Connexion : OK
- Chargement des permissions (onglets, fonctionnalités) : OK
- Badge et limites affichés correctement : OK

---

## Impact sur les migrations

Les scripts qui font des `UPDATE` sur `permissions_config` (ex. `add-classement-to-permissions.sql`, `create-ranking-rpc.sql`) sont exécutés en tant que postgres dans le SQL Editor et contournent RLS. Ils continueront à fonctionner.

---

## Récapitulatif

| Accès | Avant | Après |
|-------|-------|-------|
| Client : `SELECT * FROM permissions_config` | Variable (selon GRANTs) | Refusé |
| RPC `get_user_permissions` | OK | OK |
| Migrations SQL (postgres) | OK | OK |

---

## Validation

- [ ] Script exécuté sans erreur bloquante
- [ ] Accès direct refusé (test manuel ou vérification)
- [ ] RPC `get_user_permissions` fonctionne
- [ ] Application charge correctement les permissions

---

**Passer à l’étape 3 uniquement après validation humaine.**
