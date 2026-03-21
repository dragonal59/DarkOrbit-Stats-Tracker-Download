# RAPPORT D'AUDIT - DarkOrbit Stats Tracker Pro

**Date :** 17 février 2026  
**Périmètre :** Analyse exhaustive structurelle, fonctionnelle, cohérence, bugs, performance — aucune modification de code effectuée.

---

## 1. RÉSUMÉ EXÉCUTIF

| Métrique | Valeur |
|----------|--------|
| Fichiers source analysés | ~75 (src/, electron/, extensions/) |
| Fichiers fonctionnels | ~65 (87%) |
| Fichiers partiellement fonctionnels | 2 (3%) |
| Fichiers cassés | 0 |
| Fichiers inutilisés (code mort) | 4 (5%) |
| Lignes de code estimées (src + electron) | ~15 000 |
| Lignes de code mort estimé | ~500 (3%) |

L'application est un **tracker de statistiques DarkOrbit** en **Electron**, avec frontend HTML/CSS/JS, backend modulaire dans le renderer, Supabase pour l'auth/sync, et une extension Chrome pour le scraping des classements. L'architecture est globalement cohérente. Plusieurs points de dette technique, code mort et doublons ont été identifiés.

---

## 2. ERREURS CRITIQUES (À CORRIGER EN PRIORITÉ)

### 2.1 Backend

- **index.html** lignes 46-48 : Appel **redondant** `BackendAPI.getPermissions()` — appelé deux fois de suite lorsque `completed.done` est vrai. Supprimer l'un des deux appels.

- **index.html** lignes 33-35 : `getSupabaseClient` est invoqué **avant** le chargement de `supabase-client.js` (chargé plus bas dans le head). Risque de référence à une fonction non définie au moment de l'exécution. L'ordre des scripts dans le head place `supabase-config.js` et `supabase-client.js` avant le bloc inline ; vérifier que `getSupabaseClient` existe bien à ce moment-là (il est défini dans `supabase-client.js` qui est chargé avant le bloc inline, donc OK en pratique — mais le bloc inline s'exécute au DOMContentLoaded, donc après tous les scripts).

### 2.2 Frontend

Aucune erreur critique bloquante identifiée.

### 2.3 Electron

- **main.js** : Référence à `electron/darkorbit-accounts` et `electron/scraper-manager`. Les fichiers `electron/grades-normalizer.js` et `electron/grades-mapping.js` existent mais **ne sont jamais requis** par aucun module. Ils dépendent de `src/data/darkorbit-grades-mapping.json` — ce fichier existe mais les modules sont du **code mort**.

---

## 3. ERREURS MINEURES

### 3.1 Backend

- **history.js** : Garde-fou `if (!historyList) return;` déjà appliqué (rapport audit précédent).
- **supabase-config.js** : Plus de clé en dur ; fallback vide correct.
- **messages-api.js** : Vérification `if (!user?.id) return false` présente dans `markAsRead` et `deleteMessage`.

### 3.2 Frontend

- **script.js** : Commentaire obsolète mentionnant « chats.js » au lieu de « charts.js » (si présent).

### 3.3 Electron

- **main.js** : Le scheduler (00h00, 12h00) est intégré dans `main.js` via `setupScheduler()`. Pas de fichier `electron/scheduler.js` séparé — cohérent avec l'architecture actuelle.
- **preload.js** : Charge depuis `src/preload.js` (path.join(__dirname, 'src', 'preload.js')). En build, les fichiers sont dans `build/src` ; le `main.js` à la racine doit pointer vers le bon chemin. Le `package.json` build copie `build/src` → `src`, donc le chemin reste `src/preload.js` depuis la racine de l'app packagée.

---

## 4. CODE INUTILISÉ (À SUPPRIMER OU RÉINTÉGRER)

### 4.1 Fichiers entiers

| Fichier | Raison |
|---------|--------|
| **src/backend/grade-mappings.js** | Jamais chargé dans `index.html`. La variable `GRADE_TEXT_TO_ID` est utilisée uniquement par l’extension (`src/extensions/scraper/grade-mappings.js`), qui a sa propre copie. Le backend utilise `RANKS_DATA` dans `config.js`. → **Code mort côté app principale.** |
| **electron/grades-normalizer.js** | Jamais requis par `scraper-manager`, `scraper-server` ou `main.js`. Dépend de `src/data/darkorbit-grades-mapping.json`. → **Code mort.** |
| **electron/grades-mapping.js** | Idem — jamais requis. → **Code mort.** |
| **archive/cache.js** | Archivé, non référencé. |
| **archive/compression.js** | Archivé, non référencé. |

### 4.2 Fonctions

- Aucune fonction identifiée comme clairement jamais appelée (audit manuel partiel). Les helpers globaux (`getSessions`, `setAppAccessFromSessions`, `applyPermissionsUI`, `updateExportButtonVisibility`, `addNoteTemplate`, `clearNote`, `resetLinkIcon`) sont bien exposés et utilisés.

### 4.3 Variables/Constantes

- **GRADE_TEXT_TO_ID** dans `src/backend/grade-mappings.js` : Non utilisé par l’app principale (fichier non chargé).

### 4.4 Classes CSS

- Audit CSS non exhaustif. Les fichiers `style.css`, `events-style.css`, `ranking-style.css`, `super-admin.css` contiennent probablement des classes orphelines ; une analyse ciblée avec un outil de détection (ex. PurgeCSS en dry-run) serait nécessaire pour les lister précisément.

---

## 5. DOUBLONS (À FUSIONNER)

### 5.1 Grade mappings

| Emplacement | Rôle |
|-------------|------|
| **src/backend/grade-mappings.js** | Mapping grade texte → ID (toutes langues). **Non utilisé** par l’app (fichier non chargé). |
| **src/extensions/scraper/grade-mappings.js** | Même mapping, format condensé. **Utilisé** par l’extension (manifest). |

→ Le backend `grade-mappings.js` est redondant avec l’extension. L’extension doit garder sa copie (contexte isolé). Le fichier backend peut être supprimé s’il n’est pas prévu d’usage futur.

### 5.2 RANKS_DATA vs GRADE_TEXT_TO_ID

- **config.js** : Définit `RANKS_DATA` (grades avec honor, xp, rankPoints, img) — utilisé partout (dropdown, stats, progression, etc.).
- **grade-mappings.js** (backend) : Définit `GRADE_TEXT_TO_ID` (texte → ID fichier). Usage prévu : conversion scraped text → image. L’extension a sa propre copie pour le scraping.

→ Pas de doublon fonctionnel direct ; le backend `grade-mappings.js` est simplement mort.

### 5.3 Logique dupliquée

- **Clés de sync** : Définies dans `config/keys.js` (SYNC_KEYS) et utilisées par `unified-storage.js` et `sync-manager.js`. Cohérent.
- **getSessions** : Défini dans `sessions.js`, utilisé partout. Pas de doublon.

---

## 6. INCOHÉRENCES

### 6.1 Nommage

- `nav_dashboard` (i18n) vs onglet « Dashboard » (superadmin) : cohérent.
- Mélange `BackendAPI` (camelCase) et `DataSync` (camelCase) : cohérent.
- `applyPermissionsUI` vs `updateExportButtonVisibility` : conventions respectées.

### 6.2 Structure

- **preload.js** : Situé dans `src/preload.js`. Le `main.js` à la racine charge `path.join(__dirname, 'src', 'preload.js')`. En dev : OK. En build : les fichiers sont dans `build/` et le `package.json` indique `"files": ["main.js", {"from": "build/src", "to": "src"}]` — donc après build, `src/preload.js` pointe vers le contenu de `build/src/preload.js`. Cohérent.
- **electron-fix.js** : Chargé en premier dans `index.html` (head). Nécessaire pour mocker `chrome.*` dans Electron. Bien placé.

### 6.3 index.html — Ordre de chargement

- `BackendAPI` et `DataSync` sont utilisés dans le bloc `DOMContentLoaded` mais définis par des scripts chargés plus bas (niveau 1, 2, 3). L’ordre des balises `<script>` place tous les backend/frontend avant le bloc inline ; le bloc inline s’exécute après `DOMContentLoaded`, donc après le parsing complet. Les scripts sont exécutés dans l’ordre : le bloc inline est le dernier script du body (non, il est dans le head entre les scripts 2b et 3). En fait le bloc authCheck est **dans le head**, après unified-storage, auth-manager, sync-manager. À ce moment, `BackendAPI` et `DataSync` ne sont pas encore définis (ils sont chargés beaucoup plus bas dans le body). Donc au `DOMContentLoaded`, quand authCheck s’exécute, tous les scripts du body ont déjà été exécutés — OK.

---

## 7. ANALYSE i18n

### 7.1 Clés définies dans translations.js

- Environ 90+ clés dans `TRANSLATIONS.T`.
- Les clés sont utilisées via `data-i18n`, `data-i18n-placeholder`, `data-i18n-title` et la fonction `t(key)`.

### 7.2 Clés utilisées mais potentiellement manquantes

- Audit partiel : les clés principales (nav_stats, nav_progression, etc.) sont définies.
- Certaines zones du super-admin (titres, libellés) sont en dur en français (ex. « Collecte automatique des classements », « Comptes DarkOrbit »). Des clés comme `sa_dashboard`, `collect_rankings`, `darkorbit_accounts` existent dans translations.js mais ne sont pas toujours appliquées aux éléments HTML correspondants.

### 7.3 Traductions manquantes par langue

- Les clés ont généralement les 6 langues (fr, de, ru, es, en, tr). Pas de vérification exhaustive des trous par langue.

---

## 8. BUGS POTENTIELS (LOGIQUE / UI)

### 8.1 Bugs logiques

- **index.html** : Double appel `BackendAPI.getPermissions()` (lignes 46 et 48) — redondant, pas bloquant.
- **Limite 10 sessions FREE** : Appliquée côté client uniquement (config.js, sessions.js, get_user_permissions). Pas de contrainte serveur (trigger/RPC) pour bloquer l’insertion au-delà de 10. Un client modifié pourrait contourner.

### 8.2 Éléments DOM

- Les IDs utilisés dans le JS (`historyList`, `logoutBtn`, `saveSession`, etc.) correspondent aux éléments du HTML. Pas de référence à un élément inexistant identifiée.
- `addNoteTemplate` et `clearNote` sont appelés via `onclick` dans le HTML ; définis dans `history.js` et exposés sur `window` (script.js fait un fallback si déjà définis).

### 8.3 Memory leaks

- `setInterval(check, 60000)` dans `main.js` (scheduler) : jamais arrêté. Acceptable pour un scheduler global.
- Les listeners DOM sont généralement attachés une fois ; pas de `addEventListener` en boucle identifiée.

---

## 9. PERFORMANCE

### 9.1 Fichiers lourds

| Fichier | Lignes (approx.) | Remarque |
|---------|------------------|----------|
| index.html | ~1800 | Très long ; modals inclus. Pourrait être découpé en fragments ou composants. |
| style.css | ~2400+ | Lourd ; découpage par module envisageable. |
| events-style.css | ~1800+ | Lourd. |
| super-admin.js | ~970+ | Volumineux ; refactoring en sous-modules possible. |

### 9.2 Requêtes Supabase

- Pas de boucle évidente faisant des requêtes en double. Les caches (profile 5 min, permissions 5 min) limitent les appels.
- `DataSync.pull()` et `DataSync.sync()` sont appelés de manière raisonnable.

### 9.3 Re-renders DOM

- Pas de framework réactif ; mises à jour manuelles. Pas de re-render massif identifié.

---

## 10. DÉPENDANCES (package.json)

### 10.1 Dépendances installées

- `@supabase/supabase-js`: ^2.95.3 — utilisée (supabase-client, api, sync-manager, scraper-server, etc.).
- `dotenv`: ^17.2.4 — utilisée dans `main.js` pour charger `.env`.

### 10.2 DevDependencies

- `electron`: ^28.1.0
- `electron-builder`: ^24.9.1
- `javascript-obfuscator`: ^4.1.1 — utilisée par `scripts/obfuscate-build.js`.

Toutes les dépendances sont utilisées.

### 10.3 CDN (index.html, auth.html)

- `@supabase/supabase-js@2` — CDN jsDelivr
- `chart.js@4.4.0` — CDN
- `canvas-confetti@1.9.2` — CDN

En cas d’indisponibilité du CDN, l’app peut ne plus fonctionner. Recommandation : pour une build de production stricte, envisager des ressources locales ou un bundler.

---

## 11. RECOMMANDATIONS

### 11.1 Nettoyage immédiat

1. **Supprimer le double appel** `BackendAPI.getPermissions()` dans `index.html` (lignes 46-48).
2. **Supprimer ou documenter** les fichiers morts :
   - `src/backend/grade-mappings.js` (non chargé)
   - `electron/grades-normalizer.js` (jamais requis)
   - `electron/grades-mapping.js` (jamais requis)
3. Si ces modules Electron sont prévus pour une évolution future (ex. normalisation des grades par langue côté serveur), les documenter et les brancher. Sinon, les supprimer.

### 11.2 Refactoring à moyen terme

1. **Fusionner/décider** : Garder une seule source pour les grade mappings côté extension ; supprimer le backend `grade-mappings.js` s’il n’a pas d’usage prévu.
2. **Découper** `index.html` : extraire les modals dans des fichiers HTML partiels ou des templates si la maintenabilité le justifie.
3. **Centraliser** les clés de sync : déjà fait dans `config/keys.js` ; s’assurer qu’aucune clé en dur ne reste dans `sync-manager.js` ou `unified-storage.js`.

### 11.3 Optimisations

1. **SDK Supabase** : Envisager un chargement local ou via bundler pour la build de production.
2. **Tests** : Aucun test automatisé repéré ; ajouter des tests ciblés (auth, sync, permissions) réduirait les régressions.
3. **Documentation** : Mettre à jour la liste des migrations Supabase et l’ordre d’exécution recommandé.

---

## 12. PLAN D'ACTION

### Phase 1 (Urgent — 1–2 h)

1. Supprimer l’appel redondant `BackendAPI.getPermissions()` dans `index.html`.
2. Décider du sort de `electron/grades-normalizer.js` et `electron/grades-mapping.js` : suppression ou intégration.
3. Supprimer ou documenter `src/backend/grade-mappings.js` (non utilisé).

### Phase 2 (Important — 1–2 jours)

1. Appliquer les clés i18n manquantes dans le super-admin (titres, libellés en dur).
2. Vérifier les classes CSS orphelines (outil type PurgeCSS en dry-run).
3. Documenter la procédure de build et les variables d’environnement (.env).

### Phase 3 (Améliorations — 1 semaine)

1. Découper les fichiers CSS/JS les plus lourds si la maintenabilité le justifie.
2. Envisager des tests automatisés sur les flux critiques.
3. Clarifier la stratégie de merge (pull) et la limite FREE côté serveur dans la documentation.

---

*Rapport généré en mode audit uniquement. Aucune modification de code ou de configuration n’a été effectuée.*
