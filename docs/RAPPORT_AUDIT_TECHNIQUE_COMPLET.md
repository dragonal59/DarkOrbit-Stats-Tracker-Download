# Rapport d’audit technique complet — DarkOrbit Stats Tracker Pro

**Date :** 11 février 2026  
**Périmètre :** Frontend, backend, architecture, Supabase, auth, BDD, requêtes, sécurité, gestion des erreurs, performance, structure des fichiers, cohérence logique, dépendances.

---

## 1. Résumé global de l’état du projet

L’application est un **tracker de statistiques DarkOrbit** en **Electron**, avec frontend HTML/CSS/JS et backend modulaire dans le renderer. **Supabase** assure l’authentification, les profils, les permissions, la messagerie admin et la synchronisation des données (sessions, événements, paramètres, prédictions booster).

**Architecture :**  
- Point d’entrée : `main.js` (Electron) charge `src/auth.html`, puis après login `src/index.html`.  
- Backend : `src/backend/` (api.js, auth-manager.js, supabase-client.js, sync-manager.js, sessions.js, stats.js, unified-storage.js, messages-api.js, super-admin.js, ranking.js, history.js, etc.).  
- Frontend : `src/frontend/` (script.js, charts, dropdown, gadgets, etc.).  
- Config : `src/backend/supabase-config.js` (url/clé depuis preload ou fallback vide), `config.js` (CONFIG, STORAGE_KEYS, SERVERS_LIST).  
- Supabase : migrations dans `supabase/migrations/` (profiles, profiles_public, RLS, RPC get_ranking, get_user_permissions, admin_logs, admin RPC, etc.).

**État général :**  
Plusieurs points critiques ou majeurs identifiés dans un audit précédent ont été **corrigés ou vérifiés** : suppression du fallback avec clé Supabase en dur, création de la table `admin_logs`, chargement unique de `unified-storage.js`, gestion des erreurs RPC dans super-admin, garde-fou `user?.id` dans messages-api, sécurisation de la RPC `get_user_permissions`, feedback utilisateur en cas d’échec de `queueSync`. La base (tables, RLS, RPC) est cohérente avec le code. Il reste des **risques mineurs**, de la **dette technique** et des **recommandations d’optimisation** détaillées ci-dessous.

---

## 2. Erreurs critiques

Aucune erreur **critique** bloquante identifiée après les correctifs déjà appliqués.

- **Clé Supabase :** Plus de clé en dur ; fallback `url: '', anonKey: ''` et `isSupabaseConfigured()` utilisés correctement.  
- **Table admin_logs :** Présente via `supabase/migrations/create-admin-logs-table.sql`.  
- **Auth / utilisateur banni :** Redirection vers auth + déconnexion si `profile.status === 'banned'` au chargement de l’app.  
- **RPC admin :** Erreurs loguées et remontées à l’UI (toast) dans super-admin.  
- **Messages API :** Vérification `if (!user?.id) return false` avant utilisation de `user.id` dans `markAsRead` et `deleteMessage`.  
- **get_user_permissions :** Restriction à `auth.uid()` ou rôle admin/superadmin (migration `fix-rpc-get-user-permissions-security.sql`).

---

## 3. Erreurs majeures

### 3.1 Limite 10 sessions FREE uniquement côté client

- **Fichiers :** `config.js`, `sessions.js`, permissions (get_user_permissions).  
- **Constat :** La limite de 10 sessions pour les utilisateurs FREE est appliquée côté client. Un client modifié ou une requête directe peut contourner cette limite.  
- **Recommandation :** Pour une application stricte, ajouter côté Supabase un trigger ou une RPC d’insertion qui refuse les insertions au-delà de 10 sessions pour les comptes FREE.

### 3.2 Stratégie de merge (pull) non documentée

- **Fichiers :** `sync-manager.js` (`_mergeSessions`, `_mergeEvents`).  
- **Constat :** Stratégie « dernier écrit gagne » basée sur le timestamp. En cas d’édition concurrente sur deux appareils, des données peuvent être perdues sans message explicite.  
- **Recommandation :** Documenter ce comportement (commentaires ou doc utilisateur) et, si besoin, envisager un indicateur de conflit ou une stratégie de merge plus explicite.

### 3.3 Dépendance SDK Supabase via CDN

- **Fichiers :** `auth.html`, `index.html`.  
- **Constat :** Chargement de `@supabase/supabase-js` depuis un CDN. Indisponibilité ou changement de version peut impacter l’app.  
- **Recommandation :** En production packagée, envisager une ressource locale ou un bundler pour figer la version.

### 3.4 Variables d’environnement en build packagé

- **Fichiers :** `main.js` (dotenv), `preload.js` (process.env.SUPABASE_*).  
- **Constat :** En build packagé, il faut s’assurer que `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont fournis (fichier .env à côté de l’exécutable ou build-time).  
- **Recommandation :** Documenter la procédure de déploiement et vérifier que le preload du build lit bien les bonnes variables.

---

## 4. Erreurs mineures

### 4.1 Risque de crash si `historyList` absent (history.js)

- **Fichier :** `src/backend/history.js`.  
- **Constat :** `renderHistory()` utilise `document.getElementById("historyList")` sans vérifier si l’élément existe. Si la fonction est appelée dans un contexte où l’élément n’est pas présent (ex. DOM différent ou erreur de structure), `historyList.innerHTML` provoque une exception.  
- **Correction appliquée :** Ajout d’un garde `if (!historyList) return;` en début de fonction.

### 4.2 Fichiers potentiellement morts (cache.js, compression.js)

- **Fichiers :** `src/cache.js`, `src/compression.js`.  
- **Constat :** Non référencés dans `index.html` ni dans les scripts chargés par le frontend. Ils s’appuient sur `SafeStorage` / `UnifiedStorage`. Si aucun autre module ne les charge dynamiquement, ils constituent du code mort.  
- **Recommandation :** Vérifier en recherche d’usage (grep) ; si inutilisés, les supprimer ou les intégrer explicitement si prévus pour un usage futur.

### 4.3 Commentaire obsolète (script.js)

- **Fichier :** `src/frontend/script.js`.  
- **Constat :** Commentaire mentionne « chats.js » pour les graphiques ; le fichier réel est `charts.js`.  
- **Recommandation :** Corriger le commentaire en « charts.js » pour éviter toute confusion.

### 4.4 Doublon de migrations RPC classement

- **Fichiers :** `supabase/migrations/create-rpc-get-ranking.sql`, `supabase/migrations/create-ranking-rpc.sql`.  
- **Constat :** Deux scripts définissent une RPC `get_ranking` basée sur `profiles_public`. Risque de confusion et d’exécution dans un ordre incohérent.  
- **Recommandation :** Conserver une seule migration « source de vérité » pour `get_ranking` et documenter ou supprimer l’autre.

### 4.5 Clés de sync en dur (sync-manager / unified-storage)

- **Fichiers :** `src/backend/sync-manager.js`, `src/backend/unified-storage.js`.  
- **Constat :** Les clés synchronisées (`darkOrbitSessions`, `darkOrbitEvents`, etc.) sont en dur. Toute nouvelle clé à synchroniser doit être ajoutée à plusieurs endroits.  
- **Recommandation :** Centraliser la liste des clés de sync dans un tableau de configuration partagé (ex. dans `config.js`) et la réutiliser partout.

### 4.6 Compression réelle non implémentée (compression.js)

- **Fichier :** `src/compression.js` (si conservé).  
- **Constat :** Un TODO indique « Ajouter vrai algorithme de compression si nécessaire ». Actuellement la « compression » est du Base64.  
- **Recommandation :** À traiter seulement si la taille des données le justifie ; sinon documenter la limitation.

---

## 5. Recommandations d’optimisation

- **Refresh de session :** En cas de longue inactivité, envisager un appel explicite à `refreshSession()` (ou équivalent) avant une action sensible, puis redirection vers auth si la session est invalide.  
- **Performance :** Les requêtes RPC (get_ranking, get_user_permissions) et les lectures localStorage sont déjà raisonnables ; pas de boucle évidente à optimiser. Surveiller les appels répétés au chargement (éviter doubles appels inutiles).  
- **Gestion d’erreurs :** Continuer à appliquer le même pattern (try/catch, log, toast ou message utilisateur) sur les nouveaux appels async/RPC.  
- **Tests :** Aucun test automatisé repéré ; ajouter des tests ciblés (auth, sync, permissions) réduirait les régressions.  
- **Documentation :** Garder à jour la liste des migrations Supabase et l’ordre d’exécution recommandé (voir `SYNTHESE_TACHES_RESTANTES.md`).

---

## 6. Points forts du projet

- **Architecture claire :** Séparation backend / frontend, façade API (BackendAPI), stockage unifié (UnifiedStorage / SafeStorage), sync centralisée (sync-manager).  
- **Sécurité :** RLS sur les tables métier, RPC en SECURITY DEFINER avec vérification des rôles, pas de clé Supabase en dur, vérification du statut `banned`.  
- **Robustesse :** Fallback localStorage en absence de Supabase, gestion des erreurs RPC et sync (logs, toasts), garde-fou sur `user.id` dans les appels sensibles.  
- **Cohérence des données :** Vue `profiles_public` pour le classement, table `admin_logs` pour l’audit admin, schéma `profiles` et migrations documentés.  
- **Expérience utilisateur :** Feedback en cas d’échec de synchronisation, interface cohérente avec les permissions (onglets, fonctionnalités).

---

## 7. Priorité de correction recommandée

1. **Immédiat (déjà fait ou minimal)**  
   - Garde-fou `historyList` dans `history.js` (correction appliquée dans le cadre de cet audit).

2. **Court terme**  
   - Clarifier le statut de `cache.js` et `compression.js` (usage ou suppression).  
   - Corriger le commentaire « chats.js » → « charts.js » dans script.js.  
   - Documenter la stratégie de merge (pull) et, si besoin, la limite FREE côté serveur.

3. **Moyen terme**  
   - Unifier les migrations RPC `get_ranking` (une seule source de vérité).  
   - Centraliser les clés de sync dans la config.  
   - Documenter la procédure de build et les variables d’environnement pour le déploiement.

4. **Long terme**  
   - SDK Supabase en local ou via bundler pour la build de production.  
   - Tests automatisés sur les flux critiques (auth, sync, permissions).

---

## 8. Synthèse des corrections de code effectuées lors de cet audit

- **history.js :** Ajout de `if (!historyList) return;` au début de `renderHistory()` pour éviter une exception si l’élément `#historyList` est absent.

Aucune autre modification de code n’a été effectuée ; le reste des recommandations relève de la configuration, de la documentation ou d’évolutions à planifier.
