# Rapport d'Inspection Technique — DarkOrbit Tracker v2.5

> Document destiné à toute personne découvrant le projet pour la première fois.  
> Rédigé en février 2026 — couvre l'intégralité de l'architecture, des fonctionnalités et des flux de données.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Architecture générale](#3-architecture-générale)
4. [Authentification et comptes](#4-authentification-et-comptes)
5. [Système de hiérarchie — les Badges](#5-système-de-hiérarchie--les-badges)
6. [Scraping du classement (Extension Chrome)](#6-scraping-du-classement-extension-chrome)
7. [Scraping des profils joueurs (Client DarkOrbit)](#7-scraping-des-profils-joueurs-client-darkorbit)
8. [Synchronisation des données](#8-synchronisation-des-données)
9. [Fonctionnalités utilisateur](#9-fonctionnalités-utilisateur)
10. [Base de données Supabase](#10-base-de-données-supabase)
11. [Sécurité et contrôle d'accès](#11-sécurité-et-contrôle-daccès)
12. [Internationalisation](#12-internationalisation)
13. [Flux de données — schéma global](#13-flux-de-données--schéma-global)

---

## 1. Vue d'ensemble

**DarkOrbit Tracker** est une application de bureau (Electron) conçue pour les joueurs du jeu en ligne **DarkOrbit** (Bigpoint). Elle permet de :

- Suivre sa **progression personnelle** (honneur, XP, points de grade) au fil des sessions de jeu
- Consulter le **classement général** de son serveur en temps réel (via scraping automatisé)
- Comparer ses statistiques avec d'autres joueurs
- Gérer ses **comptes DarkOrbit** (multi-comptes, multi-serveurs)
- Administrer une communauté de joueurs via un **dashboard superadmin**

L'application fonctionne sans serveur dédié : elle s'appuie sur **Supabase** (Backend-as-a-Service) pour la base de données, l'authentification et les fonctions serveur (RPC). Une **extension Chrome** embarquée dans l'application se charge de scraper le jeu directement depuis le navigateur.

---

## 2. Stack technique

| Couche | Technologie | Rôle |
|---|---|---|
| Interface bureau | **Electron** (Node.js + Chromium) | Fenêtre native, menus, IPC |
| Frontend | **HTML/CSS/JS vanille** | UI, onglets, graphiques |
| Backend app | **Node.js** (modules JS) | Logique métier, sessions, stats |
| Base de données | **Supabase** (PostgreSQL + Auth) | Stockage cloud, auth, RPC |
| Scraping classement | **Extension Chrome** (MV3) | Parcours automatique DarkOrbit |
| Scraping profils | **CDP** (Chrome DevTools Protocol) | Interception réseau client DarkOrbit |
| Graphiques | **Chart.js** | Courbes de progression |
| Animations | **canvas-confetti** | Célébrations de progression |
| Stockage local | `localStorage` | Cache offline, préférences |

**Dépendances Node.js clés :**
- `electron` — conteneur desktop
- `@supabase/supabase-js` — client Supabase
- `chrome-remote-interface` — protocole CDP pour le client DarkOrbit
- `express` — mini serveur HTTP local pour la communication extension ↔ app

---

## 3. Architecture générale

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESSUS PRINCIPAL (main.js)                │
│  - Création de la fenêtre Electron                              │
│  - Menus natifs (Fichier, Thème, DarkOrbit, Admin)             │
│  - IPC handlers (écoute les messages du renderer)              │
│  - saveClientScrapedData() — sauvegarde des profils scrapés    │
│  - ClientLauncher.init() — pilotage du client DarkOrbit        │
└────────────────────┬───────────────────────────────────────────┘
                     │ IPC (ipcMain / ipcRenderer)
┌────────────────────▼───────────────────────────────────────────┐
│                  PROCESSUS RENDERER (src/)                      │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  Frontend   │  │   Backend    │  │     Supabase       │    │
│  │  (UI/UX)   │◄─►│  (Logique)  │◄─►│   (BDD + Auth)    │    │
│  └─────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                     │ HTTP localhost:3000
┌────────────────────▼───────────────────────────────────────────┐
│              SCRAPER-SERVER (electron/scraper-server.js)        │
│  - Serveur Express local                                        │
│  - Reçoit les données de l'extension Chrome                    │
│  - Commande la navigation du navigateur                        │
└────────────────────┬───────────────────────────────────────────┘
                     │ HTTP
┌────────────────────▼───────────────────────────────────────────┐
│            EXTENSION CHROME (src/extensions/scraper/)          │
│  - background.js : orchestration du cycle de scraping          │
│  - scraper.js : extraction DOM du classement DarkOrbit         │
│  - grade-mappings.js : traduction des grades multilingues      │
└─────────────────────────────────────────────────────────────────┘
                     │ CDP (port 9222)
┌────────────────────▼───────────────────────────────────────────┐
│          CLIENT-LAUNCHER (electron/client-launcher.js)         │
│  - Lance DarkOrbit.exe avec --remote-debugging-port=9222       │
│  - Se connecte via Chrome DevTools Protocol                    │
│  - Injecte du JS dans les popups de profil joueur             │
│  - Extrait firme, grade, pseudo, userId                        │
└─────────────────────────────────────────────────────────────────┘
```

### Fichiers principaux

| Fichier | Rôle |
|---|---|
| `main.js` | Point d'entrée Electron, fenêtre, IPC, sauvegarde scraping |
| `src/index.html` | Coquille HTML de l'interface (tous les onglets) |
| `src/preload.js` | Pont IPC sécurisé entre main et renderer |
| `src/backend/api.js` | Point d'entrée de la logique backend (initialisation) |
| `src/backend/sessions.js` | CRUD des sessions de jeu |
| `src/backend/stats.js` | Calculs de statistiques |
| `src/backend/ranking.js` | Classement local |
| `src/backend/auth-manager.js` | Authentification, gestion du token |
| `src/backend/sync-manager.js` | Synchronisation local ↔ Supabase |
| `src/backend/guards.js` | Contrôle d'accès aux fonctionnalités |
| `electron/scraper-manager.js` | Gestion du cycle de scraping (démarrage, arrêt) |
| `electron/scraper-server.js` | Serveur HTTP local pour l'extension |
| `electron/client-launcher.js` | Pilotage CDP du client DarkOrbit |
| `electron/darkorbit-accounts.js` | Gestion des comptes DarkOrbit (cookies, sessions) |

---

## 4. Authentification et comptes

### Connexion utilisateur (compte Tracker)

L'application possède son **propre système d'authentification** géré par Supabase Auth.

**Flux de connexion :**
1. L'utilisateur entre email + mot de passe dans l'onglet Auth
2. `auth-manager.js` appelle `supabase.auth.signInWithPassword()`
3. Supabase retourne un **JWT access token** + un **refresh token**
4. Le token est stocké dans `localStorage` et dans `global.supabaseAccessToken` (processus principal)
5. L'ID utilisateur est stocké dans `global.currentUserId`
6. `getPermissions()` est appelé → récupère le badge et les features autorisées
7. `applyPermissionsUI()` adapte l'interface selon le badge

**Flux de déconnexion :**
- `supabase.auth.signOut()` + nettoyage du `localStorage`
- `global.currentUserId` et `global.supabaseAccessToken` remis à null

### Comptes DarkOrbit (comptes de jeu)

Séparés des comptes Tracker, ils sont gérés dans `electron/darkorbit-accounts.js`.  
Un utilisateur peut enregistrer plusieurs comptes DarkOrbit (pseudo, mot de passe, cookies de session par serveur). Ces comptes sont utilisés par le scraper pour se connecter automatiquement sur chaque serveur lors du cycle de scraping.

**Stockage :** chiffré localement + synchronisé sur Supabase si connecté.

---

## 5. Système de hiérarchie — les Badges

### Les 4 niveaux

| Badge | Niveau | Description |
|---|---|---|
| `FREE` | 1 | Compte gratuit, fonctionnalités limitées |
| `PRO` | 2 | Compte premium, toutes les fonctionnalités de base |
| `ADMIN` | 3 | Modérateur, accès au dashboard admin |
| `SUPERADMIN` | 4 | Propriétaire, accès total + scraping client |

Le badge est stocké dans la colonne `badge` de la table Supabase `profiles`.  
Il est récupéré à la connexion via la RPC `get_user_permissions()` et mis en cache localement.

### Fonctionnalités par badge

| Fonctionnalité | FREE | PRO | ADMIN | SUPERADMIN |
|---|---|---|---|---|
| Suivi de sessions | 1 max | 10 max | Illimité | Illimité |
| Onglet Événements | ✗ | ✓ | ✓ | ✓ |
| Onglet Dashboard/Classement | ✗ | ✓ | ✓ | ✓ |
| Sidebar booster | ✗ (promo) | ✓ | ✓ | ✓ |
| Export de données | ✗ | ✓ (CSV) | ✓ | ✓ |
| Notifications push | ✗ | ✓ | ✓ | ✓ |
| Messagerie admin | ✓ (lecture) | ✓ (lecture) | ✓ (envoi) | ✓ (envoi) |
| Dashboard superadmin | ✗ | ✗ | ✗ | ✓ |
| Scraping classement | ✗ | ✗ | ✗ | ✓ |
| Scraping profil client | ✗ | ✗ | ✗ | ✓ |

### Contrôle d'accès (`guards.js`)

Le module `guards.js` expose des fonctions utilisées partout dans l'application :

- `getCurrentBadge()` → retourne le badge actuel (`'FREE'`, `'PRO'`, etc.)
- `currentHasFeature(featureKey)` → vérifie si une feature est activée pour ce badge
- `currentCanAccessTab(tabId)` → vérifie l'accès à un onglet spécifique
- `canAccessRoute(routeId)` → contrôle d'accès général aux routes

`permissions-ui.js` appelle `applyPermissionsUI()` après chaque connexion/changement de badge pour masquer ou afficher les éléments UI en conséquence.

### Dashboard SuperAdmin (`super-admin.js`)

Interface de gestion accessible uniquement au badge `SUPERADMIN` :
- Liste de tous les utilisateurs avec leur badge, statut, date de création
- Possibilité de changer le badge d'un utilisateur (upgrade/downgrade)
- Gestion des statuts : `active`, `pending`, `banned`, `rejected`, `suspended`
- Vérification des comptes (`verified_by`, `verified_at`)
- Envoi de messages à des utilisateurs
- Consultation des logs d'administration (`admin_logs`)
- Rapport des bugs signalés

---

## 6. Scraping du classement (Extension Chrome)

### Principe général

Le scraping du classement utilise une **extension Chrome** embarquée dans l'application Electron. Cette extension navigue automatiquement sur les pages de classement DarkOrbit (Hall of Fame) et en extrait les données.

### Composants

#### `electron/scraper-server.js` — Serveur HTTP local

Un serveur Express écoute sur `localhost:3000`. Il sert d'intermédiaire entre l'extension Chrome et l'application principale :

- Expose des endpoints HTTP que l'extension appelle pour rapporter des données
- Permet à l'application de commander la navigation (`/navigate`, `/execute-script`)
- Reçoit les données scrapées (`/submit-ranking`, `/submit-events`)
- Gère les tokens d'authentification de l'extension

#### `electron/scraper-manager.js` — Orchestrateur

Gère le cycle de vie du scraping :
- `startScraping()` : démarre le serveur + lance le cycle
- `stopScraping()` : arrête proprement
- Planification automatique (intervalle configurable)
- Gestion des erreurs et retry

#### `src/extensions/scraper/background.js` — Cerveau de l'extension

Service worker Chrome (Manifest V3) qui orchestre le cycle complet :

**Cycle de scraping (par compte DarkOrbit) :**
```
Pour chaque compte DarkOrbit enregistré :
  Pour chaque serveur configuré (ex: gbl5, gbl12...) :
    1. Tenter connexion par cookies (si disponibles)
    2. Si cookies expirés → connexion par identifiants
    3. Accepter la bannière cookies si présente
    4. Naviguer vers le classement Honneur (page 1)
    5. Extraire les 100 premiers joueurs
    6. Naviguer vers le classement XP (page 1)
    7. Extraire les 100 premiers joueurs
    8. Naviguer vers "Top User" (page 1 + page 2 si disponible)
    9. Fusionner toutes les données (mergeRankings)
    10. Envoyer les données au scraper-server
    11. Sur le premier serveur : extraire les événements actifs
```

#### `src/extensions/scraper/scraper.js` — Extracteur DOM

Tourne dans le contexte de la page DarkOrbit (content script). Fonctions clés :

- `extractRankingData(rankKey, valueKey)` : parse le tableau HTML du classement
  - Extrait : rang, pseudo, valeur (honneur/XP/points), grade, userId
  - Le grade est extrait soit via le texte de la cellule, soit via l'image du grade (`rank_` dans le `src`)
- `extractGradeFromRow(tr)` : détecte le grade dans une ligne de tableau

#### `src/extensions/scraper/grade-mappings.js` — Mapping des grades

Dictionnaire multilingue qui traduit les noms de grades vers des IDs normalisés :

```
"Général de division" → "major_general"
"Major General"       → "major_general"
"Дивизионный генерал" → "major_general"
... (6 langues couvertes)
```

### Données produites par le scraping classement

Pour chaque serveur scraping, on obtient un tableau de joueurs :

```json
{
  "rank": 1,
  "name": "Dragonal16012",
  "honor": 1500000,
  "xp": 250000,
  "grade": "Général de division",
  "userId": "BjmHT",
  "company": "MMO"
}
```

Ces données alimentent la table `shared_rankings` sur Supabase via la RPC `upsert_shared_ranking`.

---

## 7. Scraping des profils joueurs (Client DarkOrbit)

### Principe

Contrairement au scraping du classement (extension Chrome sur navigateur), ce module **pilote le client officiel DarkOrbit** (exécutable Windows) via le **Chrome DevTools Protocol (CDP)** pour extraire des données de profil depuis les popups joueurs.

> Le client DarkOrbit étant basé sur un environnement Chromium/web, il expose un port de debug CDP lorsqu'il est lancé avec `--remote-debugging-port=9222`.

### Composant principal : `electron/client-launcher.js`

#### Lancement du client

```javascript
child_process.spawn(
  'C:\\Users\\bnois\\Dark Orbit\\DarkOrbit.exe',
  ['--remote-debugging-port=9222']
)
```

Après un délai de 5 secondes (`CDP_INIT_DELAY_MS`), une connexion CDP est établie.

#### Découverte multi-targets

Le client peut ouvrir plusieurs fenêtres (Hall of Fame, popup de profil...). Le module utilise `Target.setDiscoverTargets({ discover: true })` pour surveiller l'apparition de nouvelles fenêtres.

Pour chaque nouvelle fenêtre de type `page` :
1. Connexion CDP à cette fenêtre spécifique
2. Activation des domaines `Network`, `Runtime`, `Page`
3. Écoute des événements réseau (WebSocket, HTTP)
4. Surveillance de `Page.frameNavigated` pour détecter les navigations

#### Détection d'un profil joueur

Quand l'URL d'une page contient `/p/` ou `internalUserDetails`, `tryInjectFirmInPage()` est déclenché.

**Séquence d'injection :**

```
Attente 1500ms (chargement DOM dynamique)
  ↓
Injection de JS_EXTRACT_FIRM
  → Extraction de la firme (MMO / EIC / VRU)
  ↓
Attente 1000ms supplémentaires
  ↓
Injection de JS_EXTRACT_PROFILE_INFO
  → Extraction pseudo, grade, userId, serveur
  ↓
Émission IPC : client-launcher:save-data
```

#### Extraction de la firme (`JS_EXTRACT_FIRM`)

Script JS injecté via `Runtime.evaluate` dans le contexte de la page :

1. **Sélecteurs CSS précis** : cherche `td[title="COMPANY"]`, `td[title="FIRME"]`, etc.
2. **Regex multilingue** : cherche des mots-clés comme `Firma`, `Gesellschaft`, `фирма`, `company`, `empresa`, `şirket`, etc. suivis de `:` ou espace, puis capture le mot suivant
3. **Normalisation** : `Mars` → `MMO`, `Earth` → `EIC`, `Venus` → `VRU`
4. **Regex directe** : recherche brute de `MMO`, `EIC`, `VRU` dans le texte de la page

Résultat : `{ company: "MMO", method: "css_selector", keyword: "COMPANY" }`

#### Extraction du profil (`JS_EXTRACT_PROFILE_INFO`)

Script JS injecté, priorités d'extraction :

**Pseudo :**
1. `#nickname` (priorité absolue)
2. Cascade de sélecteurs : `.name_stats`, `.player_name`, `h1`, `.profile-name`, `.username`...
3. `document.title` nettoyé
4. `userId` comme pseudo temporaire si tout échoue
5. Filtre `isPlaceholder()` qui rejette les génériques (`username`, `player`, `%`, `&`, `#`...)

**UserId :**
- Regex sur `window.location.href` : `/p/BjmHT`, `profile=BjmHT`, `userId=BjmHT`, `user=BjmHT`

**Serveur :**
- Extrait du hostname : `gbl5.darkorbit.com` → `gbl5`

**Grade :**
- `document.querySelector('td.playerTableBody div[style*="rank_"]')?.innerText`
- Défaut : `"Inconnu"`

Résultat : `{ playerName: "Dragonal16012", grade: "Général de division", userId: "BjmHT", server: "gbl5" }`

#### Sauvegarde dans Supabase (`saveClientScrapedData` dans `main.js`)

Quand l'IPC `client-launcher:save-data` est reçu dans le processus principal :

**Étape 1 — Résolution de l'identité**
```
global.currentUserId présent ?
  → Oui : utiliser directement
  → Non : attendre 2 secondes, réessayer
           → Toujours absent : utiliser process.env.SUPERADMIN_USER_ID
                               ou UUID hardcodé de secours
```

**Étape 2 — Vérification du badge**
```
Requête Supabase : SELECT badge FROM profiles WHERE id = resolvedUserId
  → badge = 'SUPERADMIN' ? → continuer
  → badge ≠ 'SUPERADMIN' ? → abandon (log "Droits insuffisants")
```

**Étape 3 — Upsert du joueur**
```
Lire players_json du serveur depuis shared_rankings
  → Joueur existant (par userId ou pseudo) ?
      → Mettre à jour : company, grade, client_scraped_at
  → Nouveau joueur ?
      → Créer : name, userId, company, grade, client_scraped_at = 'Inconnu' si grade absent
RPC upsert_shared_ranking(server, updated_players_array)
```

**Étape 4 — Notification UI**
- IPC `client-launcher:save-success` → toast dans l'interface "Profil de [Pseudo] mis à jour"

---

## 8. Synchronisation des données

### Local ↔ Supabase (`sync-manager.js`)

Le module de synchronisation gère la cohérence entre le stockage local (`localStorage`) et Supabase.

**Déclencheurs de sync :**
- Connexion utilisateur
- Ajout/modification d'une session
- Export de données
- Intervalle automatique si `auto-save` activé

**Flux de sync upload (local → Supabase) :**
1. Récupérer toutes les sessions locales
2. Filtrer celles non synchronisées (`synced: false`)
3. Pour chaque session : `upsert_user_session_secure(session_data)` via RPC
4. Marquer comme `synced: true` en local

**Flux de sync download (Supabase → local) :**
1. Récupérer les sessions de l'utilisateur depuis `user_sessions`
2. Merger avec les sessions locales (déduplication par ID)
3. Mettre à jour `localStorage`

### Storage unifié (`unified-storage.js`)

Couche d'abstraction qui choisit automatiquement entre localStorage et Supabase selon :
- Statut de connexion
- Feature `cloudSync` disponible pour ce badge
- Disponibilité du réseau

---

## 9. Fonctionnalités utilisateur

### Onglet Stats — Suivi de progression

- Saisie des statistiques actuelles : honneur, XP, grade, points de grade
- Calcul automatique des gains depuis la session de référence (baseline)
- Affichage : gain total, gain/heure, temps estimé pour le prochain grade
- Dropdown de sélection du grade avec calcul des points manquants (`RANKS_DATA`)

### Onglet Progression — Historique et graphiques

- Liste de toutes les sessions enregistrées avec date, durée, gains
- Graphiques Chart.js : courbes d'évolution honneur / XP / points de grade
- Streak counter : jours consécutifs de jeu (célébration à 7, 30, 100 jours)
- Filtres et tri

### Onglet Classement

- Affiche les données scraping du serveur configuré
- Filtre par firme (MMO / EIC / VRU)
- Filtre par type (Honneur, XP, Top User)
- Comparaison avec sa propre position

### Onglet Événements

- Liste des événements DarkOrbit actifs (doublons de récompenses, passes de saison, etc.)
- Données multilingues stockées dans `src/multillingues_events/*.json`
- Images dans `src/img/events/`
- Ajout/gestion d'événements (ADMIN+)

### Onglet Boosters

- Rappel du booster actif du jour
- Alertes de changement de booster (PRO+)
- Promo d'upgrade pour les FREE

### Paramètres

- Thème (clair/sombre/automatique selon OS)
- Langue de l'interface (FR, EN, ES, RU, TR, PL)
- Auto-save, notifications, streak, liens rapides (PRO+)
- Raccourcis clavier

### Raccourcis clavier

Définis dans `keyboard-shortcuts.js` :
- `Ctrl+S` : sauvegarder
- `Ctrl+E` : exporter
- `Ctrl+1..7` : naviguer entre onglets
- `Ctrl+T` : changer de thème
- `?` : afficher l'aide des raccourcis

### Messagerie admin

- Les ADMIN/SUPERADMIN peuvent envoyer des messages aux utilisateurs
- Les FREE/PRO voient leurs messages dans un inbox (badge de notification)
- Polling toutes les 30 secondes pour les nouveaux messages

### Signalement de bugs

- Formulaire accessible à tous (`bug-report.js`)
- Envoi via RPC `insert_bug_report`
- Notification automatique des admins

---

## 10. Base de données Supabase

### Tables principales

#### `profiles`
Créée automatiquement à l'inscription via Supabase Auth.

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID (PK, FK auth.users) | Identifiant unique |
| `username` | text | Pseudo sur le Tracker |
| `email` | text | Email de connexion |
| `game_pseudo` | text | Pseudo en jeu DarkOrbit |
| `server` | text | Serveur de jeu (ex: gbl5) |
| `company` | text | Firme (EIC/MMO/VRU) |
| `badge` | text | Niveau : FREE/PRO/ADMIN/SUPERADMIN |
| `status` | text | active/pending/banned/rejected/suspended |
| `verification_status` | text | Statut de vérification du compte |
| `initial_honor` | bigint | Honneur de référence |
| `initial_xp` | bigint | XP de référence |
| `initial_rank` | text | Grade de référence |
| `metadata` | JSONB | Données supplémentaires |
| `is_suspect` | boolean | Marquage anti-triche |

#### `user_sessions`
Stocke chaque session de jeu enregistrée.

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Identifiant session |
| `user_id` | UUID (FK profiles) | Propriétaire |
| `start_time` | timestamptz | Début de session |
| `end_time` | timestamptz | Fin de session |
| `honor_gained` | bigint | Honneur gagné |
| `xp_gained` | bigint | XP gagné |
| `rank_points_gained` | int | Points de grade gagnés |
| `is_baseline` | boolean | Session de référence |

#### `shared_rankings`
Stocke les classements scrapés par serveur.

| Colonne | Type | Description |
|---|---|---|
| `server` | text (PK) | Identifiant serveur (ex: gbl5) |
| `players_json` | JSONB | Tableau de tous les joueurs |
| `last_updated` | timestamptz | Date du dernier scraping |

Structure d'un joueur dans `players_json` :
```json
{
  "name": "Dragonal16012",
  "userId": "BjmHT",
  "company": "MMO",
  "grade": "Général de division",
  "honor": 1500000,
  "xp": 250000,
  "rank": 1,
  "client_scraped_at": "2026-02-21T14:30:00Z"
}
```

#### `admin_logs`
Historique des actions administratives (changement de badge, ban, etc.).

#### `bug_reports`
Signalements de bugs envoyés par les utilisateurs.

#### `messages`
Messages envoyés par les admins aux utilisateurs.

### Fonctions RPC (Supabase)

| Fonction | Description |
|---|---|
| `get_user_permissions(p_user_id)` | Retourne badge, features, tabs, limits |
| `upsert_shared_ranking(p_server, p_players)` | Mise à jour atomique du classement serveur |
| `insert_user_session_secure(p_row)` | Insertion session avec vérification de limite |
| `upsert_user_session_secure(p_row)` | Update ou insert session avec limite |
| `insert_bug_report(...)` | Enregistre un bug avec notification admin |
| `get_ranking(p_server, p_companies, p_type, p_limit)` | Requête classement paginé |
| `get_my_badge()` | Retourne le badge de l'utilisateur connecté |

---

## 11. Sécurité et contrôle d'accès

### Row Level Security (RLS) Supabase

Chaque table est protégée par des politiques RLS :
- `profiles` : SELECT uniquement pour soi-même ou admin/superadmin
- `user_sessions` : SELECT/UPDATE/DELETE pour le propriétaire uniquement, INSERT bloqué (RPC obligatoire)
- `shared_rankings` : lecture publique, écriture via RPC authentifiée
- `admin_logs` : lecture pour ADMIN/SUPERADMIN uniquement

### Contrôle dans l'application

- **Frontend** : `guards.js` + `permissions-ui.js` masquent les éléments interdits
- **Backend** : chaque fonction vérifie le badge avant d'exécuter
- **Main process** : `saveClientScrapedData()` vérifie que `badge = SUPERADMIN` via Supabase avant tout upsert
- **Supabase RPC** : les fonctions `SECURITY DEFINER` vérification le badge côté serveur

### Token d'authentification

- JWT stocké dans `localStorage` et `global.supabaseAccessToken`
- Refresh automatique via le client Supabase
- Toutes les requêtes Supabase passent par `Authorization: Bearer <token>`
- Si le token est absent, les requêtes utilisent uniquement la clé `anon` (accès limité par RLS)

---

## 12. Internationalisation

L'application supporte **6 langues** : Français, Anglais, Espagnol, Russe, Turc, Polonais.

Gestion via `src/backend/i18n.js` et `translations.js` :
- Fichier de traductions centralisé
- `t('clé.de.traduction')` → retourne la chaîne dans la langue courante
- Changement de langue en temps réel via les paramètres
- Les événements DarkOrbit ont leurs propres fichiers JSON multilingues dans `src/multillingues_events/`

---

## 13. Flux de données — schéma global

```
UTILISATEUR
    │
    ├─[Connexion]──────────────────────────────────────────────────────┐
    │                                                                  │
    │  auth-manager.js → Supabase Auth → JWT token                    │
    │  get_user_permissions() → badge, features, tabs, limits         │
    │  applyPermissionsUI() → masquage/affichage des éléments UI      │
    │                                                                  │
    ├─[Saisie stats]───────────────────────────────────────────────────┤
    │                                                                  │
    │  stats.js → calcul gains → localStorage                         │
    │  sync-manager.js → upsert_user_session_secure() → Supabase      │
    │                                                                  │
    ├─[Scraping classement]────────────────────────────────────────────┤
    │                                                                  │
    │  scraper-manager.js → démarre scraper-server (port 3000)        │
    │  Extension Chrome background.js :                               │
    │    Pour chaque compte DarkOrbit :                               │
    │      Login (cookies ou identifiants)                            │
    │      Extraction DOM classement (scraper.js)                     │
    │      → POST /submit-ranking → scraper-server                    │
    │      → upsert_shared_ranking() → Supabase shared_rankings       │
    │                                                                  │
    ├─[Scraping profil joueur]─────────────────────────────────────────┤
    │                                                                  │
    │  client-launcher.js :                                           │
    │    spawn(DarkOrbit.exe, --remote-debugging-port=9222)           │
    │    CDP connect → Target.setDiscoverTargets                      │
    │    Popup profil détectée (/p/ ou internalUserDetails)           │
    │    Runtime.evaluate(JS_EXTRACT_FIRM) → company                  │
    │    Runtime.evaluate(JS_EXTRACT_PROFILE_INFO) → pseudo, grade    │
    │    IPC emit → main.js saveClientScrapedData()                   │
    │      → vérif SUPERADMIN                                         │
    │      → upsert_shared_ranking() → Supabase                       │
    │      → IPC send → toast UI "Profil mis à jour"                  │
    │                                                                  │
    └──────────────────────────────────────────────────────────────────┘
```

---

*Document généré le 21 février 2026.*  
*Ce rapport couvre la version 2.5 de DarkOrbit Tracker.*
