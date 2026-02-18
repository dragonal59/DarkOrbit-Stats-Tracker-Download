# Rapport d’analyse — Version FREE (DarkOrbit Tracker v2.1)

## 1. Périmètre de l’analyse

- **Frontend** : JS, HTML, CSS liés aux droits FREE (onglets, fonctionnalités, messages, boutons).
- **Backend** : Fichiers JS (API, sync, sessions, permissions), appels Supabase, validations.
- **Supabase** : Tables, RPC, policies RLS, migrations concernant FREE.
- **Sécurité** : Accès aux fonctionnalités PRO/ADMIN/SUPERADMIN, clés et configuration.

---

## 2. Droits et restrictions de la version FREE (synthèse)

### 2.1 Ce que la version FREE **peut** faire

| Fonctionnalité | Détail | Fichiers / RPC concernés |
|----------------|--------|---------------------------|
| **Onglets visibles** | Stats, Progression, Historique, Classement, Paramètres | `version-badges.js` (BADGE_TABS.FREE), `permissions-ui.js` (applyTabVisibility), `guards.js` (guardRoute) |
| **Saisie et sauvegarde de sessions** | Illimité (limite supprimée côté client et Supabase) | `api.js` (getSessionLimit → 10000), `sessions.js`, RPC `insert_user_session_secure` / `upsert_user_session_secure` (migration remove-session-limits-unlimited) |
| **Seuil de départ (baseline)** | Création et réinitialisation du seuil | `baseline-setup.js`, `sessions.js` (saveBaselineSession, resetBaseline) |
| **Historique des sessions** | Consultation, chargement, suppression de ses propres sessions | `history.js`, `sessions.js` (getSessions, deleteSession, loadSession) |
| **Classement** | Consultation du classement (filtre serveur, type, firmes) | `ranking-ui.js`, `ranking.js` (loadRanking), RPC `get_ranking` (GRANT authenticated, anon) |
| **Stats personnelles** | Saisie des stats actuelles, affichage des gains | `stats.js`, onglet Stats |
| **Progression** | Gains du jour, moyennes, prédictions, comparaison | `progression.js`, onglet Progression |
| **Paramètres (partiels)** | Thème, mode d’affichage, sons, confettis (pas notifications, auto-save, streak, liens) | `settings.js`, `permissions-ui.js` (applySettingsVisibility) |
| **Export des données** | Uniquement si **données 100 % locales** (utilisateur non connecté) | `sessions.js` (exportData → vérification BackendAPI.getCurrentBadge + AuthManager.getCurrentUser) |
| **Messages** | Réception et lecture des messages admin (bouton Messages visible pour FREE/PRO) | `messages.js`, `permissions-ui.js` (applyMessagesVisibility), RPC `get_my_messages` |
| **Événements (sidebar)** | Lecture seule dans la colonne latérale (en cours / à venir) ; pas d’onglet Événements ni boutons « Voir tous » / « Ajouter » | `version-badges.js` (eventsSidebarReadOnly: true), `events.js`, `permissions-ui.js` (viewAllEventsBtn, addEventBtn masqués) |
| **Hard reset** | Réinitialisation complète locale + affichage obligatoire du popup de saisie des stats | `reset.js`, `script.js` (setAppAccessFromSessions), `baseline-setup.js` |
| **Accès à l’app** | Bloqué tant qu’il n’y a aucune session (y compris seuil de départ) ; modal baseline obligatoire | `script.js` (setAppAccessFromSessions), `baseline-setup.js` |

### 2.2 Ce que la version FREE **ne peut pas** faire (ou est limitée)

| Restriction | Détail | Contrôle |
|-------------|--------|----------|
| **Onglet Événements** | Onglet masqué (pas d’accès au calendrier complet, création/édition) | BADGE_TABS.FREE exclut `events`, `guardRoute` + `applyTabVisibility` |
| **Onglet Dashboard Super Admin** | Onglet masqué | BADGE_TABS.FREE exclut `superadmin`, `canAccessAdminDashboard()` |
| **Boutons sidebar événements** | « Voir tous » et « Ajouter » masqués | `applySidebarVisibility` : réservés ADMIN/SUPERADMIN |
| **Notifications Windows** | Groupe paramètres masqué | `currentHasFeature('notificationsWindows')` = false pour FREE |
| **Auto-save** | Groupe paramètres masqué | `currentHasFeature('autoSave')` = false |
| **Compteur de streak** | Masqué | `currentHasFeature('streakCounter')` = false, `applyStreakVisibility` |
| **Liens utiles** | Section masquée dans Paramètres | `currentHasFeature('usefulLinks')` = false |
| **Sidebar Booster** | Masquée | `currentHasFeature('boosterDisplay')` = false, `applyBoosterVisibility` |
| **Export si connecté** | Si utilisateur FREE connecté (Supabase), export bloqué avec message d’erreur | `sessions.js` exportData() : `AuthManager.getCurrentUser().then(u => { if (u) showToast erreur; else doExportData(); })` |
| **Format d’export** | JSON uniquement (pas CSV) | `api.js` limits.exportFormats = ['json'] pour FREE (get_user_permissions côté Supabase idem) |

---

## 3. Analyse frontend détaillée

### 3.1 Fichiers clés

- **`src/backend/version-badges.js`**  
  - Définition des onglets FREE : `stats`, `progression`, `history`, `classement`, `settings` (pas `events`, pas `superadmin`).  
  - Définition des features FREE : `eventsSidebarReadOnly: true`, tout le reste (notifications, booster, liens, autoSave, streak, events tab, dashboard) à `false`.  
  - `getCurrentBadge()` : priorité cache permissions RPC → cache profil → localStorage → `FREE`.

- **`src/frontend/permissions-ui.js`**  
  - `applyTabVisibility()` : masque les boutons et contenus des onglets non autorisés (`currentCanAccessTab`).  
  - `applySettingsVisibility()` : masque notifications, auto-save, streak, liens utiles pour FREE.  
  - `applyBoosterVisibility()` : masque `#boosterSidebar` pour FREE.  
  - `applySidebarVisibility()` : masque « Voir tous » et « Ajouter » événements pour tout non-ADMIN/SUPERADMIN.  
  - `applyMessagesVisibility()` : bouton Messages visible pour FREE/PRO (masqué pour ADMIN/SUPERADMIN).  
  - Titre : « DarkOrbit Stats Tracker Free ».

- **`src/frontend/tabs.js`**  
  - `switchTab()` appelle `guardRoute(tabName)` ; si refus, redirection vers le premier onglet autorisé.

- **`src/backend/guards.js`**  
  - `canAccessRoute(routeId)` : pour `events` et `superadmin`, délègue à `currentCanAccessTab`.  
  - `guardRoute(routeId, onDenied)` : si accès refusé, appelle `onDenied` (redirection).

- **`src/backend/sessions.js` (export)**  
  - `exportData()` : si badge FREE ou PRO, appelle `AuthManager.getCurrentUser()` (Promise). Si un utilisateur est connecté → toast d’erreur « Export réservé aux données stockées uniquement en local. Déconnectez-vous pour exporter. » et pas d’export. Sinon → `doExportData()`.

- **`src/index.html`**  
  - Bouton « Exporter les données » présent pour tous (pas masqué selon le badge). Le blocage est uniquement au clic (logique dans `exportData()`).  
  - Modals « Ajouter un événement » / « Modifier un événement » présentes dans le DOM ; l’accès passe par l’onglet Événements et les boutons sidebar, déjà masqués pour FREE.

### 3.2 Points de vigilance (frontend)

1. **Bouton Export visible pour FREE**  
   Un utilisateur FREE connecté voit le bouton « Exporter les données ». Au clic, l’export est refusé et un message s’affiche. Recommandation : optionnellement masquer le bouton (ou le désactiver) pour FREE quand `AuthManager.getCurrentUser()` résolu indique un utilisateur connecté, pour éviter toute ambiguïté.

2. **Vérification d’export asynchrone**  
   La vérification `getCurrentUser()` est asynchrone. Pendant le court instant de la résolution de la Promise, aucun indicateur de chargement n’est affiché. Acceptable, mais on pourrait ajouter un loader.

3. **Contournement par URL / manuel**  
   Si l’utilisateur modifiait le DOM pour afficher l’onglet `events` ou `superadmin`, le contenu s’afficherait (les tab-contents existent en HTML). La navigation réelle reste protégée par `guardRoute` et le masquage des boutons. Côté données, l’écriture (création/édition d’événements, actions admin) est protégée par les features et, côté Supabase, par les RPC et RLS (voir sections suivantes).

---

## 4. Analyse backend détaillée

### 4.1 Permissions et badge

- **`src/backend/api.js`**  
  - Fallback permissions : `maxSessions: -1`, `exportFormats: ['json']` pour FREE.  
  - `getSessionLimit()` : retourne 10000 (équivalent illimité).  
  - `getCurrentBadge()` : délègue à `getCurrentBadge()` (version-badges) ou retourne `'FREE'`.  
  - En cas d’erreur ou d’absence de profil Supabase, fallback vers badge `FREE` et stockage `darkOrbitVersionBadge`.

- **`src/backend/sync-manager.js`**  
  - Gestion des réponses RPC `upsert_user_session_secure` : affichage de toasts pour `SESSION_LIMIT_FREE` et `SESSION_LIMIT_PRO`.  
  - **Incohérence** : avec la migration `remove-session-limits-unlimited.sql`, les RPC ne renvoient plus ces codes ; les messages ne s’afficheront plus. Le code reste cohérent avec une politique « illimité », mais les libellés font encore référence aux anciennes limites (1 session FREE, 10 PRO). Recommandation : adapter ou supprimer ces messages si la politique reste « illimitée ».

### 4.2 Export

- **`src/backend/sessions.js`**  
  - Blocage export pour FREE/PRO si utilisateur connecté (voir section 3).  
  - Pas d’autre vérification côté « serveur » Node (l’app est Electron, pas de serveur d’API dédié) ; la règle métier est entièrement côté client.

### 4.3 Événements

- **`src/backend/events.js`**  
  - Sidebar : affichage des événements en cours et à venir pour tous ; bouton « Voir tous » affiché seulement si `['ADMIN','SUPERADMIN'].includes(badge)`.  
  - Pas de vérification explicite « eventsSidebarReadOnly » avant d’afficher le contenu de la sidebar ; les seuls chemins de création/édition passent par l’onglet Événements et les boutons « Ajouter » / « Voir tous », déjà réservés aux admins par le frontend.

### 4.4 Classement

- **`src/backend/ranking.js`**  
  - `loadRanking(filters)` appelle la RPC `get_ranking` ; pas de vérification de badge.  
  - Comportement voulu : le classement est accessible à FREE (et à tous les utilisateurs authentifiés ou anon selon les GRANT Supabase).

---

## 5. Analyse Supabase

### 5.1 RPC et permissions

- **`get_user_permissions(p_user_id)`**  
  - Utilisé par le client pour connaître badge, tabs, features, limits.  
  - Si `v_uid IS NULL` ou profil non trouvé : retourne badge `FREE`, tabs par défaut, `limits: { maxSessions: -1, exportFormats: ["json"] }`.  
  - Pour un profil FREE : `maxSessions: -1`, `exportFormats: ["json"]`.  
  - Fichier : `remove-session-limits-unlimited.sql` (ou équivalent dans les migrations appliquées).

- **`insert_user_session_secure(p_row)` / `upsert_user_session_secure(p_row)`**  
  - Après migration « remove limits » : plus de vérification de limite ; insertion/mise à jour directe pour l’utilisateur connecté (`auth.uid()`).  
  - FREE peut donc enregistrer autant de sessions que souhaité côté base.

- **`get_ranking(...)`**  
  - Pas de filtre sur le badge.  
  - `GRANT EXECUTE ... TO authenticated; GRANT ... TO anon` : utilisateurs connectés et anonymes peuvent appeler la RPC.  
  - Cohérent avec l’accès au classement pour FREE.

- **`admin_send_message` / `admin_send_global_message`**  
  - Vérifient `badge IN ('ADMIN','SUPERADMIN')` (ou rôle équivalent).  
  - FREE ne peut pas envoyer de messages admin.

- **`get_my_messages()`**  
  - Retourne uniquement les messages où `user_id = auth.uid()`.  
  - FREE peut lire ses propres messages reçus des admins.

### 5.2 Tables et RLS

- **`profiles`**  
  - RLS : SELECT pour son propre `id` ou pour les admins/superadmins (via `get_my_profile_role` / `get_my_profile_badge`).  
  - Un utilisateur FREE ne peut pas lire les profils des autres (sauf via la vue publique, voir ci-dessous).

- **`profiles_public`**  
  - Vue en lecture seule (id, username, game_pseudo, server, company, badge, created_at).  
  - Utilisée par le classement ; `get_ranking` s’appuie dessus.  
  - GRANT SELECT pour `authenticated` et `anon`.  
  - FREE peut donc voir ces champs publics pour tous les profils (nécessaire au classement).

- **`user_sessions`**  
  - RLS : chaque utilisateur n’a accès qu’à ses propres lignes (`user_id = auth.uid()`).  
  - Les RPC `insert_user_session_secure` et `upsert_user_session_secure` sont en SECURITY DEFINER et n’insèrent que pour `auth.uid()`.  
  - FREE ne peut pas lire ou modifier les sessions des autres.

- **`admin_messages`**  
  - RLS : lecture et mise à jour uniquement pour ses propres messages (`user_id = auth.uid()`).  
  - Insertion uniquement via RPC admin.  
  - FREE ne peut que recevoir et lire ses messages.

- **`user_events`** (si utilisée)  
  - À vérifier dans le schéma : en général chaque utilisateur n’a accès qu’à ses propres événements.  
  - Les RPC ou policies d’écriture doivent empêcher un FREE d’écrire si la logique métier le réserve aux admins (côté app, l’écriture passe par l’onglet Événements réservé aux admins).

### 5.3 Incohérences ou risques identifiés (Supabase)

1. **Messages SESSION_LIMIT dans sync-manager**  
   Les codes `SESSION_LIMIT_FREE` / `SESSION_LIMIT_PRO` ne sont plus renvoyés par les RPC après la migration « remove limits ». Les toasts correspondants ne s’afficheront plus ; pas de faille, mais texte obsolète côté client.

2. **Permissions config (tabs)**  
   Si la table `permissions_config` existe et contient des lignes par badge, il faut s’assurer que la ligne FREE contient bien `classement` dans `tabs` (migration `add-classement-to-permissions.sql` ou équivalent). Sinon, un utilisateur dont les permissions viennent uniquement de Supabase pourrait ne pas voir l’onglet Classement.

---

## 6. Sécurité et cohérence

### 6.1 Accès aux fonctionnalités PRO / ADMIN / SUPERADMIN

- **Onglets** : Masqués par `applyTabVisibility` et protégés par `guardRoute`. Un FREE ne peut pas naviguer vers Événements ou Dashboard.
- **Fonctionnalités** : Notifications, booster, liens, auto-save, streak, création/édition d’événements, actions dashboard : toutes gérées par `currentHasFeature()` / `currentCanAccessTab()` ; pour FREE, ces features sont à `false`.
- **RPC** :  
  - Envoi de messages admin : réservé ADMIN/SUPERADMIN dans la RPC.  
  - Lecture des profils complets : RLS limite à soi-même ou admins.  
  - Sessions : RLS + RPC limitent à l’utilisateur connecté.

### 6.2 Clés et configuration

- Aucune clé Supabase (URL, anon key) n’est codée en dur dans les fichiers analysés ; la configuration passe par `supabase-config.js` / preload (Electron).  
- Le badge et les permissions peuvent venir du cache local (localStorage / `darkOrbitVersionBadge`) en fallback ; en production avec Supabase, la source de vérité est `get_user_permissions` et le profil `profiles`, le cache étant alimenté après connexion.

### 6.3 Contournements possibles (et mitigations)

- **Modification du DOM** : réafficher un onglet ou un bouton ne donne pas de droits supplémentaires côté Supabase (RPC et RLS restent inchangés). Les actions « admin » ou « création d’événements » côté serveur restent refusées.
- **Modification du badge en local** : si un utilisateur modifiait `darkOrbitVersionBadge` ou le cache en mémoire pour mettre ADMIN, l’UI afficherait les onglets admin ; en revanche, les RPC (admin_send_message, etc.) et la RLS (lecture des autres profils) s’appuient sur le vrai `auth.uid()` et le profil stocké en base (badge dans `profiles`), pas sur le cache client. Donc les droits réels côté données restent ceux du compte connecté.
- **Export** : la règle « export uniquement si données locales » repose sur la présence d’un utilisateur connecté (`AuthManager.getCurrentUser()`). Si l’utilisateur se déconnecte, il peut exporter ; une fois connecté, l’export est refusé. Pas de contournement côté Supabase pour « forcer » un export serveur ; l’export ne fait que lire les données déjà présentes côté client (localStorage / état de l’app).

---

## 7. Recommandations

1. **Sync-manager** : Adapter ou retirer les messages `SESSION_LIMIT_FREE` / `SESSION_LIMIT_PRO` pour refléter la politique actuelle (sessions illimitées), ou les conserver comme message générique « Erreur de synchronisation » si les RPC renvoient une autre erreur.
2. **Bouton Export** : Pour les utilisateurs FREE (et éventuellement PRO) connectés, masquer ou désactiver le bouton « Exporter les données » et afficher un court texte du type « Export disponible uniquement en mode local (déconnexion) » pour clarifier la règle.
3. **Permissions Supabase** : Vérifier que `permissions_config` contient bien pour le badge FREE les onglets attendus (dont `classement`) et les features attendues, pour que les utilisateurs dont le badge vient uniquement de Supabase aient la même expérience que le fallback local.
4. **Tests** : Mettre en place des tests (E2E ou manuels) avec un compte FREE : pas d’onglet Événements/Dashboard, pas d’export quand connecté, export possible quand déconnecté (mode local), classement visible, messages visibles, sidebar événements en lecture seule.

---

## 8. Fichiers impactés (référence rapide)

| Fichier | Rôle pour la version FREE |
|---------|----------------------------|
| `src/backend/version-badges.js` | Définition onglets et features FREE |
| `src/backend/api.js` | Fallback permissions, getSessionLimit, getCurrentBadge |
| `src/frontend/permissions-ui.js` | Masquage onglets, paramètres, booster, sidebar events |
| `src/frontend/tabs.js` | Navigation et guardRoute |
| `src/backend/guards.js` | canAccessRoute, guardRoute, canAccessAdminDashboard |
| `src/backend/sessions.js` | exportData (blocage si connecté), doExportData |
| `src/backend/sync-manager.js` | Toasts SESSION_LIMIT_* (obsolètes si limits supprimées) |
| `src/backend/events.js` | Sidebar events, visibilité boutons Voir tous / Ajouter |
| `src/backend/ranking.js` | loadRanking (accessible FREE) |
| `src/index.html` | Structure onglets, bouton export, sidebar, modals |
| `supabase/migrations/remove-session-limits-unlimited.sql` | get_user_permissions + insert/upsert sans limite |
| `supabase/migrations/create-rpc-get-ranking.sql` | get_ranking (accessible authenticated/anon) |
| `supabase/migrations/fix-profiles-rls-sensitive-fields.sql` | RLS profiles + vue profiles_public |
| `src/backend/supabase-schema-messages.sql` | admin_send_message (admin only), get_my_messages (own) |

---

## 9. Mini synthèse

- **Droits FREE** : Accès aux onglets Stats, Progression, Historique, Classement, Paramètres ; sessions illimitées ; baseline et hard reset ; classement en lecture ; messages reçus ; sidebar événements en lecture seule. Export uniquement en mode local (non connecté).
- **Restrictions FREE** : Pas d’onglet Événements ni Dashboard ; pas de notifications Windows, booster, liens utiles, auto-save, streak ; pas de création/édition d’événements ; pas d’envoi de messages admin.
- **Sécurité** : RPC et RLS Supabase limitent correctement les données (sessions, profils, messages). L’UI masque onglets et boutons selon le badge ; le serveur ne fait pas confiance au seul cache client pour les actions sensibles.
- **Incohérences** : Toasts « limite de session FREE/PRO » encore présents dans le sync-manager alors que les RPC ne renvoient plus ces codes ; bouton Export visible pour FREE connecté alors que l’export est refusé au clic.
- **Recommandations** : Aligner les messages du sync-manager avec la politique « illimité », améliorer l’UX du bouton Export pour FREE (masquer/désactiver + explication), vérifier `permissions_config` pour FREE (tabs + features).
