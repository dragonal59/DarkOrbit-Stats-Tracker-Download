# Corrections version FREE — Rapport final

## 1. Fichiers modifiés

### Frontend
| Fichier | Modifications |
|---------|----------------|
| `src/index.html` | Booster sidebar : `style="display:none"` par défaut. Events sidebar : `style="display:none"` par défaut. Zone Export : message « Export uniquement disponible si les données sont locales » (historique + paramètres). Appel à `updateExportButtonVisibility()` après `applyPermissionsUI()` (branches avec et sans Supabase). |
| `src/frontend/permissions-ui.js` | `applyExportVisibility()` : pour FREE/PRO masque les boutons Export et affiche le message ; pour les autres affiche les boutons. `updateExportButtonVisibility()` (async) : pour FREE/PRO, selon `AuthManager.getCurrentUser()`, affiche soit les boutons (non connecté) soit le message (connecté). `applySidebarVisibility()` : masque toute la colonne `.events-sidebar` si `!currentCanAccessTab('events')` (FREE ne voient plus la sidebar Événements). |
| `src/frontend/style.css` | Styles pour `.export-wrap`, `.export-local-only-msg` et mise en page responsive (historique + paramètres). |

### Backend
| Fichier | Modifications |
|---------|----------------|
| `src/backend/sync-manager.js` | Remplacement des toasts spécifiques `SESSION_LIMIT_FREE` / `SESSION_LIMIT_PRO` par un message générique : `data.error` ou « Erreur de synchronisation des sessions. ». Plus de branchement sur le code retour. |
| `src/backend/sessions.js` | Messages « Limite de X session(s) atteinte » remplacés par « Limite de sessions atteinte. » (et variante avec « Supprimez d'anciennes sessions si besoin »). Vérification `maxSessions > 0` avant de bloquer (cohérent avec limite illimitée). |
| `src/backend/auth-manager.js` | Message d’erreur RPC baseline : « Limite de session atteinte » remplacé par « Erreur lors de la création de la session. ». |

---

## 2. Changements appliqués (détail)

### 2.1 Toasts « Limite atteinte » obsolètes
- **sync-manager.js** : Lors d’un `data.success === false` sur `upsert_user_session_secure`, affichage uniquement de `data.error` ou « Erreur de synchronisation des sessions. ». Suppression des messages dédiés FREE/PRO (1 session, 10 sessions).
- **sessions.js** : Libellés génériques « Limite de sessions atteinte » (sans nombre) ; blocage uniquement si `maxSessions > 0` (les RPC renvoyant désormais une limite illimitée, le blocage côté client ne se déclenche plus en pratique).
- **auth-manager.js** : Message d’erreur générique pour l’échec de création de la session baseline.

### 2.2 Bouton Export et message explicatif
- **FREE/PRO connectés** : Les deux boutons Export (onglet Historique `#exportData`, Paramètres `#settingsExportBtn`) sont masqués. À la place, le message « Export uniquement disponible si les données sont locales. » est affiché (éléments `#exportLocalOnlyMessage` et `#settingsExportLocalOnlyMessage`).
- **FREE/PRO non connectés** : Les boutons Export sont affichés, le message est masqué (données considérées comme locales).
- **ADMIN/SUPERADMIN** : Toujours les boutons Export visibles, message masqué.
- Logique : `applyExportVisibility()` (synchrone) applique l’état initial selon le badge ; `updateExportButtonVisibility()` (async) appelle `AuthManager.getCurrentUser()` et met à jour l’affichage pour FREE/PRO. Appel de `updateExportButtonVisibility()` après `applyPermissionsUI()` dans le flux d’auth (index.html).

### 2.3 Sidebar booster (aucun flash pour FREE)
- **index.html** : Sur l’élément `#boosterSidebar` (aside booster), ajout de `style="display:none"` par défaut.
- **permissions-ui.js** : `applyBoosterVisibility()` met `display = ''` uniquement si `currentHasFeature('boosterDisplay')` est vrai (PRO/ADMIN/SUPERADMIN). Pour FREE, la sidebar reste donc masquée dès le chargement, sans affichage temporaire.

### 2.4 Événements, Dashboard, Notifications, Liens, Auto-save, Streak (FREE)
- **Onglet Événements** : Déjà réservé par `currentCanAccessTab('events')` (false pour FREE). Les boutons et le contenu de l’onglet restent masqués par `applyTabVisibility()`.
- **Sidebar Événements** : Colonne `.events-sidebar` masquée par défaut (`style="display:none"` dans index.html). `applySidebarVisibility()` affiche la sidebar uniquement si `currentCanAccessTab('events')` est vrai. Les FREE ne voient plus du tout la colonne Événements.
- **Dashboard Super Admin** : Onglet masqué pour FREE via `currentCanAccessTab('superadmin')` et `applyTabVisibility()`.
- **Paramètres** : Les blocs Notifications Windows, Auto-save, Streak et Liens utiles restent masqués pour FREE via `applySettingsVisibility()` et `currentHasFeature(...)` (notificationsWindows, autoSave, streakCounter, usefulLinks).

### 2.5 Onglets et cohérence avec get_user_permissions
- **Onglets visibles pour FREE** : Stats, Progression, Historique, Classement, Paramètres (définition dans `version-badges.js` `BADGE_TABS[FREE]` et, côté Supabase, dans `permissions_config` / `get_user_permissions`).
- **Boutons / interactions interdits** : Création et édition d’événements (boutons « Voir tous », « Ajouter », « Ajouter un événement » dans l’onglet) et envoi de messages admin sont réservés aux profils ayant les features correspondantes ; pour FREE, les onglets et la sidebar concernés sont masqués, donc pas d’accès via l’UI.
- Les droits affichés sont alignés sur la source de vérité : cache permissions (RPC `get_user_permissions`) en priorité, puis fallback `version-badges.js`.

---

## 3. Vérifications et sécurité

- **RPC / Supabase** : Aucune modification des RPC ou des policies RLS dans ce lot. Les restrictions FREE (pas d’envoi de messages admin, pas d’accès aux données des autres utilisateurs) restent assurées par les RPC et RLS existantes.
- **Sessions** : Comportement illimité pour FREE côté client (`getSessionLimit()` → 10000) et côté Supabase après migration `remove-session-limits-unlimited.sql`. Plus de message « Limite atteinte » inapproprié.
- **Export** : La règle « export autorisé seulement si données locales (FREE/PRO non connectés) » est appliquée en UI (boutons masqués + message) et en logique (`sessions.js` `exportData()`).
- **Pas d’accès PRO/ADMIN/SUPERADMIN pour FREE** : Onglets Événements et Dashboard, sidebar booster et sidebar événements, options Paramètres (notifications, auto-save, streak, liens) et boutons d’export (quand connecté) sont masqués ou désactivés par les vérifications de badge et de features. Aucun nouveau contournement côté frontend.

---

## 4. Résumé des corrections

| Thème | Correction |
|-------|------------|
| **Toasts** | Messages « Limite atteinte » spécifiques FREE/PRO supprimés dans le sync ; message générique d’erreur de synchro. Messages limites dans sessions.js et auth-manager.js rendus génériques. |
| **Export** | Pour FREE/PRO connectés : boutons Export masqués, message « Export uniquement disponible si les données sont locales » affiché (historique + paramètres). Mise à jour async après vérification `getCurrentUser()`. |
| **Sidebar booster** | Masquée par défaut en HTML ; affichée uniquement si `boosterDisplay` = true. Plus de flash pour FREE. |
| **Sidebar Événements** | Masquée par défaut ; affichée uniquement si accès à l’onglet Événements. FREE ne voient plus la colonne Événements. |
| **Onglets** | FREE : uniquement Stats, Progression, Historique, Classement, Paramètres. Événements et Dashboard restent masqués. |
| **Boutons / messages** | Boutons création/édition d’événements et envoi de messages admin inaccessibles pour FREE (onglets et sidebar masqués). Message d’export explicite pour FREE/PRO connectés. |

---

## 5. Mini synthèse

- **Frontend** : index.html (booster + events sidebar en `display:none` par défaut, blocs export + appels `updateExportButtonVisibility`), permissions-ui.js (export, sidebar events, exposition des helpers), style.css (export-wrap et message).
- **Backend** : sync-manager.js (toasts synchro génériques), sessions.js (messages limites génériques + condition `maxSessions > 0`), auth-manager.js (message d’erreur création session).
- **Effet** : Version FREE sans toasts obsolètes, sans flash du booster ni de la sidebar événements, avec export clairement expliqué (masqué si connecté), onglets et options conformes aux droits réels et aux permissions Supabase.
