# Plan de nettoyage — Scraper DarkOrbit (classement, cookies, captcha, extension)

## Objectif
Supprimer tout ce qui concerne le scraper DarkOrbit classement : extension Chrome, cookies, captcha, serveur HTTP associé.

---

## 1. FICHIERS À SUPPRIMER

### 1.1 Extension Chrome (dossier entier)
| Fichier | Description |
|---------|-------------|
| `src/extensions/scraper/background.js` | Service worker — classement + événements |
| `src/extensions/scraper/blank.html` | Page attente token |
| `src/extensions/scraper/blank.js` | Définit startScraping / startScrapingEvents |
| `src/extensions/scraper/config.js` | Config extension |
| `src/extensions/scraper/content-script.js` | Bridge scraping |
| `src/extensions/scraper/events-scraper.js` | Extraction événements DOM |
| `src/extensions/scraper/grade-mappings.js` | Mapping grades |
| `src/extensions/scraper/login-field-detection.js` | Détection champs login |
| `src/extensions/scraper/scraper.js` | Extraction classement DOM |
| `src/extensions/scraper/start-scraping-bridge.js` | Bridge startScraping |
| `src/extensions/scraper/utils.js` | Utilitaires |
| `src/extensions/scraper/manifest.json` | Manifest extension |

**→ Supprimer le dossier `src/extensions/scraper/` entier**

### 1.2 Fichiers Electron
| Fichier | Description |
|---------|-------------|
| `electron/scraper-manager.js` | Gestionnaire extension, fenêtre, cookies, captcha |
| `electron/scraper-server.js` | Serveur HTTP port 3000 (extension ↔ Main) |

### 1.3 Références build (package.json)
- `asarUnpack`: retirer `"src/extensions/**"` et `"electron/blank.html"`

---

## 2. FICHIERS À MODIFIER

### 2.1 main.js
- Supprimer `const ScraperManager = require('./electron/scraper-manager')`
- Supprimer `ScraperManager.init(mainWindow)` (dans createWindow)
- Supprimer `ScraperManager.cleanup()` (dans app.on('window-all-closed'))
- Supprimer handlers IPC :
  - `scraper:start` → remplacer par appel direct à `runStatisticsForServers` (dostats-ranking-collect)
  - `scraper:startEventsOnly` → **voir impact ci-dessous**
  - `scraper:startDostats`
  - `scraper:pause`, `scraper:stop`, `scraper:getState`
  - `scraper:showDebugWindow`
  - `scraper:setUserContext`
- Supprimer `setScrapingConfig` / `getScrapingConfig` si uniquement utilisés par scraper
- Scheduler : `evenements` → rediriger vers SessionScraper ou désactiver

### 2.2 src/preload.js
- Supprimer ou adapter `electronScraper` :
  - `start` → garder (appelle runStatisticsForServers)
  - `startEventsOnly` → rediriger vers SessionScraper ou retirer
  - `startDostats` → garder
  - `pause`, `stop`, `getState`, `setUserContext`
  - `showDebugWindow` → retirer
  - `onProgress`, `onError`, `onCaptchaRequired`, etc. → adapter

### 2.3 src/index.html
- Supprimer / adapter listeners `electronScraper.onCaptchaRequired`, `onCaptchaDetected`, etc.
- Bouton "Collect Événement" : rediriger vers `session-scraper:start` ou masquer

### 2.4 src/backend/super-admin.js
- Adapter `electronScraper.start()` → appeler directement l’API DOStats
- Adapter `electronScraper.startEventsOnly()` → SessionScraper ou retirer
- Supprimer listeners CAPTCHA (`onCaptchaRequired`, `onCaptchaDetected`, `onCaptchaTimeout`, etc.)
- Supprimer `collectCaptchaBanner`, `collectCaptchaBannerText`, `collectCaptchaBannerTimer`
- Adapter `scrapingSettingsPanel` : retirer paramètres extension (délai serveurs gardé pour DOStats)

### 2.5 src/frontend/super-admin.css
- Supprimer styles `.sa-collect-captcha-banner`, etc.

### 2.6 package.json
- Retirer `"src/extensions/**"` et `"electron/blank.html"` de `asarUnpack`

### 2.7 scraping-config.js
- Vérifier si utilisé uniquement par extension → possiblement simplifier

### 2.8 electron/darkorbit-accounts.js
- Utilisé par SessionScraper, DOStats, dostats-ranking-collect → **garder**

### 2.9 electron/scraping-config.js
- Utilisé par dostats-ranking-collect, dostats-collect-standalone → **garder**

---

## 3. IMPACT SUR LES FONCTIONNALITÉS

| Fonctionnalité | Avant | Après |
|----------------|-------|-------|
| **Démarrer la collecte** | startStatisticsScraping (DOStats) | Inchangé |
| **Collect Événement** | Extension (startEventsOnlyScraping) | **À rediriger vers SessionScraper** ou retirer |
| **Collect DOStats** | runDostatsForServers | Inchangé |
| **Scheduler "événements"** | startEventsOnlyScraping | **À rediriger vers SessionScraper** ou retirer |
| **Session-scraper** | Indépendant (BrowserWindow, pas d’extension) | Inchangé |

**Option pour "Collect Événement"** : SessionScraper fait déjà les événements dans son cycle complet. Il n’a pas de mode "événements seuls". Choix :
- A) Ajouter un mode events-only à SessionScraper
- B) Supprimer le bouton "Collect Événement" et le slot scheduler "événements"

---

## 4. ROUTES SCRAPER-SERVER À SUPPRIMER (si on garde un serveur minimal)

Toutes les routes sont liées à l’extension. Si on supprime scraper-server, tout disparaît :
- `/log`, `/status`, `/progress`, `/execute`
- `/accounts`, `/config`
- `/captcha-detected`, `/captcha-resolved`, `/captcha-wait`
- `/restore-cookies`, `/save-cookies`, `/navigate`
- `/fetch-ranking-page`, `/collect`
- `/error`, `/scraping-done`

**→ Supprimer scraper-server entièrement** (plus de client extension)

---

## 5. DONNÉES / FICHIERS UTILISATEUR

| Fichier | Action |
|---------|--------|
| `scraper-cookies.json` (userData) | Peut rester (SessionScraper utilise `session-scraper-cookies.json`) — ou supprimer au cleanup |
| `scraper-session-refresh.json` | Déjà désactivé — peut supprimer |

---

## 6. ORDRE D’EXÉCUTION RECOMMANDÉ

1. Créer un module `electron/statistics-scraper.js` (ou garder dostats-ranking-collect) qui expose `startStatisticsScraping` sans dépendre de ScraperManager
2. Modifier main.js : remplacer ScraperManager par appels directs
3. Adapter preload.js et super-admin.js (retirer extension, captcha)
4. Décider : Collect Événement → SessionScraper ou retrait
5. Supprimer `electron/scraper-manager.js`, `electron/scraper-server.js`
6. Supprimer `src/extensions/scraper/`
7. Mettre à jour package.json
8. Nettoyer index.html (listeners captcha)
9. Tests

---

## 7. RÉSUMÉ DES SUPPRESSIONS

| Catégorie | Fichiers |
|-----------|----------|
| Extension | 12 fichiers dans `src/extensions/scraper/` |
| Electron | scraper-manager.js, scraper-server.js |
| Build | electron/blank.html, asarUnpack extensions |

---

**En attente de validation avant toute suppression.**
