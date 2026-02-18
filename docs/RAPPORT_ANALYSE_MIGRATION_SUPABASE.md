# 📊 Rapport d'analyse — Migration Supabase Auth

**Application :** DarkOrbit Stats Tracker Pro  
**Date :** Février 2025  
**Type :** Analyse exhaustive — Aucune modification de code effectuée

---

## 1. État actuel

### A. Frontend

#### Fichiers HTML

| Fichier | Rôle |
|---------|------|
| **auth.html** | Écran de connexion/inscription (point d'entrée) |
| **index.html** | Application principale (stats, progression, history, events, settings, dashboard admin) |

#### Ordre de chargement des scripts

**index.html — Bloc 1 (début body) :**
1. electron-fix.js (head)
2. SDK Supabase (CDN)
3. supabase-config.js
4. supabase-client.js
5. unified-storage.js
6. auth-manager.js
7. sync-manager.js
8. Script inline (auth check au DOMContentLoaded)

**index.html — Bloc 2 (fin body) :**
9. config.js
10. unified-storage.js
11. utils.js
12. version-badges.js
13. api.js
14. stats, sessions, history, comparaison, progression, timer, events, links, settings, booster-learning, boosters, reset
15. super-admin.js
16. guards.js
17. permissions-ui, charts, tabs, theme, dropdown, gadgets, keyboard-shortcuts, ui-improvements, shortcuts-help-modal, auto-theme
18. script.js

**auth.html :**
1. SDK Supabase
2. supabase-config.js
3. supabase-client.js
4. unified-storage.js
5. auth-manager.js
6. auth.js

#### Problèmes d'ordre de chargement

| Problème | Gravité |
|----------|---------|
| unified-storage chargé deux fois dans index.html | Faible (protégé par `window.UnifiedStorage \|\|`) |
| auth check s'exécute avant BackendAPI chargé | Non (DOMContentLoaded après tous les scripts) |
| auth.html n'a pas version-badges ni api.js | Normal (écran auth minimal) |

#### Modules utilisant Supabase vs localStorage

| Module | Supabase | localStorage |
|--------|----------|--------------|
| auth-manager | Oui (login, register, session) | Oui (remove badge au logout) |
| api.js | Oui (profiles, RPC permissions) | Oui (fallback badge) |
| super-admin.js | Oui (profiles, RPC admin) | Oui (fallback demo users) |
| sync-manager | Oui (user_sessions, user_events, user_settings) | Oui (source et destination) |
| sessions.js | Non | Oui (UnifiedStorage) |
| events.js | Non | Oui |
| settings.js | Non | Oui |
| boosters.js | Non | Oui |
| booster-learning.js | Non | Oui |

#### Conflits ou doublons

- unified-storage chargé deux fois dans index.html
- config.js et version-badges.js ne sont chargés qu'en bas ; l'auth block inline dépend de BackendAPI (OK car DOMContentLoaded)

---

### B. Backend (côté client Electron)

| Fichier | Dépend Supabase | localStorage |
|---------|-----------------|--------------|
| auth-manager.js | Oui | Oui |
| api.js | Oui | Oui |
| supabase-client.js | Oui | Non |
| supabase-config.js | Config | Non |
| super-admin.js | Oui | Oui (fallback) |
| sync-manager.js | Oui | Oui |
| version-badges.js | Non (via api/permissions) | Oui |
| sessions.js | Non | Oui |
| events.js | Non | Oui |
| settings.js | Non | Oui |
| stats.js | Non | Oui |
| links.js | Non | Oui |
| boosters.js | Non | Oui |
| booster-learning.js | Non | Oui |
| guards.js | Indirect (permissions) | Non |

---

### C. Système d'authentification

| Élément | Statut |
|---------|--------|
| Login | ✅ AuthManager.login |
| Register | ✅ AuthManager.register |
| Logout | ✅ |
| Session | ✅ AuthManager.getSession |
| Redirection si pas de session | ✅ index → auth.html |
| Redirection si session sur auth | ✅ auth → index.html |
| Mot de passe oublié | ✅ resetPasswordForEmail |
| SDK Supabase | ✅ CDN + preload pour .env |
| Configuration .env | ✅ preload expose SUPABASE_CONFIG |

Manques :
- Pas de vérification explicite du statut `banned` avant d'accéder à index
- auth.js redirige vers index si Supabase non configuré (pas de mode "hors Supabase" sur auth)

---

### D. Système de permissions/badges

| Badge | Tabs | Rôle |
|-------|------|------|
| FREE | stats, progression, history, settings | Utilisateur de base |
| PRO | Idem + fonctionnalités PRO | Idem |
| ADMIN | + events, superadmin | Ban/unban, pas de logs globaux |
| SUPERADMIN | Tout | Logs admin, changement rôle |

Source de vérité :
1. RPC get_user_permissions (Supabase) si configuré
2. Fallback version-badges.js (local) sinon

Priorité correcte :
1. _permissionsCache (RPC)
2. _profileCache (profiles Supabase)
3. localStorage
4. FREE par défaut

Dashboard admin : Fonctionnel avec fallback sur utilisateurs démo en local.

---

### E. Gestion des données

#### Données en localStorage (UnifiedStorage)

| Clé | Usage |
|-----|-------|
| darkOrbitSessions | Sessions de jeu |
| darkOrbitEvents | Événements |
| darkOrbitSettings | Paramètres |
| darkOrbitCustomLinks | Liens personnalisés |
| darkOrbitBoosters | Config boosters |
| darkOrbitCurrentStats | Stats actuelles |
| darkOrbitVersionBadge | Badge (fallback) |
| boosterLearning | Données booster learning |
| darkOrbitTheme | Thème |
| darkOrbitViewMode | Mode affichage |
| darkOrbitDataMigrated | Flag migration sync |
| darkOrbitAdminUsers | Utilisateurs admin (fallback) |
| darkOrbitAdminActionLogs | Logs admin (fallback) |

#### Sync Supabase (Phase 5)

- Tables : user_sessions, user_events, user_settings
- Migration automatique au premier lancement post-auth
- Sync périodique (5 min)
- queueSync déclenché après écriture des clés concernées
- Stratégie : dernier écrit gagne

---

## 2. Configuration Supabase

### Tables définies dans les fichiers SQL

| Table | Fichier | RLS |
|-------|---------|-----|
| permissions_config | supabase-rpc-permissions.sql | Non (table config) |
| user_sessions | supabase-schema-data.sql | Oui |
| user_events | supabase-schema-data.sql | Oui |
| user_settings | supabase-schema-data.sql | Oui |
| booster_predictions | supabase-schema-data.sql | Oui |

### Tables requises mais non créées par les SQL fournis

- **profiles** : existante (selon vos infos)
- **admin_logs** : référencée par les RPC admin mais pas de CREATE TABLE fourni

### Fonctions RPC

| RPC | Fichier |
|-----|---------|
| is_admin_or_superadmin | supabase-rpc-admin.sql |
| is_superadmin | supabase-rpc-admin.sql |
| admin_ban_user | supabase-rpc-admin.sql |
| admin_unban_user | supabase-rpc-admin.sql |
| admin_change_badge | supabase-rpc-admin.sql |
| admin_change_role | supabase-rpc-admin.sql |
| admin_add_note | supabase-rpc-admin.sql |
| admin_update_profile | supabase-rpc-admin.sql |
| get_user_admin_logs | supabase-rpc-admin.sql |
| get_admin_logs | supabase-rpc-admin.sql |
| get_user_permissions | supabase-rpc-permissions.sql |

---

## 3. Problèmes détectés

### Erreurs de configuration

| Problème | Impact |
|----------|--------|
| Table admin_logs non définie dans les SQL | Les RPC admin échoueront |
| profiles.is_suspect possiblement absent | Erreur super-admin / RPC |
| Indentation suspecte dans api.js (l.75) | Possible bug |

### Conflits de code

| Problème | Détail |
|----------|--------|
| unified-storage chargé 2x dans index.html | Redondant mais protégé |
| permissions-ui : DOMContentLoaded + appel depuis auth block | Double appel applyPermissionsUI possible |
| sync-manager : UnifiedStorage.invalidateCache?.() | Alias StorageCache, pas UnifiedStorage directement |

### Dépendances cassées

- version-badges utilise UnifiedStorage avant chargement si appelé trop tôt (peu probable)

### Ordre de chargement incorrect

- Globalement correct

### Bugs potentiels

| Problème | Localisation |
|----------|--------------|
| Pas de rafraîchissement UI après pull (DataSync) | sync-manager.js |
| Utilisateur banned peut accéder à index | Auth flow |
| profiles sans colonne is_suspect | super-admin, RPC admin_update_profile |

---

## 4. Ce qui reste à faire

### A. Modifications de code (CURSOR)

| # | Fichier | Modification | Pourquoi | Complexité |
|---|---------|--------------|----------|------------|
| 1 | index.html | Supprimer le 2e chargement de unified-storage.js | Éviter doublon | Simple |
| 2 | api.js | Corriger indentation (l.75-77) | Cohérence | Simple |
| 3 | auth flow (index.html ou auth-manager) | Vérifier status === 'banned' avant d'autoriser l'accès | Sécurité | Moyen |
| 4 | sync-manager.js | Rafraîchir l'UI après pull (renderHistory, etc.) | Données à jour après sync | Moyen |

### B. Actions manuelles (développeur)

| # | Action | Où | Étapes | Ce que ça débloque |
|---|--------|-----|--------|---------------------|
| 1 | Créer table admin_logs | Supabase SQL Editor | Exécuter CREATE TABLE admin_logs (admin_id, target_user_id, action, details, created_at) | RPC admin |
| 2 | Vérifier profiles | Supabase Table Editor | S'assurer que is_suspect existe | RPC admin_update_profile |
| 3 | Exécuter les SQL | Supabase | supabase-rpc-admin.sql, supabase-rpc-permissions.sql, supabase-schema-data.sql | RPC et tables |
| 4 | Vérifier trigger profiles | Supabase | Trigger création profil à l'inscription | Profils auto-créés |
| 5 | Tester flux complet | App | Inscription, login, dashboard, sync | Validation end-to-end |

---

## 5. Roadmap de migration

### Phase actuelle : Post-migration

- Auth Supabase intégré
- Profils et permissions (RPC) utilisés
- Dashboard admin avec RPC
- Sync et migration de données implémentés

### Phases restantes

| Phase | Tâches | Ordre |
|-------|--------|-------|
| Finalisation Supabase | Créer admin_logs, vérifier profiles, exécuter tous les SQL | 1 |
| Nettoyage code | Supprimer doublon unified-storage, corriger indentation api.js | 2 |
| Sécurité | Vérification statut banned dans auth flow | 3 |
| UX sync | Rafraîchir UI après pull | 4 |
| Tests | E2E du flux auth + sync + admin | 5 |

---

## 6. Risques et points d'attention

### Risques de casse

| Risque | Probabilité | Impact |
|--------|-------------|--------|
| RPC admin échouent si admin_logs manquant | Élevé | Dashboard admin cassé |
| Erreurs si profiles incomplet | Moyen | Profils ou admin dégradés |
| Perte de données lors de migration | Faible | Stratégie merge en place |

### Sécurité

| Point | Statut |
|-------|--------|
| Clés API dans .env | ✅ |
| RLS sur tables user_* | ✅ |
| Vérification rôle admin dans RPC | ✅ |
| Utilisateur banned non bloqué à l'entrée | ❌ À corriger |

### Incompatibilités

| Point | Détail |
|-------|--------|
| Sans Supabase | Fallback localStorage ; pas d'auth requise |
| Mode hors ligne | Données en local ; sync au retour en ligne |
| Anciens navigateurs | Non testé |

---

## 7. Synthèse

| Composant | État |
|-----------|------|
| Auth Supabase | ✅ Opérationnel |
| Permissions / badges | ✅ Opérationnel (RPC + fallback) |
| Dashboard admin | ✅ Opérationnel (avec fallback demo) |
| Sync données | ✅ Implémenté, tables à créer |
| Tables Supabase | ⚠️ profiles OK ; admin_logs manquante ; schéma data à exécuter |

**Action prioritaire :** Créer la table `admin_logs` dans Supabase et exécuter tous les scripts SQL pour finaliser la migration.
