# Documentation technique — DarkOrbit Stats Tracker Pro v2.1

**Public :** Développeurs et personnes en charge du projet (techniques ou non).  
**Dernière mise à jour :** Février 2026.

---

## Sommaire

1. [Architecture globale](#1-architecture-globale)
2. [Sécurité et règles métier](#2-sécurité-et-règles-métier)
3. [Modules et fichiers clés](#3-modules-et-fichiers-clés)
4. [Flux de synchronisation](#4-flux-de-synchronisation)
5. [Scripts de vérification](#5-scripts-de-vérification)
6. [Guide pratique](#6-guide-pratique)
7. [Synthèse des points critiques](#7-synthèse-des-points-critiques)
8. [Recommandations](#8-recommandations)

---

## 1. Architecture globale

### 1.1 Vue d’ensemble

L’application est une **application de bureau** (Electron) qui permet de suivre les statistiques de jeu DarkOrbit (sessions, honneur, XP, grades). Les données peuvent être stockées **en local** (sur l’ordinateur) et **synchronisées** avec un serveur (Supabase) pour les retrouver sur plusieurs appareils ou après réinstallation.

```
┌─────────────────────────────────────────────────────────────────┐
│  UTILISATEUR                                                     │
│  (ouvre l’app, se connecte, enregistre des sessions, consulte)   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  ELECTRON (main.js)                                              │
│  • Lance la fenêtre de l’application                             │
│  • Charge d’abord la page de connexion (auth.html)                │
│  • Après connexion → charge l’application principale (index.html) │
│  • Expose les variables d’environnement (URL Supabase, clé)       │
│     au frontend via preload.js                                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌───────────────────┐     ┌───────────────────┐
│  FRONTEND     │     │  BACKEND (JS)     │     │  SUPABASE         │
│  (HTML/CSS/   │────▶│  (dans le même    │────▶│  (serveur cloud)   │
│   affichage)  │     │   processus)      │     │  Auth + BDD + RPC  │
└───────────────┘     └───────────────────┘     └───────────────────┘
```

- **Frontend** : tout ce que l’utilisateur voit (formulaires, boutons, graphiques, onglets). Fichiers dans `src/frontend/` et le HTML.
- **Backend** : logique métier (sauvegarde des sessions, calculs, synchronisation, appels au serveur). Fichiers dans `src/backend/`.
- **Supabase** : service en ligne qui gère les comptes utilisateurs (authentification), la base de données (sessions, paramètres, etc.) et des fonctions serveur (RPC) qui appliquent les règles de sécurité.

### 1.2 Flux Supabase : authentification, RPC, RLS

- **Authentification** : l’utilisateur se connecte avec email/mot de passe. Supabase Auth vérifie les identifiants et renvoie une **session** (token). Ce token est utilisé pour tous les appels suivants (lecture/écriture des données).
- **RPC (Remote Procedure Call)** : ce sont des **fonctions** exécutées côté serveur Supabase. L’application ne fait pas d’écriture directe dans certaines tables ; elle appelle une RPC qui vérifie les droits et les règles (ex. limite de sessions) puis écrit si tout est valide.
- **RLS (Row Level Security)** : règle PostgreSQL qui restreint **qui peut voir ou modifier quelles lignes**. Par exemple : un utilisateur ne peut voir que **ses propres** sessions, pas celles des autres. Sur la table des sessions, l’**insertion directe** est interdite (pas de policy INSERT) : seules les RPC peuvent insérer.

```
  [App]                    [Supabase]
    │                           │
    │  1. Login (email/mdp)     │
    │─────────────────────────▶│  Auth : vérification
    │  2. Session (token)      │
    │◀─────────────────────────│
    │                           │
    │  3. get_user_permissions  │  RPC : renvoie badge (FREE/PRO…)
    │─────────────────────────▶│        et maxSessions (1, 10 ou -1)
    │  4. { badge, maxSessions }│
    │◀─────────────────────────│
    │                           │
    │  5. upsert_user_session_secure(p_row)   │  RPC : vérifie quota,
    │─────────────────────────▶│              │  puis INSERT ou UPDATE
    │  6. { success } ou        │              │
    │     { success: false,     │              │
    │       code: SESSION_LIMIT_* }            │
    │◀─────────────────────────│
```

### 1.3 Interaction critique : Frontend ↔ RPC ↔ user_sessions

Quand l’utilisateur enregistre une nouvelle session de jeu :

1. **Frontend** : l’utilisateur clique sur « Sauvegarder ». Le code enregistre d’abord la session **en local** (stockage du navigateur / Electron).
2. **Backend (sync-manager)** : peu après, ou lors d’une synchronisation, le backend envoie les sessions locales vers Supabase en appelant la RPC **`upsert_user_session_secure`** (ou **`insert_user_session_secure`** selon le cas).
3. **Supabase** : la RPC lit le **badge** de l’utilisateur (FREE, PRO, etc.), compte le nombre de sessions déjà présentes pour cet utilisateur, et applique la règle :
   - **FREE** : au plus 1 session → si déjà 1, retourne une erreur.
   - **PRO** : au plus 10 sessions → si déjà 10, retourne une erreur.
   - **ADMIN/SUPERADMIN** : pas de limite.
4. **Frontend** : si la RPC renvoie une erreur (ex. `SESSION_LIMIT_FREE`), l’application affiche un message à l’utilisateur (toast) pour l’informer que la limite est atteinte.

Aucune écriture directe dans la table `user_sessions` n’est possible depuis l’app : les policies RLS n’autorisent pas l’INSERT. Seules les RPC (exécutées avec des privilèges spéciaux côté serveur) peuvent insérer, après avoir vérifié les quotas.

---

## 2. Sécurité et règles métier

### 2.1 Limites de sessions FREE / PRO

| Type de compte   | Nombre max de sessions | Règle appliquée côté serveur |
|------------------|------------------------|------------------------------|
| **FREE**         | 1                      | Dès qu’il existe 1 session, toute nouvelle insertion est refusée. |
| **PRO**          | 10                     | Dès qu’il existe 10 sessions, toute nouvelle insertion est refusée. |
| **ADMIN**        | Illimité               | Aucune limite. |
| **SUPERADMIN**   | Illimité               | Aucune limite. |

- La limite est **imposée côté serveur** (dans les RPC). Le frontend affiche aussi la limite (pour désactiver le bouton ou afficher un message) en se basant sur les permissions renvoyées par **`get_user_permissions`**, mais la **vraie barrière** est la RPC.
- **Mise à jour** d’une session existante (même utilisateur, même identifiant de session) **ne compte pas** dans le quota : elle est autorisée.

### 2.2 RPC sécurisées

- **`insert_user_session_secure(p_row)`**  
  Insère une nouvelle session **après** avoir vérifié le badge et le nombre de sessions. Retourne `{ success: true }` ou `{ success: false, error: '...', code: 'SESSION_LIMIT_FREE' | 'SESSION_LIMIT_PRO' | 'AUTH_REQUIRED' }`.

- **`upsert_user_session_secure(p_row)`**  
  Si une session avec le même `(user_id, local_id)` existe déjà → **UPDATE** (autorisé, pas de vérification de quota). Sinon → même logique que l’insert (vérification du quota puis INSERT).

- **`get_user_permissions(p_user_id)`**  
  Retourne les droits de l’utilisateur (badge, onglets autorisés, **maxSessions**, etc.). Un utilisateur normal ne peut demander que **ses propres** permissions ; un admin peut interroger un autre utilisateur. Les valeurs **maxSessions** sont alignées avec le serveur : FREE = 1, PRO = 10, ADMIN/SUPERADMIN = -1 (illimité).

### 2.3 RLS et refus d’INSERT direct

Sur la table **`user_sessions`** :

- **RLS activé** : toutes les lectures/écritures passent par les règles.
- **Policies** :
  - **SELECT** : l’utilisateur ne voit que les lignes où `user_id` = son identifiant.
  - **UPDATE** : idem (seulement ses lignes).
  - **DELETE** : idem (seulement ses lignes).
  - **INSERT** : **aucune policy** → toute tentative d’INSERT directe depuis l’app est **refusée** (erreur type « row-level security policy »).

Donc : **seules les RPC** (exécutées avec privilèges serveur) peuvent insérer des lignes dans `user_sessions`. Cela garantit que la limite FREE/PRO ne peut pas être contournée par une requête directe.

### 2.4 Gestion des erreurs et messages

- En cas de **quota dépassé**, la RPC renvoie un code explicite (`SESSION_LIMIT_FREE` ou `SESSION_LIMIT_PRO`) et un message. Le **sync-manager** affiche un **toast** à l’utilisateur (ex. « Limite atteinte : les utilisateurs FREE ne peuvent avoir qu’1 session… »).
- En cas d’**échec de synchronisation** (réseau, erreur serveur), un message du type « Synchronisation reportée. Réessai automatique… » est affiché ; les données restent en local et peuvent être resynchronisées plus tard.
- Les **erreurs RPC** côté admin (super-admin) sont loguées et remontées à l’interface (toast) pour que l’administrateur sache si une action a échoué.

---

## 3. Modules et fichiers clés

### 3.1 Racine du projet

| Fichier / Dossier | Rôle |
|-------------------|------|
| **main.js** | Point d’entrée Electron : crée la fenêtre, charge `auth.html`, expose l’environnement via le preload. |
| **preload.js** | Expose au frontend les variables Supabase (URL et clé anonyme) depuis `process.env`. Ne jamais y mettre de clé en dur. |
| **.env** | Contient `SUPABASE_URL`, `SUPABASE_ANON_KEY` (et optionnellement les identifiants de test). Ne pas commiter ce fichier. |
| **package.json** | Dépendances (Electron, Supabase JS, dotenv) et scripts (start, build). |

### 3.2 Configuration et clés centralisées

| Fichier | Rôle |
|---------|------|
| **src/config/keys.js** | **Source unique** des noms de clés de stockage et de la liste des clés synchronisées. Expose `window.APP_KEYS` (STORAGE_KEYS, SYNC_KEYS). À modifier en priorité si on ajoute une nouvelle donnée à synchroniser. |
| **src/backend/config.js** | Constantes générales (limites d’interface, listes de serveurs, etc.). Utilise `APP_KEYS` pour `CONFIG.STORAGE_KEYS` et `CONFIG.SYNC_KEYS`. |
| **src/backend/supabase-config.js** | Lit la config Supabase (depuis `window.SUPABASE_CONFIG` fourni par le preload). Pas de clé en dur ; si pas de config, l’app peut tourner en mode local uniquement. |

### 3.3 Authentification et API

| Fichier | Rôle |
|---------|------|
| **src/backend/supabase-client.js** | Crée et renvoie le client Supabase (pour auth et appels BDD/RPC). |
| **src/backend/auth-manager.js** | Connexion, déconnexion, inscription, récupération de session. |
| **src/backend/api.js** | Façade « BackendAPI » : chargement du profil, appel à `get_user_permissions`, cache des permissions, `getSessionLimit()` (utilisé par l’UI pour afficher la limite). |

### 3.4 Données et synchronisation

| Fichier | Rôle |
|---------|------|
| **src/backend/unified-storage.js** | Stockage unifié (localStorage + cache). Lors d’un `set` sur une clé listée dans **SYNC_KEYS**, déclenche un sync (DataSync.queueSync). |
| **src/backend/sync-manager.js** | Migration locale → Supabase, push (envoi des sessions/events/settings via RPC ou tables), pull (récupération et fusion). Appelle **upsert_user_session_secure** / **insert_user_session_secure** et gère les erreurs de quota (toast). |
| **src/backend/sessions.js** | Création/suppression/lecture des sessions **en local**. Vérifie `BackendAPI.getSessionLimit()` avant d’ajouter une session (UX). |

### 3.5 Migrations Supabase (ordre logique)

| Fichier | Rôle |
|---------|------|
| **create-profiles-table.sql** | Table des profils utilisateurs (badge, rôle, statut, etc.). |
| **create-profiles-trigger.sql** | Création automatique d’un profil à l’inscription. |
| **fix-profiles-rls-sensitive-fields.sql** | RLS sur `profiles` et vue `profiles_public` (champs non sensibles). |
| **fix-rpc-get-user-permissions-security.sql** | Sécurisation de `get_user_permissions` (accès à ses propres permissions ou admin) et limites FREE=1, PRO=10. |
| **session-limits-rpc-and-rls.sql** | Table `user_sessions` si besoin, RPC **insert_user_session_secure** et **upsert_user_session_secure**, RLS sans policy INSERT. |
| **fix-get-user-permissions-session-limits.sql** | Aligne définitivement `get_user_permissions` sur maxSessions 1 (FREE) et 10 (PRO). |
| **create-admin-logs-table.sql** | Table des logs d’actions admin. |
| **create-rpc-get-ranking.sql** / **create-ranking-rpc.sql** | RPC du classement (à n’avoir qu’une seule version appliquée). |
| **add-classement-to-permissions.sql** | Ajout du classement dans les permissions par badge. |
| **verify-session-limits-structure.sql** | Requêtes de **vérification** (table, RLS, policies, fonctions) — à exécuter après les migrations pour valider la structure. |

### 3.6 Dépendances importantes

- **Ordre de chargement des scripts** (index.html, auth.html) :  
  Supabase SDK → supabase-config → supabase-client → **config/keys.js** → unified-storage → auth-manager → sync-manager → … → **config.js** → reste des modules.  
  Les clés (`APP_KEYS`) doivent être disponibles avant le stockage et le sync.
- **Centralisation des clés** : tout module qui lit/écrit des données synchronisées ou du stockage local doit utiliser **`APP_KEYS.STORAGE_KEYS`** ou **`CONFIG.STORAGE_KEYS`** (et **CONFIG.SYNC_KEYS** si besoin), pas de chaînes en dur (sauf fallback de secours documenté).

---

## 4. Flux de synchronisation

### 4.1 Résumé

- Les données sont d’abord écrites **en local** (UnifiedStorage / localStorage).
- Les clés listées dans **SYNC_KEYS** (sessions, events, settings, links, boosters, current stats, booster learning) déclenchent, lors d’un `set`, un **queueSync** (synchronisation en arrière-plan).
- Le **sync-manager** :
  1. **Push** : envoie les données locales vers Supabase (sessions via RPC, events/settings via tables avec RLS).
  2. **Pull** : récupère les données côté serveur et les **fusionne** avec le local (stratégie « dernier écrit gagne » basée sur les timestamps).
- Synchronisation **périodique** : toutes les X minutes, le sync-manager refait un cycle (pull puis push) et vérifie que l’utilisateur n’a pas été banni.

### 4.2 Erreurs possibles et gestion

| Situation | Comportement |
|-----------|--------------|
| Quota FREE/PRO dépassé | RPC renvoie `success: false` et `code` SESSION_LIMIT_FREE ou SESSION_LIMIT_PRO → toast utilisateur, sync s’arrête pour cette opération. |
| Utilisateur non connecté | Les RPC renvoient une erreur type AUTH_REQUIRED ; le sync ne pousse pas les données tant qu’il n’y a pas de session. |
| Réseau ou serveur indisponible | Erreur capturée, message « Synchronisation reportée… », réessai au prochain cycle ou au prochain déclenchement. |
| Données locales corrompues | Les erreurs de lecture/écriture sont loguées ; l’app peut continuer avec des valeurs par défaut ou vides selon les cas. |

> **Référence détaillée :** Voir [STRATEGIE_SYNC_ET_LIMITES.md](STRATEGIE_SYNC_ET_LIMITES.md) pour la stratégie de merge (pull), les déclencheurs et les limites FREE/PRO côté serveur.

---

## 5. Scripts de vérification

### 5.1 verify-session-limits.js

- **Emplacement** : `scripts/verify-session-limits.js`
- **Usage** : à la racine du projet, avec un fichier `.env` contenant au minimum `SUPABASE_URL` et `SUPABASE_ANON_KEY` :
  ```bash
  node scripts/verify-session-limits.js
  ```
- **Ce qu’il fait** :
  - Vérifie que la table **user_sessions** existe et est accessible (SELECT).
  - Appelle **get_user_permissions** sans authentification : doit renvoyer une réponse par défaut avec **maxSessions: 1** (pour considérer que les limites sont bien configurées).
  - Vérifie que **insert_user_session_secure** existe (sans l’appeler avec un vrai utilisateur, ou en vérifiant qu’elle refuse proprement si pas connecté).
  - Tente un **INSERT direct** sur `user_sessions` : doit être **refusé** par RLS (message d’erreur attendu).
  - **Optionnel** : si `.env` contient **TEST_USER_EMAIL** et **TEST_USER_PASSWORD**, le script se connecte avec ce compte, insère une session (doit réussir pour FREE si 0 session), tente d’en insérer une deuxième (doit échouer pour FREE avec un code explicite).
- **Interprétation** : en sortie, des lignes ✅ indiquent des vérifications réussies, ❌ des échecs. Si les migrations des limites ne sont pas appliquées, on verra des ❌ sur `get_user_permissions` (maxSessions ≠ 1) et/ou sur `insert_user_session_secure` (fonction introuvable).

### 5.2 Valider FREE/PRO et RLS

- **FREE** : avec un compte dont le badge est FREE, après avoir 1 session synchronisée, toute nouvelle session doit être refusée par la RPC avec un message/clé d’erreur explicite (SESSION_LIMIT_FREE). Aucun INSERT direct ne doit être possible.
- **PRO** : avec un compte PRO, après 10 sessions, la 11e doit être refusée (SESSION_LIMIT_PRO).
- **RLS** : le script tente un INSERT direct ; le refus avec une erreur du type « row-level security policy » confirme qu’il n’y a pas de policy INSERT sur `user_sessions`.

Le fichier **supabase/migrations/verify-session-limits-structure.sql** peut être exécuté dans le SQL Editor Supabase pour vérifier la présence de la table, l’activation du RLS, la liste des policies (aucune INSERT) et l’existence des fonctions RPC.

---

## 6. Guide pratique

### 6.1 Exécuter les migrations et valider la sécurité

1. Ouvrir le **Dashboard Supabase** du projet → **SQL Editor**.
2. Exécuter **en une fois** le fichier **`docs/RUN_MIGRATIONS_SESSION_LIMITS.sql`** (il regroupe les 3 migrations nécessaires aux limites de sessions dans le bon ordre).  
   **Ou** exécuter dans l’ordre :
   - `fix-rpc-get-user-permissions-security.sql`
   - `session-limits-rpc-and-rls.sql`
   - `fix-get-user-permissions-session-limits.sql`
3. Vérifier qu’**aucune erreur** SQL ne s’affiche.
4. Lancer **`node scripts/verify-session-limits.js`** : les vérifications structurelles doivent être vertes (table, RPC trouvées, maxSessions: 1 en défaut, INSERT direct refusé).

### 6.2 Tester les scénarios FREE et PRO

- **FREE** : se connecter avec un compte FREE, enregistrer **1** session → doit réussir. En enregistrer une **2e** (ou la pousser via sync) → doit échouer avec un message du type « Limite atteinte : les utilisateurs FREE ne peuvent avoir qu’1 session… ».
- **PRO** : se connecter avec un compte PRO, enregistrer jusqu’à **10** sessions → doivent réussir. La **11e** doit être refusée avec un message du type « Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions… ».
- **Optionnel** : mettre **TEST_USER_EMAIL** et **TEST_USER_PASSWORD** dans `.env` (compte FREE ou PRO) et relancer `node scripts/verify-session-limits.js` pour automatiser une partie de ces tests.

### 6.3 Points à vérifier après une modification

- **Changement de logique de sessions ou de permissions** : relancer `verify-session-limits.js` et, si possible, un test manuel FREE (1 OK, 2e refusée) et PRO (10 OK, 11e refusée).
- **Nouvelle clé de stockage à synchroniser** : l’ajouter dans **`src/config/keys.js`** dans **SYNC_KEYS** et s’assurer que le **sync-manager** (push/pull) gère cette clé ; vérifier qu’aucun autre fichier n’utilise une chaîne en dur pour cette clé.
- **Nouvelle migration Supabase** : exécuter dans l’ordre indiqué, puis vérifier (structure ou script) que les tables/policies/fonctions attendues sont bien présentes.
- **Modification des RPC** (insert/upsert session, get_user_permissions) : vérifier que les limites (FREE=1, PRO=10) et les codes d’erreur restent cohérents avec le frontend (sync-manager, api.js).

---

## 7. Synthèse des points critiques

- **Limites de sessions** : FREE = 1, PRO = 10, imposées **uniquement** par les RPC côté Supabase. Ne jamais réintroduire d’INSERT direct sur `user_sessions` (RLS doit rester sans policy INSERT).
- **Fichiers à surveiller en priorité** :
  - **src/config/keys.js** : toute nouvelle clé de sync ou de stockage.
  - **src/backend/sync-manager.js** : appels RPC et gestion des erreurs de quota.
  - **src/backend/api.js** : cohérence des fallbacks de permissions (maxSessions 1/10/-1).
  - **supabase/migrations/session-limits-rpc-and-rls.sql** (et les 2 autres migrations de limites) : logique des RPC et RLS.
- **Sécurité** : pas de clé Supabase en dur ; config via preload + `.env`. Les RPC sensibles (sessions, permissions) sont en SECURITY DEFINER et vérifient le badge et le quota.

---

## 8. Recommandations

- **Avant chaque déploiement** : exécuter les migrations manquantes sur la base cible et relancer `verify-session-limits.js` pour confirmer que les limites et le RLS sont actifs.
- **Documentation** : tenir à jour cette documentation et les rapports dans `docs/` (sécurisation des limites, centralisation des clés, validation) lors de changements d’architecture ou de règles métier.
- **Tests** : pour les comptes FREE/PRO, garder une checklist simple (1 session OK / 2e refusée pour FREE ; 10 OK / 11e refusée pour PRO) et, si possible, automatiser via `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` et le script de vérification.
- **Évolutions** : toute nouvelle donnée synchronisée doit passer par **keys.js** (SYNC_KEYS et STORAGE_KEYS) et par le sync-manager ; toute nouvelle règle de quota ou de permission doit être implémentée côté serveur (RPC/RLS) en priorité, le frontend restant aligné pour l’affichage et le confort utilisateur.
