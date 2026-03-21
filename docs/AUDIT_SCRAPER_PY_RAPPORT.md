# Audit complet de scraper.py — Rapport structuré

**Fichier audité :** `pythscrap/scraper.py`  
**Date :** 2025-03-07  
**Périmètre :** Analyse exhaustive sans modification de code.

---

## 1. Analyse des fonctions et blocs logiques

### 1.1 Rôle réel vs attendu

| Fonction | Lignes | Rôle attendu | Rôle réel | Note |
|----------|--------|--------------|-----------|------|
| `auto_login` | 500-553 | Connexion auto, retourne dosid | Retourne `(dosid, session)` | **Annotation de type incorrecte** : signature indique `-> str`, retour réel `tuple[str, requests.Session]`. |
| `check_session` | 271-324 | Vérifier session via GET internalStart | Idem ; lève `SessionExpiredException` ou `CaptchaRequiredException` | Conforme. |
| `_session_for_cookie` | 611-632 | Construire session HoF avec dosid + __bpid | Idem ; dosid sur `{server_id}.darkorbit.com`, __bpid sur `.darkorbit.com` | Conforme. |
| `_dedup_session_cookies` | 410-439 | Dédupliquer cookies, réinjecter __bpid si absent | Idem | Conforme. |
| `fetch_all_rankings` | 923-1103 | Récupérer tous les classements HoF (config) | Idem ; dedup, acr=0, warmup, boucle vues/pages | Conforme. |
| `fetch_hall_of_fame` | 767-834 | Récupérer 3 vues × 2 pages (fallback sans config RANKINGS) | Utilise ses propres headers (Mozilla), **pas** HOF_USER_AGENT ni dedup/acr=0 | **Chemin secondaire** : utilisé uniquement si `_config` n’a pas `RANKINGS` (l.1583-1591). |

### 1.2 Code mort

- **Aucune fonction définie sans appel** : toutes les fonctions listées sont utilisées (y compris `fetch_hall_of_fame` et `save_hof_results` sur la branche sans RANKINGS).
- **Variable / constante** : `action_url` (l.527) est réassignée par `_extract_bpsecure_action_url` ; pas de variable inutilisée évidente.

### 1.3 Ordre d’appel

- **check_session puis _session_for_cookie** : dans `scrape_one_server`, on appelle `check_session(server_id, cookie)` avec la chaîne cookie, puis `_session_for_cookie(server_id, cookie)`. Donc la session utilisée pour HoF n’a pas été validée en tant que `requests.Session` par check_session (check_session valide avec la chaîne ou une session ; si on passe la chaîne, la session construite ensuite est fraîche). Cohérent.
- **Ordre dedup → acr=0 → warmup** : dans `fetch_all_rankings`, l’ordre est correct (dedup, tracking cleanup, acr=0, **puis** premier `_hof_warmup`). En revanche, **la réponse du warmup peut réinjecter des cookies** (voir section 5).

---

## 2. Flux d’authentification complet (démarrage → internalHallofFame)

### 2.1 Chemin résumé

1. **Entrée** : `main()` → `scrape_one_server(server_id)`.
2. **Session** : `load_account(server_id)` → `cookie` (dosid/session/cookie depuis JSON).
3. **Si cookie non vide** : `check_session(server_id, cookie)` (GET internalStart avec cookie string ou session) → si OK, `session_for_hof = _session_for_cookie(server_id, cookie)` (dosid + __bpid depuis JSON).
4. **Si cookie vide ou check_session échoue** : `auto_login(...)` → `save_cookie(server_id, dosid, login_session)` → `check_session(server_id, login_session)` → `_post_login_warmup(server_id, login_session)` → `session_for_hof = login_session`.
5. **Captcha (connexion initiale)** : `CAPTCHA_REQUIRED|{server_id}` → attente `captcha_resolved_event` → rechargement compte → `check_session` + `_session_for_cookie` + `_post_login_warmup`.
6. **HoF** : `session = session_for_hof` (ou `_session_for_cookie(server_id, cookie)` si fallback) → si `_config.RANKINGS` : `fetch_all_rankings(server_id, session)` (dedup, acr=0, User-Agent HoF, warmup, GET internalHallofFame en boucle). Sinon : `fetch_hall_of_fame(server_id, session)` (pas de dedup ni acr=0, headers Mozilla locaux).

### 2.2 Création / modification / reconstruction de la session

| Lieu | Action |
|------|--------|
| `auto_login` | Crée `requests.Session()`, headers Mozilla, GET login, POST action (bpsecure), GET internalStart warmup, `_normalize_dosid_in_session` |
| `_session_for_cookie` | Crée nouvelle session, pose dosid (domaine `{server_id}.darkorbit.com`), __bpid (`.darkorbit.com`) |
| `_dedup_session_cookies` | Clear jar, réinjecte un cookie par nom (dernière occurrence), réinjecte __bpid depuis JSON si absent |
| `fetch_all_rankings` | Dedup, suppression tracking, suppression acr + set acr=0 (domaine `{server_id}.darkorbit.com`) ; **les réponses GET (warmup, HoF) peuvent réajouter des cookies** via Set-Cookie |

### 2.3 Headers et cookies par étape

| Étape | User-Agent | Cookies posés (domaine) |
|-------|------------|--------------------------|
| Login GET/POST (auto_login) | Mozilla (l.511) | Réponse serveur (dosid, etc.) |
| check_session | Mozilla (l.282) | Selon type (string dosid ou session) |
| _session_for_cookie | Mozilla (l.615) | dosid `{server_id}.darkorbit.com`, __bpid `.darkorbit.com` |
| fetch_all_rankings (HoF) | HOF_USER_AGENT (Mozilla) (l.965) | Après dedup + acr=0 (acr sur `{server_id}.darkorbit.com`) |
| fetch_hall_of_fame (fallback) | Mozilla (l.784) | Session telle quelle, **pas de forçage acr=0** |

**Conflits / écrasements :**  
- Les réponses HTTP (warmup, internalHallofFame) avec `allow_redirects=True` peuvent envoyer `Set-Cookie` (ex. acr) et requests les enregistre dans la session. Donc **acr=0 posé au début de fetch_all_rankings peut être écrasé après le premier _hof_warmup** (voir section 5).

### 2.4 Domaines des cookies

- **dosid** : `_session_for_cookie` → `{server_id}.darkorbit.com` ; `_normalize_dosid_in_session` (après login) → `.darkorbit.com`.
- **__bpid** : `_session_for_cookie` et `_dedup_session_cookies` → `.darkorbit.com`. Cohérent.
- **acr** : forçage dans `fetch_all_rankings` → `{server_id}.darkorbit.com`. Pas de gestion de `lang` dans le rapport (non demandé).

---

## 3. Gestion des erreurs et reconnexion

### 3.1 Flux SessionExpiredException (dans la boucle HoF de scrape_one_server)

1. `fetch_all_rankings` lève `SessionExpiredException` (redirection login détectée, l.1054 ou 1084).
2. **Étape 1** : rechargement compte → `saved_cookie` → `session = _session_for_cookie(server_id, saved_cookie)` → `check_session(server_id, session)`. Si succès : `reconnect_attempts = 0`, `continue` (pas d’auto_login).
3. **Étape 2** (si étape 1 échoue) : si `reconnect_attempts >= 1` → log "Abandon — risque captcha", `raw_rankings = {}`, `break` (sortie propre). Sinon `reconnect_attempts += 1` → `auto_login` → `save_cookie` → `check_session` → `_post_login_warmup` → `session = login_session`, `reconnect_attempts = 0`, `continue`.
4. Si auto_login échoue (ex. captcha) : `CAPTCHA_REQUIRED|{server_id}` → attente `captcha_resolved_event` → rechargement cookie → `_session_for_cookie` + `check_session` + `_post_login_warmup` → `continue` (sans incrémenter à nouveau reconnect_attempts).

**Boucle infinie :** Non. Après au plus une tentative auto_login (reconnect_attempts passe à 1), un deuxième SessionExpired mène à l’abandon (break). Après captcha, on ne réincrémente pas reconnect_attempts ; si une nouvelle SessionExpired survient, on retente étape 1 puis on a déjà reconnect_attempts >= 1 donc abandon.

### 3.2 Remise à zéro de reconnect_attempts

- Remis à 0 après succès étape 1 (session rétablie depuis cookies) (l.1513).  
- Remis à 0 après succès étape 2 (auto_login réussi) (l.1530).  
- Pas remis à 0 après résolution captcha (on reprend avec la même valeur, 1), ce qui évite un second auto_login en cas de nouvelle expiration.

### 3.3 Fallback captcha (webview)

- Déclenché quand :  
  - `CaptchaRequiredException` (check_session ou détection page challenge),  
  - ou exception dans auto_login avec message contenant "captcha" ou "session refusée".  
- Émission : `CAPTCHA_REQUIRED|{server_id}`.  
- Côté Electron : `scraper-window.js` écoute stdout, ouvre Connexion navigateur, puis `updateDoAccountsFromSessionCookies(serverId)` et envoie `CAPTCHA_RESOLVED` sur stdin.  
- Python : `captcha_resolved_event.wait(timeout=600)` puis rechargement cookie depuis `load_account` et reprise.

### 3.4 Chemins sans abandon

- Boucle `while True` dans scrape_one_server sort soit par `break` (succès après `fetch_all_rankings`), soit par `break` (abandon avec raw_rankings={}), soit par `raise` (ValueError, RuntimeError). Aucune boucle infinie sans issue identifiée.

---

## 4. Réponses HTTP non inspectées

### 4.1 session.get / session.post dont la réponse est peu ou pas utilisée

| Lieu | Appel | Utilisation de la réponse |
|------|------|----------------------------|
| auto_login l.572, 580 | `session.get(login_url)` (fallback credentials) | Non utilisée (réponse ignorée) |
| auto_login l.573, 581 | `session.post(...)` | Utilisée pour `dosid = _get_dosid_from_session(...)` |
| _post_login_warmup l.236 | `session.get(url, ...)` | status + final_url loggés ; corps non parsé |
| _hof_warmup l.878 | `session.get(warmup_url, ...)` | url, history, text (pour _gl) ; pas de vérification login/captcha sur la réponse warmup |
| fetch_all_rankings l.1010, 1063 | `session.get(url, ...)` (HoF) | r.url, r.text (parse_hof_table, détection login/captcha) |
| fetch_profile_check l.1168 | `session.post(...)` | r.status_code, r.url, r.text |
| fetch_profile_page l.1292 | `session.get(...)` | r.status_code, r.url, r.text |

- **internalHallofFame** : Le contenu HTML (r.text) est inspecté (parse_hof_table, présence "hof_ranking_table", _is_challenge_or_captcha_page, _is_likely_login_redirect sur r.url). En revanche, **aucune recherche explicite de loginError=94** (ou autre code d’erreur dans le corps) ; une réponse 200 avec un corps “loginError=94” et sans tableau serait traitée comme 0 joueurs + warmup/retry, sans message dédié.
- **Redirections** : Partout où c’est pertinent, `allow_redirects=True` est utilisé (check_session, warmup, HoF, login). C’est intentionnel pour suivre les redirections login/captcha et utiliser l’URL finale.

### 4.2 Recommandation

- Optionnel : avant ou en complément de parse_hof_table, détecter dans r.text des chaînes du type "loginError" ou "loginError=94" et lever SessionExpiredException ou logger un message explicite pour faciliter le diagnostic.

---

## 5. Gestion des cookies

### 5.1 Où les cookies sont posés sur la session

| Lieu | Cookie(s) | Domaine |
|------|-----------|---------|
| auto_login | Réponse serveur (Set-Cookie) | Défini par le serveur |
| _normalize_dosid_in_session | dosid (un seul) | `.darkorbit.com` |
| _session_for_cookie | dosid, __bpid | dosid `{server_id}.darkorbit.com`, __bpid `.darkorbit.com` |
| _dedup_session_cookies | Tous (réinjection) + __bpid si absent | Conservé ou `.darkorbit.com` pour __bpid |
| fetch_all_rankings | acr=0 (après suppression de tous les acr) | `{server_id}.darkorbit.com` |

### 5.2 Réponses HTTP qui peuvent écraser / ajouter des cookies

- **requests.Session** enregistre automatiquement les `Set-Cookie` des réponses. Donc :
  - Après `_hof_warmup(server_id, session, headers)` (l.966), une réponse internalStart peut envoyer par ex. `Set-Cookie: acr=1434` (ou autre valeur), qui est ajoutée au jar.
  - L’ordre actuel est : acr=0 (l.949-955) → **puis** _hof_warmup (l.966). Donc le premier GET HoF (warmup) peut réintroduire acr, et les GET internalHallofFame suivants enverraient à nouveau acr≠0.
- **Impact** : Risque de rejet (ex. loginError=94) si le serveur exige acr=0 et que la réponse warmup remet acr à une autre valeur.

**Correction recommandée** : Réappliquer le forçage acr=0 après le premier _hof_warmup (et éventuellement après chaque _hof_warmup dans la boucle), ou documenter que le serveur ne doit pas renvoyer Set-Cookie acr sur internalStart.

### 5.3 Cohérence domaines

- dosid : parfois `{server_id}.darkorbit.com` (_session_for_cookie), parfois `.darkorbit.com` (_normalize_dosid_in_session). Selon le contexte (session “fraîche” vs session post-login), les deux peuvent exister ; la dédup et _get_dosid_from_session gèrent les doublons.
- __bpid : uniquement `.darkorbit.com` partout. OK.

---

## 6. IPC Electron ↔ Python

### 6.1 Canaux IPC (stdout / stdin)

**Émis par Python (stdout) :**

| Préfixe / ligne | Rôle | Listener côté Electron / UI |
|-----------------|------|-----------------------------|
| `PROTOCOL|scraper.py started` | Canari démarrage | Envoyé au renderer via `scraper:line` (affiché dans les logs) |
| `PROGRESS_BAR|...` | Barre de progression | Idem |
| `PROGRESS|...` | Progression serveur courant | Idem |
| `PROGRESS_TOTALS|...` | Totaux pages / joueurs | Idem |
| `SERVER_START|{server_id}` | Début serveur | Idem |
| `SERVER_DONE|{server_id}|...` | Fin serveur | Idem |
| `SERVER_ERROR|{server_id}|...` | Erreur serveur | Idem |
| `RUN_DONE|...` | Fin du run | Idem |
| `CAPTCHA_REQUIRED|{server_id}` | Ouvrir Connexion navigateur | scraper-window.js : ouvre fenêtre, met à jour do_accounts (dosid), envoie CAPTCHA_RESOLVED |
| `TEST_OK|{server_id}` | Réponse test connexion | Envoyé au renderer |
| `TEST_FAIL|{server_id}|...` | Échec test | Idem |
| `TECH|...` | Log technique | Idem (si verbose) |
| Lignes sans préfixe | Logs utilisateur | Idem |

**Reçus par Python (stdin) :**

| Commande | Émetteur | Effet Python |
|----------|----------|--------------|
| `STOP` | UI (bouton Arrêter) | `stop_requested.set()` |
| `CAPTCHA_RESOLVED` | scraper-window après Connexion navigateur | `captcha_resolved_event.set()` |
| `TEST|{server_id}` | UI (test connexion) | Lance `test_connection(server_id)` dans un thread |

### 6.2 Orphelins

- Tous les préfixes émis par Python sont envoyés au renderer via `scraper:line` ; le renderer peut filtrer (ex. TECH|) ou afficher tout. Pas de préfixe émis sans être transmis.
- Côté Electron : seul `CAPTCHA_REQUIRED|` déclenche une action spécifique (ouverture fenêtre + CAPTCHA_RESOLVED). Les autres lignes sont des logs/progression. Aucun listener “orphan” identifié (pas de listener qui attendrait un préfixe jamais émis par Python).

### 6.3 __bpid et do_accounts.json (Electron)

- **updateDoAccountsFromSessionCookies** (scraper-window.js) ne met à jour que **dosid / session / cookie** dans do_accounts.json, pas __bpid. Donc après résolution captcha via Connexion navigateur, __bpid n’est jamais écrit par Electron. Si do_accounts.json contenait déjà __bpid pour ce serveur, il reste ; sinon Python n’aura __bpid que après un auto_login réussi (save_cookie avec session).

---

## 7. Code mort et imports

### 7.1 Imports

- **`import os`** : présent deux fois (l.8 et l.55). Redondant, pas d’impact fonctionnel.
- Tous les autres imports sont utilisés (argparse, json, re, threading, time, datetime, config, requests, auth).

### 7.2 Blocs try/except silencieux (sans log)

| Lignes | Contexte | Recommandation |
|--------|----------|----------------|
| 78 | Chargement SCRAPER_SETTINGS_JSON | Logger en debug en cas d’exception |
| 140 | load_profile_cache (json invalide) | Idem |
| 437 | _dedup_session_cookies (load_account pour __bpid) | Déjà log "__bpid absent du JSON" dans le bloc else ; l’except ne logue pas l’exception |
| 563 | auto_login (urlparse) | Fallback action_host utilisé ; log optionnel |
| 625 | _session_for_cookie (load_account) | Pass silencieux ; __bpid simplement absent |
| 670 | parse_hof_table (ImportError BeautifulSoup) | Retourne [] ; log possible |
| 779 | fetch_hall_of_fame (ImportError BeautifulSoup) | _log_tech présent |
| 804 | fetch_hall_of_fame session.get | _log_tech avec erreur |
| 818 | fetch_hall_of_fame debug write | _log_tech |
| 883 | _hof_warmup | Retourne None ; pas de log de l’exception |
| 1042 | fetch_all_rankings debug write | pass |
| 1145 | _extract_profile_check_from_load_user_info_response | return None |
| 1169 | fetch_profile_check session.post | return None |
| 1243 | _parse_profile_page_stats ImportError | return out |
| 1293 | fetch_profile_page session.get | return None |
| 1398 | listen_stdin BrokenPipeError/EOFError | pass (attendu en fin de flux) |
| 1621 | main() chargement config / SERVER_GROUPS | server_ids = list(SERVER_LABELS.keys()) |

---

## 8. Rapport final par criticité

### CRITIQUE

| # | Fonction / zone | Lignes | Problème | Impact | Correction recommandée |
|---|------------------|--------|----------|--------|------------------------|
| C1 | fetch_all_rankings | 966 (après 949-955) | La réponse du premier _hof_warmup (et des suivants) peut contenir Set-Cookie (ex. acr), ce qui réécrit le cookie acr dans le jar. On a forcé acr=0 juste avant, mais pas après le warmup. | Les requêtes internalHallofFame suivantes peuvent renvoyer acr≠0 et être rejetées (ex. loginError=94). | Réappliquer le forçage acr=0 après chaque _hof_warmup, ou après le premier warmup avant la boucle des pages HoF. |
| C2 | Electron updateDoAccountsFromSessionCookies | scraper-window.js | N’écrit pas __bpid dans do_accounts.json après résolution captcha. | Si l’utilisateur n’a jamais fait d’auto_login pour ce serveur, __bpid restera absent après captcha et les requêtes HoF peuvent échouer. | Enrichir updateDoAccountsFromSessionCookies (et/ou session-scraper-cookies) pour lire et écrire __bpid dans do_accounts.json. |

### MAJEUR

| # | Fonction / zone | Lignes | Problème | Impact | Correction recommandée |
|---|------------------|--------|----------|--------|------------------------|
| M1 | fetch_hall_of_fame | 767-834, 1584-1586 | Utilisé quand _config n’a pas RANKINGS. Utilise des headers locaux (Mozilla) et n’applique pas dedup, acr=0, ni HOF_USER_AGENT. | Pour les runs sans config RANKINGS, les requêtes HoF peuvent envoyer des cookies dupliqués, acr≠0, ou un User-Agent différent. | Aligner ce chemin sur fetch_all_rankings : même User-Agent HoF, même préparation cookies (dedup + acr=0) avant les GET, ou factoriser la préparation session HoF. |
| M2 | auto_login | 500 | Annotation de retour `-> str` alors que la fonction retourne `(str, requests.Session)`. | Risque d’erreur pour les outils de type / refactoring ; appelants utilisent déjà le tuple. | Corriger la signature en `-> tuple[str, requests.Session]` (ou équivalent selon version Python). |
| M3 | _dedup_session_cookies (except) | 437-438 | `except Exception:` sans log de l’exception. | En cas d’erreur (ex. fichier do_accounts absent), on ne voit que "__bpid absent du JSON" sans cause. | Logger l’exception (ex. _log_tech ou logging) avant de loguer "__bpid absent du JSON". |

### MINEUR

| # | Fonction / zone | Lignes | Problème | Impact | Correction recommandée |
|---|------------------|--------|----------|--------|------------------------|
| N1 | Imports | 8, 55 | `import os` en double. | Redondance. | Supprimer l’un des deux (ex. garder l.8). |
| N2 | fetch_all_rankings / internalHallofFame | ~1018-1020 | Aucune détection explicite de loginError (ex. 94) dans le corps de la réponse. | En cas de 200 OK avec loginError dans le corps, on traite comme 0 joueurs + retry sans message clair. | Optionnel : rechercher "loginError" (ou "loginError=94") dans r.text et lever SessionExpiredException ou logger un message explicite. |
| N3 | try/except silencieux | 78, 140, 883, 1042, 1145, 1169, 1243, 1293, 1398, 1621 | Plusieurs `except` sans log. | Debug plus difficile en cas d’échec. | Ajouter des logs (au moins _log_tech ou debug) dans les branches concernées selon criticité. |

### INFO

| # | Sujet | Suggestion |
|---|--------|------------|
| I1 | Factorisation | La préparation “session HoF” (dedup, tracking, acr=0, User-Agent) pourrait être extraite dans une fonction (ex. _prepare_session_for_hof(server_id, session)) appelée au début de fetch_all_rankings et, si on aligne le fallback, au début de fetch_hall_of_fame. |
| I2 | Logs | En mode verbose, ajouter le status_code (et éventuellement un extrait du corps) pour la première réponse internalHallofFame quand elle ne contient pas de tableau (0 joueurs), pour faciliter le diagnostic des rejets (loginError, etc.). |
| I3 | SessionExpiredException | Certains appels passent un message formaté (ex. f"Session expirée pour {server_id}"), d’autres uniquement server_id. Harmoniser pour toujours passer un message string lisible. |

---

**Fin du rapport.** Aucune modification n’a été apportée au code ; ce document sert uniquement de base pour les corrections et améliorations listées ci-dessus.
