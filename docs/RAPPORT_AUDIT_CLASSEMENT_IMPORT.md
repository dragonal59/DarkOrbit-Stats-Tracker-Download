# Rapport d'audit — Classement importé non affiché

**Date :** 12 février 2025  
**Objet :** Analyse détaillée du flux d'import du classement fusionné et des causes possibles de l'absence d'affichage.  
**Portée :** Application complète (frontend, backend, sync) + Supabase.

---

## 1. Résumé exécutif

Le classement importé depuis un fichier fusion JSON n'apparaît pas dans l'interface, bien que l'import semble réussir (toast de succès, filtre serveur mis à jour sur « Global PvE 5 (Steam) »). L'analyse identifie **plusieurs points de défaillance possibles** répartis entre le stockage local, la synchronisation Supabase, la chaîne de conversion serveur, le format du fichier fusion et le contexte d'exécution (Electron).

---

## 2. Flux complet (import → affichage)

### 2.1 Import (ranking-import.js)

1. **Sélection du fichier** → `importRankingFile(file)` appelé
2. **Extraction serveur** : `extractServerFromFilename(file.name)` → doit retourner `"gbl5"` (regex `^[a-z]{2,4}\d+$`)
3. **Parsing JSON** → `isFusionFormat(json)` vérifie que `players[0]` a `top_user_rank` ou `honor_rank` ou `experience_rank` (ou camelCase)
4. **Stockage** : `UnifiedStorage.set('darkOrbitImportedRankings', { gbl5: { fusion: { exportedAt, players } } })`
5. **Invalidation cache** : `UnifiedStorage.invalidateCache(key)` sur la clé
6. **Sync** : `DataSync.queueSync()` → push asynchrone vers Supabase
7. **Retour** : `{ success: true, server: 'gbl5', count: N }`

### 2.2 Affichage (ranking-ui.js → ranking.js)

1. **Après import** : `filterServer.value = displayName` (« Global PvE 5 (Steam) »), puis `await load()`
2. **getFilters()** : `server = "Global PvE 5 (Steam)"`, `type = "honor"` (défaut)
3. **loadRanking(filters)** : `displayServer = "Global PvE 5 (Steam)"`, `server = rankingDisplayToCode(displayServer)` → doit être `"gbl5"`
4. **getImportedRanking('gbl5', type)** :
   - lit `UnifiedStorage.get('darkOrbitImportedRankings', {})`
   - accède à `data['gbl5'].fusion.players`
   - filtre les joueurs par `honor_rank` 1–100 (ou xp, général selon type)
   - transforme en format UI
5. **renderRanking(data, type)** : affiche les lignes du tableau

### 2.3 Cas « Tous » (filtre serveur)

1. `server = null` (filtre « Tous »)
2. `getImportedServerList()` → doit retourner `['gbl5']`
3. Pour chaque serveur : `getImportedRanking('gbl5', type)` puis fusion + tri
4. Retour top 100 agrégé

---

## 3. Points de défaillance identifiés

### 3.1 Ordre de chargement des scripts et variables globales

| Script | Chargé | Variables exposées |
|--------|--------|--------------------|
| config.js | Après auth (body) | `SERVERS_LIST`, `SERVER_CODE_TO_DISPLAY`, `SERVER_DISPLAY_TO_CODE` |
| keys.js | Head (avant storage) | `APP_KEYS.STORAGE_KEYS`, `APP_KEYS.SYNC_KEYS` |
| ranking-import.js | Avant ranking.js | `importRankingFile`, `getImportedRanking`, `getImportedServerList` |
| ranking.js | Après ranking-import | `loadRanking`, `RANKING_SERVER_DISPLAY_TO_CODE` |

**Risque :** `SERVERS_LIST`, `SERVER_DISPLAY_TO_CODE`, `SERVER_CODE_TO_DISPLAY` sont définis avec `const` dans `config.js`. En contexte non-module, ils sont dans la portée globale du document mais **pas sur `window`**. Si un script s'exécute avant ou dans un contexte isolé, ces variables peuvent être `undefined`.  
`ranking.js` utilise une copie locale `RANKING_SERVER_DISPLAY_TO_CODE` avec fallback, ce qui limite le risque pour la conversion display → code.

### 3.2 DataSync.pull() — Course critique

**Séquence au démarrage (index.html, DOMContentLoaded) :**
1. `DataSync.migrateIfNeeded()`
2. **`DataSync.pull()`** (await)
3. `DataSync.startPeriodicSync()` (intervalle 5 min)

**Comportement du pull (sync-manager.js) :**
- Lit `user_settings` depuis Supabase
- Pour `imported_rankings_json` : n'écrase le local **que si** le serveur a un objet non vide (`Object.keys(...).length > 0`)
- **À la fin** : `UnifiedStorage?.invalidateCache?.()` **sans argument** → **vide tout le cache mémoire**

**Problème potentiel :**  
Si le pull s'exécute **après** l'import (ex. sync périodique, ou pull lent qui se termine après le clic import) :
- Le serveur peut encore avoir `imported_rankings_json: {}` (sync push pas encore appliquée)
- Le correctif actuel évite d'écraser avec `{}`
- Mais `invalidateCache()` vide tout le cache : le prochain `get()` relira depuis `localStorage`  
→ En théorie, les données devraient toujours être dans `localStorage`. À vérifier en conditions réelles.

### 3.3 Contexte Electron et localStorage

- **loadFile** : `mainWindow.loadFile('src/auth.html')` → origine de type `file://`
- En Electron, `localStorage` est disponible pour `file://` mais peut avoir des limites (quota, persistance selon chemin)
- Pas de `nodeIntegration` ; `contextIsolation: true` → le preload n'expose que Supabase, pas de manipulation du storage

**Risque :** En environnement Electron packagé ou selon la version, des différences de comportement du `localStorage` par rapport au navigateur sont possibles (par ex. stockage par chemin de fichier).

### 3.4 Format du fichier fusion

**Attendu (snake_case) :**
```json
{
  "exportedAt": 1234567890,
  "players": [
    {
      "name": "Joueur1",
      "grade": "Maréchal",
      "top_user_rank": 1,
      "top_user_value": 202152025,
      "honor_rank": 2,
      "honor_value": 4569744698,
      "experience_rank": 2,
      "experience_value": 156505343300
    }
  ]
}
```

**Vérifications dans le code :**
- `isFusionFormat` : exige que le premier joueur ait au moins un de `top_user_rank`, `honor_rank`, `experience_rank` (ou camelCase)
- `getImportedRanking` : filtre `honor_rank` / `experience_rank` / `top_user_rank` entre 1 et 100

**Risques :**
- Si le fichier utilise d’autres noms de champs (ex. `rank` au lieu de `honor_rank`), le filtre renverra 0 joueur
- Si les rangs sont 0-based ou décalés, la condition `r >= 1 && r <= 100` peut exclure tout le monde
- Si le fichier contient plus de 200 joueurs avec des rangs > 100 pour honor/xp, seuls les 1–100 sont affichés (comportement normal)

### 3.5 Extraction du code serveur (extractServerFromFilename)

Regex utilisée : `/^[a-z]{2,4}\d+$/i` pour un segment du nom de fichier.

**Exemples :**
- `"classement 2026-02-14 16-02-58 gbl5 fusion.json"` → `"gbl5"` ✓
- `"gbl5_fusion.json"` → `"gbl5"` ✓
- `"fusion.json"` (sans code) → `null` → import échoue avec message d’erreur

**Risque :** Si le nom de fichier ne contient pas un code de type `gbl5`, `fr1`, etc., l’import échoue. L’utilisateur ayant un toast de succès, ce cas semble écarté.

### 3.6 Clé de stockage et SYNC_KEYS

- Clé : `darkOrbitImportedRankings` (définie dans `keys.js`, `IMPORTED_RANKINGS`)
- Elle est bien dans `SYNC_KEYS` → `UnifiedStorage.set()` déclenche `DataSync.queueSync()`
- `queueSync()` appelle `sync()` qui fait un push (dont `_migrateSettings`) vers Supabase

---

## 4. Supabase — Schéma et RPC

### 4.1 Table `user_settings`

Colonnes pertinentes (d’après migrations) :
- `imported_rankings_json` JSONB DEFAULT `'{}'`

Structure attendue côté app :  
`{ "gbl5": { "fusion": { "exportedAt": number, "players": [...] } } }`

### 4.2 RPC `get_ranking`

- **Rôle :** Classement depuis `profiles_public` + dernière session (`user_sessions`)
- **Paramètres :** `p_server`, `p_companies`, `p_type`, `p_limit`
- **Filtre serveur :** `p.server = v_server` (comparaison stricte avec `profiles.server`)

**Important :**  
`get_ranking` sert uniquement quand **aucune donnée importée** n’est trouvée. La chaîne est :
1. Si données importées disponibles → utiliser `getImportedRanking`
2. Sinon → appeler Supabase `get_ranking`

Donc un problème sur `get_ranking` n’explique pas l’absence de classement si l’import est censé fournir les données.

---

## 5. Chaîne de conversion serveur (display ↔ code)

- **Filtre UI :** valeurs `""` (Tous) et `"Global PvE 5 (Steam)"`
- **loadRanking** : `rankingDisplayToCode("Global PvE 5 (Steam)")` → doit retourner `"gbl5"`
- **Stockage importé :** clé serveur = `"gbl5"` (depuis `extractServerFromFilename`)

La correspondance est cohérente si `RANKING_SERVER_DISPLAY_TO_CODE` est bien rempli (fallback `{'Global PvE 5 (Steam)': 'gbl5'}` dans `ranking.js`).

---

## 6. Checklist de diagnostic

À vérifier en conditions réelles :

| # | Vérification | Comment |
|---|--------------|---------|
| 1 | Données bien stockées après import | DevTools (F12) → Application → Local Storage → `darkOrbitImportedRankings` |
| 2 | Structure exacte du JSON | Inspecter `darkOrbitImportedRankings` : objet avec clé `gbl5`, sous-objet `fusion`, tableau `players` |
| 3 | Nom des champs dans `players` | Premier élément : présence de `honor_rank` / `honorRank`, `top_user_rank` / `topUserRank`, etc. |
| 4 | Valeurs des rangs | Vérifier que `honor_rank`, `experience_rank`, `top_user_rank` sont entre 1 et 100 pour au moins 1 joueur |
| 5 | Cache UnifiedStorage | Après import, `UnifiedStorage._cache` ne doit pas contenir une ancienne valeur vide pour `darkOrbitImportedRankings` |
| 6 | Exécution de getImportedRanking | `console.log` dans `getImportedRanking` : `data`, `data[server]`, `entry.fusion`, `raw.length`, `sorted.length` |
| 7 | Valeur de `server` dans loadRanking | `console.log(server)` dans `loadRanking` : doit être `"gbl5"` quand le filtre est « Global PvE 5 (Steam) » |
| 8 | Données Supabase après sync | Table `user_settings` : colonne `imported_rankings_json` pour l’utilisateur courant |
| 9 | Ordre d’exécution Pull vs Import | Vérifier si un pull termine après l’import et écrase ou invalide le cache au mauvais moment |

---

## 7. Hypothèses prioritaires

1. **Format du fichier fusion**  
   Noms de champs ou plage de rangs différents de ce qu’attend le code → filtres qui retournent 0 joueur.

2. **Données non persistées en localStorage**  
   Contexte Electron ou erreur silencieuse lors du `set` → `get` retourne `{}`.

3. **Pull qui écrase ou invalide au mauvais moment**  
   Sync périodique ou pull tardif qui réécrit `imported_rankings_json` avec `{}` (atténué par le correctif) ou invalide le cache juste avant l’affichage.

4. **Clé serveur incorrecte**  
   Si `extractServerFromFilename` ne renvoie pas `"gbl5"` pour le fichier utilisé, ou si le mapping display → code échoue, `data[server]` serait `undefined`.

5. **Compression UnifiedStorage**  
   Si `useCompression` et taille > 50 Ko : compression/décompression défectueuse pour le JSON des classements.

---

## 8. Questions à clarifier

1. Nom exact du fichier importé (pour valider `extractServerFromFilename`).
2. Un extrait anonymisé du JSON (structure des 1–2 premiers joueurs) pour vérifier les noms de champs et les rangs.
3. L’app est-elle utilisée via Electron ou en ouvrant directement les HTML dans un navigateur ?
4. Le toast « Classement importé : N joueurs » affiche-t-il un N > 0 ?

---

## 9. Recommandations (sans modification de code)

1. Exécuter les vérifications de la section 6 (localStorage, logs, Supabase).
2. Partager un extrait du fichier fusion pour valider le format.
3. Tester en navigation privée ou avec un localStorage vide pour écarter des données corrompues.
4. Vérifier la console (F12) pour d’éventuelles erreurs JavaScript pendant l’import et le chargement du classement.
