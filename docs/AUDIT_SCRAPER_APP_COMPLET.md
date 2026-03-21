# Audit complet — Application Scraper (fenêtre Electron)

**Date :** 15 mars 2026  
**Périmètre :** Fenêtre Scraper uniquement (Dashboard, Serveurs, Console log, Planning, Visualisation, Paramètres) — IPC, entrées, persistance, bugs, visuel.  
**Règle :** Analyse uniquement, aucune modification de code.

---

## 1. Résumé

L’app Scraper est une fenêtre Electron secondaire (React) avec sidebar, flux live DOSTATS, console log, pages Serveurs / Visualisation / Planning / Paramètres. Plusieurs points bloquent ou limitent l’usage : **persistance des paramètres absente** (load/save Settings non exposés en IPC), **Planning et état Serveurs purement locaux** (non reliés au main), **scraping DOSTATS qui renvoie 0 entrée** (hors périmètre « cause exacte »). Les IPC DOSTATS (get-ranking, scraper:start, logs) et les contrôles de fenêtre sont cohérents. Des incohérences visuelles ou de libellés (ex. « scraper » dans le log, « Console log » vs « proxies ») et des APIs exposées mais non utilisées (electronScraperWindow, electronScrapingConfig dans l’UI Scraper) complètent le tableau.

---

## 2. IPC — Cartographie et cohérence

### 2.1 Canaux utilisés par l’app Scraper

| API exposée (preload) | Canal(s) IPC | Utilisation dans l’app Scraper |
|----------------------|-------------|---------------------------------|
| `electronAPI` (minimize, maximize, close) | `window:controls:*` | TitleBar.jsx ✅ |
| `electronDostatsScraper.start` | `dostats-scraper:start` | ServeursPage (bouton scrape par serveur) ✅ |
| `electronDostatsScraper.onLog` | `dostats:log` (receive) | ScraperUI (scraperLogs), useLiveLogs, ConsoleLogPage ✅ |
| `electronDostatsScraper.getRanking` | `dostats:get-ranking` | VisualisationPage ✅ |
| `electronDostatsProfilesScraper.start` | `dostats-profiles-scraper:start` | (non vu dans les pages auditées) |
| `electronScrapingConfig.get` / `save` | `scraping:get-config`, `scraping:save-config` | **Non utilisés** par Paramètres (voir 3.1) |
| `electronScheduler.getConfig` / `saveConfig` / `reload` | `scheduler:*` | **Non utilisés** par Planning (voir 3.2) |
| `electronHofPlanning.get` / `save` / `onNext` / `runStarted` / `runEnded` | `hof-planning:*`, `hof-run:*` | **Non utilisés** par Planning (voir 3.2) |
| `electronScraperWindow.open` | `scraper-window:open` | N/A (ouvrir la fenêtre = depuis l’app principale) |
| `electronScraperWindow.openOutputDir` (via scraperBridge) | `scraper-window:open-output-dir` | **Non utilisé** dans l’UI Scraper (pas de bouton « Ouvrir dossier sortie ») |

**Cohérence main / preload :** Les handlers `dostats:get-ranking`, `dostats-scraper:start`, `scraper-window:open-output-dir`, `window:controls:*` existent dans main.js et ciblent la bonne fenêtre (event.sender pour les contrôles). Aucune incohérence de signature relevée sur ces canaux.

### 2.2 Points d’attention IPC

- **scraping:get-config** : le main lit via `mainWindow.webContents.executeJavaScript` (storage du **main**), pas la fenêtre scraper. Si seul le Scraper est ouvert, `mainWindow` peut être la fenêtre principale ; selon l’ordre d’ouverture, la config lue peut ne pas être celle « vue » par l’utilisateur dans le Scraper.
- **Paramètres** n’appellent pas `electronScrapingConfig` mais `electronAPI.loadSettings` / `saveSettings`, qui **ne sont pas exposés** dans le preload (voir 3.1).

---

## 3. Persistance des réglages

### 3.1 Paramètres (page Paramètres)

- **useSettings.js** : au chargement appelle `window.electronAPI.loadSettings()`, à la sauvegarde `window.electronAPI.saveSettings(settings)`.
- **preload.js** : `electronAPI` ne contient **pas** `loadSettings` ni `saveSettings`.
- **Conséquence :** Au chargement, `loaded` est toujours `undefined`, les paramètres restent ceux de `DEFAULT_SETTINGS`. Au clic « Sauvegarder », aucun IPC n’est envoyé ; les changements ne sont que en mémoire et sont **perdus au rechargement ou à la fermeture**.  
- **Risque :** L’utilisateur croit sauvegarder (proxies, scraper, base de données, notifications, apparence) alors qu’aucune persistance n’existe.

### 3.2 Planning

- **usePlanning.js** : état local uniquement (`MOCK_SCHEDULES`, `MOCK_BANNED`). Aucun appel à `electronScheduler` ou `electronHofPlanning` pour charger/sauvegarder.
- **Conséquence :** Schedules et listes de bannissement ne sont pas persistés ni synchronisés avec le main (scheduler / HOF planning). Rechargement = retour aux mocks.

### 3.3 Serveurs (état UI)

- **useServersState.js** : état dérivé de `SERVER_GROUPS` (mock) et `toggleServer` en local. Aucune persistance, aucun lien avec un état côté main.  
- **Attendu :** Pas nécessairement de persistance pour l’état « running / idle » des cartes, mais à clarifier si un jour le scheduler doit piloter les mêmes serveurs.

### 3.4 Données DOSTATS (classements)

- **Lecture :** `getLatestRanking` lit depuis `userData` puis secours `Documents` ✅ (persistance OK).
- **Écriture :** `dostats-scraper` écrit dans `userData/rankings_output/hall_of_fame/...` ✅.

---

## 4. Entrées utilisateur (inputs)

### 4.1 Visualisation

- **Serveur :** `<select>` avec `AVAILABLE_SERVERS` → `value` = `s.code` (ex. `gbl5`). Envoi normalisé (trim, lowercase) vers `getRanking` ✅.
- **Type / Période :** Pills avec `RANKING_TYPES` et `RANKING_PERIODS` → `t.value` / `p.value` envoyés tels quels. Alignés avec les clés du scraper (honor, current, last_24h, etc.) ✅.

### 4.2 Serveurs

- **Bouton scrape :** `onStartScrape(server.code)` → `electronDostatsScraper.start({ serverCode })` ✅. Pas de validation côté UI (code issu de mockServers).

### 4.3 Paramètres

- **Section Scraper :** range inputs (concurrency, timeoutMs, rateLimitDelay, retries), toggles (headless, blockImages, etc.), textarea User-Agent. Tous pilotent l’état React `settings.scraper` ; la sauvegarde ne persiste pas (cf. 3.1).
- **Sections Proxies, Database, Notifications, Appearance :** idem, état local uniquement, pas de persistance réelle.

### 4.4 Planning

- **Ajout / édition / suppression de schedules, ban / unban :** tout est en state local (usePlanning). Aucun envoi au main.

### 4.5 Console log

- **Filtres, recherche, commandes (/clear, /freeze, etc.) :** gérés dans useConsoleLogs ; les logs « scraper » viennent de `scraperLogs` (dostats:log). Pas de problème d’input identifié.

---

## 5. Bugs et incohérences

### 5.1 Critiques

1. **Paramètres non persistés** : `loadSettings` / `saveSettings` absents du preload → aucune sauvegarde des réglages (proxies, scraper, database, notifications, appearance).
2. **Planning non relié au main** : pas d’appel à `electronScheduler` / `electronHofPlanning` → plannings et bans non sauvegardés ni rejoués par le moteur du main.

### 5.2 Mineurs / UX

3. **Libellé « scraper » dans LiveFeed** : la propriété affichée sous le message est `log.scraper`, alimentée par `log.server || log.metric_type`. Donc on affiche plutôt le serveur ou le type de métrique ; le libellé « scraper » peut prêter à confusion.
4. **Bouton « Ouvrir dossier sortie »** : `scraper-window:open-output-dir` est exposé (via electronScraperWindow / scraperBridge) mais aucun bouton dans l’UI Scraper ne l’appelle → l’utilisateur ne peut pas ouvrir le dossier des classements depuis le Scraper.
5. **Scraping DOSTATS 0 entrée** : comportement actuel connu ; l’audit ne détermine pas la cause (contenu page, délais, sélecteurs, etc.) mais le symptôme est un échec systématique d’extraction.

### 5.3 Données et filtrage

6. **Filtrage par serveur** : getLatestRanking filtre bien par `requested` serveur ; à l’enregistrement le scraper ne garde que les entrées du serveur demandé. Cohérent avec l’intention « un fichier = un serveur ».

---

## 6. Problèmes visuels

### 6.1 Déjà traités (rapports précédents)

- **Tableau Visualisation** : colonnes (rang, joueur, firme, serveur, points) réorganisées avec largeurs et débordements gérés (visualisation.css) pour éviter que les valeurs se chevauchent.

### 6.2 Vérifications rapides

- **TitleBar** : boutons minimize / maximize / close ; pas de `electronAPI` spécifique au Scraper, même preload que le main → OK.
- **Sidebar** : « Console log » pour l’id `proxies` → légère incohérence sémantique (proxies vs console) mais compréhensible.
- **LiveFeed** : icônes par type (success ✅, error ❌, warning ⚡, info ℹ️) ; après correction récente, 0 entrée = type `error` → croix rouge ✅.
- **ConsoleLogRow** : badge par type (INFO, OK, WARN, ERROR) avec couleurs ; pas d’anomalie relevée.

### 6.3 Données mock / statiques

- **Dashboard** : KPI, graphiques (VolumeAreaChart, SuccessErrorBarChart), ScraperTable basés sur mockData / kpiData / scrapers → pas de lien avec des vrais compteurs du scraper.
- **Sidebar** : « Moteur de scraping prêt », « Quota utilisé 0% » → statique, non branché sur l’état réel.

---

## 7. Synthèse des risques

| Zone | Risque | Gravité |
|------|--------|--------|
| Paramètres | Aucune persistance ; utilisateur croit sauvegarder | Élevée |
| Planning | Données non synchronisées avec le main, non persistées | Élevée |
| scraping:get-config | Lecture depuis mainWindow (contexte principal) quand on est dans le Scraper | Moyenne |
| Ouvrir dossier sortie | Impossible depuis l’UI Scraper | Faible |
| Libellé « scraper » dans les logs | Confusion possible | Faible |
| Dashboard / Sidebar | Données et statuts fictifs | Faible (affichage) |

---

## 8. Points à clarifier (sans modifier le code)

1. **Paramètres :** Souhait-on une persistance via un stockage dédié (fichier userData, ou clé localStorage du **Scraper**) et exposer `loadSettings` / `saveSettings` dans le preload + les implémenter dans le main pour la fenêtre Scraper ?
2. **Planning :** Les plannings et bans doivent-ils être gérés par le main (scheduler / hof-planning) et chargés/sauvegardés via `electronScheduler` / `electronHofPlanning`, ou rester une maquette locale ?
3. **scraping:get-config / save-config :** Doivent-ils servir la fenêtre Scraper (et dans ce cas lire/écrire le storage de la fenêtre courante ou un fichier commun) ou uniquement la fenêtre principale ?
4. **Bouton « Ouvrir dossier sortie » :** Faut-il l’ajouter (ex. dans Paramètres > Scraper ou en bas de la page Visualisation) et l’associer à `openOutputDir` ?

---

## 9. Checklist rapide (référence)

- [ ] IPC DOSTATS (start, getRanking, onLog) : cohérents et utilisés
- [ ] Contrôles de fenêtre (minimize, maximize, close) : OK pour la fenêtre Scraper
- [ ] Persistance classements (userData + fallback Documents) : OK
- [ ] **Persistance paramètres (load/save Settings) : absente**
- [ ] **Persistance planning / scheduler : non branchée**
- [ ] Visualisation (sélecteurs serveur/type/période) : normalisation et filtrage OK
- [ ] Affichage 0 entrée = erreur (croix rouge) : en place
- [ ] Bouton ouvrir dossier sortie dans le Scraper : manquant
- [ ] Données Dashboard / Sidebar : mock, non liées au moteur
