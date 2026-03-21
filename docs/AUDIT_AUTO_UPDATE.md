# Audit du système d’auto-update (electron-updater)

## 1. Configuration electron-updater (provider, feed, URL)

- **Aucun `setFeedURL()`** dans le code : electron-updater s’appuie uniquement sur la config **publish** du build.
- **Fichier de config au runtime** : dans l’app packagée, `resources/app-update.yml` est généré par electron-builder à partir de `package.json` → `build.publish` :
  - `owner`: dragonal59  
  - `repo`: DarkOrbit-Stats-Tracker-Download  
  - `provider`: github  
  - `releaseType`: release  
  - `vPrefixedTagName`: true  
- **Feed / URL** : avec le provider **GitHub**, il n’y a pas de “feed URL” explicite. electron-updater :
  1. Utilise l’API GitHub pour récupérer la **dernière release** du dépôt.
  2. Cherche dans les **assets** de cette release un fichier de métadonnées (pour Windows NSIS : **`latest.yml`**).
  3. Télécharge l’installer indiqué dans ce YAML (ex. `DOStatsTracker-Setup-v2.3.0.exe`).

Donc la “source de vérité” pour les mises à jour est : **la dernière release GitHub** (tag + assets), pas une URL de feed custom.

---

## 2. Où est défini le publish (package.json / electron-builder)

- **Fichier** : `package.json`, section `"build"` → `"publish"`.
- **Contenu actuel** :
  ```json
  "publish": {
    "provider": "github",
    "owner": "dragonal59",
    "repo": "DarkOrbit-Stats-Tracker-Download",
    "releaseType": "release",
    "vPrefixedTagName": true
  }
  ```
- Il n’y a **pas de fichier** `electron-builder.yml` (ou `.yaml`) à la racine : toute la config build (dont publish) est dans `package.json`.
- **Script build** : `"build": "electron-builder"` — sans cible de publish. Pour **publier** sur GitHub il faut lancer explicitement une commande qui publie, par ex. :
  - `npx electron-builder --win --publish always`
  - ou un script du type `"release": "electron-builder --win --publish always"`.

---

## 3. Génération et emplacement de `latest.yml`

- **Génération** : **electron-builder** génère `latest.yml` lors du build Windows (cible NSIS), dans le répertoire **`dist/`** à la racine du projet.
- **Contenu typique** (ex. `dist/latest.yml`) :
  - `version` (ex. 2.3.0)
  - `files` (URL relative de l’exe, sha512, size)
  - `path`, `sha512`, `releaseDate`
- **Rôle** : ce fichier est le **manifeste** que electron-updater télécharge pour savoir s’il y a une version plus récente et quel fichier télécharger.
- **Où le placer pour une release GitHub** : **`latest.yml` doit être un asset de la release GitHub**, au même niveau que le `.exe` (et éventuellement le `.blockmap`).  
  - Si vous publiez avec `electron-builder --publish always`, il est uploadé automatiquement avec l’exe.  
  - Si vous créez la release à la main : il faut **joindre explicitement** le fichier `dist/latest.yml` (renommé ou non selon ce qu’attend le client ; pour le provider GitHub, le nom attendu pour Windows est en pratique **`latest.yml`**).
- **Cause très fréquente** d’auto-update “qui ne marche pas alors que la release existe” : la release contient bien le `.exe` mais **pas** l’asset **`latest.yml`**. Sans ce fichier, electron-updater ne peut pas résoudre la mise à jour.

---

## 4. initAutoUpdater : initialisation de _autoUpdater et conditions de non-initialisation

- **Fichier** : `electron/auto-updater.js`.
- **Appel** : dans `main.js`, dans le handler `app.on('ready')` :
  - `autoUpdateManager = initAutoUpdater(mainWindow, pkg)` (à ce moment `mainWindow` est encore `null`).
  - Puis `createWindow()` → à l’intérieur, `autoUpdateManager.setWindowRef(mainWindow)` pour que l’auto-updater envoie les événements à la bonne fenêtre.
  - Puis `autoUpdateManager.setup()`.

**Quand `_autoUpdater` n’est pas initialisé (setup ne fait rien) :**

1. **`!app.isPackaged`**  
   Au tout début de `setup()` : `if (!app.isPackaged) return;`  
   → En **développement** (`electron .`), l’auto-updater n’est **jamais** initialisé : pas de `require('electron-updater')`, pas d’écoute d’événements, pas de `checkForUpdates()`. Aucune erreur, mais aucun update.

2. **Exception dans `setup()`**  
   Si `require('electron-updater')` ou l’enregistrement des listeners lève une exception, elle est catchée et seulement loguée :  
   `console.warn('[AutoUpdate] setup:', e?.message || e);`  
   → **Erreur silencieuse côté UX** : pas de feedback renderer, pas de `update-error` si l’échec a lieu avant la pose des listeners.

**Résumé** :  
- En dev : pas d’init volontaire.  
- En packagé : init uniquement si `app.isPackaged` et si `setup()` ne lève pas.

---

## 5. Remontée des événements (update-available / update-not-available / error) vers le renderer

- **Côté main** (`electron/auto-updater.js`) :  
  Dans `setup()`, des handlers sont enregistrés sur `autoUpdater` et appellent une fonction `send(channel, payload)` qui fait :
  - `mainWindow.webContents.send(channel, payload)`  
  (avec vérification `mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents`).

- **Canaux utilisés** :
  - `update-checking` (checking-for-update)
  - `update-available` (avec payload `{ version }` après validation semver + optionnel critical)
  - `update-not-available`
  - `update-downloaded`, `update-download-progress`, `update-error`
  - `update-critical-available`, `update:installing`

- **Côté preload** (`src/preload.js`) :  
  `contextBridge.exposeInMainWorld('electronAppUpdater', { ... })` expose des setters qui enregistrent des listeners IPC :
  - `onChecking`, `onUpdateAvailable`, `onUpdateNotAvailable`, `onUpdateError`, `onUpdateDownloaded`, `onDownloadProgress`, `onCriticalAvailable`, `onInstalling`
  - `checkForUpdates()` envoie `ipcRenderer.send('update:check')`.

- **Côté renderer** :  
  Les écrans qui s’abonnent (ex. onglet “À propos” dans `account-panel.js`) appellent `window.electronAppUpdater.onUpdateAvailable(...)`, etc. Ces callbacks sont invoqués quand le main envoie les événements correspondants.

**Référence de fenêtre** :  
Au moment de `initAutoUpdater(mainWindow, pkg)`, `mainWindow` est encore `null`. La référence est mise à jour dans `createWindow()` via `setWindowRef(mainWindow)`. Donc au moment où `setup()` et le premier `checkForUpdates()` (dans un `setImmediate`) s’exécutent, `mainWindow` est déjà défini et les `send()` partent bien vers la fenêtre principale.

---

## 6. Erreurs silencieuses possibles dans le flux

1. **`latest.yml` absent de la release GitHub**  
   L’appel API renvoie bien une release, mais electron-updater ne trouve pas le fichier de métadonnées attendu (ex. `latest.yml`). Comportement typique : échec ou réponse “pas de mise à jour” / erreur peu explicite, sans message clair dans l’UI. **Vérifier que chaque release contient l’asset `latest.yml`** (généré dans `dist/` lors du build).

2. **Check automatique au démarrage avant que quiconque écoute**  
   `setup()` enchaîne avec `setImmediate(() => autoUpdater.checkForUpdates())`. Les événements (`update-available`, `update-not-available`, `update-error`) sont envoyés tout de suite après. Si l’utilisateur n’a pas encore ouvert l’onglet “À propos” (Compte), les listeners `electronAppUpdater.onUpdateAvailable`, etc., ne sont pas encore enregistrés → **les événements sont émis mais personne ne les reçoit**. L’update peut quand même se télécharger en arrière-plan (côté main), mais **l’UI ne sera pas mise à jour** pour ce premier check. Seul un clic ultérieur sur “Vérifier les mises à jour” (avec l’onglet ouvert) garantit un feedback visible.

3. **Exception dans `setup()`**  
   Toute exception avant ou pendant l’enregistrement des listeners est seulement loguée en `console.warn`. Le renderer ne reçoit aucun `update-error` pour cet échec d’init → **échec silencieux** pour l’utilisateur.

4. **`checkForUpdates()` rejeté sans remontée au renderer**  
   Les appels `autoUpdater.checkForUpdates().catch(...)` ne font que `console.warn`. En cas d’échec (réseau, API GitHub, etc.), **aucun `send('update-error', ...)` n’est fait** pour ces erreurs de “check” (contrairement aux erreurs sur l’événement `error` de l’autoUpdater ou sur `downloadUpdate()`). Donc l’utilisateur peut ne rien voir si le problème survient au stade de la vérification.

5. **Version “disponible” filtrée côté main**  
   En `update-available`, une comparaison semver impose que la version distante soit **strictement supérieure** à la version courante. Si elle est égale ou inférieure, le main envoie `update-not-available` au lieu de `update-available`. C’est voulu, mais en cas de tag/version mal formatée côté release (ex. préfixe `v`, chaîne vide), le comportement peut sembler “silencieux” (toujours “à jour” ou “erreur” selon le cas).

6. **Build sans publish**  
   Si on lance uniquement `npm run build` (sans `--publish always`), les artefacts sont produits dans `dist/` mais **rien n’est envoyé sur GitHub**. Une release créée manuellement sans y joindre **`latest.yml`** (copie de `dist/latest.yml`) restera invisible pour electron-updater.

---

## 7. Synthèse : pourquoi l’auto-update peut ne pas fonctionner “malgré une release correcte”

- **Cause la plus probable** : la release GitHub ne contient **pas** l’asset **`latest.yml`** (ou pas sous le nom attendu). Sans lui, electron-updater ne peut pas savoir quelle version/quel fichier télécharger.
- **À faire** :  
  - Soit publier avec `electron-builder --win --publish always` pour que `latest.yml` soit uploadé avec l’exe.  
  - Soit, en release manuelle, **ajouter** le fichier `dist/latest.yml` comme asset de la release (nom : **`latest.yml`**).
- **Autres points à vérifier** :  
  - Tag de la release cohérent avec `vPrefixedTagName: true` (ex. `v2.3.0`).  
  - Écouter les `console.warn` du main (et éventuellement exposer un `update-error` pour les échecs de `checkForUpdates()`).  
  - S’assurer que l’onglet “À propos” (ou tout écran qui écoute les événements) est chargé avant le premier check si on veut un retour visuel immédiat.
