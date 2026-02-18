# Rapport d’audit complet — DarkOrbit Stats Tracker Pro

**Date :** 11 février 2026  
**Mode :** Audit / analyse uniquement — aucune modification de code effectuée.

---

## 1. Résumé exécutif

L’application est une app **Electron** (frontend HTML/JS dans un renderer) avec **Supabase** pour l’auth, les profils, les permissions et la synchro des données (sessions, événements, paramètres). L’architecture est cohérente : séparation backend (modules dans `src/backend/`), frontend (`src/frontend/`), stockage unifié (UnifiedStorage), façade API (BackendAPI), et sync bidirectionnelle (DataSync).  

**Points positifs :** Auth (login/register/logout, mot de passe oublié), RLS sur les tables métier, RPC sécurisées (SECURITY DEFINER avec vérification admin), fallbacks localStorage en absence de Supabase, vérification du statut `banned` au chargement de l’app.  

**Points critiques :** Clé Supabase **en dur** dans `supabase-config.js` (fallback) — exposition si le fichier est diffusé ou si l’app est ouverte hors Electron. Table `admin_logs` **non créée** dans les scripts SQL fournis : les RPC admin (ban, unban, badge, etc.) échoueront en production. Schéma de la table `profiles` (colonnes `email`, `metadata`, `is_suspect`, `last_login`, etc.) n’est pas défini dans le dépôt et dépend de la config Supabase (Auth + éventuel trigger).

---

## 2. Points critiques urgents

### 2.1 Exposition de la clé Supabase (sécurité)

- **Fichier :** `src/backend/supabase-config.js`  
- **Constat :** Si `window.SUPABASE_CONFIG` n’est pas déjà défini (preload Electron), le code utilise un **fallback** avec une URL et une **anon key réelles** en clair dans le fichier.  
- **Risque :** Toute personne ayant accès au code (build, repo, copie) ou ouvrant `auth.html` en `file://` sans passer par Electron peut récupérer la clé. L’anon key permet d’accéder à Supabase dans la limite des RLS ; si les RLS ou une RPC sont mal configurées, cela peut aller jusqu’à lecture/écriture non autorisées.  
- **Recommandation :** Supprimer tout fallback contenant des secrets. Si Supabase n’est pas configuré (pas de .env / preload), afficher un message explicite et ne pas initialiser le client avec une clé en dur. S’assurer que `.env` n’est jamais commité (déjà dans `.gitignore`).

### 2.2 Table `admin_logs` absente

- **Fichier :** `src/backend/supabase-rpc-admin.sql`  
- **Constat :** Les fonctions `admin_ban_user`, `admin_unban_user`, `admin_change_badge`, `admin_change_role`, `admin_add_note`, `admin_update_profile` font toutes un `INSERT INTO admin_logs (...)`. Aucun script du dépôt ne contient `CREATE TABLE admin_logs`.  
- **Risque :** En production, toute action admin (ban, unban, changement de badge/rôle, note, mise à jour profil) provoquera une erreur SQL et le dashboard admin sera cassé pour ces actions.  
- **Recommandation :** Créer la table `admin_logs` dans Supabase (voir section 6) et exécuter le script avant ou avec les RPC admin.

### 2.3 Schéma `profiles` non documenté dans le dépôt

- **Constat :** Les RPC et le code supposent que `profiles` contient au minimum : `id`, `username`, `email`, `badge`, `role`, `status`, `metadata`, `updated_at`, `is_suspect`, `created_at`, `last_login`. Aucun fichier SQL du projet ne crée cette table.  
- **Risque :** Si la table est créée à la main ou par un trigger Supabase Auth, un oubli de colonne (ex. `is_suspect`, `metadata`) casse `admin_update_profile`, `admin_add_note` ou le select dans `super-admin.js`.  
- **Recommandation :** Documenter ou ajouter un script SQL de référence pour `profiles` (et trigger de création à l’inscription si utilisé) et vérifier en base que toutes les colonnes utilisées existent.

---

## 3. Risques majeurs

### 3.1 Auth / session

- **Refresh de session :** Aucun appel explicite à `refreshSession()`. Le client Supabase gère le refresh automatique ; en cas de désactivation ou de problème côté Supabase, la session peut expirer sans que l’app redirige proprement vers la page de login.  
- **Double appel getSession / getUser :** `getSession()` (auth.html, index.html) et `getUser()` (api.js, sync-manager, messages-api) sont utilisés. `getSession()` peut être en cache ; pour les décisions sensibles (accès données), `getUser()` est préférable — c’est déjà le cas dans api.js et sync.  
- **auth.html sans Electron :** Ouvert en `file://` ou dans un navigateur, le preload ne s’exécute pas : soit pas de config (redirection vers index), soit fallback avec clé en dur selon l’ordre de chargement. À traiter en supprimant le fallback (cf. 2.1).

### 3.2 Permissions et RLS

- **Policy `profiles_select_all` (SELECT avec `USING (true)`):** Tout utilisateur authentifié peut lire tous les profils. C’est cohérent avec le dashboard admin qui liste les utilisateurs, mais cela expose les profils (email, badge, role, etc.) à tous les utilisateurs. Acceptable si c’est voulu ; sinon restreindre (ex. admins seulement pour les champs sensibles).  
- **RPC `get_user_permissions(p_user_id)` :** Prend un `p_user_id` optionnel. Si le front appelle avec un autre utilisateur que le courant, la RPC renvoie quand même les permissions de cet utilisateur (la RPC ne vérifie pas que `auth.uid() = p_user_id`). Vérifier que le front n’envoie que `user.id` du compte connecté (c’est le cas dans api.js).  
- **admin_messages :** Pas de policy INSERT directe pour les utilisateurs ; l’insertion passe par la RPC `admin_send_message` (SECURITY DEFINER), ce qui est correct.

### 3.3 Données et sync

- **Stratégie de merge (pull) :** `_mergeSessions` et `_mergeEvents` utilisent un “dernier écrit gagne” basé sur timestamp. En cas d’éditions concurrentes sur deux appareils, des écritures peuvent être perdues. Documenter ce comportement pour l’utilisateur.  
- **Migration unique :** `migrateIfNeeded()` ne s’exécute qu’une fois (flag `darkOrbitDataMigrated`). Si la première migration échoue partiellement, les données restantes ne seront pas re-migrées sans réinitialiser le flag (opération manuelle).  
- **queueSync après UnifiedStorage.set :** Les clés déclenchant un sync sont codées en dur (`darkOrbitSessions`, etc.). Toute nouvelle clé à synchroniser doit être ajoutée à cette liste.

### 3.4 Dépendances et exécution

- **SDK Supabase via CDN :** `auth.html` et `index.html` chargent `@supabase/supabase-js` depuis un CDN. En cas d’indisponibilité du CDN ou de changement de version, l’app peut ne plus fonctionner.  
- **Electron et .env :** `dotenv` est chargé dans `main.js` ; le preload lit `process.env.SUPABASE_*`. En build packagé, il faut s’assurer que les variables sont fournies (ex. build-time ou fichier .env à côté de l’exécutable) et que le preload est bien celui du build.

---

## 4. Dette technique

- **Doublon de chargement :** `unified-storage.js` est inclus deux fois dans `index.html` (rapport de migration déjà identifié). Comportement sécurisé par `window.UnifiedStorage ||`, mais chargement redondant.  
- **Dépendances globales :** Beaucoup de modules s’appuient sur `getSupabaseClient`, `AuthManager`, `BackendAPI`, `UnifiedStorage`, `setProfileCache`, etc. sans contrat explicite (pas de bundler avec imports). Risque de régression si l’ordre des scripts ou le nom des globaux change.  
- **Gestion d’erreurs RPC admin (super-admin.js) :** Les appels RPC (ex. `admin_ban_user`, `admin_change_badge`) ne lisent que `data?.success` ; les erreurs Supabase (`error`) ne sont pas loguées ni remontées à l’UI. En cas d’échec (ex. admin_logs manquant), l’utilisateur peut croire que l’action a réussi.  
- **Messages API — double getUser() :** Dans `markAsRead` et `deleteMessage`, `(await supabase.auth.getUser()).data.user?.id` est appelé ; en cas d’échec, `.eq('user_id', undefined)` peut être envoyé. Un garde-fou (early return si pas d’user) serait plus sûr.  
- **Limites FREE (10 sessions) :** La limite est appliquée côté client (config.js, sessions.js) et reflétée dans les permissions (get_user_permissions). Aucune contrainte RLS ou trigger côté Supabase pour bloquer l’insertion au-delà de 10 sessions pour les FREE ; un client modifié pourrait ignorer la limite. Pour une application “stricte”, il faudrait une contrainte ou une RPC côté serveur.

---

## 5. Ce qu’il reste à faire côté programmation

- **Supprimer le fallback avec clé en dur** dans `supabase-config.js` et gérer proprement l’absence de config (message + pas d’init client).  
- **Gérer les erreurs des RPC admin** dans `super-admin.js` : au minimum logger `error` et afficher un message à l’utilisateur en cas d’échec.  
- **Sécuriser les appels dans messages-api.js** : vérifier que `user` existe avant d’utiliser `user.id` dans `markAsRead` et `deleteMessage`.  
- **Optionnel :** Appel explicite à `refreshSession()` après une longue inactivité ou avant une action sensible, puis redirection vers auth si la session est invalide.  
- **Optionnel :** Un seul chargement de `unified-storage.js` dans `index.html`.  
- **Optionnel :** Côté serveur, appliquer la limite de 10 sessions pour les utilisateurs FREE (trigger ou RPC d’insertion) si la politique métier l’exige.

---

## 6. Ce qu’il reste à configurer manuellement sur Supabase

### 6.1 Tables

- **profiles**  
  - Doit exister avec au minimum : `id` (UUID, PK, lien avec `auth.users`), `username`, `email`, `badge`, `role`, `status`, `metadata` (JSONB), `is_suspect`, `created_at`, `updated_at`, `last_login` (si utilisé).  
  - Souvent créée par un trigger sur `auth.users` après signup ; sinon créer la table et le trigger d’insertion.

- **admin_logs** (absente des scripts du dépôt)  
  - Création recommandée :
  ```sql
  CREATE TABLE IF NOT EXISTS admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON admin_logs(target_user_id);
  CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);
  ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
  -- Policy : seul le service role ou une RPC SECURITY DEFINER peut écrire/lire selon besoin
  ```
  - Les RPC admin sont en SECURITY DEFINER donc l’INSERT depuis la RPC fonctionnera une fois la table créée. Adapter les policies RLS si des lectures directes sont nécessaires (ex. SUPERADMIN uniquement).

### 6.2 Policies et RLS

- **profiles :** Exécuter `supabase-fix-profiles-rls.sql` pour éviter la récursion RLS et avoir select all, update own, update admin, insert own. Vérifier que RLS est activé.  
- **user_sessions, user_events, user_settings, booster_predictions :** RLS activé et policy “user = auth.uid()” pour CRUD (déjà dans `supabase-schema-data.sql`).  
- **admin_messages :** RLS et policies déjà définis dans `supabase-schema-messages.sql` (lecture par user_id, update par user, insertion via RPC).  
- **permissions_config :** Table utilisée par `get_user_permissions` ; pas de RLS strict nécessaire si contenu non sensible (liste de droits par badge). À garder en lecture pour les utilisateurs authentifiés ou via la RPC seule.

### 6.3 Index

- Déjà présents dans les scripts : `user_sessions`, `user_events`, `user_settings`, `booster_predictions`, `admin_messages`.  
- Après création de `admin_logs`, ajouter les index ci-dessus (target_user_id, created_at) pour les requêtes des RPC `get_user_admin_logs` et `get_admin_logs`.

### 6.4 Auth

- Vérifier dans le dashboard Supabase : URL de redirection après confirmation email / reset password si utilisées.  
- `auth.html` utilise `window.location.href` pour le redirect après reset ; s’assurer que l’URL est autorisée dans “Redirect URLs” Supabase.

### 6.5 Variables d’environnement

- **Côté app (Electron) :** Fichier `.env` à la racine (ou équivalent en build) avec `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Optionnel : `SUPABASE_PROJECT_ID` si utilisé. Ne pas commiter `.env`.  
- **Supabase :** Aucune variable d’environnement supplémentaire n’a été repérée dans le code pour l’exécution des RPC ou des policies.

---

## 7. Recommandations stratégiques

1. **Sécurité :** Traiter en priorité la suppression de la clé en dur dans `supabase-config.js` et la création de la table `admin_logs`. Documenter le schéma `profiles` et le trigger d’inscription.  
2. **Stabilité :** Créer un checklist de déploiement Supabase (ordre d’exécution des SQL : schéma data, messages, permissions, fix RLS profiles, admin_logs, RPC admin). Tester le flux complet (inscription → login → sync → dashboard admin + ban/unban + messages).  
3. **Maintenabilité :** Centraliser la liste des clés synchronisées (syncKeys) et la liste des colonnes attendues pour `profiles` dans un seul fichier de config ou de doc.  
4. **Performance :** Les caches (profile 5 min, permissions 5 min) sont raisonnables. En cas de forte charge, envisager des index supplémentaires sur les requêtes les plus utilisées (ex. `user_sessions(user_id, session_timestamp)` déjà présent).  
5. **UX :** En cas d’échec de sync ou de RPC, afficher un message clair à l’utilisateur (toast ou bandeau) au lieu de silencer l’erreur (ex. `queueSync().catch(() => {})`).

---

*Rapport généré en mode audit uniquement. Aucune modification de code ou de configuration n’a été effectuée.*
