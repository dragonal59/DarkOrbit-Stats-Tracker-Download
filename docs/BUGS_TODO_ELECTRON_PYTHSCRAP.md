# Backlog bugs & code mort — DarkOrbit Tracker

**Dernière mise à jour du fichier :** mars 2026.  
**Contexte produit à jour :** `docs/APP_CONTEXT.md`, `docs/MIGRATION_ORDER.md`, `docs/README.md`.

---

## Traités récemment (app Electron — mars 2026)

Les points suivants ne sont plus à faire tels quels (référence code / migrations) :

| Sujet | Détail |
|--------|--------|
| **Suppression de toutes les sessions** | RPC `delete_all_sessions_for_current_user()` — migration `20260321140000_delete_all_sessions_for_current_user.sql`. Appel depuis `auth-manager.js` (`_afterSignUpComplete`) et `reset.js` (`hardReset`). |
| **Migration / import sessions en rafale** | RPC `upsert_user_sessions_bulk(p_rows jsonb)` — migration `20260321150000_upsert_user_sessions_bulk.sql`. Utilisé par `sync-manager.js` (`_migrateSessions`) et `sessions.js` (`importData`, chunks de 100). |
| **Évènements sidebar — purge** | Client : `deleteExpiredEvent` ne tente pas la RPC si pas d’échéance ; migration `20260321130000_delete_event_by_id_only_if_expires_at.sql` (SQL : pas de `DELETE` si `expires_at IS NULL`). |
| **Classement — stabilité UI** | `ranking-ui.js` : init idempotente, throttle global `refreshRanking`, hook CDP unique ; `script.js` : pas de double `refreshRanking` après `DataSync.pull()`. |
| **Classement — nombres snapshots** | `parseSharedNumber` unifié (troncature number + string) dans `ranking.js`. |
| **Stats — compteurs header** | `updateCurrentPlayerRankingCounters` sorti du milieu de `updateHeaderProgressBar` (`stats.js`) + promesse gérée à l’appel. |
| **DOStats période** | Lookback snapshots : `DOSTATS_PERIOD_SNAPSHOT_LOOKBACK` (remplace un `limit(5)` trop bas) dans `ranking.js`. |
| **Documentation** | Nettoyage / alignement : `APP_CONTEXT.md`, `MIGRATION_ORDER.md`, `docs/README.md` ; suppression de fichiers obsolètes (voir liste dans `README.md`). |
| **Isolation stockage multi-compte** | Plus de conservation des clés « joueurs suivis » au changement de compte ; `stopPeriodicSync` avant logout si banni ; doc `docs/STORAGE_KEYS_AND_USER_ISOLATION.md` + commentaires `keys.js`. |
| **Classement — matrice des sources** | `docs/RANKING_SOURCES.md` ; `normalizeRankingFilters` + `resolveRankingLoadRoute` + refactor `loadRanking` dans `ranking.js`. |

---

## Backlog bugs & code mort — App Electron

### Bugs / risques critiques

- **[CRITIQUE] Pile scraping SuperAdmin (Electron) très couplée au DOM DarkOrbit & DOStats**
  - **Zones** : `main.js` (`saveClientScrapedData`, IPC `client-launcher:*`, `session-scraper:*`, `scraper-window:*`), `electron/client-launcher.js`, `electron/session-scraper.js`, `electron/scraper-bridge.js`, `electron/dostats-scraper.js`, fenêtre Scraper (React) si présente dans le repo / build.
  - **À corriger** :
    - Isoler les heuristiques DOM (sélecteurs, regex, parsing DOStats, extraction profileCheck) dans des helpers bien nommés.
    - Documenter le flux complet (diagramme) et les points de fragilité (changements DOM, textes, scripts distants).
    - Ajouter des modes dégradés clairs (ex. HoF OK mais profil partiel) plutôt que des échecs silencieux.

- **[CRITIQUE] Logique de classement multi‑source très complexe (local import + snapshots + DOStats + RPC)** — *partiellement traité (mars 2026)*
  - **Fait** : matrice documentée `docs/RANKING_SOURCES.md` ; résolution centralisée **`resolveRankingLoadRoute`** + **`normalizeRankingFilters`** dans `ranking.js` ; `loadRanking` dispatch par route.
  - **Reste** : tests auto ou protocole de tests manuels multi-serveurs / périodes ; éventuel fallback `get_ranking` quand snapshots vides (décision produit).

### Bugs / risques majeurs

- **[MAJEUR] Imports de sessions & classements peu encadrés (risque de doublons / overwrites silencieux)** — *partiellement traité (mars 2026 — étape 4)*
  - **Zones** : `src/backend/sessions.js` (`handleImportFile`), `src/backend/ranking-import.js` (`importRankingFile`), chaînes `translations.js` (6 langues).
  - **Fait** : avertissements doublons d’`local_id` dans le fichier + collisions avec sessions déjà chargées ; message si tronqué à 500 ; **double confirmation** à partir de 50 sessions ; **confirm explicite** avant remplacement d’un classement fusion déjà importé pour le même serveur ; plafond **25 000** joueurs par fichier fusion.
  - **Reste (backlog)** :
    - Métadonnées d’import (batch_id, date, source) côté Supabase si besoin.
    - Options utilisateur « fusionner / écraser / annuler dernier import ».

- **[MAJEUR] Nettoyage agressif du stockage local (banned / changement de user)** — *partiellement traité (mars 2026)*
  - **Fait** : `docs/STORAGE_KEYS_AND_USER_ISOLATION.md` + en-tête `keys.js` ; fin de fuite **joueurs suivis** au switch compte ; `stopPeriodicSync()` avant logout si **banned**.
  - **Reste** : persister suivis dans `user_settings` (ou autre) pour les retrouver après logout ; re-audit si nouvelles clés `STORAGE_KEYS`.

### Bugs / risques mineurs

- **[MINEUR] Mélange `UnifiedStorage` et `localStorage` brut pour certaines préférences**
  - **Zones** : `version-badges.js`, `i18n.js`, divers fichiers backend/frontend.
  - **À corriger** : décider ce qui est synchronisé vs local pur ; harmoniser les accès.

- **[MINEUR] Logs très verbeux en prod (scraping/ranking/main)**
  - **Zones** : `main.js`, `electron/*scraper*`, `src/backend/ranking.js`.
  - **À corriger** : niveau de log configurable (DEBUG/INFO/WARN/ERROR), désactiver DEBUG en build prod sauf flag support.

- **[MINEUR] UX incomplète pour les fonctionnalités desktop‑only en contexte web**
  - **Zones** : `src/backend/darkorbit-accounts-ui.js`, `src/backend/super-admin.js`, `src/frontend/auth.js`.
  - **À corriger** : masquage cohérent ; messages invitant à utiliser l’app Electron.

### Code mort / à supprimer (ou archiver)

- **`src/main.js`**
  - Ancien entrypoint Electron sans preload.
  - **Action** : confirmer qu’il n’est plus référencé par les scripts ; si oui, supprimer ou déplacer dans `archive/` avec README.

- **Dossier `archive/`**
  - **Action** : README clair ou retrait du dépôt si inutile.

- **Ancienne méthode extension Chrome de scraping**
  - **Action** : nettoyer les commentaires « méthode 1 » / extension ; doc déjà dans `docs/README.md` (extension supprimée).

- **Scripts DOStats standalone** (`electron/dostats-collect-standalone.js`, `electron/dostats-ranking-collect.js` — confirmer présence dans le dépôt)
  - **Action** : confirmer l’usage ; sinon archiver ou supprimer.


## Backlog bugs & code mort — Scraper Python (`pythscrap/`)

### Bugs / risques critiques

- **[CRITIQUE] Stockage des identifiants DarkOrbit en clair dans `do_accounts.json`**
  - **Zones** : `pythscrap/do_accounts.json`, `load_account`, `save_cookie` dans `scraper.py`.
  - **À corriger** :
    - Ne jamais versionner de credentials réels (utiliser un `do_accounts.example.json`).
    - Envisager un format chiffré ou un autre mécanisme sécurisé pour stocker username/password/sessions.

- **[CRITIQUE] Couplage fort aux pages HTML DarkOrbit (HoF, login, profil, challenges/captcha)**
  - **Zones** : `check_session`, `_is_challenge_or_captcha_page`, `_is_likely_login_redirect`, `fetch_all_rankings`, `fetch_profile_check_from_profile_page`, parsing des pages HoF/profil dans `scraper.py`; mapping multilingue dans `auth.py`.
  - **À corriger** :
    - Extraire les heuristiques de parsing DOM/URL dans des fonctions dédiées et testables.
    - Jeu de fixtures HTML (captures réelles) pour tests hors connexion.
    - Modes dégradés (ex. continuer avec HoF même si profileCheck échoue).

### Bugs / risques majeurs

- **[MAJEUR] `do_accounts.json` comme “source de vérité” mutable écrite en continu**
  - **Zones** : `load_account`, `save_cookie` dans `scraper.py`.
  - **À corriger** :
    - Sauvegarde robuste (fichier temporaire puis `rename`, ou un fichier par serveur).
    - Limiter les réécritures disque inutiles.

- **[MAJEUR] Gestion très complexe des cookies (`dosid`, `acr`, `__bpid`)**
  - **Zones** : `_get_dosid_from_session`, `_dedup_session_cookies`, `_normalize_dosid_in_session`, `_reapply_acr_zero`, `check_session` dans `scraper.py`.
  - **À corriger** :
    - Documenter la stratégie (priorité domaines, réinjection `__bpid`, normalisation `acr`).
    - Tests unitaires sur des jars de cookies simulés.

- **[MAJEUR] Pipeline HoF/profil très imbriqué (warmup, `_gl`, retry, rate‑limit, stop_requested)**
  - **Zones** : `fetch_all_rankings` et helpers dans `scraper.py`.
  - **À corriger** :
    - Découper en petites fonctions.
    - Comportement de `stop_requested` plus granulaire.

### Bugs / risques mineurs

- **[MINEUR] Branches inatteignables / code mort dans `fetch_all_rankings`**
  - **Zones** : `fetch_all_rankings` dans `scraper.py`.
  - **À corriger** : nettoyer les blocs après `return` incohérents.

- **[MINEUR] Double logique de détection des champs de login**
  - **Zones** : `_find_form_fields` dans `scraper.py`, BeautifulSoup dans `auth.py`.
  - **À corriger** : centraliser sur `auth.py` ou marquer un seul chemin comme officiel.

- **[MINEUR] Messages d’erreur peu standardisés côté CLI / protocole**
  - **Zones** : `ValueError` dans `load_account` et helpers.
  - **À corriger** : préfixes / codes pour que l’UI Electron distingue config vs technique.

### Code mort / à supprimer (ou simplifier)

- **Branches après `return` dans `fetch_all_rankings`** — supprimer ou remonter dans la bonne branche.
- **Helpers de parsing login redondants** — ne garder qu’une stratégie officielle si possible.
