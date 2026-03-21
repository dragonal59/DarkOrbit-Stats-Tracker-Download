# Rapport — Échec de la collecte DOStats après int2 et « 0 profils »

## Constat

- **Collecte démarrée** : 02:32:58  
- **Jusqu’à int2** : classements et profils sont scrappés, données envoyées à Supabase.  
- **À partir de int5** :  
  - Les logs indiquent **« 0 profils »** pour int5, int6, int7, int11, int14, mx1, pl3, ru1, ru5, tr3…  
  - Les appels Supabase échouent avec **« JWT expired »** (upsert profils, `insert_ranking_snapshot`, `flushRankingsToSupabase`).

Les classements sont bien récupérés depuis DOStats (ex. « int5: 244 joueurs fusionnés »), mais plus rien n’est écrit en base après expiration du JWT.

---

## Cause racine : expiration du JWT Supabase

Le token d’authentification Supabase (JWT) est **fixé une seule fois** au démarrage de la collecte et **jamais renouvelé** pendant une exécution qui peut durer plus d’une heure.

### Où le token est fixé

1. **Lancement manuel (Dashboard)**  
   - `src/backend/super-admin.js` : au clic sur « Démarrer »,  
     `getSession()` puis `setUserContext(session.user.id, session.access_token)`.  
   - Le token utilisé pour toute la collecte est celui de **ce** moment.

2. **Lancement par le planificateur**  
   - `main.js` : le scheduler appelle `ScraperBridge.startStatisticsScraping()` **sans** rafraîchir le token.  
   - Il réutilise `global.currentUserId` et `global.supabaseAccessToken` tels qu’ils ont été définis la dernière fois (ex. dernier clic « Démarrer » ou ouverture de l’app).  
   - Si la collecte programmée (ex. 04:00) s’exécute avec un token émis longtemps avant, il peut déjà être expiré au démarrage.

### Où le token est utilisé (sans refresh)

| Fichier | Usage |
|--------|--------|
| `electron/scraper-bridge.js` | `setUserContext(userId, accessToken)` stocke dans `global.currentUserId` et `global.supabaseAccessToken`. Aucune mise à jour ensuite pendant la collecte. |
| `electron/dostats-ranking-collect.js` | Au début de `runStatisticsForServers()`, création d’**un** client Supabase avec `Authorization: Bearer ${global.supabaseAccessToken}`. Ce client est réutilisé pour tout le run (user_settings, `insert_ranking_snapshot`, `enrichPlayersWithProfiles`, `getPlayersForProfiles`, `flushRankingsToSupabase`). |
| `electron/dostats-profile-scraper.js` | `makeSupabaseClient()` lit `global.supabaseAccessToken` à chaque création de client. Le token n’étant jamais rafraîchi, tous les appels utilisent le même token (déjà expiré après un moment). |
| `electron/ranking-collect.js` | Même schéma : client créé avec le token global pour `collectRankings`. |

Dès que le JWT atteint sa date d’expiration (souvent 1 h côté Supabase), **tous** les appels Supabase (RPC, tables) renvoient « JWT expired ».

---

## Enchaînement observé (résumé)

1. Token fixé au démarrage (ex. 02:32).  
2. Classements + profils OK pour les premiers serveurs (de2 → int2).  
3. Pendant ou après int2, le JWT expire.  
4. **insert_ranking_snapshot** échoue pour int5, int6, … → aucun snapshot partagé pour ces serveurs.  
5. **getPlayersForProfiles(supabase, serverId)** lit `shared_rankings_snapshots` pour ce `server_id`. Comme le snapshot n’a pas été écrit (à cause du JWT), la requête ne renvoie pas de joueurs → **« 0 profils »** affiché pour int5, int6, etc.  
6. Les upserts de profils (`upsert_player_profile`) échouent aussi en « JWT expired » à partir du moment où le token est expiré.  
7. **flushRankingsToSupabase** échoue également → pas de sauvegarde des `user_settings` / classements en base pour la fin de run.

Donc : **« 0 profils »** n’est pas un bug de comptage, mais la **conséquence** de l’échec d’écriture des snapshots (JWT expiré), puis de la lecture vide dans `shared_rankings_snapshots`.

---

## Synthèse

| Problème | Explication |
|----------|-------------|
| Pas d’envoi des données après int2 | Tous les appels Supabase (RPC + tables) utilisent un JWT qui n’est plus valide. |
| « 0 profils » à partir de int5 | Les snapshots pour int5+ ne sont pas insérés à cause du JWT ; `getPlayersForProfiles` ne trouve donc aucun joueur pour ces serveurs. |
| Pas de rafraîchissement du token | Un seul `setUserContext` au début (manuel ou ancien) ; aucun mécanisme de refresh pendant la collecte ni au déclenchement du scheduler. |

---

## Pistes de correction (à implémenter ultérieurement)

1. **Rafraîchir le token avant / pendant la collecte**  
   - Avant chaque run (manuel ou planifié) : appeler `supabase.auth.getSession()` (ou `refreshSession()`) côté renderer, puis renvoyer le nouveau token au main (ex. `setUserContext`) avant de lancer le scraping.  
   - Pour le scheduler : le process main n’a pas accès à la session Supabase ; il faudrait soit demander au renderer un token frais (IPC), soit stocker refresh_token côté main et faire un refresh côté serveur si l’architecture le permet.

2. **Refresh périodique pendant le run**  
   - Toutes les N serveurs (ou toutes les N minutes), demander un nouveau token au renderer (IPC « getFreshToken ») et mettre à jour `global.supabaseAccessToken`, puis recréer les clients Supabase utilisés dans `dostats-ranking-collect.js` et `dostats-profile-scraper.js` avec ce token.

3. **Scheduler**  
   - Au moment du créneau programmé, avant d’appeler `startStatisticsScraping()`, déclencher une procédure qui obtient un token valide (via le renderer si l’app est ouverte, ou via un refresh token stocké côté main si disponible).

4. **Gestion d’erreur « JWT expired »**  
   - Détecter explicitement cette erreur (message ou code), tenter une fois un refresh du token puis réessayer l’appel (insert_ranking_snapshot, upsert_player_profile, flush).  
   - Si le refresh n’est pas possible (ex. app fermée, pas de refresh_token), logger clairement et éventuellement notifier l’utilisateur.

5. **Durée de vie du JWT Supabase**  
   - Vérifier la configuration Supabase (JWT expiry) ; augmenter la durée (ex. 2 h ou plus) peut atténuer le problème pour les runs très longs, mais le refresh reste la solution robuste.

---

## Fichiers concernés (pour une future implémentation)

- `electron/scraper-bridge.js` — stockage du contexte utilisateur.  
- `electron/dostats-ranking-collect.js` — création unique du client Supabase en début de run ; pas de recréation avec nouveau token.  
- `electron/dostats-profile-scraper.js` — `makeSupabaseClient()` lit le token global sans refresh.  
- `electron/ranking-collect.js` — idem, token global.  
- `main.js` — scheduler : pas d’injection de token frais avant `startStatisticsScraping()`.  
- `src/backend/super-admin.js` — un seul `setUserContext` au clic « Démarrer » ; pas de re-call pendant la collecte.

Ce document ne contient que l’analyse et les recommandations ; aucune modification de code n’a été effectuée.
