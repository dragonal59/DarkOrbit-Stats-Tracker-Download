# TODO — Scraper DOSTATS (IPC & fenêtres)

Liste des tâches liées à l’IPC et au comportement de la fenêtre Scraper DOSTATS.

---

## Fenêtre scraper indépendante

- [x] **Rendre la fenêtre scraper indépendante de la fenêtre principale**  
  - Suppression de `parent: mainWindow` à la création de `scraperWindow` dans `main.js`.  
  - Résultat : afficher ou masquer une fenêtre n’affecte plus l’autre (chacune a son propre show/hide).

---

## IPC / Paramètres

- [ ] **Exposer `loadSettings` / `saveSettings` (Paramètres Scraper)**  
  - `useSettings` (Scraper) appelle `electronAPI.loadSettings()` et `electronAPI.saveSettings(settings)` qui ne sont pas exposés dans le preload.  
  - À faire : exposer ces méthodes dans le preload et implémenter les handlers dans le main (ex. réutiliser ou étendre `scraping:get-config` / `scraping:save-config`), ou faire persister les paramètres Scraper via une autre API existante.

- [ ] **Relier les boutons Serveurs (Play / Pause) à l’IPC scraper**  
  - Actuellement : state React uniquement (running / idle).  
  - À faire : selon le design, appeler le scraper Electron (start/pause par serveur ou groupe) pour que Play/Pause ait un effet réel.

- [ ] **Bouton Config (engrenage) sur ServerCard**  
  - Actuellement : `onClick={() => {}}` (aucune action).  
  - À faire : brancher une action (modal config serveur, etc.) ou retirer le bouton.

- [ ] **Planning : persistance et/ou IPC**  
  - Actuellement : state local uniquement (`usePlanning` + mock).  
  - À faire : si les plannings doivent être sauvegardés ou exécutés par le planificateur côté main, ajouter persistance (fichier/main) et/ou IPC (ex. `hof-planning` ou dédié).

---

*Dernière mise à jour : après découplage fenêtre scraper / fenêtre principale.*
