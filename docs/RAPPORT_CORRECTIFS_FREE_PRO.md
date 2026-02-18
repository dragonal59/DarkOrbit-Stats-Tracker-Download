# Rapport des correctifs FREE / PRO – DarkOrbit Tracker

**Date :** 11 février 2025  
**Contexte :** Corrections issues du prompt Cursor (console Electron, hard reset, formulaire stats, événements, vider le cache, format des nombres).

---

## 1. Fichiers modifiés

| Fichier | Modifications |
|---------|----------------|
| `main.js` | Suppression de l’ouverture automatique des DevTools au lancement ; console uniquement via F12. |
| `src/backend/version-badges.js` | PRO : `eventsTab: true`, `eventsSidebarViewAllButton: true` ; BADGE_TABS : PRO inclut l’onglet Événements. |
| `src/backend/reset.js` | Hard reset asynchrone : suppression des sessions Supabase (utilisateur connecté) puis suppression locale ; popup formulaire stats obligatoire. |
| `src/frontend/script.js` | Appel asynchrone à `hardReset()` au clic sur le bouton. |
| `src/backend/unified-storage.js` | Nouvelle méthode `clearAllAppDataExceptAuth()` : suppression de toutes les données locales sauf clés `sb-*` (auth Supabase). |
| `src/backend/settings.js` | Bouton « Vider le cache » : suppression complète (local + sessions Supabase si connecté), mise à jour espace utilisé, popup stats obligatoire. |
| `src/backend/baseline-setup.js` | Validation non bloquante : valeurs négatives ramenées à 0 + toast ; champs restent éditables ; utilisation de `numFormat` pour les points de grade. |
| `src/backend/stats.js` | Ajout de `numFormat()`, exposition `window.numFormat` ; `getCurrentStats()` clamp des valeurs à ≥ 0 ; `loadCurrentStats()` et `formatNumberDisplay()` utilisent `numFormat`. |
| `src/backend/sessions.js` | Chargement d’une session dans le formulaire : affichage des nombres via `numFormat` (fallback `toLocaleString`). |
| `src/frontend/dropdown.js` | Saisie des points du prochain grade via `numFormat` si disponible. |

---

## 2. Changements appliqués (résumé)

- **Console Electron**  
  - Plus d’ouverture automatique des DevTools au démarrage.  
  - Accès à la console uniquement via F12 (ou raccourci développeur).

- **Hard reset / baseline**  
  - Si l’utilisateur confirme (taper « RESET ») :  
    1. Suppression des sessions de l’utilisateur connecté dans Supabase (`user_sessions`).  
    2. Suppression locale : SESSIONS, CURRENT_STATS, THEME, VIEW_MODE.  
    3. Réinitialisation des champs du formulaire.  
    4. Affichage du popup de saisie des stats (accès bloqué tant que les stats ne sont pas enregistrées).  
  - Le bouton reste visible pour FREE et PRO (non réservé aux ADMIN/SUPERADMIN).

- **Réinitialiser les stats dans le formulaire**  
  - Champs honor, xp, rankPoints, nextRankPoints restent éditables.  
  - Validation côté frontend : valeurs négatives ramenées à 0 avec toast, sans bloquer la saisie ni l’enregistrement.

- **Événements**  
  - FREE : onglet et sidebar Événements masqués (`BADGE_TABS` sans `events`, `eventsTab: false`).  
  - PRO / ADMIN / SUPERADMIN : onglet Événements visible ; visibilité gérée par `currentCanAccessTab('events')` et `get_user_permissions`.

- **Vider le cache**  
  - Suppression de toutes les données locales (sessions, stats, paramètres, etc.) sauf les clés d’auth Supabase (`sb-*`).  
  - Si connecté : suppression des `user_sessions` côté Supabase pour l’utilisateur courant.  
  - Mise à jour immédiate de l’espace utilisé (`updateDataInfo()`).  
  - Popup formulaire obligatoire pour ressaisir les stats (`setAppAccessFromSessions(0)` + `initBaselineSetup(true)`).

- **Format des nombres**  
  - Fonction centrale `numFormat(num)` dans `stats.js` : virgules, séparateur de milliers (style en-US), valeurs négatives affichées comme 0.  
  - Exposée en `window.numFormat` pour réutilisation.  
  - Utilisée pour : formulaire stats (honor, xp, rankPoints, nextRankPoints), chargement de session, baseline, dropdown grade.  
  - Validation : `getCurrentStats()` impose des valeurs ≥ 0 (Math.max(0, …)).

---

## 3. Vérifications / tests possibles

1. **Console**  
   - Lancer l’app : la console ne s’ouvre pas.  
   - Appuyer sur F12 : la console s’ouvre/ferme.

2. **Hard reset**  
   - En tant que FREE ou PRO (connecté ou non) : cliquer sur « Hard reset », taper « RESET », valider.  
   - Vérifier : sessions et stats supprimées en local ; si connecté, sessions Supabase supprimées ; popup de saisie des stats s’affiche ; après saisie, accès à l’app normal.

3. **Formulaire stats / baseline**  
   - Saisir des valeurs négatives dans le formulaire baseline ou stats : un toast signale la correction, les valeurs sont enregistrées à 0.  
   - Vérifier que tous les champs restent éditables et que les nombres s’affichent avec des virgules (ex. 1,000,000).

4. **Événements**  
   - Compte FREE : onglet « Événements » absent.  
   - Compte PRO / ADMIN / SUPERADMIN : onglet « Événements » visible et utilisable.

5. **Vider le cache**  
   - Cliquer sur « Vider le cache » dans Paramètres, confirmer.  
   - Vérifier : espace utilisé mis à jour ; popup de saisie des stats ; si connecté, sessions Supabase supprimées pour l’utilisateur.

6. **Format nombres**  
   - Vérifier dans Stats, Historique, Progression que les nombres (XP, points, honneur) s’affichent avec séparateur de milliers (ex. 1,234,567).

7. **Supabase**  
   - Après hard reset ou vider le cache (utilisateur connecté) : vérifier dans la table `user_sessions` que les lignes de l’utilisateur ont bien été supprimées (RLS et droits inchangés).

---

*Rapport généré à l’issue des correctifs demandés. Style UI et limites FREE/PRO existantes respectés.*
