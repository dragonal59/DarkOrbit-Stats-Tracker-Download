# Audit — Filtres période DOStats (24h, 7j, 30j) — « aucun joueur trouvé »

**Date** : 2025-03  
**Contexte** : Les logs `[Ranking] loadDostatsPeriodRanking: aucun joueur trouvé pour { server: 'gbl5', type: 'honor', hofType: 'honor', period: '7j'|'30j', duration: 7|30 }` apparaissent ; les vues +24h / +7j / +30j restent vides dans l’onglet Classement.

---

## 1. Flux des données (sans modifier le code)

### 1.1 Scraper Electron → Supabase

| Étape | Fichier | Comportement |
|--------|--------|---------------|
| 1 | `electron/dostats-ranking-collect.js` | `fetchRankingsForServer(serverId)` récupère pour chaque type (honor, experience, topuser, ships, aliens) les pages DOStats **All Time** et **duration=1, 7, 30**. |
| 2 | Id. | Pour chaque (type, duration), les joueurs sont mappés avec `hof_type: type`, `period: duration` (nombre 1, 7 ou 30) et poussés dans `periodSnapshots`. |
| 3 | Id. | **Correction appliquée** : tous les `periodSnapshots` sont fusionnés en un seul tableau `allPeriodPlayers` et **un seul** appel RPC `insert_dostats_snapshot(p_server_id: serverId, p_players: allPeriodPlayers)` est effectué par serveur. |
| 4 | RPC `insert_dostats_snapshot` (migration 20260304120000) | `DELETE FROM shared_rankings_dostats_snapshots WHERE server_id = p_server_id` puis `INSERT` d’**une** ligne (server_id, players_json, uploaded_by). La colonne `scraped_at` est remplie par défaut `now()`. |

**Contrat attendu en base** : une ligne par serveur dans `shared_rankings_dostats_snapshots`, avec `players_json` = tableau d’objets dont chacun peut avoir `hof_type` (string, ex. `"honor"`) et `period` (nombre 1, 7 ou 30).

### 1.2 App (Classement) → lecture

| Étape | Fichier | Comportement |
|--------|--------|---------------|
| 1 | `src/backend/ranking.js` | `loadDostatsPeriodRanking(supabase, server, type, period, limit)` est appelé avec ex. server=`'gbl5'`, type=`'honor'`, period=`'24h'|'7j'|'30j'` → duration = 1, 7 ou 30. |
| 2 | Id. | Requête Supabase : `from('shared_rankings_dostats_snapshots').select('server_id, scraped_at, players_json').eq('server_id', server).order('scraped_at', { ascending: false }).limit(5)`. |
| 3 | Id. | Pour chaque ligne retournée, filtre dans `players_json` : `p.hof_type === hofType && Number(p.period) === duration`. Dès qu’un tableau filtré non vide est trouvé, il est utilisé pour le rendu. |
| 4 | Id. | Si aucun joueur ne correspond : log du warning (throttlé 15 s par couple serveur|type|période) et retour `[]` → message « Aucune donnée de comparaison disponible pour cette période ». |

---

## 2. Pourquoi « aucun joueur trouvé » peut encore apparaître

### 2.1 Données pas encore ré-enregistrées avec le nouveau scraper

- **Avant** la correction (un insert par type×duration), chaque appel à `insert_dostats_snapshot` **écrasait** la seule ligne du serveur. En base il ne restait qu’**un** type×duration (le dernier inséré).
- **Après** la correction, une **seule** ligne par serveur contient **tous** les joueurs 24h/7j/30j (tous types). Cette ligne n’existe qu’après **au moins un run du scraper** avec le code à jour.
- Si le scraper n’a pas été relancé depuis la correction, la base peut encore contenir une ancienne ligne (un seul type×duration) → pour honor/7j et honor/30j le filtre ne trouve rien → warning.

**À faire** : Relancer le scraping DOStats (classements) pour le serveur concerné (ex. gbl5) et vérifier en base qu’une ligne existe avec un `players_json` contenant des entrées `hof_type: 'honor'` et `period: 1`, `7`, `30`.

### 2.2 Scraper non exécuté ou échec silencieux

- Si `periodSnapshots` est vide (DOStats injoignable, parsing échoué, ou types/durations non récupérés), aucun `insert_dostats_snapshot` n’est appelé.
- En cas d’erreur dans `withTokenRetry` (ex. token expiré, réseau), le log `[DOStatsRanking] insert_dostats_snapshot gbl5 erreur: ...` apparaît ; la base n’est pas mise à jour.

**À faire** : Vérifier dans la console Electron / les logs que le message `[DOStatsRanking] insert_dostats_snapshot OK — gbl5 — N joueurs (périodes) {...}` apparaît bien après un run du scraper.

### 2.3 Casse de `server_id`

- La table utilise `server_id TEXT`. En PostgreSQL la comparaison est **sensible à la casse** : `'gbl5'` ≠ `'GBL5'`.
- Le scraper envoie `p_server_id: serverId` (valeur venue de la config, ex. `getServerList()`).
- L’app envoie `server` issu du filtre Classement (après `rankingDisplayToCode(displayServer)`).

Si la config utilise `'GBL5'` et l’UI envoie `'gbl5'` (ou l’inverse), la requête `.eq('server_id', server)` ne matche pas la ligne insérée.

**À faire** : S’assurer que partout (config scraper, valeur du select Classement, et donc en base) le même format de code serveur est utilisé (idéalement tout en minuscules, ex. `gbl5`).

### 2.4 Structure de `players_json` différente de l’attendu

- Le code attend pour chaque joueur : `hof_type` (string) et `period` (nombre 1, 7 ou 30).
- Côté lecture : `pDur = p.period != null ? Number(p.period) : null` et `pType === hofType && pDur === duration`.

Si le scraper (ou un autre writer) enregistre par exemple `period` en string (`"7"`) ou sous un autre nom, ou si `hof_type` est absent / différent, le filtre ne matche pas.

**À faire** : Dans Supabase, ouvrir une ligne `shared_rankings_dostats_snapshots` pour `server_id = 'gbl5'`, inspecter `players_json` : présence de champs `hof_type` et `period`, types et valeurs (1, 7, 30).

### 2.5 Aucune ligne pour le serveur

- Si `shared_rankings_dostats_snapshots` ne contient aucune ligne pour `server_id = 'gbl5'`, la requête retourne `data = []` → `loadDostatsPeriodRanking` sort en `return []` **avant** le warning (le warning ne s’affiche que lorsqu’il y a des lignes mais aucun joueur filtré).
- Les logs que tu vois (« aucun joueur trouvé pour … 7j / 30j ») indiquent donc qu’**au moins une ligne** existe pour gbl5, mais qu’**aucun élément** de `players_json` ne satisfait `hof_type === 'honor'` et `period === 7` ou `period === 30`.

Conclusion : soit cette ligne a été insérée **avant** la correction (une seule période/type), soit l’insert actuel n’envoie pas honor/7 et honor/30 (ex. erreur partielle, ou fusion qui ne contient pas ces clés).

---

## 3. Checklist de vérification (sans coder)

1. **Scraper**  
   - Le code de `electron/dostats-ranking-collect.js` fait bien **un seul** insert par serveur avec `allPeriodPlayers` (réduction de `periodSnapshots`).  
   - Après un run pour gbl5, le log `insert_dostats_snapshot OK — gbl5 — N joueurs (périodes)` apparaît avec un `totalByKey` contenant bien honor pour d=1, d=7, d=30.

2. **Base Supabase**  
   - Une ligne existe pour `server_id = 'gbl5'` dans `shared_rankings_dostats_snapshots`.  
   - Dans `players_json`, présence d’objets avec `hof_type: 'honor'` et `period: 1`, `7`, `30` (et éventuellement experience, topuser, etc.).

3. **Cohérence server_id**  
   - Même valeur (et même casse) utilisée à l’insert (scraper) et à la lecture (filtre Classement).

4. **Côté app**  
   - `loadDostatsPeriodRanking` reçoit bien `server = 'gbl5'`, `type = 'honor'`, `period = '7j'` ou `'30j'` (donc duration 7 ou 30). Aucune transformation inattendue de `server` (ex. label au lieu de code) en amont.

---

## 4. Synthèse

- Le warning « aucun joueur trouvé » pour honor/7j et honor/30j signifie : **il y a au moins une ligne pour gbl5**, mais **aucun joueur** dans `players_json` avec `hof_type === 'honor'` et `period === 7` ou `30`.
- Cause la plus probable : **la ligne en base a été créée avant la correction du scraper** (une seule période/type par insert), ou **le scraper n’a pas encore été relancé** après la correction, donc pas de données 7j/30j pour honor dans la ligne actuelle.
- Vérifications utiles : **relancer le scraper** pour gbl5, confirmer le log d’insert, puis **inspecter** `players_json` en base pour `server_id = 'gbl5'` (présence de `hof_type` + `period` 1, 7, 30). Si la structure est correcte et la casse cohérente, les filtres 24h/7j/30j devraient recommencer à afficher des données.
