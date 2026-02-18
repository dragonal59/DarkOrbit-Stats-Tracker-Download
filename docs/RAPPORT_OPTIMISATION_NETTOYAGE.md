# Rapport — Optimisation et nettoyage du projet DarkOrbit Tracker v2.1

**Date :** Février 2026  
**Périmètre :** Suppression de code mort, clarification des doublons, correction de commentaires. Aucune modification de la logique métier ni de la sécurité.

---

## 1. Analyse réalisée

### 1.1 Fichiers ou modules non utilisés

- **src/cache.js** : Jamais chargé (aucune référence dans `index.html` ni `auth.html`). Le cache et les helpers `getCachedSessions` / `saveCachedSessions` sont fournis par **unified-storage.js** (alias `StorageCache` et fonctions du même nom). Les modules `links.js` et `settings.js` utilisent `StorageCache` via un test `typeof StorageCache !== 'undefined'` : ils s’appuient sur l’objet exposé par unified-storage, pas sur cache.js.
- **src/compression.js** : Jamais chargé. La compression est gérée dans **unified-storage.js** (`_compress` / `_decompress` en Base64). Aucun autre fichier n’appelle `CompressedStorage` ou `SimpleCompress`.
- **src/script_TIMER_FIX.js** : Jamais chargé. Correctif timer (visibility, cleanup) ; la logique du timer est dans **backend/timer.js**, qui est chargé. Ce fichier était un patch isolé non intégré au chargement.
- **src/chats.js** : Jamais chargé. Ancienne version du module de graphiques (un seul canvas `progressChart`). L’application charge **frontend/charts.js** (plusieurs graphiques honor/xp/rank). Faute de nom « chats » au lieu de « charts ».

### 1.2 Doublons de migrations

- **create-rpc-get-ranking.sql** et **create-ranking-rpc.sql** définissent tous deux la RPC **get_ranking**. La première est alignée avec `ranking.js` (paramètres et structure). La seconde est un doublon. Aucune suppression de fichier pour ne pas casser d’éventuels déploiements ; un **README** dans `supabase/migrations/` indique quelle migration est canonique et déconseille d’exécuter le doublon.

### 1.3 Dépendances (package.json)

- **@supabase/supabase-js** : utilisée par les scripts Node (`scripts/verify-session-limits.js`, `scripts/check-supabase-tables.js`). L’app en production charge le SDK depuis le CDN dans le HTML ; la dépendance npm reste utile pour les scripts.
- **dotenv** : utilisée dans `main.js` et les scripts. Aucune dépendance inutilisée identifiée.

### 1.4 Performance

- **Sync-manager** : pas de boucle infinie détectée. Le `set()` sur une clé SYNC_KEYS déclenche `queueSync` ; le sync fait un push puis, après pull, des `set()` locaux qui peuvent à nouveau déclencher un sync — comportement volontaire pour repousser les données. Aucune modification effectuée.
- **Unified-storage** : compression au‑dessus de 50 KB, cache mémoire, pas de recalcul inutile identifié.
- **Appels RPC** : les permissions sont mises en cache (BackendAPI) ; pas de sur-appel repéré. Aucun changement sur la logique des appels.

---

## 2. Nettoyage effectué

### 2.1 Fichiers supprimés du build (archivés)

| Fichier d’origine | Action | Nouvelle localisation |
|-------------------|--------|------------------------|
| **src/cache.js** | Déplacé vers l’archive | **archive/cache.js** |
| **src/compression.js** | Déplacé vers l’archive | **archive/compression.js** |
| **src/chats.js** | Déplacé vers l’archive | **archive/chats.js** |
| **src/script_TIMER_FIX.js** | Déplacé vers l’archive | **archive/script_TIMER_FIX.js** |

- Les fichiers ont été **copiés** dans **archive/** (avec court en-tête « ARCHIVÉ » où pertinent), puis **supprimés** de **src/**.
- Le dossier **archive/** est à la racine du projet ; il n’est pas inclus dans le build (`package.json` → `"files": ["src/**/*", "main.js"]`).
- **archive/README.md** décrit la raison du retrait de chaque fichier.

### 2.2 Commentaires et documentation

- **src/frontend/script.js** : commentaire de liste de modules corrigé : « chats.js » → « charts.js » (référence au bon fichier de graphiques).
- **supabase/migrations/README.md** : créé pour indiquer l’ordre d’exécution des migrations et préciser que **create-rpc-get-ranking.sql** est la version canonique de la RPC classement, **create-ranking-rpc.sql** étant un doublon à ne pas exécuter en parallèle.

### 2.3 Code non modifié (volontairement)

- Aucune suppression de commentaires dans les fichiers métier (pas de grand bloc de code commenté repéré comme purement obsolète).
- Aucune refactorisation des boucles ou des appels RPC : la logique métier et le comportement du sync sont inchangés.

---

## 3. Optimisations (vérifications, pas de changement de comportement)

- **Appels réseau / RPC** : utilisation existante du cache de permissions (BackendAPI) ; pas de requête redondante identifiée à corriger.
- **Sync-manager et unified-storage** : pas de boucle ni de recalcul inutile modifié ; le flux actuel est conservé.
- **Frontend (historique, stats)** : les listes sont rendues par le code existant (history.js, etc.) ; pas de virtualisation ni de pagination ajoutée dans ce cadre. Aucune optimisation structurelle des composants n’a été faite pour rester dans le périmètre « nettoyage / léger » demandé.

---

## 4. Vérifications

- **Fonctionnalités** : les modules chargés (sessions, stats, progression, sync, thèmes, events, settings) ne dépendent pas des fichiers archivés. `StorageCache` et les helpers de cache viennent de **unified-storage.js** ; les graphiques de **frontend/charts.js** ; le timer de **backend/timer.js**.
- **Compatibilité keys.js** : les fichiers archivés utilisaient déjà `APP_KEYS` en fallback ; leur suppression ne change rien à l’usage de **config/keys.js** dans le projet actif.
- **Build** : la configuration `"files": ["src/**/*", "main.js"]` n’inclut pas **archive/** ; le build Electron n’est pas impacté par l’archive.

---

## 5. Liste des fichiers supprimés / archivés

- **Supprimés de src/** : `cache.js`, `compression.js`, `chats.js`, `script_TIMER_FIX.js`.
- **Créés** : `archive/README.md`, `archive/cache.js`, `archive/compression.js`, `archive/chats.js`, `archive/script_TIMER_FIX.js`, `supabase/migrations/README.md`.
- **Modifiés** : `src/frontend/script.js` (un commentaire : chats.js → charts.js).

---

## 6. Liste des optimisations effectuées

| Type | Détail |
|------|--------|
| Réduction du code livré | 4 fichiers (~15 Ko) retirés du répertoire source et archivés. |
| Clarté du projet | Commentaire script.js corrigé ; ordre et doublons des migrations documentés dans supabase/migrations/README.md. |
| Maintenance | Un seul fichier de graphiques (charts.js) et un seul système de cache (unified-storage) à maintenir ; moins de risque de confusion avec des fichiers morts. |

Aucune optimisation algorithmique ou de requêtes (réseau / BDD) n’a été appliquée pour ne pas toucher à la logique métier.

---

## 7. Impact sur la performance et la maintenance

- **Performance** : légère réduction du périmètre du projet (fichiers en moins dans `src/`) ; aucun impact négatif attendu. Le comportement à l’exécution est inchangé.
- **Maintenance** : moins de fichiers à parcourir, moins de risque d’éditer par erreur un module non utilisé. La documentation des migrations et de l’archive facilite les prochains changements et la compréhension de l’historique.

---

## 8. Synthèse des points critiques (post-nettoyage)

- **Fichiers à ne pas réintégrer sans vérification** : tout ce qui est dans **archive/** (cache.js, compression.js, chats.js, script_TIMER_FIX.js) ; réintégration uniquement si un besoin métier le justifie et sans dupliquer unified-storage ou charts.js.
- **Migrations** : n’exécuter qu’**une** des deux migrations RPC classement (**create-rpc-get-ranking.sql** recommandée) ; s’appuyer sur **supabase/migrations/README.md** pour l’ordre et les doublons.
- **Sécurité et logique métier** : inchangées ; aucun correctif sur les limites de sessions, RLS, RPC ou centralisation des clés.
