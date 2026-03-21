# Audit technique — Scraping des profils joueurs (firmes)

**Date :** 21 février 2025  
**Rôle :** Expert Senior Web Scraping & Ingénieur QA  
**Périmètre :** Système de scraping des profils joueurs (récupération des firmes MMO/EIC/VRU)

---

## 1. Analyse de l'architecture

### 1.1 Flux de données (du lancement à l'enregistrement)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SOURCES DE DONNÉES (shared_rankings)                                            │
│  • Extension Chrome (Méthode 1) → /collect → upsert_shared_ranking [avec userId]  │
│  • Session-scraper (Méthode 2) → saveRankingToSupabase → upsert_shared_ranking   │
│    [SANS userId — voir section 3]                                                │
│  • Import manuel (ranking-import.js) → peut inclure company                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PROFILE-SCRAPER (electron/profile-scraper.js)                                   │
│  1. fetchPlayersNeedingCompany() → lit shared_rankings                           │
│  2. Filtre : joueurs avec userId non null ET company absent                      │
│  3. Pour chaque joueur : navigateTo(https://[server].darkorbit.com/p/[userId]/)  │
│  4. exec(JS_EXTRACT_COMPANY) → extraction DOM                                    │
│  5. saveUpdatedCompanies() → upsert_shared_ranking (players_json mis à jour)      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technologies et librairies

| Composant | Technologie |
|-----------|-------------|
| **Profile-scraper** | Electron `BrowserWindow` (headless), `webContents.executeJavaScript()` |
| **Session-scraper** | Idem — BrowserWindow + executeJavaScript |
| **Extension (classement)** | Chrome Extension API, Content Script, `fetch` vers serveur HTTP local |
| **Serveur HTTP** | Node.js `http.createServer` (port 3000) |
| **Base de données** | Supabase (PostgreSQL) — table `shared_rankings`, RPC `upsert_shared_ranking` |
| **Parsing DOM** | Code JavaScript injecté (pas de BeautifulSoup, Playwright ou Puppeteer) |

**Note :** Aucune librairie dédiée au scraping (Playwright, Puppeteer, etc.). Le système repose sur Electron `BrowserWindow` + `executeJavaScript` pour exécuter du code dans le contexte de la page.

---

## 2. Diagnostic : Ce qui fonctionne (✅)

### 2.1 Modules robustes

| Élément | Détail |
|---------|--------|
| **Architecture modulaire** | Profile-scraper isolé, API claire (`start`, `stop`, `getState`, `cleanup`) |
| **Partition partagée** | Réutilise `persist:session-scraper` — bénéficie des cookies de session déjà sauvegardés |
| **Délais aléatoires** | `betweenProfiles: 2000–5000 ms`, `pageLoad: 1500–3000 ms` — limite la détection anti-bot |
| **Arrêt propre** | `_shouldStop` vérifié à chaque itération, sauvegarde groupée par serveur avant sortie |
| **État exposé** | `profile-scraper-progress` envoyé au renderer pour affichage UI |
| **Validation auth** | Vérification `global.currentUserId` et `global.supabaseAccessToken` avant démarrage |

### 2.2 Sélecteurs CSS — validité actuelle

Le script `JS_EXTRACT_COMPANY` utilise une cascade de sélecteurs :

| # | Sélecteur | Usage probable |
|---|-----------|----------------|
| 1 | `td[title="COMPANY"]` | Profil EN standard |
| 2 | `td[title="Company"]` | Variante casse |
| 3 | `td[title="Firme"]` | Profil FR |
| 4 | `td[title="Clan"]` | Certains serveurs |
| 5 | `td[title="CLAN"]` | Variante casse |
| 6 | `.hof_clanname` | Table classement embarquée |
| 7 | `[class*="company"]` | Fallback générique |

**Validation texte :** `t.length >= 1 && t.length <= 20` — évite les faux positifs (texte trop long = probablement pas une firme).

### 2.3 Bonnes pratiques en place

- **Timeout sur `exec`** : 10 s — évite blocage infini si la page ne répond pas
- **Timeout sur `navigateTo`** : 20 s — résolution même en cas de `did-fail-load`
- **Sauvegarde groupée** : Un seul `upsert_shared_ranking` par serveur après traitement de tous les joueurs (limite les appels DB)
- **Clé stable** : Identification des joueurs par `userId` dans la copie mutable

---

## 3. Diagnostic : Ce qui ne fonctionne pas ou est fragile (❌/⚠️)

### 3.1 Bugs bloquants

| Problème | Fichier | Impact |
|----------|---------|--------|
| **Session-scraper ne fournit pas `userId`** | `electron/session-scraper.js` | La fonction `jsExtractRanking` n’extrait pas `nameEl.getAttribute('showuser')`. Les joueurs sauvegardés dans `shared_rankings` via Méthode 2 n’ont pas de `userId`. Le profile-scraper filtre `p.userId && !p.company` → **0 joueur à traiter** si les données viennent uniquement du session-scraper. |
| **Endpoints manquants dans scraper-server** | `electron/scraper-server.js` | L’extension `background.js` appelle `/restore-cookies` et `/remove-cookies`, qui **n’existent pas**. Seuls `/save-cookies` et `/clear-cookies` sont implémentés. Résultat : 404, fallback sur login manuel (fonctionnel mais redondant). |

### 3.2 Fragilités et risques

| Risque | Détail |
|--------|--------|
| **Sélecteurs obsolètes** | Si DarkOrbit modifie la structure HTML des profils (ex. passage à des `data-*` ou classes minifiées), les 7 sélecteurs peuvent tous échouer. Aucun mécanisme de fallback avancé (ex. regex sur le texte de la page). |
| **Pas de retry** | En cas d’échec (timeout, erreur réseau, page vide), le joueur est ignoré sans nouvelle tentative. |
| **Dépendance aux cookies** | Le profile-scraper réutilise la partition du session-scraper. Si l’utilisateur n’a jamais lancé le session-scraper ou si les cookies ont expiré, les pages profil peuvent rediriger vers la page de login → extraction impossible. |
| **Normalisation firme** | Le script retourne le texte brut (ex. "MMO", "EIC", "VRU"). Pas de normalisation stricte — si DarkOrbit renvoie "mmo" ou "Mmo", l’affichage couleur dans le classement peut ne pas matcher (le code `ranking-ui.js` fait `toLowerCase()` côté affichage, donc OK). |
| **Pas de gestion CAPTCHA** | Les pages profil DarkOrbit peuvent afficher un CAPTCHA si la session est suspecte. Aucune détection ni mécanisme d’attente manuelle (contrairement au session-scraper et à l’extension qui gèrent `/captcha-wait`). |

### 3.3 Fuites mémoire / ressources

| Élément | Analyse |
|---------|---------|
| **Timer `navigateTo`** | Le `setTimeout` est bien `clearTimeout` dans les handlers `onLoad`/`onFail`. ✅ |
| **Timer `exec`** | Le `setTimeout` dans `Promise.race` n’est pas annulé si `executeJavaScript` résout avant — la callback `rej` sera appelée après le timeout, mais la promesse est déjà résolue. Pas de fuite critique. |
| **BrowserWindow** | `destroyWindow()` appelé dans le `finally` du cycle — pas de fenêtre orpheline. ✅ |

### 3.4 Logs et observabilité

| Manque | Détail |
|-------|--------|
| **Logs structurés** | Uniquement `console.log` / `console.warn` — pas de niveaux (debug, info, error), pas d’ID de cycle pour tracer une exécution. |
| **Métriques** | Pas de compteur de succès/échec par sélecteur — impossible de savoir lequel fonctionne le mieux après un changement DarkOrbit. |
| **Erreur Supabase** | `saveUpdatedCompanies` logue `error.message` mais ne remonte pas l’erreur — le cycle continue sans alerte visible si tous les upserts échouent. |

### 3.5 Problèmes de cohérence

| Problème | Détail |
|----------|--------|
| **Incohérence Extension vs Session-scraper** | L’extension extrait `userId` (scraper.js ligne 77), le session-scraper non. Les deux alimentent `shared_rankings` mais avec des schémas différents. |
| **URL profil** | Format `https://[server].darkorbit.com/p/[userId]/?lang=en` — si DarkOrbit change l’URL (ex. `/profile/` au lieu de `/p/`), tout échoue. |

---

## 4. Recommandations & correctifs

### 4.1 Correctifs immédiats (bloquants)

1. **Ajouter l’extraction de `userId` dans le session-scraper**
   - Dans `jsExtractRanking`, après `var name = ...`, ajouter :  
     `var userId = nameEl.getAttribute('showuser') || null;`
   - Inclure `userId` dans l’objet `p` passé à `players.push(...)`.
   - Adapter `mergeRankings` du session-scraper pour propager `userId` (comme dans `background.js`).

2. **Implémenter ou aligner les endpoints cookies**
   - Option A : Ajouter `/restore-cookies` et `/remove-cookies` dans `scraper-server.js` (alias vers la logique existante de cookies).
   - Option B : Modifier `background.js` pour utiliser `/login` (avec retour des credentials) et `/clear-cookies` à la place de `/restore-cookies` et `/remove-cookies`.

### 4.2 Améliorations performance et discrétion

| Recommandation | Priorité | Détail |
|----------------|----------|--------|
| **Retry avec backoff** | Haute | En cas d’échec sur un profil, réessayer 1–2 fois avec délai croissant (ex. 5 s, 15 s) avant de passer au suivant. |
| **Détection CAPTCHA profil** | Moyenne | Avant `exec(JS_EXTRACT_COMPANY)`, vérifier la présence d’un formulaire de login ou d’un iframe reCAPTCHA. Si oui, émettre un événement `profile-scraper-captcha-required` et attendre résolution manuelle (comme pour le session-scraper). |
| **Batch size configurable** | Basse | Traiter par lots de N joueurs (ex. 20) puis pause plus longue (ex. 30 s) pour limiter la détection de trafic automatisé. |
| **User-Agent réaliste** | Moyenne | S’assurer que le `BrowserWindow` utilise un User-Agent de navigateur récent (Electron par défaut peut être détecté). |
| **Validation firme** | Basse | Après extraction, normaliser vers `MMO`|`EIC`|`VRU` (trim, toUpperCase, mapping des variantes connues) pour garantir la cohérence avec l’affichage. |

### 4.3 Observabilité

- Introduire des logs structurés (JSON) avec `cycleId`, `player`, `selectorUsed`, `success`, `duration`.
- Exposer un compteur par sélecteur dans l’état (`getState`) pour analyse post-cycle.
- En cas d’échec de `upsert_shared_ranking`, incrémenter un compteur `dbErrors` et le remonter dans `profile-scraper-progress`.

### 4.4 Tests de non-régression

- Créer un test manuel ou automatisé qui charge une page profil DarkOrbit (ex. `https://gbl5.darkorbit.com/p/1lEHc/?lang=en`) et exécute `JS_EXTRACT_COMPANY` — vérifier que la firme est extraite.
- Documenter les sélecteurs et leur ordre dans un fichier de config pour faciliter les mises à jour si le site change.

---

## 5. Résumé — Santé du système

| Critère | Note | Commentaire |
|---------|------|-------------|
| Architecture | 8/10 | Modulaire, séparation claire des responsabilités |
| Robustesse | 5/10 | Session-scraper sans `userId` bloque le flux principal |
| Maintenabilité | 7/10 | Code lisible, mais sélecteurs en dur |
| Gestion erreurs | 4/10 | Pas de retry, logs limités |
| Discrétion / anti-détection | 7/10 | Délais aléatoires corrects, pas de proxy |
| Observabilité | 4/10 | Logs basiques, pas de métriques |

### Note globale : **6/10**

Le profile-scraper est bien conçu et suit les bonnes pratiques (délais, timeouts, arrêt propre). En revanche, **il ne peut pas fonctionner correctement** lorsque les données proviennent uniquement du session-scraper, car celui-ci n’extrait pas le `userId`. La correction de ce point est prioritaire. Les endpoints manquants (`/restore-cookies`, `/remove-cookies`) affectent l’extension mais ont un contournement (fallback login). Les sélecteurs sont multiples et couvrent plusieurs langues, mais restent fragiles face à des changements de structure du site DarkOrbit.
