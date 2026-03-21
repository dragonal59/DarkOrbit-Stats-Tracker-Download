# Audit — Onglet Progression

## Périmètre
- Contenu de l’onglet **Progression** (analyse de progression, gains, graphiques, prédictions, comparaison temporelle).
- Lien avec la **barre de progression** dans le header et la section **« Progression vers le prochain grade »** (onglet Statistiques) lorsque les données sont partagées ou affichées de façon cohérente.

## Sources de données
- **Sessions** : `getSessions()` (filtré par `getActivePlayerId()`), tri chronologique.
- **Référence « Gains du jour »** : `getReferenceSession(sessions)` → session précédente chronologique, ou baseline, ou zéro (reference-manager.js).
- **Calcul des gains** : `calculateGains(latestSession, reference)` (honor, xp, rankPoints ; supporte `rank_points` en fallback).
- **Header / barres (Stats)** : `getHeaderStatsSource()` → dernière session ou `CURRENT_STATS` (formulaire), via stats.js.

---

## Incohérences et corrections à prévoir

### 1. **Libellé « Moyenne …/jour » vs valeur « par session »**
- **Où** : Bloc « Statistiques détaillées » (advancedStats) : labels « Moyenne honneur/jour », « Moyenne XP/jour », « Moyenne points de grade/jour ».
- **Problème** : Les valeurs affichées dans `#avgHonorPerDay`, `#avgXpPerDay`, `#avgRankPerDay` sont en réalité **moyennes par session** (`avgHonorPerSession`, `avgXpPerSession`, `avgRankPerSession`). Les moyennes par jour (`avgXpPerDay`, `avgRankPerDay`) sont calculées mais utilisées uniquement pour les prédictions, pas pour ces champs.
- **Correction** : Soit afficher les moyennes **par jour** (calculer aussi `avgHonorPerDay = totalHonorGain / daysDiff` et l’utiliser), soit renommer les labels en « Moyenne …/session » et garder les valeurs actuelles.

### 2. **« Gains du jour » indépendants du formulaire**
- **Où** : Carte « Gains du jour » dans l’onglet Progression.
- **Problème** : Les gains sont calculés entre la **référence** et la **dernière session enregistrée** uniquement. Les valeurs du formulaire (onglet Statistiques) non sauvegardées ne sont jamais prises en compte. L’utilisateur peut avoir l’impression que « gains du jour » inclut sa saisie en cours.
- **Correction** : Documenter clairement (« Gains par rapport à la dernière session enregistrée ») et/ou proposer un mode « inclure les stats en cours » (comparer référence vs `getCurrentStats()` si le formulaire est rempli).

### 3. **« Session précédente » avec 2 sessions et pas de baseline**
- **Où** : Carte « Session précédente » (gains Honneur / XP / Points grade de l’avant-dernière session).
- **Problème** : `refForPrevious = beforePrevious || (oldest.is_baseline ? oldest : null)`. Avec **exactement 2 sessions** et **pas de baseline**, `refForPrevious` est `null`, donc les gains affichés sont `previous - 0` (= valeurs brutes de la session précédente), pas le gain réel de cette session.
- **Correction** : Utiliser la session précédente chronologique comme référence :  
  `refForPrevious = beforePrevious ?? oldest` (toujours `oldest` quand il n’y a pas de `beforePrevious`).

### 4. **« Meilleure session » : somme de grandeurs hétérogènes**
- **Où** : Calcul de la « meilleure session » (boucle sur les sessions, comparaison des gains).
- **Problème** : Le score est `(honor diff) + (xp diff) + (rankPoints diff)`. On additionne honneur, XP et points de grade, qui n’ont pas la même échelle ni la même unité, ce qui fausse la notion de « meilleure » session.
- **Correction** : Définir un critère unique (ex. « meilleure en XP » ou « meilleure en honneur ») ou afficher trois « meilleures » sessions (une par métrique), ou utiliser un score normalisé (ex. gains en % par rapport à la moyenne).

### 5. **Risque d’undefined sur `rankPoints` dans les sessions**
- **Où** : progression.js et charts.js utilisent `session.rankPoints`, `latest.rankPoints`, etc.
- **Problème** : Les sessions Supabase sont normalisées en `rankPoints` à la lecture. Si d’autres chemins (import, merge, ancien format) fournissent uniquement `rank_points`, les calculs et graphiques peuvent voir `undefined` et produire des NaN ou des courbes incorrectes.
- **Correction** : Utiliser partout un accesseur du type `(s.rankPoints ?? s.rank_points ?? 0)` (ou une fonction `getSessionRankPoints(s)`) pour les calculs et les graphiques.

### 6. **Cohérence header / onglet Progression**
- **Où** : Barre de progression du header (stats.js) vs cartes et gains dans l’onglet Progression.
- **Problème** : Le header utilise `getHeaderStatsSource()` (dernière session **ou** `CURRENT_STATS`), alors que l’onglet Progression ne travaille que sur les **sessions enregistrées**. Les deux peuvent donc afficher des états différents (ex. formulaire modifié mais non sauvegardé).
- **Correction** : Soit documenter la différence, soit faire en sorte que l’onglet Progression propose clairement un « état actuel » (formulaire) vs « état enregistré » (sessions) pour éviter la confusion.

### 7. **Prédictions « prochain grade » et `nextRankPoints`**
- **Où** : `updatePredictions` : `rankPointsNeeded = (latestSession.nextRankPoints || nextRankData.rankPoints) - latestSession.rankPoints`.
- **Problème** : Si la session n’a pas `nextRankPoints` (ou `next_rank_points`), on utilise le seuil statique de `RANKS_DATA`. Les seuils du jeu peuvent évoluer ; les prédictions peuvent alors être fausses.
- **Correction** : Privilégier `latestSession.nextRankPoints` / `next_rank_points` quand il est renseigné ; documenter que le fallback sur `RANKS_DATA` est une approximation.

### 8. **Comparaison temporelle « cette semaine / semaine dernière »**
- **Où** : `updateTimeComparison` (début de semaine = lundi).
- **Problème** : Si l’historique ou d’autres écrans utilisent une autre règle (dimanche, ou semaine calendaire), les chiffres « cette semaine » / « semaine dernière » ne seront pas alignés avec le reste de l’app.
- **Correction** : Centraliser la définition de « début de semaine » (ex. `getWeekStart`) et l’utiliser partout (Progression, Historique, etc.).

### 9. **Division par zéro / cas limites**
- **Où** : `avgHonorPerSession = totalHonorGain / (sessions.length - 1)` quand `sessions.length === 2` ; `daysDiff = Math.max(1, ...)`.
- **Problème** : Avec 2 sessions, le dénominateur est 1, pas de bug. Si un jour `sessions.length` ou `daysDiff` venait à être 0, des divisions par zéro pourraient apparaître.
- **Correction** : S’assurer que tous les calculs de moyennes (par session, par jour) utilisent un dénominateur au moins 1 ou ne s’exécutent que lorsque `sessions.length >= 2`.

### 10. **i18n et libellés en dur**
- **Où** : Plusieurs textes dans progression.js sont en français en dur (« Gains du jour », « Session précédente », « Moyennes / session », « Progression totale », « Point de départ », etc.).
- **Problème** : Incohérent avec le reste de l’app qui passe par `data-i18n` / traductions.
- **Correction** : Utiliser les clés d’i18n existantes ou en ajouter, et remplacer les chaînes en dur par des appels de traduction.

---

## Synthèse des corrections prioritaires

| Priorité | Point | Action |
|----------|--------|--------|
| Haute | Libellé « /jour » vs valeur « /session » | Aligner libellés et valeurs (soit afficher moyennes/jour, soit renommer en « /session »). |
| Haute | Session précédente (2 sessions, sans baseline) | Utiliser `refForPrevious = beforePrevious ?? oldest`. |
| Moyenne | Meilleure session (somme honneur + xp + rp) | Changer de critère (une métrique ou trois « meilleures » ou score normalisé). |
| Moyenne | Robustesse `rankPoints` | Utiliser `rankPoints ?? rank_points ?? 0` (ou accesseur) partout. |
| Basse | Gains du jour vs formulaire | Documentation et/ou option « inclure stats en cours ». |
| Basse | Prédictions et `nextRankPoints` | Privilégier la valeur session, documenter le fallback. |
| Basse | Début de semaine | Centraliser `getWeekStart` pour Progression et Historique. |
| Basse | i18n | Remplacer les textes en dur par des clés de traduction. |

---

## Fichiers concernés
- `src/backend/progression.js` (logique principale, gains, prédictions, comparaison temporelle, meilleure session).
- `src/backend/reference-manager.js` (référence et calcul des gains).
- `src/backend/stats.js` (header, getCurrentLevel, getNextLevel, updateHeaderProgressBar).
- `src/frontend/charts.js` (données des graphiques : honor, xp, rankPoints).
- `src/index.html` (structure de l’onglet Progression et des blocs « Statistiques détaillées »).
- `src/backend/sessions.js` (forme des sessions : rankPoints, currentRank, etc.).
