# Rapport boutons / toggles — liaison IPC et fonctionnalité

Inventaire des boutons et toggles de l’application, avec indication de la liaison IPC (oui/non) et de l’action réelle ou attendue.

---

## 1. Application principale (index.html + src/)

### 1.1 Header / fenêtre

| Élément | ID / repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------------|-------|---------|---------------------|
| Recharger l’app | `reloadAppBtn` | **Oui** | `script.js` → `electronAPI.reload()` | Envoyer `app:reload` au main → rechargement de la fenêtre. **Lié.** |
| Toujours au premier plan | `alwaysOnTopBtn` | **Oui** | `script.js` → `electronAPI.toggleAlwaysOnTop(next)` | Envoyer `window:toggle-always-on-top`. **Lié.** |
| Déconnexion | `logoutBtn` | Non | `auth.js` / Supabase Auth | Déconnexion Supabase côté renderer. Pas d’IPC. **OK (pas nécessaire).** |
| Mon compte | `myAccountBtn` | Non (ouverture externe) | `account-panel.js` | Ouvre le panneau compte (modal). `electronAPI.openExternal` utilisé pour des liens. **OK.** |
| Messages | `messagesInboxBtn` | Non | `messages.js` | Affiche la liste des messages (Supabase). **OK.** |
| Écran de chargement — Réessayer | `appLoadingRetryBtn` | Non | `loading-screen.js` | Réessayer le chargement (souvent `location.reload()`). Pas d’IPC. **OK.** |
| Infos légales | `btnLegal` | Non | `legal.js` | Ouvre la modal CGU/RGPD. **OK.** |
| Payer un café (support) | `supportDeveloperBtnTopLeft` | **Oui** (optionnel) | `paypal-buttons.js` → `electronAPI.openExternal(url)` | Ouvre l’URL PayPal. **Lié.** |
| Fermer modal upgrade PRO | `upgradeProModalClose` | Non | Ferme la modal. **OK.** |
| CTA PayPal (modal PRO) | `upgradeProCtaBtn` | Non | Fait défiler vers le bouton PayPal (abonnement). **OK.** |

### 1.2 Onglet Statistiques (saisie session)

| Élément | ID / repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------------|-------|---------|---------------------|
| Sauvegarder la session | `saveSession` | Non | `sessions.js` → `saveSession()` | Appel Supabase (RPC / table sessions). Pas d’IPC. **OK.** |
| Récupérer mes stats | `collectStatsFromGameBtn` | **Oui** (si scraper) | `stats-collect-auto.js` → `electronPlayerStatsScraper.collectWithLogin()` ou client launcher | `player-stats-scraper:collect` ou flux client launcher. **Lié.** |
| Annuler (modal DO) | `doModalCancel` | Non | Ferme la modal. **OK.** |
| Lancer le scan (modal DO) | `doModalSubmit` | **Oui** | Même flux que « Récupérer mes stats » avec identifiants saisis. **Lié.** |
| Réinitialiser stats | `resetStats` | Non | Vide les champs et sauvegarde. **OK.** |
| Remplir depuis dernière session | `fillLastSession` | Non | Remplit depuis stockage/Supabase. **OK.** |

### 1.3 Onglet Classement

| Élément | ID / repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------------|-------|---------|---------------------|
| Comparer | `compareBtn` | Non | `comparaison.js` | Ouvre la vue comparaison (données locales/Supabase). **OK.** |
| Filtre firme MMO/EIC/VRU | `.ranking-company-btn` | Non | Filtre côté client. **OK.** |
| Suivre ce joueur | `ranking-detail-follow` | Non | Supabase / suivi. **OK.** |
| Scroll vers moi | `ranking-scroll-to-me` | Non | Scroll dans le tableau. **OK.** |

### 1.4 Onglet Paramètres (app principale)

| Élément | ID / repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------------|-------|---------|---------------------|
| Thème Dark/Light/Auto | `settingsThemeDark` etc. | Non | `auto-theme.js` / préférences. **OK.** |
| Vue détaillée/compacte | `settingsViewDetailed` / `settingsViewCompact` | Non | Préférence d’affichage. **OK.** |
| Activer une licence | `activateLicenseBtn` | Non | `license-activation.js` → Supabase RPC `activate_license_key`. **OK.** |
| Gérer abonnement | `manageSubscriptionBtn` | **Oui** | `electronAPI.openExternal(url)` PayPal. **Lié.** |
| Gérer les liens | `manageLinksBtnSettings` | Non | `links.js` → modal liens. **OK.** |
| Envoyer rapport de bug | `bugReportSubmitBtn` | Non | `bug-report.js` → Supabase (table bug_reports). **OK.** |

### 1.5 Onglet Super Admin (SUPERADMIN)

| Élément | ID / repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------------|-------|---------|---------------------|
| Message global | `superAdminGlobalMessageBtn` | Non | Ouvre modal envoi message (Supabase). **OK.** |
| Logs admin | `superAdminLogsBtn` | Non | Affiche les logs (Logger local). **OK.** |
| Surveillance sécurité | `superAdminSecurityEventsBtn` | Non | Liste des événements sécurité (Supabase). **OK.** |
| Générer clés | `superAdminKeysGenerateBtn` | Non | Supabase RPC (génération clés). **OK.** |
| Copier clés | `superAdminKeysCopyBtn` | Non | Copie dans le presse-papier (navigator.clipboard). **OK.** |
| Ouvrir fenêtre Scraper | `superAdminScraperWindowBtn` | **Oui** | `electronScraperWindow.open()` → `scraper-window:open`. **Lié.** |
| Forcer sync | `superAdminForceSyncBtn` | Non | `DataSync.sync()` + `DataSync.pull()` (Supabase). **OK.** |
| Enregistrer permissions admin | `saPermissionsAdminSaveBtn` | Non | Supabase RPC `admin_update_admin_permissions`. **OK.** |
| Fermer popup action | `superAdminActionPopupClose` | Non | Ferme la popup. **OK.** |
| Actions menu (message, ban, suspect, edit, notes, history) | `data-menu-action` | Non | Supabase / API backend. **OK.** |
| Envoyer message (modal) | `superAdminMessageSend` | Non | Envoi message (Supabase). **OK.** |
| Fermer modals (notes, history, edit, etc.) | Divers `superAdmin*Close` | Non | Fermeture modale. **OK.** |

### 1.6 Navigation par onglets

| Élément | Classe / repère | IPC ? | Handler | Sensé faire / fait |
|--------|------------------|-------|---------|---------------------|
| Tab Stats / Progression / Historique / Classement / Coupons / Paramètres / Dashboard | `.tab-btn` | Non | `tabs.js` → affichage panneau. **OK.** |
| Sous-onglets Super Admin | `.sa-subtab-btn` | Non | `super-admin.js` → affichage panneau. **OK.** |

### 1.7 Modals ranking (détail joueur, Galaxy Gates)

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Fermer modal classement / GG | `gg-modal-close`, overlay | Non | Ferme la modal. **OK.** |

### 1.8 Coupons

| Élément | ID / repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------------|-------|---------|---------------------|
| Ajouter un coupon | `couponsAddBtn` | Non | Affiche le formulaire. **OK.** |
| Soumettre / Annuler formulaire | submit, `couponAddCancel` | Non | Supabase ou annulation. **OK.** |

### 1.9 Historique

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Période (toggle) | `toggleHistoryPeriod` | Non | Expand/collapse période. **OK.** |
| Supprimer session | `onclick="deleteSession(...)"` | Non | Suppression session (Supabase / RPC). **OK.** |

### 1.10 Messages (inbox)

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Marquer lu / Supprimer | `messages-btn-read`, `messages-btn-delete` | Non | Supabase. **OK.** |

### 1.11 Mise à jour

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Télécharger mise à jour critique | `update-critical-download-btn` | **Oui** | `electronAppUpdater.startCriticalDownload()` → `update:startCriticalDownload`. **Lié.** |
| Vérifier mise à jour | (menu ou équivalent) | **Oui** | `electronAppUpdater.checkForUpdates()` → `update:check`. **Lié.** |

---

## 2. Interface Scraper (React — scraper_app)

### 2.1 HeaderBar (ScraperUI)

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Tester HoF DOSTATS | Bouton « Tester HoF DOSTATS » | **Oui** | `onStartRankings` → `electronDostatsScraper.start(groupId)` | `dostats-scraper:start` avec `{ groupId }`. **Lié.** |
| Tester profils DOSTATS | Bouton « Tester profils DOSTATS » | **Oui** | `onStartProfiles` → `electronDostatsProfilesScraper.start(serverCode, ids)` | Preload envoie `serverCode` et `userIds`; main attend `payload.serverCode` et `payload.userIds`. **Lié.** (Preload passe `{ serverCode, userIds }`, main OK.) |

### 2.2 Onglet Serveurs (ServeursPage)

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Démarrer (carte serveur) | ServerCard — bouton Play | **Non** | `toggleServer(server.id, 'start')` | Change uniquement le state React (`useServersState`) → statut `running`. **Aucun IPC** : ne lance pas de scrape réel. |
| Pause (carte serveur) | ServerCard — bouton Pause | **Non** | `toggleServer(server.id, 'pause')` | Idem, state local `idle`. **Aucun IPC.** |
| Config (carte serveur) | ServerCard — bouton Settings | **Non** | `onClick={() => {}}` | **Aucune action.** Bouton vide. |
| Tout activer / Tout désactiver (groupe) | ServerGroup — boutons header | **Non** | `toggleServer(s.id, 'start'/'pause')` pour chaque serveur du groupe | Même state local, pas d’IPC. |

### 2.3 Onglet Console

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Filtres (INFO, OK, WARN, etc.) | ConsoleToolbar — pills | Non | State local `toggleFilter`. **OK.** |
| Logs techniques (toggle) | Toggle logs techniques | Non | State local `setShowTechnical`. **OK.** |
| Auto-scroll | Bouton Auto-scroll | Non | State local `setAutoScroll`. **OK.** |
| Copier tout / Exporter CSV | Boutons toolbar | Non | Copie / export côté client. **OK.** |
| Saisie commande + Entrée | ConsoleInput | Non | `executeCommand` → mock (status, help, clear, etc.). Pas d’IPC. **OK (mock).** |

### 2.4 Onglet Planning

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Vue Timeline / Liste | PlanningToolbar | Non | State `setView` dans `usePlanning`. **OK.** |
| Nouveau planning | « Nouveau » | Non | Ouvre `PlanningEditModal`. State local. **OK.** |
| Afficher bannis | Toggle bannis | Non | State local `showBanned`. **OK.** |
| Éditer / Supprimer / Activer-désactiver planning | PlanningGroupCard | Non | `usePlanning`: `updateSchedule`, `deleteSchedule`, `toggleSchedule`. **State local uniquement**, pas d’IPC, pas de persistance main/Supabase. |
| Heure / Type / Période (modale édition) | PlanningEditModal — chips | Non | State local du formulaire. **OK.** |
| Sauvegarder / Annuler (modale) | Boutons modale | Non | `onSave` / `onClose` → state local. **Pas de persistance.** |
| Bannir serveur | BanModal | Non | `usePlanning.banServer` → state local. **Pas d’IPC.** |
| Débannir | BannedList | Non | `usePlanning.unbanServer` → state local. **Pas d’IPC.** |

### 2.5 Onglet Paramètres (Scraper)

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Réinitialiser (section Scraper) | SectionScraper — « Réinitialiser » | Non | `resetSection('scraper')` → state par défaut. **OK.** |
| Sliders (workers, timeout, rate limit) | SectionScraper | Non | `patch('scraper', ...)` → state. **OK.** |
| Toggles (section Scraper) | SectionScraper — toggle-list | Non | `patch('scraper', ...)`. **OK.** |
| Tester tous (proxies) | SectionProxies | Non | `testAllProxies()` → simulation locale (setTimeout + random). **Pas d’IPC**, pas de vrai test. |
| Importer / Ajouter proxy | SectionProxies | Non | `importProxies` / `addProxy` → state. **OK.** |
| Toggle / Test / Supprimer (ligne proxy) | ProxyRow | Non | `updateProxy`, simulation test, `deleteProxy` → state. **OK.** |
| Sauvegarder / Annuler (barre fixe) | SaveBar | **Non (IPC manquant)** | `save` appelle `window.electronAPI.saveSettings(settings)` | **Problème** : `electronAPI.saveSettings` et `electronAPI.loadSettings` **ne sont pas exposés** dans `preload.js`. Au chargement, `loadSettings` renvoie `undefined`; à la sauvegarde, rien n’est envoyé au main. Les paramètres Scraper (proxies, scraper, etc.) restent **uniquement en mémoire** et sont perdus au rechargement. |

### 2.6 Visualisation

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Sélecteurs (serveur, type, période) | VisuSelectors | Non | State local. **OK.** |
| Clic ligne classement | RankingTable | Non | Remplit un slot profil (state local). **OK.** |
| Slot profil (sélection / clear) | PlayerProfileSlot | Non | State local. **OK.** |

### 2.7 Sidebar Scraper

| Élément | Repère | IPC ? | Handler | Sensé faire / fait |
|--------|--------|-------|---------|---------------------|
| Liens de navigation (Dashboard, Serveurs, etc.) | Sidebar | Non | `onChangePage`. **OK.** |

---

## 3. Synthèse des écarts

### 3.1 IPC manquant ou incohérent

- **Paramètres Scraper (Save/Discard)**  
  - `useSettings` utilise `window.electronAPI.loadSettings()` et `window.electronAPI.saveSettings(settings)`.  
  - Ces méthodes **ne sont pas exposées** dans `preload.js` (seuls `openExternal`, `reload`, `toggleAlwaysOnTop`, etc. le sont).  
  - **Conséquence** : la sauvegarde ne persiste pas côté main; le chargement au démarrage ne récupère rien. Il faudrait soit exposer `loadSettings` / `saveSettings` via preload et les implémenter dans le main (ex. `scraping:get-config` / `scraping:save-config` ou un stockage dédié), soit faire utiliser à Parametres les APIs existantes (ex. `electronScrapingConfig.get` / `save` si le format est le même).

### 3.2 Boutons sans action

- **ServerCard — bouton Config (engrenage)**  
  - `onClick={() => {}}` : aucune action. À brancher sur une config serveur ou à retirer.

### 3.3 Comportement uniquement local (volontaire ou à clarifier)

- **Onglet Serveurs**  
  - Démarrer / Pause / Tout activer-désactiver : uniquement state React (`running` / `idle`). Aucun appel au scraper Electron. Si l’intention est de piloter le scraping par serveur, il faudrait relier ces boutons à un IPC (ex. scraper start/pause par `serverId`).

- **Onglet Planning**  
  - Tous les CRUD (ajout, édition, suppression, activation/désactivation des plannings, ban/unban) sont en state local (`usePlanning` avec `MOCK_SCHEDULES` / `MOCK_BANNED`). Aucun envoi au main ni à Supabase. Si des plannings doivent être persistés ou exécutés par le planificateur Electron, il faudrait des appels IPC et/ou Supabase.

- **Paramètres Scraper — Tester tous (proxies)**  
  - Simulation (délai + random). Pas d’appel réseau réel ni d’IPC pour un test de proxies.

---

## 4. Récapitulatif IPC (main ↔ renderer)

| Canal IPC (exemples) | Utilisé par | Statut |
|----------------------|-------------|--------|
| `app:reload` | Recharger l’app | OK |
| `window:toggle-always-on-top` | Toujours au premier plan | OK |
| `window:controls:minimize/maximize-toggle/close` | Contrôles fenêtre (si utilisés) | OK |
| `app:openExternal` | Liens externes (PayPal, etc.) | OK |
| `scraper:start`, `scraper:pause`, `scraper:stop` | (Scraper legacy) | OK (côté main) |
| `session-scraper:start/stop/getState` | Session scraper | OK |
| `client-launcher:*` | Lancement client DO, scan, collecte | OK |
| `player-stats-scraper:collect`, `collect-manual` | Récupérer mes stats | OK |
| `dostats-scraper:start` | HeaderBar « Tester HoF DOSTATS » | OK |
| `dostats-profiles-scraper:start` | HeaderBar « Tester profils DOSTATS » | OK |
| `scraper-window:open` | Super Admin — Ouvrir fenêtre Scraper | OK |
| `scraping:get-config`, `scraping:save-config` | Config scraping (main) | OK (non utilisés par Parametres actuellement) |
| `update:check`, `update:startCriticalDownload` | Mise à jour | OK |
| **loadSettings / saveSettings** (absents du preload) | Paramètres Scraper (Save/Discard) | **Manquants** |

---

*Rapport généré pour audit des boutons et toggles — liaison IPC et fonctionnalité.*
