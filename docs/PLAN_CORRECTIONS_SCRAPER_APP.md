# Plan de corrections — Application Scraper

**Référence :** AUDIT_SCRAPER_APP_COMPLET.md  
**Ordre :** du plus critique au plus insignifiant. Chaque étape peut être réalisée et testée indépendamment.

---

## Priorité 1 — Critique

### Étape 1.1 — Persistance des paramètres (load / save)

**Problème :** Les réglages (Paramètres) ne sont jamais sauvegardés ni rechargés : `loadSettings` et `saveSettings` ne sont pas exposés dans le preload, donc aucun IPC n’est envoyé.

**Actions :**

1. **Main** — Créer un fichier de config dédié au Scraper (ex. `userData/scraper-app-settings.json`). Ajouter deux handlers IPC :
   - `scraper-app:load-settings` → lit le fichier, renvoie l’objet (ou défaut si absent / erreur).
   - `scraper-app:save-settings` → reçoit l’objet, le valide (structure alignée sur `defaultSettings.js`), écrit le fichier.
2. **Preload** — Exposer sur une API dédiée au Scraper (ex. `electronScraperAppSettings` ou sur `electronAPI`) :
   - `loadSettings: () => ipcRenderer.invoke('scraper-app:load-settings')`
   - `saveSettings: (settings) => ipcRenderer.invoke('scraper-app:save-settings', settings)`
3. **useSettings.js** — S’assurer que le chargement appelle bien cette API (déjà `window.electronAPI?.loadSettings` / `saveSettings`). Si l’API est exposée sous un autre nom (ex. `electronScraperAppSettings`), adapter les appels dans useSettings.

**Fichiers à modifier :** `main.js`, `src/preload.js`, éventuellement `src/scraper_app/hooks/useSettings.js` (si changement de nom d’API).

**Validation :** Ouvrir Paramètres, modifier une valeur (ex. concurrency), cliquer Sauvegarder, fermer la fenêtre Scraper et rouvrir → les valeurs doivent être conservées.

---

### Étape 1.2 — Planning relié au main (scheduler / HOF)

**Problème :** Le Planning ne charge ni ne sauvegarde rien côté main ; tout est en state local (mocks). Les plannings et bans ne sont pas utilisés par le scheduler ni par le HOF planning.

**Actions :**

1. **Chargement au montage** — Dans la page Planning (ou un hook dédié), au montage :
   - Appeler `electronScheduler.getConfig()` pour les créneaux (slots).
   - Appeler `electronHofPlanning.get()` pour la config HOF et `getHistory()` si besoin.
   - Mapper la réponse du main vers le format attendu par `usePlanning` (schedules, banned) ou adapter usePlanning pour accepter le format main.
2. **Sauvegarde** — Lors d’un « Save » ou « Appliquer » dans le Planning :
   - Construire le payload attendu par `scheduler:saveConfig` (ex. `{ slots: [...] }`).
   - Appeler `electronScheduler.saveConfig(payload)`.
   - Si la page gère aussi la config HOF (groupes, prochaine run), appeler `electronHofPlanning.save(config)`.
3. **Cohérence des formats** — Comparer `loadSchedulerConfig()` / `saveSchedulerConfig()` dans main.js et la structure des mocks (mockPlanning, usePlanning). Si les formats diffèrent, soit adapter le main pour accepter le format UI, soit adapter l’UI pour utiliser le format main (sans casser le scheduler existant).

**Fichiers à modifier :** `src/scraper_app/pages/PlanningPage.jsx`, `src/scraper_app/hooks/usePlanning.js`, éventuellement `src/scraper_app/data/mockPlanning.js` (pour alignement). Vérifier `main.js` (scheduler, hof-planning) pour les contrats.

**Validation :** Modifier un planning ou un ban, sauvegarder, fermer et rouvrir le Scraper → les données doivent être rechargées depuis le main. Optionnel : déclencher un run planifié et vérifier que le main utilise bien ces données.

---

## Priorité 2 — Important

### Étape 2.1 — Config scraping lue depuis le bon contexte

**Problème :** `scraping:get-config` exécute du JS dans `mainWindow` (fenêtre principale). Si l’utilisateur n’utilise que le Scraper, la config lue peut être vide ou celle du main, pas celle du Scraper.

**Actions :**

1. **Option A (recommandée si Paramètres Scraper = source de vérité)**  
   Ne plus utiliser `scraping:get-config` pour la page Paramètres du Scraper. À la place, utiliser uniquement `scraper-app:load-settings` (étape 1.1). Ainsi la config « Scraper » est toujours lue depuis le fichier `scraper-app-settings.json`, quel que soit la fenêtre ouverte.
2. **Option B**  
   Si une partie des réglages doit rester partagée avec le main (ex. heures planifiées), faire en sorte que `scraping:get-config` lise soit depuis un fichier commun (userData), soit depuis la fenêtre qui a appelé l’IPC (event.sender) si le storage y est disponible. Documenter clairement quelle fenêtre est la source de vérité.

**Fichiers à modifier :** Selon option — soit seulement s’assurer que Paramètres Scraper utilise uniquement load/save settings (étape 1.1) ; soit `main.js` (scraping:get-config) et éventuellement preload.

**Validation :** Modifier des réglages dans le Scraper, sauvegarder, vérifier que après rechargement on retrouve bien ces réglages (et pas ceux du main si différents).

---

### Étape 2.2 — Bouton « Ouvrir dossier sortie »

**Problème :** L’IPC `scraper-window:open-output-dir` existe mais aucun bouton dans l’UI Scraper ne l’appelle.

**Actions :**

1. Exposer l’API dans le preload pour la fenêtre Scraper (déjà fait via `electronScraperWindow.openOutputDir` ou scraperBridge — vérifier le nom exact utilisé par la fenêtre Scraper).
2. Ajouter un bouton dans l’UI Scraper qui appelle cette API (ex. « Ouvrir dossier des classements »). Emplacements possibles :
   - Paramètres → section Scraper ou Database, ou
   - En bas de la page Visualisation (à côté du texte « Lancez un scrape ou chargez un classement »), ou
   - Dans la barre d’outils / header de la page Visualisation.

**Fichiers à modifier :** `src/scraper_app/components/parametres/sections/SectionScraper.jsx` ou `SectionDatabase.jsx`, ou `src/scraper_app/pages/VisualisationPage.jsx`, ou un composant commun. Vérifier que la fenêtre Scraper a bien accès à `window.electronScraperWindow` ou `window.scraperBridge` (nom dans preload).

**Validation :** Cliquer sur le bouton → le dossier `userData/rankings_output` (ou équivalent) s’ouvre dans l’explorateur.

---

## Priorité 3 — Mineur / UX

### Étape 3.1 — Libellé « scraper » dans le flux live

**Problème :** Sous chaque message du LiveFeed, on affiche une propriété nommée `scraper` alors qu’elle contient en fait le serveur ou le type de métrique (`log.server || log.metric_type`).

**Actions :**

1. Dans le composant qui affiche la ligne de log (ex. LiveFeed.jsx), soit renommer la propriété affichée (ex. « Serveur / type » ou « Contexte »), soit afficher deux champs courts : `log.server` et `log.metric_type` quand ils sont présents.
2. Optionnel : dans useLiveLogs, nommer la propriété du state de façon plus explicite (ex. `context` au lieu de `scraper`) pour cohérence avec le rendu.

**Fichiers à modifier :** `src/scraper_app/components/LiveFeed.jsx`, éventuellement `src/scraper_app/hooks/useLiveLogs.js`.

**Validation :** Lancer un scrape et vérifier que les lignes du flux live affichent un libellé compréhensible (ex. « gbl5 » ou « honor ») au lieu d’un terme générique « scraper » trompeur.

---

### Étape 3.2 — Incohérence Sidebar : « Console log » vs id `proxies`

**Problème :** L’entrée de menu est labellisée « Console log » mais l’id de page est `proxies`. Peut prêter à confusion (proxies vs logs).

**Actions :**

1. Soit renommer l’id en `console` (ou `consoleLog`) et adapter partout où `currentPage === 'proxies'` (ScraperUI.jsx, etc.).
2. Soit garder l’id et changer le libellé en « Console » ou « Logs » pour rester cohérent avec le contenu (liste de logs). Éviter « Proxies » si la page affiche bien la console et pas la config des proxies.

**Fichiers à modifier :** `src/scraper_app/components/Sidebar.jsx` (label et/ou id), `src/scraper_app/ScraperUI.jsx` (condition d’affichage de la page si changement d’id).

**Validation :** Vérifier que le bon onglet s’ouvre et que le libellé reflète le contenu.

---

## Priorité 4 — Insignifiant / Cosmétique

### Étape 4.1 — Dashboard / Sidebar : données réelles (optionnel)

**Problème :** KPI, graphiques et texte « Moteur de scraping prêt », « Quota utilisé 0% » sont en mock / statique.

**Actions :**

1. Si on souhaite afficher des indicateurs réels : définir des IPC ou des événements (ex. `dostats:log` ou un nouvel event `scraper-app:stats`) qui remontent des compteurs (nombre de scrapes aujourd’hui, succès/échec, dernier run).
2. Brancher les composants (KPICard, VolumeAreaChart, SuccessErrorBarChart, bloc « Quota ») sur ces données au lieu des mocks.
3. Si on garde le mock pour l’instant : ajouter une mention discrète « Données de démonstration » pour ne pas induire en erreur.

**Fichiers à modifier :** `src/scraper_app/ScraperUI.jsx`, `src/scraper_app/mockData.js`, composants Dashboard et Sidebar concernés ; éventuellement main + preload si nouveaux events.

**Validation :** Soit les chiffres reflètent l’activité réelle, soit le caractère démo est clair.

---

### Étape 4.2 — Scraping DOSTATS 0 entrée (investigation séparée)

**Problème :** Le scraper renvoie systématiquement 0 entrée. Hors périmètre « correction immédiate » mais à traiter pour que l’app soit pleinement utile.

**Actions (sans ordre imposé) :**

1. **Debug visuel** : temporairement afficher la fenêtre de scraping (`show: true`), vérifier que la page DOSTATS se charge et que le tableau est bien rendu (structure HTML, délais).
2. **URL / paramètres** : confirmer que les URLs utilisées (casse, query params) sont celles attendues par le site (tu as déjà fourni des exemples d’URL ; les aligner si besoin).
3. **Sélecteurs / timing** : vérifier que l’extraction cible le bon `table` et attend assez longtemps (waitForHallOfFameTable, délai initial). Si le site change de structure, adapter les sélecteurs.
4. **Extension / User-Agent** : tester avec une extension (anti-pub / anti-captcha) dans la fenêtre Electron ou un User-Agent différent si le site restreint l’accès.

**Fichiers concernés :** `electron/dostats-scraper.js` (URLs, attente, sélecteurs, optionnel : chargement d’extension).

**Validation :** Au moins une combinaison serveur/type/période renvoie des entrées et elles s’affichent en Visualisation.

---

## Récapitulatif par priorité

| Priorité | Étape | Thème | Effort estimé |
|----------|--------|--------|----------------|
| 1 | 1.1 | Persistance paramètres (load/save) | Moyen |
| 1 | 1.2 | Planning relié au main | Moyen à élevé |
| 2 | 2.1 | Config scraping bon contexte | Faible (si Option A) |
| 2 | 2.2 | Bouton ouvrir dossier sortie | Faible |
| 3 | 3.1 | Libellé « scraper » dans LiveFeed | Faible |
| 3 | 3.2 | Sidebar « Console log » vs `proxies` | Faible |
| 4 | 4.1 | Dashboard / Sidebar données réelles | Optionnel, variable |
| 4 | 4.2 | DOSTATS 0 entrée (investigation) | Variable |

---

## Ordre d’exécution recommandé

1. **Étape 1.1** — Persistance paramètres (impact direct sur l’usage quotidien).
2. **Étape 2.2** — Bouton ouvrir dossier (rapide, utile tout de suite).
3. **Étape 3.1** — Libellé LiveFeed (rapide, moins de confusion).
4. **Étape 3.2** — Sidebar console/proxies (rapide).
5. **Étape 2.1** — Config scraping bon contexte (dépend de 1.1 si Option A).
6. **Étape 1.2** — Planning relié au main (plus de travail, formats à aligner).
7. **Étape 4.1** — Dashboard données réelles (optionnel).
8. **Étape 4.2** — Investigation DOSTATS 0 entrée (en parallèle ou après selon dispo).

Une fois 1.1 et 2.2 faites, l’utilisateur peut au moins sauver ses réglages et ouvrir le dossier des classements. Les étapes 3.x améliorent la clarté sans risque. Le Planning (1.2) et la config scraping (2.1) peuvent suivre selon la priorité métier du projet.
