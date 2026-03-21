# Rapport d’analyse — Scraping Hall of Fame DOStats

**Date :** 2025-03-01  
**Contexte :** URLs `https://dostats.info/hall-of-fame?server={SERVER_ID}&type={TYPE}` avec types `topuser`, `experience`, `honor`, `aliens`, `ships`.  
**Référence :** 24 serveurs avec flags `aliens` / `ships` (gbl2 et gbl3 sans aliens/ships).

---

## 1. Où sont définis serveurs et types

### 1.1 Liste des serveurs

| Fichier | Rôle |
|--------|------|
| **`electron/darkorbit-accounts.js`** | Liste canonique `SERVERS` (lignes 18–24) : 24 identifiants utilisés pour comptes, attributions et collecte. |
| **`src/backend/server-mappings.js`** | `SERVER_CODE_TO_DISPLAY` : `server_id` → nom affiché (25 entrées, inclut int2/int6). |
| **`src/backend/config.js`** | Fallback `SERVER_CODE_TO_DISPLAY` (l.251–260) + construction de `SERVERS_LIST` (l.276) pour formulaire inscription et classement. |

**Contenu actuel de `SERVERS` dans `darkorbit-accounts.js` :**
```js
const SERVERS = [
  'de2', 'de4', 'es1', 'fr1',
  'gbl1', 'gbl2', 'gbl3', 'gbl4', 'gbl5',
  'int1', 'int2', 'int5', 'int6', 'int7', 'int11', 'int14',
  'mx1', 'pl3', 'ru1', 'ru5',
  'tr3', 'tr4', 'tr5', 'us2'
];
```

### 1.2 Types scrapés (Hall of Fame)

| Fichier | Types utilisés | Usage |
|--------|-----------------|--------|
| **`electron/dostats-ranking-collect.js`** | `['topuser', 'experience', 'honor', 'ships', 'aliens']` (l.215) | Collecte HoF complète pour chaque serveur — **tous les types pour tous les serveurs** (pas de filtre par serveur). |
| **`electron/client-launcher.js`** | `['experience', 'honor', 'topuser']` (l.1295) | Récupération company depuis DOStats (3 types suffisants). |

### 1.3 Remappage d’identifiants URL

| Fichier | Mapping | Rôle |
|--------|---------|------|
| **`electron/dostats-ranking-collect.js`** | Utilise désormais directement `serverId` dans l’URL DOStats HoF (`server=gbl2`, `server=gbl3`, etc.), sans remappage. |
| **`electron/dostats-profile-scraper.js`** | Utilise désormais directement `server` dans l’URL profils DOStats (`Server=gbl2`, `Server=gbl3`, etc.), sans remappage. |

---

## 2. Comparaison avec le mapping de référence

### 2.1 Présence des 24 serveurs

- **Référence :** 24 serveurs (Allemagne 2 → USA 2).
- **Code :** Les 24 sont présents dans `SERVERS` (darkorbit-accounts.js).
- **Différence d’ID :** La référence indique `"USA 2 (West Coast)"` avec `id: "usa2"`. Dans le code et sur DOStats, l’URL utilise **`us2`** (confirmé par l’usage du paramètre `us2` sur dostats.info). Donc **pas de changement à faire** : garder `us2` côté code.

**Verdict :** ✅ Tous les serveurs de la référence sont couverts ; l’ID `us2` est cohérent avec DOStats.

### 2.2 Serveurs obsolètes ou en trop

- Aucun serveur présent dans le code qui soit absent de la référence.
- **Verdict :** ✅ Aucun serveur obsolète identifié.

### 2.3 Flags aliens / ships pour gbl2 et gbl3

- **Référence :** Pour **Global 2 (Ganymede)** (`gbl2`) et **Global 3 (Titan)** (`gbl3`), `aliens: false` et `ships: false` — il ne faut **pas** appeler le HoF pour les types `aliens` et `ships`.
- **Code :** Dans `dostats-ranking-collect.js`, la liste des types est fixe (l.215) : les 5 types sont demandés pour **tous** les serveurs, donc aussi pour gbl2 et gbl3.

**Verdict :** ❌ **Erroné** — Les requêtes `aliens` et `ships` sont envoyées pour gbl2 et gbl3 alors qu’elles ne doivent pas l’être.

### 2.4 Couverture des 5 types

- **Référence :** topuser, experience, honor (toujours), aliens et ships (selon le serveur).
- **Code :** Les 5 types sont gérés (parsing, merge, `mapHofToPlayer` pour ships/aliens). Seul le **filtrage par serveur** manque pour gbl2/gbl3.

**Verdict :** ✅ Les 5 types sont couverts ; il reste à ne pas les appeler pour gbl2/gbl3.

### 2.5 Remappage gbl2 → gbl3 (URL DOStats) — corrigé

- Un ancien remappage `gbl2 → gbl3` existait dans le code (HoF et profils) et faisait que Ganymede et Titan partageaient la même URL DOStats.
- Après vérification, `server=gbl2` et `server=gbl3` renvoient des données distinctes sur DOStats : **le remappage a été supprimé**.

**Verdict :** ✅ Les URLs DOStats utilisent désormais directement les IDs internes (`gbl2`, `gbl3`, …) sans remappage.

---

## 3. Synthèse

| Point | Statut | Détail |
|-------|--------|--------|
| Liste des 24 serveurs | ✅ | Complète dans `SERVERS` et mappings d’affichage. |
| ID USA 2 (us2 vs usa2) | ✅ | Garder `us2` (aligné DOStats). |
| Serveurs obsolètes | ✅ | Aucun. |
| Types topuser / experience / honor / aliens / ships | ✅ | Tous gérés dans le code. |
| Pas d’appel aliens/ships pour gbl2 et gbl3 | ❌ | À corriger : filtrer les types par serveur. |
| Remappage gbl2 → gbl3 | ✅ | Bug corrigé : plus de remappage, URLs DOStats alignées sur les `server_id` internes. |

---

## 4. Corrections proposées

### 4.1 (Prioritaire) Ne pas scraper `aliens` ni `ships` pour gbl2 et gbl3

**Fichier :** `electron/dostats-ranking-collect.js`

- Introduire une source de vérité pour les serveurs sans HoF aliens/ships (ex. `SERVERS_WITHOUT_ALIENS_SHIPS = ['gbl2', 'gbl3']`).
- Dans `fetchRankingsForServer(serverId)`, construire la liste des types en fonction du `serverId` :
  - pour gbl2 et gbl3 : uniquement `['topuser', 'experience', 'honor']` ;
  - pour les autres : `['topuser', 'experience', 'honor', 'ships', 'aliens']`.
- Adapter l’initialisation de `byType` en fonction de cette liste pour éviter des clés vides inutiles.

### 4.2 (Optionnel) Aligner les libellés avec la référence

- **server-mappings.js / config.js :**  
  - « Global Europe 1 » → « Europe Global 1 » (idem pour int5, int7, int11, int14) si on veut coller exactement à la référence.
  - « Amerique » → « Amérique » (int2, int6).
- Impact purement cosmétique (affichage).

---

## 5. Fichiers impactés

| Fichier | Modification |
|---------|--------------|
| `electron/dostats-ranking-collect.js` | Ajout config serveurs sans aliens/ships + filtre des types dans `fetchRankingsForServer`. |
| `src/backend/server-mappings.js` | Optionnel : libellés Europe Global / Amérique. |
| `src/backend/config.js` | Optionnel : même libellés dans le fallback. |

---

*Rapport généré dans le cadre de l’audit du scraping Hall of Fame DOStats.*
