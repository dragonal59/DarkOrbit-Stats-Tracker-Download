# Audit : connexion DarkOrbit, extraction joueurs, détection captcha et remontée UI

## Résumé exécutif

- **Connexion / extraction** : le cookie est accepté sur `/?lang=fr` après login mais **refusé sur internalHallofFame** (redirection vers `externalHome&loginError=94`). Causes probables : cookies dupliqués ou tracking réinjectés, ou domaine/ordre des requêtes.
- **Détection captcha** : elle repose uniquement sur la page Bigpoint **check() + parm_0/parm_1**. La page `externalHome&loginError=94` (HTML classique DarkOrbit) **n’est pas reconnue comme captcha**, donc on lève **SessionExpiredException** au lieu de **CaptchaRequiredException** → pas d’ouverture webview captcha.
- **Remontée vers l’UI** : quand le Python envoie `CAPTCHA_REQUIRED|serverId`, le **main Electron ouvre bien** la webview Connexion navigateur, mais l’**UI React (ScraperUI) ne traite pas cette ligne** : pas de toast dédié, et la ligne reste uniquement dans les logs.

---

## 1. Pourquoi il n’arrive pas à extraire les joueurs

### 1.1 Flux observé (tes logs)

1. Auto-login OK → cookie enregistré, `check_session` donne 200 avec `final_url='https://gbl5.darkorbit.com/?lang=fr'`.
2. Premier GET internalHallofFame → **302** vers internalHallofFame puis **302** vers `externalHome&loginError=94` → URL finale `https://gbl5.darkorbit.com/?lang=fr`, body = page d’accueil (pas le classement).
3. Le code considère « redirection login » (URL sans internalHallofFame) et lève **SessionExpiredException** (ou retourne selon le chemin).
4. Reconnexion → nouveau cookie → deuxième `fetch_all_rankings` → **PROGRESS_TOTALS|gbl5|48|0** → 0 joueurs.

Donc : **Bigpoint refuse la requête internalHallofFame** (loginError=94) alors que la même session est acceptée sur la home. Ce n’est pas un échec de login au sens « mauvais identifiants », mais **session refusée sur l’endpoint interne**.

### 1.2 Causes probables côté code / trafic

- **Cookies envoyés sur la requête HoF** (d’après tes logs) :  
  `HoF cookies sent (honor page 1): ... dosid=..., dosid=..., aliyungf_tc=..., BP_DO_tracking_viewToReg_view=..., acr=0`  
  → **Deux fois `dosid`** et **réapparition de cookies de tracking** alors qu’ils ont été nettoyés avant. Entre le cleanup et le GET, une réponse (ex. warmup) a dû réinjecter des Set-Cookie. Le serveur peut :
  - prendre le mauvais `dosid` (ex. bpsecure au lieu de darkorbit),
  - ou considérer la requête comme suspecte à cause du tracking.
- **Ordre / domaine des cookies** : même avec `_dedup_session_cookies` et priorité darkorbit, si le jar est modifié après (warmup, redirections), on peut renvoyer un mélange incohérent.
- **Pas de `_gl`** : logs indiquent « HoF _gl not found in warmup ». Certains sites n’acceptent les requêtes internes qu’avec un paramètre _gl ; si Bigpoint l’exige, son absence peut expliquer le refus.

### 1.3 Comportement à risque dans le code

- **Lignes 1071–1073 (scraper.py)** :  
  Si `"login" in r.url` ou `"bpsecure" in r.url`, on fait `return raw` **sans lever d’exception**.  
  Or après une 302, l’URL finale peut être `https://gbl5.darkorbit.com/?lang=fr` (sans la chaîne "login"). Dans ce cas on ne rentre pas dans ce bloc et on continue (parsing, 0 joueurs, etc.). Mais si un jour l’URL finale contient "login", on **retourne silencieusement** sans lever **SessionExpiredException** → la boucle de reconnexion dans `scrape_one_server` ne se déclenche pas et on obtient des données vides sans message clair.
- **Recommandation** : en cas de redirection vers login (URL finale sans internalHallofFame ou avec loginError), **toujours lever SessionExpiredException** (ou CaptchaRequiredException si on décide de traiter loginError=94 comme captcha) au lieu de `return raw`.

---

## 2. Pourquoi il n’arrive pas à « rester connecté » (loginError=94)

- Le **même cookie** est accepté sur la home (`/?lang=fr`) et refusé sur internalHallofFame. Donc ce n’est pas un échec de login initial, mais un **refus côté Bigpoint pour les URLs internes**.
- Hypothèses cohérentes avec les logs :
  1. **Cookie jar incohérent** au moment du GET HoF (doublons, tracking) → déjà tracé ci‑dessus.
  2. **Exigence _gl** ou autre paramètre/ordre de requêtes non respecté.
  3. **Protection anti-bot** : trop de requêtes (GET/POST) ou pattern détecté comme non‑navigateur → loginError=94 sans page captcha classique (check/parm_0).

Tant que le jar n’est pas strictement nettoyé avant **chaque** requête HoF (et que le bon `dosid` darkorbit est utilisé), le problème peut persister.

---

## 3. Pourquoi les captcha ne sont pas détectés

### 3.1 Détection actuelle (scraper.py)

- **`_is_challenge_or_captcha_page(html)`** : retourne True **uniquement** si dans les 5000 premiers caractères :
  - présence de `onload="check()"` (ou variante),
  - **et** de `parm_0` ou `parm_1`.
- C’est la **page challenge Bigpoint classique** (anti-bot avec check/parm).  
  Si Bigpoint utilise un **autre type de défi** (reCAPTCHA, page « vérifiez que vous êtes humain » sans check/parm, ou page loginError=94 avec un autre HTML), **on ne la reconnaît pas** et on ne lève pas **CaptchaRequiredException**.

### 3.2 Cas loginError=94 (tes logs)

- La réponse reçue après redirection est la **page d’accueil DarkOrbit** (DOCTYPE, titre « DarkOrbit Reloaded », etc.). Elle **ne contient pas** la structure check() + parm_0/parm_1.
- Donc `_is_challenge_or_captcha_page(r.text)` → **False**.
- Le code traite alors comme **session expirée** (SessionExpiredException ou chemin « 0 joueurs + redirect »), **pas comme captcha**.
- Conséquence : **CAPTCHA_REQUIRED|serverId n’est jamais envoyé** dans ce scénario → pas d’ouverture de la webview « Connexion navigateur » pour ce cas.

### 3.3 Où la détection est utilisée

- **check_session** : si redirection vers login/bpsecure, on appelle `_is_challenge_or_captcha_page(response.text)` ; si True → CaptchaRequiredException. Si la page est la home avec loginError=94 (HTML classique), False → SessionExpiredException.
- **fetch_all_rankings** : après chaque GET HoF, on teste `_is_challenge_or_captcha_page(r.text)` ; idem après retry. Même limite : seule la page Bigpoint « check/parm » est reconnue.
- **auto_login** (post‑login warmup) : si la réponse du warmup est une page captcha (check/parm), on lève CaptchaRequiredException.

Donc : **tant que Bigpoint ne renvoie pas la page avec check() + parm_0/parm_1, on ne détecte pas de captcha** et on ne peut pas ouvrir la webview pour ce cas.

---

## 4. Pourquoi tu n’as pas d’avertissement (toast) + webview qui s’ouvre

### 4.1 Côté Electron (main process) – scraper-window.js

- **Ligne 479–501** : à la réception d’une ligne stdout qui commence par `CAPTCHA_REQUIRED|` :
  - le **main** appelle **openBrowserLoginForCaptcha(serverId)** → ouvre bien la **fenêtre « Connexion navigateur »** (webview),
  - puis met à jour les cookies et envoie `CAPTCHA_RESOLVED` au Python.
- Donc **dès que le Python envoie CAPTCHA_REQUIRED|serverId**, la webview **doit** s’ouvrir. Si tu ne la vois jamais, c’est que **le Python n’envoie pas CAPTCHA_REQUIRED** dans ton scénario (parce que la page reçue n’est pas reconnue comme captcha, cf. §3).

### 4.2 Côté UI React – ScraperUI.jsx (parseLine)

- Il n’existe **aucun** `if (t.startsWith('CAPTCHA_REQUIRED|'))` dans **parseLine**.
- Les lignes connues sont : PROGRESS_BAR, TECH, PROGRESS, SERVER_START, SERVER_DONE, **SERVER_ERROR**, RUN_DONE, TEST_OK, TEST_FAIL. Tout le reste (dont **CAPTCHA_REQUIRED|serverId**) tombe dans le **cas par défaut** : la ligne est uniquement **ajoutée aux logs** (`setLogs(...)`).
- Le **toast** « Session expirée ou captcha… » n’apparaît que pour **SERVER_ERROR|...** lorsque le message contient "captcha" (lignes 432–435). Donc :
  - Si le Python envoie **CAPTCHA_REQUIRED|gbl5**, tu n’as **pas de toast** dédié, seulement la ligne dans le log.
  - La webview, elle, s’ouvre bien (côté main), mais l’UI ne te prévient pas par un toast explicite « Captcha détecté — ouverture Connexion navigateur ».

Résumé : **toast + webview** :
- **Webview** : s’ouvre uniquement quand le Python envoie `CAPTCHA_REQUIRED|serverId`, ce qui n’arrive pas quand la réponse est la page loginError=94 (non reconnue comme captcha).
- **Toast** : même quand `CAPTCHA_REQUIRED` est envoyé, l’UI ne montre **pas** de toast pour ce préfixe ; elle ne montre un toast captcha que pour **SERVER_ERROR** avec "captcha" dans le message.

---

## 5. Synthèse des corrections à prévoir

### 5.1 Connexion / extraction (scraper.py)

1. **Ne jamais retourner silencieusement** quand la réponse HoF est une redirection vers login. Si l’URL finale n’est pas internalHallofFame (ou si loginError est présent dans l’URL ou le body), **lever SessionExpiredException** (ou CaptchaRequiredException si on décide de traiter loginError=94 comme « ouvrir la webview ») au lieu de `return raw`.
2. **S’assurer qu’avant chaque GET internalHallofFame** le jar est dans un état propre : un seul `dosid` (darkorbit), pas de cookies de tracking (aliyungf_tc, BP_DO_tracking_*), acr=0. Si une réponse intermédiaire (warmup, etc.) réinjecte des cookies, refaire ce nettoyage avant la requête HoF.
3. **Vérifier** si Bigpoint exige le paramètre **_gl** pour internalHallofFame ; si oui, le récupérer de façon fiable (warmup ou première réponse) et l’envoyer systématiquement.

### 5.2 Détection captcha (scraper.py)

1. **Étendre la détection** : en plus de check() + parm_0/parm_1, considérer comme « captcha / défi » au moins :
   - **loginError=94** dans l’URL ou dans le body de la réponse (puis lever **CaptchaRequiredException** et émettre **CAPTCHA_REQUIRED|serverId** pour ouvrir la webview et arrêter les reconnexions automatiques).
2. Optionnel : détecter d’autres patterns (ex. « recaptcha », « human verification », ou balises connues de Bigpoint) si tu constates d’autres types de pages de défi.

### 5.3 UI : toast + visibilité (ScraperUI.jsx + éventuellement main)

1. **Dans parseLine (ScraperUI.jsx)** : ajouter un cas explicite pour **CAPTCHA_REQUIRED|** :
   - extraire `serverId`,
   - appeler **addToast** avec un message du type : « Captcha ou vérification requise pour {serverId} — ouverture de la fenêtre Connexion navigateur »,
   - (optionnel) mettre en avant le serveur concerné (ex. setLastCaptchaServerId(serverId)).
2. La **webview** est déjà ouverte par le main ; avec ce toast, l’utilisateur a un **retour visuel clair** même quand le Python envoie bien CAPTCHA_REQUIRED.

### 5.4 Option : traiter loginError=94 comme « ouvrir webview »

- Si tu décides que **loginError=94** doit toujours ouvrir la webview (et pas déclencher une reconnexion auto), alors dans **fetch_all_rankings** et **check_session** :
  - dès que **loginError=94** est présent (URL ou body), lever **CaptchaRequiredException** et émettre **CAPTCHA_REQUIRED|serverId**,
  - et ne pas faire de reconnexion automatique dans ce cas (le flux actuel avec `captcha_resolved_event.wait()` et rechargement du cookie depuis la webview suffit).

---

## 6. Checklist rapide

| Problème | Cause identifiée | Où corriger |
|----------|------------------|------------|
| 0 joueurs extraits | Cookie refusé sur internalHallofFame (loginError=94) ; possiblement jar incohérent (doublons, tracking) | scraper.py : nettoyage cookies avant chaque HoF ; ne pas `return raw` sans lever d’exception en cas de redirect login |
| « Pas connecté » après login | Même cookie OK sur home, KO sur HoF ; _gl ou ordre des requêtes à vérifier | scraper.py : cookies + optionnel _gl |
| Captcha non détecté | Détection limitée à check() + parm_0/parm_1 ; page loginError=94 = HTML classique | scraper.py : _is_challenge_or_captcha_page ou chemins appelants : prendre en compte loginError=94 (et éventuellement autres patterns) |
| Pas d’avertissement (toast) | ScraperUI ne traite pas la ligne CAPTCHA_REQUIRED | src/scraper-ui/ScraperUI.jsx : branche parseLine pour CAPTCHA_REQUIRED + addToast |
| Webview ne s’ouvre pas | Python n’envoie jamais CAPTCHA_REQUIRED quand la réponse est loginError=94 | scraper.py : traiter loginError=94 comme captcha (lever CaptchaRequiredException + print CAPTCHA_REQUIRED) |

Ce document peut servir de base pour implémenter les correctifs (scraper.py + ScraperUI.jsx) et retester le flux de bout en bout.
