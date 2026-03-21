# Workflow de release — DO Stats Tracker

Ce document décrit les étapes pour publier une nouvelle version de l’application et mettre à jour le site vitrine.

## Prérequis

- **Repo GitHub** : [dragonal59/DarkOrbit-Stats-Tracker-Download](https://github.com/dragonal59/DarkOrbit-Stats-Tracker-Download)
- **Build** : `npm run build` génère `dist/DOStatsTracker-Setup.exe`
- **changelog.json** : source de vérité pour l’app (auto-update) et le site vitrine (affichage)

---

## Étapes de release

### 1. Mettre à jour `changelog.json`

À la **racine du projet**, ouvrir `changelog.json` et ajouter la nouvelle version **en tête** du tableau `versions` :

```json
{
  "versions": [
    {
      "version": "2.2.0",
      "date": "2026-03-15",
      "type": "standard",
      "changes": {
        "nouveautés": ["…"],
        "améliorations": ["…"],
        "corrections": ["…"]
      }
    },
    { "version": "2.1.0", "date": "2026-03-02", "type": "standard", "changes": { … } }
  ]
}
```

- **`type`** : `"standard"` (mise à jour en arrière-plan, install au prochain redémarrage) ou `"critical"` (blocage immédiat, modale obligatoire).
- Conserver les anciennes entrées pour l’historique.

### 2. Bumper la version dans `package.json`

Modifier `version` pour qu’elle corresponde à la release :

```json
"version": "2.2.0"
```

Vérifier aussi :

- `"name": "do-stats-tracker"`
- `"productName": "DO Stats Tracker"`

### 3. Builder l’application

```bash
npm run build
```

Le fichier généré doit être : **`dist/DOStatsTracker-Setup.exe`** (nom fixe pour l’URL de téléchargement).

### 4. Créer une GitHub Release

1. Aller sur :  
   `https://github.com/dragonal59/DarkOrbit-Stats-Tracker-Download/releases/new`
2. **Tag** : créer un tag **`vX.X.X`** (ex. `v2.2.0`) — le préfixe `v` est requis par electron-updater.
3. **Titre** : par ex. « Release v2.2.0 ».
4. **Description** : coller ou adapter le contenu du changelog de cette version.
5. **Fichiers** :
   - Uploader **`DOStatsTracker-Setup.exe`** (depuis `dist/`).
   - (Optionnel) Uploader **`changelog.json`** si vous le publiez depuis ce repo (sinon le garder dans l’autre repo et le pousser sur `main`).

### 5. Publier `changelog.json` sur le repo Download

Pour que l’app et le site vitrine lisent le bon changelog :

- Soit vous avez copié `changelog.json` dans le repo **DarkOrbit-Stats-Tracker-Download** et vous le commitez sur la branche **master**.
- Soit l’URL utilisée est :  
  `https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json`  
  → le fichier doit donc exister à la racine de ce repo, branche `master`.

```bash
# depuis le repo DarkOrbit-Stats-Tracker-Download (clone séparé si besoin)
git add changelog.json
git commit -m "changelog: v2.2.0"
git push origin main
```

### 6. Vérifications

| Élément | Statut |
|--------|--------|
| L’app notifie les utilisateurs (nouvelle version disponible) | ✅ |
| Le site vitrine affiche le nouveau changelog (fetch sur l’URL raw) | ✅ |
| Le bouton « Télécharger » pointe sur la dernière release (latest) | ✅ |

**URL de téléchargement directe :**  
`https://github.com/dragonal59/DarkOrbit-Stats-Tracker-Download/releases/latest/download/DOStatsTracker-Setup.exe`

---

## Récapitulatif

1. Mettre à jour **changelog.json** (nouvelle version en tête).
2. Bumper la version dans **package.json**.
3. Lancer **`npm run build`** (electron-builder).
4. Créer une **GitHub Release** avec le tag **vX.X.X** sur le repo **DarkOrbit-Stats-Tracker-Download**.
5. Uploader **DOStatsTracker-Setup.exe** dans cette release.
6. Pusher **changelog.json** sur le repo (branch **main**) pour que l’URL raw soit à jour.

Après cela :

- L’app (electron-updater) notifie les utilisateurs et propose la mise à jour (standard ou critique selon `type`).
- Le site vitrine charge le changelog dynamiquement et affiche la version courante à côté du bouton télécharger.

---

## NSIS (installateur Windows)

La configuration dans `package.json` utilise déjà :

- **oneClick: false** — l’utilisateur choisit le dossier d’installation.
- **installerLanguages: ["fr"]**, **language: "1036"** — installateur en français.
- **shortcutName: "DO Stats Tracker"** — nom affiché.
- **installerIcon / uninstallerIcon** : `src/img/icon_app/icon_app.ico`.

Les champs **installerHeaderIcon**, **installerSidebar**, **uninstallerSidebar** ne sont pas définis pour éviter une erreur de build si les assets sont absents. Si vous ajoutez un fichier **installer-sidebar.bmp** (164×314 px recommandé), vous pouvez les ajouter dans la section **nsis** de **build** (ex. `"installerSidebar": "assets/installer-sidebar.bmp"`).
