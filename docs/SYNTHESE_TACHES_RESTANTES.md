# Synthèse des tâches restantes — DarkOrbit Stats Tracker Pro

Vue d’ensemble structurée de tout ce qui reste à faire (code, Supabase, configuration et documentation).  
**Dernière mise à jour :** février 2026.

---

## État des tables Supabase (vérification réelle)

Vérification effectuée via connexion à la base (script `scripts/check-supabase-tables.js`). Résultat :

| Table | Statut | Détail |
|-------|--------|--------|
| **admin_logs** | ✅ Existe | Table présente. Colonnes non listées (table vide) ; schéma attendu : id, admin_id, target_user_id, action, details, created_at. |
| **profiles** | ✅ Existe et complète | Colonnes confirmées : id, username, email, badge, role, status, is_suspect, metadata, created_at, updated_at, last_login. Conforme au code. |
| **user_sessions** | ✅ Existe | Table présente. Colonnes non listées (table vide). Vérifier en base : contrainte UNIQUE(user_id, local_id) requise pour l’upsert (sinon erreur 400). |
| **user_events** | ✅ Existe | Table présente. Schéma attendu : id, user_id, local_id, event_data, created_at, updated_at. |
| **user_settings** | ✅ Existe | Table présente. Schéma attendu : user_id (PK), settings_json, links_json, booster_config_json, etc. |
| **booster_predictions** | ✅ Existe | Table présente. |
| **admin_messages** | ✅ Existe | Table présente. Schéma attendu : id, admin_id, user_id, subject, message, is_read, created_at, deleted_by_user. |
| **permissions_config** | ✅ Existe et complète | Colonnes confirmées : badge, features, tabs. Conforme au code. |

**Conclusion :** Les 8 tables existent. Aucune création de table n’est nécessaire. Il reste des **vérifications optionnelles** (contraintes, RLS, index) et la **documentation** des étapes déjà faites.

---

## 1️⃣ CODE — Tâches de développement restantes

### Priorité CRITIQUE

| # | Tâche | Fichier(s) | Détail | Dépendance |
|---|--------|------------|--------|-------------|
| 1 | **Sécuriser les appels Messages API** | `src/backend/messages-api.js` | Dans `markAsRead` et `deleteMessage`, vérifier que `(await supabase.auth.getUser()).data.user` existe avant d’utiliser `.id`. Sinon, `.eq('user_id', undefined)` peut être envoyé. Ajouter un early return si pas d’utilisateur. | Aucune |
| 2 | **Vérifier le flux utilisateur banni** | `src/index.html`, `src/backend/auth-manager.js` | Confirmer que la redirection vers auth.html + déconnexion quand `profile.status === 'banned'` couvre tous les cas (rafraîchissement, retour après inactivité). Optionnel : appeler `refreshSession()` ou `getUser()` avant les actions sensibles et rediriger si session invalide. | Aucune |

### Priorité IMPORTANTE

| # | Tâche | Fichier(s) | Détail | Dépendance |
|---|--------|------------|--------|-------------|
| 3 | **Supprimer le doublon de chargement unified-storage** | `src/index.html` | `unified-storage.js` est inclus deux fois (début et fin du body). Supprimer l’une des deux références pour éviter chargement redondant. | Aucune |
| 4 | **Rafraîchir l’UI après un pull** | `src/backend/sync-manager.js` | Après `pull()`, s’assurer que `renderHistory`, `updateEventsDisplay`, `updateProgressionTab`, `loadCurrentStats`, `initBaselineSetup` sont bien appelés (déjà présents dans le code ; vérifier que tous les rafraîchissements nécessaires sont couverts). | Aucune |
| 5 | **Feedback utilisateur en cas d’échec de sync** | `src/backend/sync-manager.js` | Remplacer `queueSync().catch(() => {})` par un log et/ou un toast (ex. `showToast('Synchronisation reportée.', 'warning')`) pour que l’utilisateur soit informé en cas d’échec. | Aucune |

### Améliorations (priorité secondaire)

| # | Tâche | Fichier(s) | Détail | Dépendance |
|---|--------|------------|--------|-------------|
| 6 | **Compression réelle (optionnel)** | `src/compression.js` | Un TODO indique « Ajouter vrai algorithme de compression si nécessaire ». Actuellement la « compression » est du Base64. À traiter seulement si la taille des données le justifie. | Aucune |
| 7 | **Limite 10 sessions FREE côté serveur (optionnel)** | Supabase + éventuellement `sync-manager.js` ou RPC | La limite est appliquée côté client uniquement. Pour une application stricte : trigger ou RPC d’insertion qui refuse les insertions au-delà de 10 sessions pour les utilisateurs FREE. | Table `profiles` et permissions, RPC `get_user_permissions` |
| 8 | **Documenter la stratégie de merge (pull)** | Documentation ou commentaires | Stratégie « dernier écrit gagne » dans `_mergeSessions` / `_mergeEvents`. Documenter pour l’utilisateur (risque de perte en cas d’édition concurrente sur deux appareils). | Aucune |
| 9 | **Centraliser les clés de sync** | `src/backend/unified-storage.js` | La liste `syncKeys` (ex. `darkOrbitSessions`, `darkOrbitEvents`, …) est en dur. Toute nouvelle clé à synchroniser doit être ajoutée ici ; envisager un tableau de config partagé ou documenté. | Aucune |

### Déjà traité (à ne pas refaire)

- **supabase-config.js** : fallback avec clé en dur supprimé ; config uniquement via .env / preload.
- **super-admin.js** : gestion des erreurs RPC (console.error, showToast, try/catch, fallback localStorage) déjà ajoutée.
- **Vérification statut banned** : présente dans `index.html` au chargement (redirect + logout si `profile.status === 'banned'`).

---

## 2️⃣ SUPABASE — Tâches réellement restantes

Les 8 tables existent déjà (voir section « État des tables Supabase »). Il ne reste que des **vérifications** et, le cas échéant, des **corrections ciblées**.

### 1. Contrainte UNIQUE sur `user_sessions` (si erreur 400 à l’upsert)

Si la synchronisation des sessions renvoie une erreur 400, la contrainte d’unicité sur `(user_id, local_id)` peut manquer. Vérifier dans le **Table Editor** ou exécuter :

```sql
-- À exécuter seulement si la contrainte n'existe pas déjà
ALTER TABLE user_sessions
ADD CONSTRAINT user_sessions_user_id_local_id_key UNIQUE (user_id, local_id);
```

(Si la contrainte existe déjà, ne pas la recréer.)

### 2. Vérifications optionnelles (sans impact si déjà en place)

| Élément | Où vérifier | Action si manquant |
|--------|-------------|---------------------|
| Colonne `is_baseline` | user_sessions | Exécuter `supabase-migration-baseline.sql` (ADD COLUMN IF NOT EXISTS + index). |
| RLS + policies | Chaque table | Vérifier dans Dashboard → Authentication → Policies. Si besoin, exécuter `supabase-fix-profiles-rls.sql` pour profiles, et les policies définies dans `supabase-schema-data.sql` / `supabase-schema-messages.sql`. |
| Index (performance) | user_sessions, admin_logs, etc. | Les scripts du projet les créent avec IF NOT EXISTS ; exécuter les scripts concernés si des index manquent. |

### 3. Rien à créer

- **admin_logs** : ✅ Table existante.
- **profiles** : ✅ Table existante et colonnes conformes (id, username, email, badge, role, status, is_suspect, metadata, created_at, updated_at, last_login).
- **user_sessions, user_events, user_settings, booster_predictions, admin_messages, permissions_config** : ✅ Tables existantes.

---

## 3️⃣ CONFIGURATION & DOCUMENTATION

### Variables d’environnement

| Variable | Où | Obligatoire | Détail |
|----------|-----|-------------|--------|
| SUPABASE_URL | Fichier `.env` à la racine du projet | Oui (pour Supabase) | URL du projet Supabase (ex. https://xxx.supabase.co). |
| SUPABASE_ANON_KEY | Idem | Oui (pour Supabase) | Clé anon du projet (exposée côté client, protégée par RLS). |
| SUPABASE_PROJECT_ID | Idem | Non | Utilisée si besoin (ex. build ou scripts). |

- Ne pas commiter `.env` (déjà dans `.gitignore`).
- En build packagé Electron : s’assurer que les variables sont disponibles (ex. `.env` à côté de l’exécutable ou injection au build).

---

### Configuration Electron

| Élément | Fichier | Action |
|--------|---------|--------|
| Content-Security-Policy (CSP) | `src/index.html`, `src/auth.html` | Optionnel. Voir `docs/CORRECTIFS_ERREURS_3_ET_4.md` pour une proposition de balise `<meta>` CSP à ajouter dans le `<head>` après validation manuelle. En dev, l’avertissement CSP peut être ignoré. |
| Preload / .env | `src/preload.js`, `main.js` | Déjà en place (preload expose `SUPABASE_CONFIG` depuis `process.env`). |
| Redirect URLs Auth | Dashboard Supabase → Authentication → URL Configuration | Vérifier que les URLs de redirection (ex. après reset password, confirmation email) utilisées par l’app sont autorisées. |

---

### Documentation à créer ou compléter

| Document | Contenu | Priorité |
|----------|---------|----------|
| **Schéma `profiles`** | Liste officielle des colonnes de `profiles` et du trigger de création (si utilisé). À placer dans `docs/` ou en commentaire dans un script SQL de référence. | Importante |
| **Checklist déploiement Supabase** | Ordre d’exécution des SQL (voir section 2 ci-dessus), vérifications RLS, test du flux (inscription → login → sync → admin + messages). | Importante |
| **Clés synchronisées** | Liste des clés localStorage qui déclenchent un sync (syncKeys dans `unified-storage.js`) et, si besoin, doc pour ajouter une nouvelle clé. | Secondaire |
| **Stratégie de merge (pull)** | Courte explication « dernier écrit gagne » et risque d’édition concurrente sur deux appareils. | Secondaire |
| **.env.example** | Déjà présent à la racine avec SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PROJECT_ID. Vérifier qu’il est à jour. | Faible |

---

### Fichiers de configuration existants

- **.env.example** — Présent ; à copier en `.env` et à renseigner.
- **.gitignore** — Contient `.env`, `.env.local`, `node_modules`, etc.
- **docs/CORRECTIFS_ERREURS_3_ET_4.md** — Erreur 3 (user_sessions) et Erreur 4 (CSP) ; à suivre pour les vérifications manuelles et la CSP.

---

## 4️⃣ Pourcentage de travail restant (mis à jour)

Compte tenu de l’état **réel** de la base Supabase (8 tables existantes, `profiles` et `permissions_config` conformes) :

| Domaine | Avant vérification | Après vérification | Reste à faire |
|---------|--------------------|--------------------|----------------|
| **Tables Supabase** | ~40 % (création admin_logs, profiles, etc.) | **~95 %** | Vérification contrainte UNIQUE user_sessions si 400 ; vérifications optionnelles (RLS, index). |
| **Code** | Inchangé | Inchangé | Tâches liste § 1 (messages-api, doublon unified-storage, feedback sync, etc.). |
| **Config & doc** | Inchangé | Inchangé | .env, CSP optionnelle, doc (checklist, schéma profiles). |

**Estimation globale du travail restant :**

- **Supabase :** ~5–10 % (vérifications ciblées, pas de création de tables).
- **Code :** selon priorité (critique → important → améliorations), l’essentiel est stable.
- **Config & doc :** ~10–15 % (CSP optionnelle, documentation).

**En résumé :** La base de données est en place. Le gros du travail restant est côté **code** (sécurité messages-api, nettoyage, feedback utilisateur) et **documentation / configuration** (CSP, checklist, variables d’environnement).

---

*Document généré à partir du rapport d’audit, des correctifs manuels et de la vérification réelle des tables Supabase (script `scripts/check-supabase-tables.js`). À mettre à jour au fur et à mesure des réalisations.*
