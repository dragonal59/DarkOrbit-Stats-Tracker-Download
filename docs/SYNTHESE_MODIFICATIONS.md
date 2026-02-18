# Synthèse des modifications — DarkOrbit Tracker v2.1

## Fichiers impactés

| Fichier | Modifications |
|---------|----------------|
| `src/backend/api.js` | Limites de sessions : `maxSessions: -1` pour tous les badges (FREE, PRO, ADMIN, SUPERADMIN). Fallback et défaut alignés. |
| `src/backend/reset.js` | Après hard reset : appel à `setAppAccessFromSessions(0)` et `initBaselineSetup(true)` pour afficher le popup de saisie des stats. Sécurisation des accès aux éléments DOM. |
| `src/backend/sessions.js` | Export : FREE/PRO ne peuvent exporter que si données 100 % locales (vérification asynchrone `AuthManager.getCurrentUser()`). Extraction de la logique d’export dans `doExportData()`. |
| `src/backend/baseline-setup.js` | Modal seuil : remplissage du select des grades depuis `RANKS_DATA`, image du grade à gauche du select (`baselineGradeImg`), mise à jour après réinitialisation. Après enregistrement du seuil, appel à `setAppAccessFromSessions()` pour réafficher l’app. |
| `src/backend/settings.js` | Suppression de la ligne « X événements » dans les infos de données. Cache : bouton « Vider le cache » appelle `UnifiedStorage.clearCacheExceptRegisteredKeys()`. |
| `src/backend/unified-storage.js` | Nouvelle méthode `clearCacheExceptRegisteredKeys()` : supprime toutes les clés localStorage sauf celles de `APP_KEYS.STORAGE_KEYS` (sessions, événements, paramètres, etc.). |
| `src/backend/auth-manager.js` | Inscription : avant création de la session baseline, suppression de toutes les sessions existantes du user (`user_sessions` Supabase) si l’utilisateur a déjà des stats (inscription avec initial_*). |
| `src/backend/progression.js` | Statistiques détaillées : moyennes (honneur, XP, points/jour) affichées avec signe « - » et classe `stat-negative` (rouge) si négatif. Libellé « points/jour » géré côté HTML. |
| `src/backend/messages-api.js` | Nouvelle méthode `sendGlobalMessage(subject, message)` appelant la RPC `admin_send_global_message`. |
| `src/backend/super-admin.js` | Fonction `openGlobalMessageModal()` et bouton « Message global » : ouverture du modal avec destinataire « Tous les utilisateurs », envoi via `MessagesAPI.sendGlobalMessage` si `userId === 'global'`. |
| `src/frontend/script.js` | Fonction `setAppAccessFromSessions(sessionCount)` : masque `.main-content` et `aside.booster-sidebar` si aucune session. Appel au chargement et après enregistrement du seuil. |
| `src/index.html` | Modal baseline : select grade remplacé par un bloc avec image + select, options générées par JS. Onglet Super Admin : bouton « 📢 Message global ». Progression : libellé « Moyenne points de grade/jour ». |
| `src/backend/config.js` | `SERVERS_LIST` réduit à `['Global PvE 5 (Steam)']` (classement + formulaire d’inscription). |
| `src/frontend/style.css` | Historique : grille `.session-stats` en 5 colonnes alignées, `line-height: 1.2`, image du grade à gauche du nom (ordre CSS). Classe `.stat-negative` (rouge) pour les moyennes négatives. Media query pour petit écran sur la grille. |
| `supabase/migrations/remove-session-limits-unlimited.sql` | Nouveau : `get_user_permissions` renvoie `maxSessions: -1` pour tous. `insert_user_session_secure` et `upsert_user_session_secure` sans vérification de limite (insert direct). |
| `supabase/migrations/add-admin-send-global-message.sql` | Nouveau : RPC `admin_send_global_message(p_subject, p_message)` insérant un message pour chaque ligne de `profiles` (admin/superadmin uniquement). |

---

## Modifications appliquées (résumé)

1. **Sessions** : Aucune limite de nombre de sessions pour FREE, PRO, ADMIN, SUPERADMIN. Côté client (api.js) et côté Supabase (migration RPC + permissions). Code et clés existants conservés.
2. **Hard reset** : Popup obligatoire de saisie des stats après reset ; accès à l’app bloqué tant qu’il n’y a aucune session (y compris seuil de départ).
3. **Réinitialiser le seuil de départ** : Modal réaffichée après reset ; select des grades alimenté par `RANKS_DATA` ; image du grade à gauche du nom dans la modal.
4. **Cache** : Vidage de tout le cache sauf les clés enregistrées (STORAGE_KEYS). Rafraîchissement de l’espace utilisé et du nombre de sessions via `updateDataInfo()` après vidage.
5. **Version FREE/PRO** : Suppression de la mention du nombre d’événements dans les infos de données (Paramètres).
6. **Classement** : Un seul serveur conservé : « Global PvE 5 (Steam) » dans `SERVERS_LIST` (filtre classement + formulaire d’inscription).
7. **Inscription** : Si l’utilisateur a déjà des stats (inscription avec initial_*), suppression de toutes ses sessions Supabase avant création de la session baseline.
8. **Export** : FREE et PRO ne peuvent exporter que si les données sont uniquement en local (non connecté). Si connecté, message d’erreur et pas d’export.
9. **Superadmin** : Bouton « Message global » et envoi à tous les utilisateurs via RPC `admin_send_global_message`.
10. **Historique** : Grille des sessions alignée (5 colonnes), pas d’interligne superflu, image du grade à gauche du nom.
11. **Progression** : Moyennes (honneur, XP, points de grade/jour) négatives en rouge avec signe « - ». Libellé « points/jours » remplacé par « points de grade/jour ».

---

## Vérifications et sécurité

- **Sessions** : Les RPC Supabase restent en `SECURITY DEFINER` ; seuls les inserts/updates par l’utilisateur connecté (auth.uid()) sont autorisés. Pas de modification des clés ou du schéma des tables.
- **Export** : Vérification du badge (BackendAPI) et de l’absence d’utilisateur connecté (AuthManager.getCurrentUser()) avant d’autoriser l’export pour FREE/PRO.
- **Inscription** : Suppression des sessions uniquement pour l’utilisateur concerné (user.id), via Supabase (RLS).
- **Message global** : RPC réservée aux profils avec badge ADMIN ou SUPERADMIN ; pas d’exposition de données sensibles.
- **Cache** : Seules les clés listées dans `APP_KEYS.STORAGE_KEYS` sont conservées ; pas de suppression des sessions ou paramètres utilisateur.
- **Config** : Aucune modification des clés Supabase (URL, anon key) ; uniquement la liste des serveurs et les migrations SQL ciblées.

---

## Déploiement Supabase

À exécuter dans l’éditeur SQL Supabase (si pas encore appliqué) :

1. `supabase/migrations/remove-session-limits-unlimited.sql` — limites de sessions désactivées.
2. `supabase/migrations/add-admin-send-global-message.sql` — envoi de message global (optionnel si la messagerie admin n’est pas utilisée).

Aucune autre modification du schéma ou des clés n’a été effectuée.
