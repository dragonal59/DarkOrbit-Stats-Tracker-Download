# Audit complet du scraper (fenêtre Scraper — DO Stats Tracker)

Document généré pour tracer chaque étape, chaque URL visitée, et classer les problèmes du plus critique au plus insignifiant.

---

## 1. Architecture globale

```
[ScraperUI React]  ←→  [preload.js / scraperBridge]  ←→  [Electron main : scraper-window.js]
                                                                    │
                                                                    ├─ writeDoAccountsJson() → pythscrap/do_accounts.json
                                                                    ├─ spawn(py, ['-u', 'scraper.py', '--servers', 'gbl5,...'])
                                                                    └─ stdout/stderr → IPC 'scraper:line'  |  stdin ← STOP / TEST|serverId

[scraper.py]  →  requests  →  https://{serverId}.darkorbit.com/...
[pythscrap/auth.py]  →  détection langue + champs formulaire (BeautifulSoup)
```

- **UI** : `src/scraper-ui/ScraperUI.jsx` (React), chargée dans `src/scraper/index.html`.
- **Main** : `electron/scraper-window.js` (createScraperWindow, setupScraperWindowIPC).
- **Python** : `pythscrap/scraper.py` (point d’entrée), `pythscrap/auth.py` (mapping multilingue + formulaire).
- **Données** : `pythscrap/do_accounts.json` (comptes par serveur), `userData/session-scraper-cookies.json` (cookies du fallback navigateur).

---

## 2. Séquence détaillée (étape par étape)

### Phase A — Côté Electron (au clic « Lancer le scraping »)

| # | Étape | Fichier | Détail |
|---|--------|---------|--------|
| A1 | IPC `scraper-window:start` | scraper-window.js | Réception `{ serverIds }` (ex. `['gbl5']`). |
| A2 | Vérifications | scraper-window.js | Fenêtre ouverte, pas de run en cours, `serverIds` non vides. |
| A3 | Identifiants manquants | scraper-window.js | Pour chaque `serverId` : compte dans `do_accounts.json` OU compte assigné dans l’app (DarkOrbit) avec credentials. Sinon retour `{ ok: false, error: 'Identifiants manquants...' }`. |
| A4 | Résolution CWD | scraper-window.js | `getPythscrapDir()` → dev : `…/pythscrap`, packagé : `…/app.asar.unpacked/pythscrap`. |
| A5 | Vérification scraper.py | scraper-window.js | `fs.existsSync(scraperPy)` ; sinon abort. |
| A6 | Écriture do_accounts.json | scraper-window.js | `writeDoAccountsJson(serverIds, cwd)` : fusion `loadExistingDoAccounts(cwd)` + `loadSessionCookies()` + `DarkOrbitAccounts.getServerAssignments()` / `getCredentials`, puis `fs.writeFileSync(…/do_accounts.json)`. |
| A7 | Spawn Python | scraper-window.js | `spawn(pyCmd, ['-u', 'scraper.py', '--servers', serversArg], { cwd, stdio: ['pipe','pipe','pipe'], env: { …, PYTHONIOENCODING: 'utf-8' } })`. |
| A8 | Routage stdout/stderr | scraper-window.js | stdout → `scraper:line` (chaque ligne) ; stderr → `scraper:line` avec préfixe `ERROR|`. |
| A9 | Fermeture / STOP | scraper-window.js | Sur `close` du process : `scraper:closed`. Sur « Arrêter » : `pythonProcess.stdin.write('STOP\n')`. |

### Phase B — Côté Python (scraper.py)

| # | Étape | Fichier | Détail |
|---|--------|---------|--------|
| B1 | Démarrage | scraper.py | Écriture debug `_scraper_debug_started.txt`, puis `PROTOCOL|scraper.py started` sur stdout. |
| B2 | Parsing args | scraper.py | `--servers gbl5` → `server_ids = ['gbl5']`. Sans `--servers` : chargement via `config.SERVER_GROUPS` ou `SERVER_LABELS`. |
| B3 | Démarrage thread stdin | scraper.py | `listen_stdin()` en daemon : lit `STOP` ou `TEST|serverId` et réagit. |
| B4 | Boucle par serveur | scraper.py | Pour chaque `server_id` : `SERVER_START|{server_id}`, `PROGRESS|current|total|server_id|label`, puis `scrape_one_server(server_id)`. |

### Phase C — Pour un serveur : scrape_one_server(server_id)

| # | Étape | Fichier | Détail |
|---|--------|---------|--------|
| C1 | Chargement compte | scraper.py | `load_account(server_id)` : lecture `do_accounts.json`, recherche par `server_id` ou `server`. Retourne `username`, `password`, `session`/`cookie`/`dosid`. |
| C2 | Tentative cookie existant | scraper.py | Si cookie non vide : `check_session(server_id, cookie)` puis `_session_for_cookie(server_id, cookie)` pour la suite. |
| C3 | Si session expirée | scraper.py | `SessionExpiredException` → on passe au fallback login (C4–C8). |
| C4 | Auto-login GET page login | scraper.py | Voir section « URLs visitées » (login page). |
| C5 | Auto-login détection + POST | scraper.py | auth : `detect_auth_language(html)`, `find_credential_fields(html, lang)`, `get_form_action_and_hidden(html, login_url)` ; sinon regex `_find_form_fields`, `_find_submit_button`. POST vers `action_url` avec hidden + credentials + submit. |
| C6 | Warmup internalStart | scraper.py | Après réception cookie : GET internalStart (ancrage session). Si redirection login → exception. |
| C7 | Sauvegarde cookie | scraper.py | `save_cookie(server_id, dosid)` : mise à jour `session`/`dosid`/`cookie` dans `do_accounts.json`. |
| C8 | Vérification session | scraper.py | `check_session(server_id, login_session)` (même session que le login). |
| C9 | Récupération HoF | scraper.py | `fetch_hall_of_fame(server_id, session_or_cookie)` : GET page Hall of Fame, parse tableau, retourne nombre de joueurs. |
| C10 | Retour et émission | scraper.py | `SERVER_DONE|server_id|nb_players|supabase_skip` ou `SERVER_ERROR|server_id|raison`. Puis `RUN_DONE|nb_termines|nb_erreurs`. |

### Phase D — Fallback « Connexion navigateur (captcha) »

| # | Étape | Fichier | Détail |
|---|--------|---------|--------|
| D1 | IPC browser-login | scraper-window.js | `scraper-window:browser-login` avec `{ serverId }` (défaut `gbl5`). |
| D2 | Ouverture fenêtre | scraper-window.js | `BrowserWindow` avec `partition: 'persist:browser-login-captcha'`, `loadURL(loginUrl)`. |
| D3 | URL chargée | scraper-window.js | `https://{serverId}.darkorbit.com/`. |
| D4 | Détection succès | scraper-window.js | `did-navigate` / `did-navigate-in-page` : si `url` matche `/internalStart|indexInternal/i` → connexion réussie. |
| D5 | Sauvegarde cookies | scraper-window.js | `session.cookies.get({ url })` puis merge dans `SESSION_COOKIES_FILE` (session-scraper-cookies.json), clé `serverId`. |
| D6 | Fermeture | scraper-window.js | Fenêtre détruite, promesse résolue `{ ok: true }`. Au prochain « Démarrer », `writeDoAccountsJson` fusionne ces cookies dans `do_accounts.json`. |

---

## 3. URLs visitées (exhaustif)

Toutes les URLs sont en `https://{serverId}.darkorbit.com` avec `serverId` (ex. `gbl5`, `fr1`).

| # | URL | Méthode | Contexte |
|---|-----|--------|----------|
| 1 | `https://{serverId}.darkorbit.com/` | GET | Page de login (auth). Utilisée dans : auto_login (scraper.py), fallback browser-login (Electron). |
| 2 | `https://{serverId}.darkorbit.com/` | POST | Soumission formulaire login (action peut être relative, résolue via `urljoin` dans auth.py). Corps : champs hidden + username + password + submit. |
| 3 | `https://{serverId}.darkorbit.com/indexInternal.es?action=internalStart&prc=100` | GET | Vérification session + ancrage après login. Referer: `base_url/`. |
| 4 | `https://{serverId}.darkorbit.com/indexInternal.es?action=internalHallofFame&view=UserHonor&dps=1` | GET | Récupération classement Hall of Fame (une seule vue, page 1). Referer: `base_url/`. |

Aucune autre URL n’est utilisée par le scraper Python ou par le flux browser-login du scraper.

---

## 4. Protocole stdout (Python → UI)

Messages émis par le script Python et affichés / interprétés dans l’UI :

| Ligne | Signification |
|-------|----------------|
| `PROTOCOL|scraper.py started` | Démarrage du script. |
| `PROGRESS|current|total|serverId|label` | Progression (ex. 1/1, gbl5, Global PvE). |
| `SERVER_START|serverId` | Début du traitement d’un serveur. |
| `SERVER_DONE|serverId|nb_players|supabase_ok\|supabase_skip` | Serveur terminé avec succès. |
| `SERVER_ERROR|serverId|raison` | Erreur sur un serveur (ex. captcha, credentials, timeout). |
| `RUN_DONE|nb_termines|nb_erreurs` | Fin du run. |
| `TEST_OK|serverId` | Test connexion réussi. |
| `TEST_FAIL|serverId|raison` | Test connexion échoué. |
| Toute autre ligne | Log libre (affichée dans la zone log). |
| `ERROR|…` | Ligne issue de stderr (préfixée côté Electron). |

---

## 5. Fichiers et rôles

| Fichier | Rôle |
|---------|------|
| `electron/scraper-window.js` | Fenêtre scraper, IPC start/stop/test/browser-login, écriture do_accounts.json, spawn Python, routage stdout/stderr. |
| `pythscrap/scraper.py` | Point d’entrée, lecture do_accounts, check_session, auto_login, fetch_hall_of_fame, protocole stdout. |
| `pythscrap/auth.py` | Détection langue auth, recherche champs credentials, action formulaire + hidden (BeautifulSoup). |
| `pythscrap/do_accounts.json` | Comptes par serveur (username, password, session/dosid/cookie). Écrit par Electron et par save_cookie (Python). |
| `userData/session-scraper-cookies.json` | Cookies par serveur (fallback browser-login). Lu par writeDoAccountsJson. |
| `src/scraper-ui/ScraperUI.jsx` | UI : toggles serveurs (persistés localStorage), logs, progress, boutons Lancer/Arrêter/Test/Connexion navigateur. |
| `src/preload.js` | Expose scraperBridge (start, stop, test, browserLogin, openOutputDir, onLine, onClosed). |

---

## 6. Problèmes et recommandations (par gravité)

### Critique

| Id | Problème | Où | Recommandation |
|----|----------|-----|----------------|
| C1 | Données HoF non persistées | scraper.py | Le scraper ne fait qu’afficher le nombre de joueurs et ne sauvegarde ni en fichier ni en Supabase. L’app s’attend à des classements (ex. shared_rankings_snapshots / imported_rankings). | Décider d’un flux : soit export JSON local (ex. pythscrap/output/), soit appel Supabase (RPC / table) depuis le main process, et l’implémenter. |
| C2 | Captcha bloque le login automatique | scraper.py / auto_login | En cas de captcha, le POST login ne renvoie pas de cookie valide → « cookie reçu mais session refusée ». | Le fallback « Connexion navigateur (captcha) » est en place ; s’assurer que l’utilisateur le voit (toast + bouton) et que les cookies sauvegardés sont bien repris au run suivant (writeDoAccountsJson + do_accounts.json). |
| C3 | Risque d’écrasement do_accounts.json | scraper-window.js | `writeDoAccountsJson` fusionne par serveur mais ne lit que les serveurs du run courant pour les credentials app ; les autres restent issus du fichier. Si le fichier est corrompu ou vide au chargement, des comptes peuvent être perdus. | Vérifier que loadExistingDoAccounts lit bien tout le fichier et que la fusion préserve tous les comptes existants (déjà le cas si byServer est initialisé avec existingList). Ajouter un garde-fou (backup ou validation) si le fichier est critique. |

### Majeur

| Id | Problème | Où | Recommandation |
|----|----------|-----|----------------|
| M1 | Une seule vue HoF (UserHonor, dps=1) | scraper.py | Seule la page 1 du classement Honneur est récupérée ; pas de UserEP, User, ni page 2. Le session-scraper Electron fait 3 vues × 2 pages. | Étendre fetch_hall_of_fame pour au moins une ou deux vues supplémentaires et/ou plusieurs pages si l’objectif est d’aligner les données avec le reste de l’app. |
| M2 | Pas d’envoi des classements à Supabase | scraper.py | Retour systématique `(nb_players, False)` (supabase_skip). Aucune intégration Supabase côté Python. | Si les classements doivent être partagés, prévoir soit une API/IPC depuis Python vers Electron qui appelle Supabase, soit un export JSON lu par l’app et envoyé à Supabase. |
| M3 | Test connexion pendant un run | scraper-window.js / scraper.py | « Tester la connexion » envoie `TEST|serverId` en parallèle du run ; test_connection appelle scrape_one_server dans un thread. Concurrence sur le même process. | Soit désactiver le bouton Test pendant un run, soit isoler le test (process séparé ou file dédiée) pour éviter des états incohérents. |
| M4 | Dépendance à la structure HTML HoF | scraper.py | Le parsing du tableau dépend des classes (hof, ranking, position, name, spacer). Un changement côté DarkOrbit casse le comptage. | Conserver les fallbacks (table avec ≥10 tr, parsing 1ère/2ème cellule). Optionnel : sauvegarder un extrait HTML en debug quand count=0 pour adapter le parser. |

### Mineur

| Id | Problème | Où | Recommandation |
|----|----------|-----|----------------|
| m1 | Commande Python fixe (py / python3) | scraper-window.js | `getPyCmd()` retourne `py` (Windows) ou `python3` (autre). Pas de config utilisateur. | Documenter ou ajouter une préférence (env / config) si des utilisateurs ont un Python sous un autre nom. |
| m2 | Pas de timeout global du run | scraper.py | Un serveur bloqué (GET/POST très lent) peut bloquer toute la boucle jusqu’au timeout par requête (10–15 s). | Ajouter un timeout global optionnel ou un mécanisme de skip après N secondes par serveur. |
| m3 | Logs verbeux en production | scraper.py | Beaucoup de `print(…, flush=True)` (diagnostic HoF, etc.). | Introduire un niveau de log (ex. --quiet / --verbose) ou un fichier de config pour réduire le bruit en prod. |
| m4 | Persistance toggles : clé localStorage unique | ScraperUI.jsx | Une seule clé `darkOrbitScraperToggles` pour tous les serveurs. Pas de versioning. | Si la structure des groupes/serveurs change (renommage, ajout), prévoir une version dans la clé ou migrer l’ancien format au chargement. |
| m5 | Dossier de sortie « Ouvrir » | scraper-window.js | `open-output-dir` ouvre `pythscrap/output` qui peut ne pas exister ; le scraper n’y écrit pas encore. | Créer le dossier au premier run ou à l’ouverture, ou désactiver le bouton tant qu’aucun export n’existe. |

### Insignifiant

| Id | Problème | Où | Recommandation |
|----|----------|-----|----------------|
| i1 | Fichier debug _scraper_debug_started.txt | scraper.py | Écrit à chaque lancement. | Supprimer en prod ou le limiter au premier run. |
| i2 | SERVER_LABELS dupliqué | scraper.py / config.js / ScraperUI | Liste des serveurs et labels en plusieurs endroits. | Centraliser (ex. un module partagé ou un JSON) pour éviter les écarts. |
| i3 | Titre fenêtre browser-login | scraper-window.js | Titre en français. | Aligner avec l’i18n si l’app est multilingue. |
| i4 | ETA progress bar | ScraperUI.jsx | ETA basé sur la moyenne des durées des serveurs déjà traités ; au premier serveur, ETA = 0. | Acceptable ; optionnel : afficher « — » tant qu’aucune durée n’est disponible. |

---

## 7. Résumé des URLs (référence rapide)

```
GET  https://{serverId}.darkorbit.com/
POST https://{serverId}.darkorbit.com/   [ou form action si différent]
GET  https://{serverId}.darkorbit.com/indexInternal.es?action=internalStart&prc=100
GET  https://{serverId}.darkorbit.com/indexInternal.es?action=internalHallofFame&view=UserHonor&dps=1
```

Fallback captcha (Electron) : une BrowserWindow charge `https://{serverId}.darkorbit.com/` ; aucune autre URL n’est appelée automatiquement par le scraper.

---

## 8. Dépendances Python

- `requests` (requêtes HTTP).
- `beautifulsoup4` (auth.py + parsing HoF ; fallback regex si absent pour les champs formulaire).

Fichier : `pythscrap/requirements.txt`.
