# Analyse flux "Récupérer mes stats depuis le jeu" → user_sessions Supabase

## 1. Vue d'ensemble du flux

```
[UI] Clic "Récupérer mes stats"
  → initCollectStatsFromGameButton (stats-collect-auto.js)
  → collectWithLogin (preload → main IPC)
  → PlayerStatsScraper.collectPlayerStatsWithLogin (player-stats-scraper.js)
  → Scraping DO (login, home, rank pages)
  → Retour { ok: true, data }
  → onCollectSuccess(data, nowIso)
  → addSessionFromScan(data)  ← POINT CRITIQUE
  → refreshSessionsFromSupabase()
  → renderHistory() / updateProgressionTab()
```

## 2. Points de sortie prématurée (addSessionFromScan retourne false)

| # | Condition | Fichier:Ligne |
|---|-----------|---------------|
| 1 | `!data \|\| typeof data !== 'object'` | sessions.js:105 |
| 2 | `!validation.valid` (validateSession) | sessions.js:127-128 |
| 3 | `!supabase \|\| !user \|\| !user.id` | sessions.js:130 |
| 4 | `rpc.error \|\| rpc.data.success === false` | sessions.js:133-135 |

## 3. validateSession (utils.js:47-82)

Champs requis : `id`, `timestamp`, `honor`, `xp`, `rankPoints`, `currentRank`

- `honor`, `xp`, `rankPoints` : doivent être des nombres ≥ 0
- `currentRank` : chaîne non vide

**Risque** : si le scraper renvoie `initial_xp` ou `initial_honor` à `null`/`undefined`, `Number(null)=0` OK, mais `Number(undefined)=NaN` → `Math.max(0, NaN)=NaN` → validation peut échouer selon le check exact.

## 4. Données scraper → addSessionFromScan

Le scraper (player-stats-scraper.js:342-355) fusionne home + rank :

```js
data = {
  server, game_pseudo, player_id, player_pseudo, player_server,
  company, initial_rank, initial_xp, initial_honor,
  initial_rank_points, next_rank_points  // de la page rank
}
```

- `initial_rank` : slug (ex. `basic_space_pilot`) ou `null` si extraction échoue
- `initial_rank_points` : peut être `null` si page rank échoue
- `player_id` : peut être `null` si non trouvé dans le DOM

## 5. Filtrage getSessions() par player_id

```js
// sessions.js:276-281
function getSessions() {
  var all = getSessionsAll();
  var activeId = getActivePlayerId();  // UserPreferencesAPI.getActivePlayerIdSync()
  if (!activeId) return all;  // Pas de filtre si activeId null
  return all.filter(s => (s.player_id || '') === activeId);
}
```

**Problème potentiel** : si `activeId` est défini (ex. compte DO précédent) et que la nouvelle session a `player_id` différent ou `null`, elle est **exclue** de l’affichage même si elle est bien en base.

## 6. Ordre onCollectSuccess

```js
// stats-collect-auto.js:230-275
UserPreferencesAPI.setPreferences({ active_player_id: data.player_id, ... });  // await
UserPreferencesAPI.invalidateCache();  // ← vide _activePlayerCache
// ...
addSessionFromScan(data);
```

Après `invalidateCache()`, `getActivePlayerIdSync()` retourne `null` → `getSessions()` retourne toutes les sessions (pas de filtre). Donc pas de blocage ici.

## 7. Chargement initial des sessions

- **DataSync.pull()** (index.html:201) : appelé au login, récupère `user_sessions` et appelle `setSessionsCache(merged)`.
- **refreshSessionsFromSupabase** : jamais appelé au démarrage, uniquement après :
  - addSessionFromScan, saveBaselineSession, saveCurrentSession, deleteSession, import, reset baseline.

Donc au premier chargement, les sessions viennent bien de `DataSync.pull()`.

## 8. Hypothèses de cause

### A. addSessionFromScan jamais appelé
- `typeof addSessionFromScan === 'function'` faux → `sessions.js` chargé après `stats-collect-auto.js` ou erreur de chargement.
- Ordre : sessions.js (L2277) avant stats-collect-auto.js (L2290) → OK.

### B. Validation échoue
- `initial_xp` ou `initial_honor` à `undefined` → `NaN` → échec possible selon validateSession.
- `currentRank` vide : corrigé avec fallback `'Grade inconnu'`.

### C. RPC échoue
- Limite FREE (1 session) : si baseline existe déjà, nouvelle session refusée → toast "Limite atteinte".
- Erreur RLS/auth : toast "Erreur sauvegarde".
- Si aucun toast, soit pas d’erreur, soit toast non affiché.

### D. Session créée mais invisible
- `getSessions()` filtre par `player_id`.
- Si `activeId` défini et `session.player_id` différent ou `null` → session masquée.

### E. Scraper ne trouve pas player_id
- Si `data.player_id` est `null`, la session est créée avec `player_id: null`.
- Si l’utilisateur a un `activeId` d’un autre compte, la session avec `player_id: null` est filtrée.

## 9. Recommandations de diagnostic

1. **Logs** : ajouter `console.log` dans `addSessionFromScan` :
   - entrée (data)
   - après validation
   - résultat RPC

2. **Vérifier Supabase** : table `user_sessions` pour `user_id` du compte test.

3. **Vérifier RPC** : exécuter `upsert_user_session_secure` manuellement avec un payload type.

4. **Vérifier getSessions** : loguer `getSessionsAll().length` vs `getSessions().length` et `getActivePlayerId()`.

5. **Vérifier scraper** : loguer `data` dans `onCollectSuccess` pour confirmer `initial_rank`, `initial_xp`, `initial_honor`, `player_id`.

## 10. Résumé des causes probables

| Priorité | Cause | Vérification |
|----------|-------|--------------|
| 1 | `player_id` null + filtre activeId | Log getSessions / activeId |
| 2 | Erreur RPC (limite, auth) | Log rpc.error, rpc.data |
| 3 | Validation (honor/xp NaN) | Log validation.error |
| 4 | addSessionFromScan jamais appelé | Log avant appel |
| 5 | Scraper renvoie données incomplètes | Log data dans onCollectSuccess |
