# Rapport de validation — Limites de sessions (FREE=1, PRO=10)

> ⚠ **Statut : document historique (obsolète pour la version actuelle).**  
> Ce rapport valide l’ancienne configuration où FREE était limité à 1 session et PRO à 10 sessions côté Supabase.  
> Dans la version actuelle de l’app, ces limites ont été remplacées par des **sessions illimitées pour tous les badges** (`remove-session-limits-unlimited.sql`, voir `CORRECTIONS_VERSION_FREE.md`).  
> Utiliser ce fichier uniquement comme référence d’audit, pas comme procédure à rejouer sur une base déjà migrée.

**Date (configuration historique) :** 11 février 2026  
**Périmètre :** Exécution/vérification des migrations Supabase et tests des limites.

---

## ÉTAPE 1 — Exécution des migrations

Les migrations suivantes **doivent être exécutées manuellement** dans l’éditeur SQL du projet Supabase (Dashboard → SQL Editor), **dans cet ordre** :

1. **fix-rpc-get-user-permissions-security.sql**  
   - Crée/met à jour `is_admin_or_superadmin` et `get_user_permissions` (limites FREE=1, PRO=10).

2. **session-limits-rpc-and-rls.sql**  
   - Table `user_sessions` (si besoin), colonne `is_baseline`, fonctions `get_my_badge`, `insert_user_session_secure`, `upsert_user_session_secure`, RLS sans policy INSERT, GRANT EXECUTE.

3. **fix-get-user-permissions-session-limits.sql**  
   - Réapplique `get_user_permissions` avec `maxSessions` 1 (FREE) et 10 (PRO).

**Vérification :** Aucune erreur SQL ne doit apparaître. Après exécution, les fonctions `insert_user_session_secure`, `upsert_user_session_secure`, `get_user_permissions`, `get_my_badge` doivent exister (vérifiable via le script Node ou le fichier `verify-session-limits-structure.sql`).

---

## ÉTAPE 2 — Vérification structurelle (résultats actuels)

| Vérification | Résultat | Détail |
|--------------|----------|--------|
| Table `user_sessions` existe | ✅ | SELECT possible depuis le client. |
| RLS activé sur `user_sessions` | ✅ | INSERT direct refusé (policy RLS). |
| Aucune policy INSERT directe | ✅ | Erreur obtenue : « new row violates row-level security policy for table "user_sessions" » (code 42501). |
| Seules les RPC permettent l’insertion | ⚠️ | RLS bloque l’INSERT direct ; les RPC `insert_user_session_secure` et `upsert_user_session_secure` **n’existent pas encore** en base (migrations non exécutées). |
| Fonctions existantes | ❌ | `insert_user_session_secure` : « Could not find the function ... in the schema cache ». `get_user_permissions` existe mais renvoie encore l’ancienne valeur. |

---

## ÉTAPE 3 — Tests fonctionnels (résultats après exécution du script)

Script utilisé : `node scripts/verify-session-limits.js` (sans `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`).

- **Table et SELECT :** OK.  
- **get_user_permissions (sans auth) :** Retourne `maxSessions: 10` au lieu de `1` → **migrations des limites non appliquées**.  
- **insert_user_session_secure (sans auth) :** Erreur « Could not find the function ... » → **migration session-limits non appliquée**.  
- **INSERT direct dans `user_sessions` :** Refusé par RLS (comportement attendu).  
- **Tests avec compte FREE/PRO :** Non exécutés (pas de compte test fourni). Pour les lancer : définir `TEST_USER_EMAIL` et `TEST_USER_PASSWORD` dans `.env`, puis relancer le script.

---

## ÉTAPE 4 — Validation finale (état actuel)

| Critère | Statut |
|---------|--------|
| FREE ne peut jamais dépasser 1 session | ❌ Non validé | RPC `insert_user_session_secure` / `upsert_user_session_secure` absentes tant que la migration n’est pas exécutée. |
| PRO ne peut jamais dépasser 10 sessions | ❌ Non validé | Même cause. |
| Aucun contournement via requête directe | ✅ Validé | L’INSERT direct est refusé par RLS (pas de policy INSERT). |
| Aucune régression détectée | ✅ | Comportement RLS cohérent. |

---

## Anomalies détectées

1. **Migrations non exécutées sur la base cible**  
   - Les fichiers `session-limits-rpc-and-rls.sql`, `fix-get-user-permissions-session-limits.sql` et (pour les limites) `fix-rpc-get-user-permissions-security.sql` n’ont pas été appliqués dans l’éditeur SQL du projet Supabase.  
   - Conséquences : pas de RPC `insert_user_session_secure` ni `upsert_user_session_secure`, et `get_user_permissions` renvoie encore `maxSessions: 10` pour le cas par défaut/FREE.

2. **RLS déjà configuré**  
   - L’INSERT direct sur `user_sessions` est déjà refusé (pas de policy INSERT). Une fois les RPC déployées, toute insertion devra passer par elles.

---

## Actions à effectuer pour activer la sécurité

1. Ouvrir le **Dashboard Supabase** du projet → **SQL Editor**.  
2. Exécuter **en une fois** dans le SQL Editor le fichier **`docs/RUN_MIGRATIONS_SESSION_LIMITS.sql`** (il contient les 3 migrations dans le bon ordre).  
   Ou exécuter **dans l’ordre** :  
   `fix-rpc-get-user-permissions-security.sql` → `session-limits-rpc-and-rls.sql` → `fix-get-user-permissions-session-limits.sql`.  
3. Rejouer la vérification :  
   `node scripts/verify-session-limits.js`  
   - Vérifier : `get_user_permissions` (anon) → `maxSessions: 1`, et plus d’erreur sur `insert_user_session_secure`.  
4. Optionnel : définir `TEST_USER_EMAIL` et `TEST_USER_PASSWORD` dans `.env` et relancer le script pour valider les scénarios FREE (1 session OK, 2e refusée) et PRO (10 OK, 11e refusée).  
5. Optionnel : exécuter `verify-session-limits-structure.sql` dans le SQL Editor pour confirmer table, RLS, policies et présence des fonctions.

---

## Synthèse

- **Sécurité partielle en place :** l’INSERT direct sur `user_sessions` est bloqué par RLS.  
- **Sécurité complète conditionnelle :** il faut exécuter les 3 migrations dans le SQL Editor pour créer les RPC et aligner `get_user_permissions` sur FREE=1 et PRO=10.  
- **Outils livrés :**  
  - `scripts/verify-session-limits.js` pour vérifications automatiques et tests optionnels avec compte.  
  - `supabase/migrations/verify-session-limits-structure.sql` pour contrôle structurel en base.
