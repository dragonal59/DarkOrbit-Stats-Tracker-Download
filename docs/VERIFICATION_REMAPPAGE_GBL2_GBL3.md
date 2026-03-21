# Vérification du remappage gbl2 / gbl3 (DOStats Hall of Fame)

**Date :** 2025-03-01  
**Contexte :** URLs `https://dostats.info/hall-of-fame?server={SERVER_ID}&type={TYPE}`. Vérifier les IDs réels envoyés pour « Global 2 (Ganymede) » et « Global 3 (Titan) ».

---

## 1. Localisation des remappages d’IDs serveurs

### 1.1 Hall of Fame (classements)

**Fichier :** `electron/dostats-ranking-collect.js`

- Ancien état : un remappage `gbl2 → gbl3` existait pour la construction des URLs HoF (supprimé depuis la correction).
- **Comportement avant correction :**
  - `serverId === 'gbl2'` → `urlServerId = 'gbl3'` (remappé).
  - `serverId === 'gbl3'` → `urlServerId = 'gbl3'` (inchangé, pas dans la map).
- **Utilisation :** dans `fetchRankingsForServer(serverId)`, l’URL est construite avec `urlServerId` (l.229).

### 1.2 Profils joueurs

**Fichier :** `electron/dostats-profile-scraper.js`

- Ancien état : un remappage `gbl2 → gbl3` existait pour la construction des URLs profils (supprimé depuis la correction).
- **Comportement avant correction :** identique (gbl2 → gbl3, gbl3 → gbl3).
- **Utilisation :** dans `scrapeOnePlayer(server, userId, pseudo)`, l’URL profils est `https://dostats.info/player/{userId}?Server={urlServerId}` (l.169).

### 1.3 Autres fichiers

- **`electron/darkorbit-accounts.js` :** Liste `SERVERS` contenant `'gbl2'` et `'gbl3'` tels quels. Aucun remappage.
- **`src/backend/server-mappings.js` :** Uniquement noms affichés (`SERVER_CODE_TO_DISPLAY`). Aucun remappage d’ID.
- **`src/backend/config.js` :** Fallback des noms affichés. Aucun remappage d’ID.

---

## 2. URLs réellement appelées pour gbl2 et gbl3

Types autorisés pour ces deux serveurs : **topuser**, **experience**, **honor** (pas aliens/ships).

### 2.1 Serveur interne `gbl2` (Global 2 – Ganymede)

Après remappage : `getDoStatsServerId('gbl2') === 'gbl3'`.

| Type       | URL appelée |
|-----------|---------------------------------------------|
| topuser   | `https://dostats.info/hall-of-fame?server=gbl3&type=topuser`   |
| experience| `https://dostats.info/hall-of-fame?server=gbl3&type=experience`|
| honor     | `https://dostats.info/hall-of-fame?server=gbl3&type=honor`     |

### 2.2 Serveur interne `gbl3` (Global 3 – Titan)

Pas de remappage : `getDoStatsServerId('gbl3') === 'gbl3'`.

| Type       | URL appelée |
|-----------|---------------------------------------------|
| topuser   | `https://dostats.info/hall-of-fame?server=gbl3&type=topuser`   |
| experience| `https://dostats.info/hall-of-fame?server=gbl3&type=experience`|
| honor     | `https://dostats.info/hall-of-fame?server=gbl3&type=honor`     |

### 2.3 Conséquence

**Les deux serveurs internes (gbl2 et gbl3) déclenchent exactement les mêmes requêtes HTTP vers DOStats** (paramètre `server=gbl3` pour les trois types). Les données renvoyées sont donc les mêmes ; la distinction Ganymede vs Titan ne se fait que côté application (clé `server_id` dans les snapshots = `gbl2` ou `gbl3`), pas dans l’URL.

---

## 3. Cohérence

- Le remappage est **identique** pour le HoF et pour les profils (gbl2 → gbl3 dans les deux modules).
- Les types utilisés pour gbl2 et gbl3 sont bien limités à **topuser, experience, honor** (plus d’appels aliens/ships après la correction précédente).
- **Incohérence fonctionnelle possible :** si sur DOStats la page `server=gbl2` existe et contient les données Ganymede, alors aujourd’hui on ne la consulte jamais (on utilise toujours `server=gbl3`). Il faudrait confirmer sur le site :
  - soit DOStats n’a qu’une seule page pour Ganymede et Titan (ex. tout sous `gbl3`), et le remappage est voulu ;
  - soit `server=gbl2` existe et on devrait l’utiliser pour gbl2 (donc supprimer le remappage gbl2 → gbl3 pour le HoF).

---

## 4. Verdict

| Point | Statut |
|-------|--------|
| IDs et URLs sont correctement formés (syntaxe) | ✅ |
| Remappage appliqué de façon cohérente (HoF + profils) | ✅ |
| Même URL pour gbl2 et gbl3 (server=gbl3) | ⚠️ À confirmer sur DOStats |
| Correction « pas d’aliens/ships pour gbl2 et gbl3 » | ✅ Déjà en place |

**Recommandation :** Vérifier manuellement sur https://dostats.info/hall-of-fame si les paramètres `server=gbl2` et `server=gbl3` renvoient des données différentes ou identiques.  
- Si **différentes** : supprimer le remappage `gbl2 → gbl3` dans `dostats-ranking-collect.js` et `dostats-profile-scraper.js` pour que gbl2 utilise `server=gbl2`.  
- Si **identiques** ou si **gbl2** n’existe pas : laisser le code actuel et documenter que « Ganymede et Titan partagent l’URL DOStats gbl3 ».

---

*Rapport généré dans le cadre de la vérification du remappage gbl2/gbl3.*
