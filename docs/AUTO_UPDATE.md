# Mise à jour automatique (electron-updater + GitHub Releases)

## GitHub

- **Owner :** dragonal59  
- **Repo :** DarkOrbit-Stats-Tracker-Download  
- **changelog.json (raw) :** https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json  
- **Téléchargement (latest) :** https://github.com/dragonal59/DarkOrbit-Stats-Tracker-Download/releases/latest/download/DOStatsTracker-Setup.exe  

## Architecture

- **.exe** : publié sur GitHub Releases (artifact nommé `DOStatsTracker-Setup.exe`).
- **changelog.json** : à la racine du dépôt + source de vérité pour l’app et le site vitrine.
- **Mise à jour standard** : téléchargement en arrière-plan, redémarrage pour appliquer au **prochain lancement** (pas de blocage).
- **Mise à jour critique** : l’app **bloque immédiatement** et redémarre pour installer.

## 1. Structure du changelog.json

Fichier à la racine du dépôt : `changelog.json`.

- `versions[]` : tableau d’entrées `{ version, date, type, changes }`.
- `type` : `"standard"` ou `"critical"`.
- `changes` : `nouveautés`, `améliorations`, `corrections` (tableaux de chaînes).

URL utilisée par l’app (déduite de `package.json` repository) :  
https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json  
(branche modifiable via `GITHUB_CHANGELOG_BRANCH`).

## 2. Installation

```bash
npm install
```

La dépendance `electron-updater` est déjà dans `package.json`.

## 3. Configuration GitHub

1. **package.json**  
   `repository.url` pointe vers :  
   `https://github.com/dragonal59/DarkOrbit-Stats-Tracker-Download.git`

2. **Build et publication**  
   - Tag Git au format `v2.1.0` (avec le `v`).
   - Build : `npm run build` (génère l’exe dans `dist/`).
   - Créer une **Release** sur GitHub avec ce tag et attacher le `.exe` (et optionnellement `changelog.json`).
   - Pour une release automatique (CI) : utiliser `electron-builder` avec `publish: "always"` et un token GitHub (GH_TOKEN) avec droit de publication.

3. **changelog.json**  
   Conservé à la **racine du dépôt** ; l’app et le site utilisent l’URL raw. Optionnel : l’ajouter aussi en asset de chaque release.

## 4. Comportement dans l’app

- **Au lancement** (uniquement en version packagée) : vérification des mises à jour en arrière-plan.
- **Type lu** depuis `changelog.json` pour la **version disponible** :
  - **critical** : dialogue « Mise à jour critique », puis redémarrage immédiat pour installer.
  - **standard** : téléchargement en arrière-plan ; à la **prochaine fermeture** de l’app, l’installateur s’exécute et l’app redémarre avec la nouvelle version.

## 5. Site vitrine

Le site peut afficher le changelog en récupérant le même `changelog.json` (fetch vers l’URL raw GitHub ci-dessus) et en affichant les entrées `versions[]`.
