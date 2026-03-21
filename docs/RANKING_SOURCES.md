# Classement — sources de données et priorités

**Code source de vérité :** `src/backend/ranking.js` — fonctions **`normalizeRankingFilters`**, **`resolveRankingLoadRoute`**, puis **`loadRanking`**.

---

## 1. Filtres normalisés

| Champ | Rôle |
|--------|------|
| `displayServer` | Libellé ou code tel que reçu de l’UI (ex. nom affiché serveur). |
| `server` | Code interne après `rankingDisplayToCode` (ex. `gbl5`), ou `null` si « Tous ». |
| `type` | `honor` \| `xp` \| `rank_points` \| `npc_kills` \| `ship_kills` \| `galaxy_gates`. |
| `limit` | Entre 1 et `RANKING_LIMIT_MAX` (100). |
| `period` | `null` \| `24h` \| `7j` \| `30j` \| `24h_today`. |

---

## 2. Matrice : quelle route ?

`resolveRankingLoadRoute(norm)` retourne une **route** (constantes `RANKING_LOAD_ROUTE`) :

| Condition | Route | Chargement effectif |
|-----------|--------|----------------------|
| `period` défini **et** `server` absent | `ui_needs_server` | Placeholder UI `{ _comparison_needs_server: true }` — l’utilisateur doit choisir un serveur. |
| `period` **et** `server` **et** période dans `PERIOD_TO_DOSTATS_DURATION` (`24h`, `7j`, `30j`) | `period_dostats` | **`loadDostatsPeriodRanking`** — table `shared_rankings_dostats_snapshots`, aligné pages DOStats « Last N days ». |
| `period` **et** `server` **et** période **non** DOStats (ex. `24h_today`) | `period_comparison` | **`loadRankingComparison`** — RPC `get_ranking_comparison` (snapshots + deltas). |
| Sinon (`period` null) | `standard` | Voir §3. |

---

## 3. Route `standard` (pas de filtre période)

Ordre **strict** dans `loadRanking` :

1. **Import local** (`getImportedRanking` / `getImportedServerList` + `ranking-import.js`)  
   - Si des lignes existent → enrichissement optionnel `enrichImportedWithProfiles` → **retour** (plus de fallback dans ce cas).

2. **`loadSharedRanking`**  
   - D’abord tentative RPC **`get_ranking_with_profiles`** si `server` défini.  
   - Sinon / fallback : lecture **`shared_rankings_snapshots`** (et agrégation multi-serveurs via RPC si besoin).  
   - Si le résultat a **au moins une ligne** → **retour** (tableau tronqué à `limit`).

3. **RPC `get_ranking`**  
   - Appelée **uniquement** si `loadSharedRanking` **lève une exception**.  
   - Si `loadSharedRanking` réussit mais renvoie `[]`, **pas** de fallback `get_ranking` aujourd’hui (comportement historique à connaître pour évolutions futures).

---

## 4. Cas particuliers

- **`galaxy_gates` en période DOStats** : pas d’équivalent DOStats → `loadDostatsPeriodRanking` renvoie `[]` (voir logs).
- **Limite interne** : `loadRankingComparison` tronque actuellement à 100 côté RPC/usage — indépendant de `norm.limit` pour cette voie.

---

## 5. Modifier le comportement

1. Ajuster **`resolveRankingLoadRoute`** pour toute nouvelle branche (nouvelle période, nouvelle source).  
2. Mettre à jour **ce fichier** et les commentaires au-dessus de **`loadRanking`** dans `ranking.js`.  
3. En debug navigateur avec `window.DEBUG` : `normalizeRankingFilters`, `resolveRankingLoadRoute`, `RANKING_LOAD_ROUTE` sont exposés sur `window`.
