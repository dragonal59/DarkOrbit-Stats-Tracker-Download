# Plan des corrections — Scraper classement

## Phase 1 — Priorité haute

### 1.1 Délai entre serveurs relié à la config

| Étape | Fichier(s) | Action |
|-------|------------|--------|
| 1 | `electron/scraper-server.js` | Ajouter endpoint `GET /config` retournant `{ delayBetweenServers }` depuis `scraping-config.getConfig()` |
| 2 | `src/extensions/scraper/background.js` | Au début de `runScrapingCycle()`, appeler `GET /config` et stocker `delayBetweenServers` |
| 3 | `src/extensions/scraper/background.js` | Remplacer `randomDelay(10000, 15000)` entre serveurs par `delayBetweenServers` (ou min/max si config fournit les deux) |
| 4 | Fallback | Si `/config` échoue ou `delayBetweenServers` absent → utiliser 60000 ms |

---

### 1.2 Restore-cookies → atterrissage direct page 1 honneur

| Étape | Fichier(s) | Action |
|-------|------------|--------|
| 1 | `src/extensions/scraper/background.js` | Changer l’URL après restore-cookies : `internalHallofFame` → `internalHallofFame&view=UserHonor&dps=1` |
| 2 | `src/extensions/scraper/background.js` | Dans la boucle des vues/pages : pour la première itération (honor p1), vérifier si l’URL actuelle contient déjà `view=UserHonor` et `dps=1` ; si oui, ne pas appeler `navigateTo` |
| 3 | Alternative plus simple | Toujours naviguer vers `&view=UserHonor&dps=1` après restore-cookies, et garder la boucle telle quelle — on évite au moins 1 reload (la nav initiale amène déjà sur honor p1) |

---

### 1.3 Endpoint /remove-cookies

| Étape | Fichier(s) | Action |
|-------|------------|--------|
| 1 | `electron/scraper-server.js` | Ajouter `POST /remove-cookies` avec la même logique que `/clear-cookies` (suppression des cookies du serveur en mémoire + disque) |
| 2 | Ou | Modifier `background.js` pour appeler `/clear-cookies` au lieu de `/remove-cookies` |

---

## Phase 2 — Priorité moyenne

### 2.1 Réduction du délai avant boucle classements

| Étape | Fichier(s) | Action |
|-------|------------|--------|
| 1 | `src/extensions/scraper/background.js` | Remplacer `randomDelay(5000, 8000)` par `randomDelay(1000, 2000)` après connexion et avant la boucle des vues |

---

### 2.2 Réduction des délais entre pages et vues

| Étape | Fichier(s) | Action |
|-------|------------|--------|
| 1 | `src/extensions/scraper/background.js` | `randomDelay(2000, 3000)` entre pages → `randomDelay(1000, 2000)` |
| 2 | `src/extensions/scraper/background.js` | `randomDelay(3000, 5000)` entre vues → `randomDelay(2000, 3000)` |

---

### 2.3 Éviter navigation redondante (honor p1)

| Étape | Fichier(s) | Action |
|-------|------------|--------|
| 1 | `src/extensions/scraper/background.js` | Avant `navigateTo(url)` pour honor p1 : exécuter un check de l’URL actuelle ; si elle contient déjà `view=UserHonor` et `dps=1`, sauter la navigation |
| 2 | Attention | Ne s’applique que si on vient de restore-cookies avec l’URL complète (cf. 1.2) |

---

## Phase 3 — Priorité basse / exploration

### 3.1 Réduction des rechargements (changement de vue sans reload)

| Étape | Fichier(s) | Action |
|-------|------------|--------|
| 1 | Exploration | Tester si DarkOrbit met à jour le contenu via AJAX quand on change `location.href` ou `history.pushState` sans rechargement |
| 2 | Si oui | Adapter le flux pour modifier l’URL sans `navigateTo` (éviter `loadURL`) |
| 3 | Si non | Garder le flux actuel ; les optimisations 1.2 et 2.3 suffisent |

---

### 3.2 Logs de diagnostic

| Étape | Fichier(s) | Action |
|-------|------------|--------|
| 1 | `src/extensions/scraper/background.js` | Log avant chaque `navigateTo` : URL cible, raison (connexion, honor p1, etc.) |
| 2 | `electron/scraper-server.js` | Log dans `/config` quand il est appelé et la valeur de `delayBetweenServers` retournée |

---

## Ordre d’exécution recommandé

1. **1.3** — Endpoint `/remove-cookies` (rapide, évite les 404)
2. **1.1** — Délai entre serveurs depuis la config
3. **1.2** — Restore-cookies → page 1 honneur
4. **2.1** — Réduction délai avant boucle
5. **2.2** — Réduction délais entre pages/vues
6. **2.3** — Skip navigation si déjà sur honor p1
7. **3.1** — Exploration AJAX (optionnel)
8. **3.2** — Logs (optionnel)

---

## Fichiers impactés (résumé)

| Fichier | Phases |
|---------|--------|
| `electron/scraper-server.js` | 1.1, 1.3, 3.2 |
| `electron/scraping-config.js` | 1.1 (lecture seule) |
| `src/extensions/scraper/background.js` | 1.1, 1.2, 2.1, 2.2, 2.3, 3.2 |

---

## Validation

À valider avant implémentation.
