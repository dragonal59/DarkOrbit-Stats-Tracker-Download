## Protocole IPC Electron ↔ `pythscrap/scraper.py`

### 1. Vue d’ensemble

- Communication sur `stdin`/`stdout` en texte ligne par ligne (UTF-8).
- Chaque message est une ligne terminée par `\n`.
- Les champs sont séparés par le caractère `|` (pipe). Le premier champ est toujours un identifiant de message stable.

---

### 2. Messages Electron → scraper (stdin)

#### 2.1 `STOP`

- **Direction**: Electron → scraper  
- **Format**:  
  - `STOP`
- **Effet**:
  - Appelle `stop_requested.set()` dans `scraper.py`.
  - Toutes les boucles de scraping doivent tester `stop_requested.is_set()` et sortir proprement dès que possible.
- **Idempotent**: oui (plusieurs `STOP` successifs ne changent pas le comportement).

#### 2.2 `CAPTCHA_RESOLVED`

- **Direction**: Electron → scraper  
- **Format**:  
  - `CAPTCHA_RESOLVED`
- **Effet**:
  - Appelle `captcha_resolved_event.set()`.
  - Débloque les appels à `captcha_resolved_event.wait(timeout=600)` qui suivent un `CAPTCHA_REQUIRED|{server_id}`.

#### 2.3 `TEST|{server_id}`

- **Direction**: Electron → scraper  
- **Format**:  
  - `TEST|{server_id}`
- **Effet**:
  - Lance `test_connection(server_id)` dans un thread daemon.
- **Réponses possibles**:
  - `TEST_OK|{server_id}`
  - `TEST_FAIL|{server_id}|{reason}`

---

### 3. Messages scraper → Electron (stdout)

#### 3.1 Démarrage

##### `PROTOCOL|scraper.py started`

- **Quand**: immédiatement au lancement du process `scraper.py`.
- **Usage**:
  - Signal de handshake / présence du scraper.
  - Peut servir plus tard pour porter une version de protocole si nécessaire.

---

#### 3.2 Gestion des serveurs

##### `SERVER_START|{server_id}`

- **Quand**: juste avant le lancement effectif du scraping sur un serveur donné.
- **Champs**:
  - `server_id` : identifiant du serveur DarkOrbit (ex. `gbl1`, `fr1`…).

##### `SERVER_DONE|{server_id}|{nb_players}|{flag}`

- **Quand**: après succès du scraping pour un serveur.
- **Champs**:
  - `server_id` : serveur concerné.
  - `nb_players` : nombre total de joueurs extraits dans la liste fusionnée.
  - `flag` :
    - `supabase_ok` : push Supabase réussi (`push_hof_to_supabase` retourne `True`).
    - `supabase_skip` : Supabase non configuré ou push en erreur.

##### `SERVER_ERROR|{server_id}|{reason}`

- **Quand**: lorsqu’une exception non récupérée remonte jusqu’à `run_one_server`.
- **Champs**:
  - `server_id` : serveur concerné.
  - `reason` : message d’erreur tronqué (≈ 80 caractères max) et sans caractère `|`.

##### `PROGRESS|{current}|{total}|{server_id}|{label}`

- **Quand**: après chaque `SERVER_DONE` ou `SERVER_ERROR`.
- **Champs**:
  - `current` : nombre de serveurs terminés (succès + erreurs) depuis le début du run.
  - `total` : nombre total de serveurs prévus pour ce run.
  - `server_id` : dernier serveur terminé.
  - `label` : libellé humain pour l’UI (ex. `"Global PvE"`, `"Amériques"`).

---

#### 3.3 Captcha / challenge

##### `CAPTCHA_REQUIRED|{server_id}`

- **Quand**:
  - Page de challenge / captcha détectée pendant :
    - le login automatique (`auto_login`),
    - les warmups `internalStart`,
    - les requêtes HoF / profils.
  - Codes de retour `loginError` imposant un captcha (94, 6, 7).
  - Dernier recours textuel contrôlé (message interne indiquant explicitement un blocage captcha).
- **Champs**:
  - `server_id` : serveur sur lequel le captcha est requis.
- **Effet attendu côté UI**:
  - Ouvrir la fenêtre "Connexion navigateur" ciblée sur `server_id`.
  - Une fois le captcha résolu et la connexion effectuée par l’utilisateur, envoyer `CAPTCHA_RESOLVED`.

---

#### 3.4 Progression détaillée HoF / profils

##### `PROGRESS_TOTALS|{server_id}|{total_pages}|{total_players}`

- **Quand**: après obtention de la liste fusionnée HoF pour un serveur.
- **Champs**:
  - `server_id` : serveur concerné.
  - `total_pages` : nombre total de pages HoF prévues (toutes vues confondues) pour ce serveur.
  - `total_players` : nombre de joueurs uniques avec `user_id` dans la liste fusionnée.
- **Usage UI**:
  - Initialiser les barres / compteurs de progression par phase pour ce serveur.

##### `PROGRESS_BAR|{server_id}|{phase}|{cur}|{total}|{label}`

> Remarque : le nom exact et le format du message sont alignés sur `_emit_progress_bar` dans `scraper.py`.  
> Si le format est ajusté, cette section doit être mise à jour en même temps.

- **Quand**: pendant les différentes phases du scraping :
  - `phase = "rankings" | "profile_check" | "profile_page"`.
- **Champs**:
  - `server_id` : serveur concerné.
  - `phase` :
    - `"rankings"` : obtention des classements HoF.
    - `"profile_check"` : récupération des `profile_check` via l’API.
    - `"profile_page"` : scraping des pages profil complètes.
  - `cur` / `total` : avancement numérique dans la phase (par ex. pages parcourues, profils traités).
  - `label` : texte court lisible pour l’utilisateur (ex. `"2/6 pages"`, `"15/100 profils"`).

---

#### 3.5 Fin de run

##### `RUN_DONE|{nb_success}|{nb_errors}`

- **Quand**: en toute fin de process, juste avant `sys.exit(0)`.
- **Champs**:
  - `nb_success` : nombre de serveurs terminés avec succès (`SERVER_DONE`).
  - `nb_errors` : nombre de serveurs en erreur (`SERVER_ERROR`).
- **Effet attendu côté UI**:
  - Fermer/figer les barres de progression.
  - Afficher un résumé global (succès/erreurs).

---

### 4. Messages techniques `TECH|`

- Tous les messages dont le payload commence par `TECH|` sont des logs techniques.
- Ils peuvent être :
  - masqués par défaut dans l’UI,
  - affichés dans un panneau "Logs techniques",
  - collectés pour le support.
- Ces messages **ne doivent jamais contenir de secrets** :
  - pas de cookies (`dosid`, `__bpid`),
  - pas de clés Supabase (`SUPABASE_SERVICE_ROLE_KEY`, etc.),
  - pas de mots de passe ou identifiants en clair.

---

### 5. Principes d’évolution du protocole

- Tout nouveau message IPC doit être :
  - Documenté dans ce fichier (nom, format, sémantique).
  - Préfixé de façon stable (`SERVER_*`, `PROGRESS_*`, `TECH|...`, etc.).
- Toute modification de format sur un message existant (`SERVER_*`, `PROGRESS`, `CAPTCHA_REQUIRED`, `RUN_DONE`, `PROGRESS_TOTALS`, `PROGRESS_BAR`) doit être :
  - soit **rétro-compatible** (champs ajoutés en fin, anciens champs conservés),
  - soit accompagnée d’un changement dans le message `PROTOCOL|...` (par ex. `PROTOCOL|scraper.py v2`).
- L’UI doit traiter les messages inconnus de façon robuste (log + ignore), pour permettre l’ajout futur de nouveaux types de messages sans casser les versions existantes.

