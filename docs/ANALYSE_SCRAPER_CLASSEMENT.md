# Analyse complète — Scraper classement DarkOrbit

## 1. Flux étape par étape

### 1.1 Démarrage initial (avant tout scraping)

| Étape | Fichier | Action |
|-------|---------|--------|
| 1 | `scraper-manager.js` | Création `BrowserWindow` scraping (cachée) |
| 2 | `scraper-manager.js` | Chargement extension via `session.loadExtension()` |
| 3 | `scraper-manager.js` | **Navigation vers `blank.html?token=xxx`** (chrome-extension://) |
| 4 | `blank.js` | Stockage token dans `chrome.storage.local` |
| 5 | `blank.js` | Définition `window.startScraping` / `startScrapingEvents` |

**Pourquoi blank.html avant DarkOrbit ?**  
Le token d’auth pour le serveur HTTP (port 3000) doit être stocké dans l’extension. `executeJavaScript` ne fonctionne pas sur les pages `chrome-extension://`, donc le token est passé via l’URL. C’est la seule façon de l’injecter.

---

### 1.2 Déclenchement du cycle (clic « Lancer »)

| Étape | Fichier | Action |
|-------|---------|--------|
| 1 | `main.js` | `scraper:start` → charge config depuis localStorage |
| 2 | `main.js` | `setScrapingConfig(cfg)` — **config jamais transmise à l’extension** |
| 3 | `scraper-manager.js` | `executeJavaScript('window.startScraping()')` sur la fenêtre scraping |
| 4 | `blank.js` | `chrome.runtime.sendMessage({ type: 'START_SCRAPING' })` |
| 5 | `background.js` | `runScrapingCycle()` |

---

### 1.3 Par serveur — Connexion

| Étape | Fichier | Action | Rechargement page ? |
|-------|---------|--------|---------------------|
| 1 | `background.js` | `sendProgress(server_id, 'connecting')` | Non |
| 2 | `background.js` | `POST /restore-cookies` — injection cookies en session | Non |
| 3 | `background.js` | **`navigateTo(Hall of Fame)`** | **Oui — 1er chargement DarkOrbit** |
| 4 | `background.js` | `waitForPageReady` (polling DOM) | Non |
| 5 | `background.js` | `executeInPage(checkUrlCode)` — vérif URL | Non |
| 6a | Si cookies OK | `usedCookies=true`, `loginOk=true` | Non |
| 6b | Si cookies expirés | `POST /remove-cookies` → **404** (endpoint absent) | Non |
| 6c | Si cookies expirés | **`navigateTo(login)`** | **Oui** |
| 7 | `background.js` | `performLogin()` → `POST /execute` (injection formulaire) | Non |
| 8 | `background.js` | `POST /save-cookies` | Non |
| 9 | Si CAPTCHA | `POST /captcha-wait` (2 min max) | Non |
| 10 | Si CAPTCHA résolu | **`navigateTo(Hall of Fame)`** | **Oui** |

---

### 1.4 Par serveur — Avant extraction classements

| Étape | Fichier | Action | Rechargement ? |
|-------|---------|--------|----------------|
| 1 | `background.js` | `acceptCookieBannerIfPresent()` | Non |
| 2 | `background.js` | **`randomDelay(5000, 8000)`** | Non |

---

### 1.5 Par serveur — Boucle classements (honneur, XP, top user × 2 pages)

Pour chaque vue (honor, xp, topuser) et chaque page (1, 2) :

| Étape | Fichier | Action | Rechargement ? |
|-------|---------|--------|----------------|
| 1 | `background.js` | `sendProgress(scraping_honor_p1, …)` | Non |
| 2 | Si page 2 | `POST /restore-cookies` | Non |
| 3 | `background.js` | **`navigateTo(baseUrl&view=X&dps=N)`** | **Oui — rechargement complet** |
| 4 | `background.js` | `acceptCookieBannerIfPresent()` | Non |
| 5 | `background.js` | `waitForPageReady` ou `randomDelay(3000,5000)` si pas de tabId | Non |
| 6 | `background.js` | `executeInPage(CHECK_CAPTCHA_RANKING)` | Non |
| 7 | `background.js` | `scrapeTabRanking()` → `POST /execute` | Non |
| 8 | `scraper-server.js` | DIAG : `hasLoginForm` ? | Non |
| 9 | Si session expirée | **`navigateTo(login)`** | **Oui** |
| 10 | Si session expirée | Login inject, **`navigateTo(redirect_url)`** | **Oui** |
| 11 | `background.js` | **`randomDelay(2000, 3000)`** | Non |
| 12 | Entre vues | **`randomDelay(3000, 5000)`** | Non |

**Total navigations par serveur (cookies valides) :**  
1 (Hall of Fame initial) + 6 (honor p1, honor p2, xp p1, xp p2, topuser p1, topuser p2) = **7 rechargements complets**.

---

### 1.6 Après extraction d’un serveur

| Étape | Fichier | Action |
|-------|---------|--------|
| 1 | `background.js` | `POST /collect` (envoi joueurs vers Supabase) |
| 2 | `background.js` | **`randomDelay(10000, 15000)`** — délai entre serveurs |

---

## 2. Problèmes identifiés

### 2.1 Délai entre serveurs — non relié à la config

| Problème | Détail |
|----------|--------|
| **Config ignorée** | `background.js` utilise `CONFIG.delayBetweenServers: { min: 10000, max: 15000 }` en dur |
| **Planificateur** | `scraping-config.js` et `main.js` définissent `delayBetweenServers` (10s–600s) |
| **Extension** | Ne reçoit jamais cette config : pas d’endpoint `/config`, pas de passage de paramètres |
| **Résultat** | Délai réel = 10–15 s, alors que l’utilisateur peut avoir configuré 60 s ou plus |

---

### 2.2 Rechargements excessifs → risque CAPTCHA

| Cause | Occurrences par serveur |
|-------|-------------------------|
| Navigation Hall of Fame initiale | 1 |
| Navigation par page de classement (6 pages) | 6 |
| Reconnexion si session expirée (dans /execute) | 2 par événement |
| **Total minimal** | **7 rechargements** |
| **Avec 1 session expirée** | **9 rechargements** |

Chaque `navigateTo()` = rechargement complet. DarkOrbit peut interpréter cela comme du trafic automatisé et afficher un CAPTCHA.

---

### 2.3 Restauration cookies → pas de cible directe page 1 honneur

| Problème | Détail |
|----------|--------|
| **Flux actuel** | `restore-cookies` → `navigateTo(internalHallofFame)` (sans `view` ni `dps`) |
| **URL utilisée** | `indexInternal.es?action=internalHallofFame` |
| **Comportement** | DarkOrbit charge la vue par défaut (souvent honneur p1), mais ce n’est pas garanti |
| **Puis** | Boucle qui navigue vers `&view=UserHonor&dps=1` → **rechargement inutile** si on est déjà dessus |

Si la page par défaut est déjà honneur p1, la première navigation de la boucle refait un rechargement pour la même page.

---

### 2.4 Endpoint manquant

| Endpoint | Statut | Utilisation |
|----------|--------|-------------|
| `/remove-cookies` | **Absent** | `background.js` l’appelle quand les cookies sont expirés → 404 |
| `/clear-cookies` | Présent | Équivalent fonctionnel, mais l’extension ne l’utilise pas |

---

### 2.5 Délais trop longs

| Délai | Valeur | Impact |
|-------|--------|--------|
| Avant boucle classements | 5–8 s | Inutile si on est déjà sur Hall of Fame |
| Entre pages (p1→p2) | 2–3 s | Peut être réduit |
| Entre vues (honor→xp→topuser) | 3–5 s | Peut être réduit |
| Entre serveurs | 10–15 s (hardcodé) | Doit venir de la config |

---

## 3. Optimisations proposées

### 3.1 Réduire les rechargements

| Optimisation | Description |
|--------------|-------------|
| **Une seule navigation initiale** | Après `restore-cookies`, naviguer directement vers `&view=UserHonor&dps=1` |
| **Changement d’URL sans reload** | Tester `history.pushState` / `location.href` sans `navigateTo` si DarkOrbit gère le contenu en AJAX |
| **Éviter les doubles navigations** | Si on est déjà sur `UserHonor&dps=1`, ne pas recharger pour la même page |
| **Ordre des vues** | Enchaîner honor p1 → p2, xp p1 → p2, topuser p1 → p2 pour limiter les changements de vue |

---

### 3.2 Cookies → atterrissage direct page 1 honneur

| Action | Implémentation |
|--------|----------------|
| **URL après restore-cookies** | `indexInternal.es?action=internalHallofFame&view=UserHonor&dps=1` |
| **Première itération** | Si on vient de cette navigation, ne pas rappeler `navigateTo` pour honor p1 |
| **Réduction** | 1 rechargement en moins par serveur |

---

### 3.3 Délai entre serveurs depuis la config

| Action | Implémentation |
|--------|----------------|
| **Endpoint `/config`** | Ajouter dans `scraper-server.js` un GET qui renvoie `delayBetweenServers` depuis `scraping-config` |
| **Extension** | Au démarrage du cycle, `GET /config` et utiliser cette valeur |
| **Fallback** | Si config absente, garder 60 s par défaut |

---

### 3.4 Réduction des délais internes

| Délai | Actuel | Proposé |
|-------|--------|---------|
| Avant boucle classements | 5–8 s | 1–2 s (ou 0 si déjà sur la bonne page) |
| Entre pages | 2–3 s | 1–2 s |
| Entre vues | 3–5 s | 2–3 s |

---

### 3.5 Correction endpoint cookies

| Action | Implémentation |
|--------|----------------|
| **Option A** | Créer `/remove-cookies` qui appelle la même logique que `/clear-cookies` |
| **Option B** | Remplacer dans `background.js` l’appel à `/remove-cookies` par `/clear-cookies` |

---

## 4. Synthèse des corrections à faire

### Priorité haute

1. **Délai entre serveurs** : exposer la config via `/config` et l’utiliser dans l’extension.
2. **Restore-cookies → page 1 honneur** : naviguer vers `&view=UserHonor&dps=1` et éviter un second chargement pour honor p1.
3. **Endpoint `/remove-cookies`** : implémenter ou remplacer par `/clear-cookies`.

### Priorité moyenne

4. **Réduire les rechargements** : vérifier si le changement de `view`/`dps` peut se faire sans reload (AJAX/SPA).
5. **Délai avant boucle** : passer de 5–8 s à 1–2 s.
6. **Délais entre pages/vues** : légère réduction (1–2 s entre pages, 2–3 s entre vues).

### Priorité basse

7. **Éviter navigation redondante** : si l’URL actuelle correspond déjà à la page cible, ne pas rappeler `navigateTo`.
8. **Logs** : ajouter des logs pour tracer les navigations et les délais appliqués.

---

## 5. Schéma du flux actuel (résumé)

```
[blank.html] 
    → restore-cookies 
    → navigateTo(Hall of Fame)          [RELOAD 1]
    → (si cookies OK) 
    → randomDelay(5-8s)
    → pour honor p1: navigateTo(HoF&view=UserHonor&dps=1)  [RELOAD 2]
    → pour honor p2: restore-cookies, navigateTo(dps=2)    [RELOAD 3]
    → pour xp p1: navigateTo(view=UserEP&dps=1)            [RELOAD 4]
    → pour xp p2: restore-cookies, navigateTo(dps=2)      [RELOAD 5]
    → pour topuser p1: navigateTo(view=User&dps=1)         [RELOAD 6]
    → pour topuser p2: restore-cookies, navigateTo(dps=2) [RELOAD 7]
    → /collect
    → randomDelay(10-15s)  [HARDCODÉ - ignore config]
    → serveur suivant
```

Si session expirée pendant /execute : 2 reloads supplémentaires (login + redirect).
