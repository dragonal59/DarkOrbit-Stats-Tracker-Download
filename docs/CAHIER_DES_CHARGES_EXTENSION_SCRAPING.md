# Cahier des charges — Extension de scraping des classements DarkOrbit

**Version :** 2.0  
**Date :** 15 février 2025  
**Statut :** Implémenté (v2.1) — Phase 1 livrée

---

## 1. Vue d'ensemble

### 1.1 Objectif
Intégrer une extension Chrome/Vivaldi de scraping des classements DarkOrbit dans l’application Electron DarkOrbit Stats Tracker Pro, afin de collecter automatiquement les classements (Top User, Honneur, Expérience) et les boosters 50 % sur 23 serveurs.

### 1.2 Périmètre Phase 1
- **Collecte mono-compte** (un seul compte DarkOrbit par collecte)
- **23 serveurs** à parcourir
- **6 pages par serveur** : Top User (2), Honneur (2), Expérience (2)
- **Collecte planifiée** : 00:00 et 12:00 heure de Paris

---

## 2. Configuration serveurs

### 2.1 Liste des 23 serveurs (ordre de collecte)

| # | Code | Libellé |
|---|------|---------|
| 1 | gbl5 | Global 5 - Callisto (prioritaire) |
| 2 | de2 | Allemagne 2 |
| 3 | de4 | Allemagne 4 |
| 4 | es1 | Espagne |
| 5 | fr1 | France |
| 6 | gbl1 | Global JcE |
| 7 | gbl3 | Global 3 - Titan |
| 8 | gbl4 | Global 4 - Europa |
| 9 | int1 | Europe Globale |
| 10 | int2 | Amérique Globale |
| 11 | int5 | Europe Globale 2 |
| 12 | int6 | Amérique Globale 2 |
| 13 | int7 | Europe Globale 3 |
| 14 | int11 | Europe Globale 5 |
| 15 | int14 | Europe Globale 7 |
| 16 | mx1 | Mexique 1 |
| 17 | pl3 | Pologne 3 |
| 18 | ru1 | Russie |
| 19 | ru5 | Russie 5 |
| 20 | tr3 | Turquie 3 |
| 21 | tr4 | Turquie 4 |
| 22 | tr5 | Turquie 5 |
| 23 | us2 | USA Ouest |

**Séquence :** gbl5 en premier, puis ordre alphabétique pour les 22 autres.

### 2.2 URLs de classement
- **Pattern :** `https://{serverCode}.darkorbit.com/indexInternal.es?action=internalHallofFame&view={ViewType}`
- **ViewType :** `User` (Top User), `UserHonor`, `UserEP` (Expérience)

---

## 3. Timing et contraintes

| Paramètre | Valeur |
|-----------|--------|
| Délai entre pages | 60 000 – 180 000 ms (aléatoire) |
| Timeout par page | 300 secondes (5 minutes) |
| Durée chargement après clic serveur | 10 s – 3 min (variable) |

---

## 4. Détection d'erreur « trop de clics »

### 4.1 Message exact
> « Doucement pilote, il semble que vous avez cliqué trop de fois »

### 4.2 Spécifications
- **Détection :** Dans le DOM ou le titre de la page
- **Action :** Mise en pause de la collecte
- **Logger :** Événement + avertissement dans l’UI Super Admin
- **Reprise :** Automatique après pause

### 4.3 Recommandation — Durée de pause optimale
**Recommandation : 10 minutes.**

| Durée | Avantages | Inconvénients |
|-------|-----------|---------------|
| 5 min | Reprise rapide | Risque de retrigger immédiat |
| **10 min** | **Compromis robuste** | Acceptable |
| 15 min | Marge maximale | Collecte rallongée |

**Justification :** Le client indique une erreur environ toutes les 2 h. Une pause de 10 min laisse le temps au système DarkOrbit de réinitialiser son compteur interne tout en restant acceptable pour l’utilisateur. Stocker la durée en configuration (Super Admin) pour ajustement ultérieur.

### 4.4 Recommandation — Multi-langue (erreur)
Le message sera traduit selon le serveur. **Stratégie :**
1. **Sélecteurs structurels** : repérer un conteneur d’erreur type modal/overlay (classes/id stables).
2. **Fichier de mapping** : liste de chaînes connues par langue (fr, de, en, tr, ru, pl, es, mx). Recherche de sous-chaînes clés (« doucement », « too many », « zu oft », « çok fazla », etc.).
3. **Fallback** : si structure typique (modal + bouton fermer) détectée, considérer comme erreur rate-limit même sans correspondance exacte.

---

## 5. Navigation et chargement

### 5.1 Comportement après clic sur un serveur

1. **Clic** sur le lien serveur → **rechargement complet** de la page.
2. **Popup d’événement** peut apparaître de manière aléatoire → **à fermer** avant de continuer.
3. **Page d’accueil** : événements (boosters), top 10, boutons (Hangar, Skylab, Magasin).
4. **Temps de chargement** : 10 s à 3 min.

### 5.2 Recommandation — Détection et fermeture des popups

**Stratégie en 3 couches :**

1. **Par structure HTML :**
   - Overlays/modals DarkOrbit : classes/id récurrents (ex. `#lightbox`, `.modal`, `.popup`, `[class*="event"]`).
   - Repérer les éléments avec `z-index` élevé, `position: fixed`, `display: block` sur les overlays.

2. **Par timing :**
   - Après changement de serveur : boucle d’attente (polling 500 ms) pendant 15 s max.
   - À chaque cycle : chercher overlay visible + bouton fermer (texte « X », « Fermer », « Close » ou icône).
   - Cliquer sur le bouton si trouvé, puis vérifier disparition.

3. **Fallback :**
   - Clic sur zone « backdrop » (en dehors du contenu) pour fermer.
   - Si aucun sélecteur ne marche : mapping multi-langue des textes « Fermer » / « Close » / « Schließen » / « Kapat » / etc.

**Robustesse :** Considérer les popups comme non-bloquantes si, après 15 s, aucun overlay n’est détecté — la page est probablement prête.

### 5.3 Recommandation — Attente intelligente du chargement

**Stratégie : attente sur éléments stables (sélecteurs structurels).**

1. **Éléments cibles (choisir au moins 2) :**
   - Boutons de navigation (Hangar, Magasin, Skylab).
   - Bloc du classement top 10.
   - Sélecteurs par ID ou classes structurelles (pas de texte).

2. **Algorithme :**
   - Démarrer un timer de 300 s (timeout).
   - Polling toutes les 500 ms : `document.querySelectorAll(selecteurs)`.
   - Dès que ≥ 2 éléments cibles sont visibles et stables (2 checks consécutifs à 1 s d’intervalle) → page prête.
   - Sinon : après 300 s → timeout, serveur marqué en erreur, passage au suivant.

3. **Éviter :** `load` event seul (SPA) et délais fixes.

### 5.4 Navigation vers les classements
- Depuis la page d’accueil : navigation directe vers les URLs Hall of Fame via `action=internalHallofFame&view=...`.
- Pas besoin de cliquer sur des onglets : l’URL suffit.
- Même logique d’attente sur éléments du tableau de classement avant extraction.

---

## 6. Authentification

### 6.1 Flow
1. **Premier lancement** : popup/modal (email + mot de passe) + option « Mémoriser la session ».
2. **Connexion** : l’app se connecte via les credentials.
3. **Collectes suivantes** : réutilisation de la session (cookies).
4. **Session expirée** : réafficher le popup.

### 6.2 Recommandation — Stockage sécurisé des credentials

**Approche recommandée : Electron safeStorage + Keychain (OS).**

1. **Ne jamais stocker le mot de passe en clair.**
2. **Session mémorisée :**
   - Stocker uniquement les **cookies de session** nécessaires (identifiants de session).
   - Chiffrer les cookies avec `safeStorage.encryptString()` (Electron 22+).
   - Stockage : fichier local chiffré ou `electron-store` avec chiffrement.
3. **Si « Mémoriser » non coché :** garder la session en mémoire seulement pour la durée de l’exécution.
4. **Keychain (macOS/Windows) :** pour les credentials si nécessaire — préférer les cookies chiffrés pour éviter de stocker le mot de passe.

**Architecture :**
- Module `session-store.js` : lecture/écriture des cookies chiffrés.
- Au démarrage collecte : tenter de restaurer la session depuis les cookies chiffrés.
- Si échec (401, redirect login) : invalider la session et afficher le popup.

---

## 7. Multi-langue

### 7.1 Problématique
La langue change selon le serveur (fr1→français, de2/de4→allemand, tr→turc, ru→russe, pl→polonais, gbl/int/us2/mx1→anglais). Les sélecteurs basés sur du texte échouent.

### 7.2 Recommandation — Scraping indépendant de la langue

**Principe : sélecteurs structurels uniquement.**

1. **Sélecteurs privilégiés :**
   - ID (`#xxx`)
   - Classes structurelles stables (liées au layout : `.hof_ranking_table`, `.rank_position`, `[data-*]`)
   - Hiérarchie DOM (ex. `table.ranking > tbody > tr`)

2. **À éviter :**
   - `contains(text())`, `:contains()`
   - Textes visibles pour la logique métier

3. **Données numériques :**
   - Rangs, valeurs : toujours des chiffres → extraction par regex/parse, pas par libellé.

4. **Boosters 50 % :**
   - Repérer par **structure** (bloc événement, icône, classe CSS) plutôt que par texte « 50 % honneur ».
   - Si le type doit être distingué : pattern « 50 » + structure (ordre des blocs Honor vs XP sur la page).

5. **Tests obligatoires :** fr1, de2, gbl5 minimum. Idéalement : tr3, ru1, pl3.

---

## 8. Boosters 50 %

### 8.1 Où
- **Page d’accueil** : visible mais peu détaillé.
- **Pages de classement (Honor, XP)** : source principale.

### 8.2 Données à extraire
- Type (50 % Honneur / 50 % Expérience)
- Statut (actif / inactif)
- Dates/heures : incertain — à vérifier sur les pages réelles.

### 8.3 Structure de données proposée

```json
{
  "serverCode": "gbl5",
  "collectedAt": "2025-02-15T12:00:00.000Z",
  "boosters": {
    "honor50": { "active": true, "startDate": null, "endDate": null },
    "experience50": { "active": false, "startDate": null, "endDate": null }
  }
}
```

- Si date/heure présente dans le DOM : remplir `startDate` et `endDate`.
- Sinon : `null` + `collectedAt` comme référence.

### 8.4 Intégration dans le flux
Collecter les boosters **sur la première page de classement** (Honor ou XP) de chaque serveur, avant ou après extraction des rangs. Une seule détection par serveur suffit si les deux types sont visibles sur la même page.

---

## 9. Gestion des données partielles et reprise

### 9.1 Stratégie
- **Sauvegarde incrémentale** après chaque serveur réussi.
- **Reprise intelligente** au prochain lancement.

### 9.2 Recommandation — Architecture de progression

**Double stockage : local + Supabase.**

| Stockage | Contenu | Rôle |
|----------|---------|------|
| **Fichier local** `collect-state.json` | `{ lastRunId, servers: { gbl5: "success", de2: "success", ... int5: "error" }, lastError, startedAt }` | Reprise rapide, offline |
| **Table Supabase** `collection_runs` | `run_id, server_code, status, collected_at, error_message` | Audit, cohérence, UI |

**Flux :**
1. Au démarrage d’une collecte : créer un `run_id`, initialiser l’état.
2. Après chaque serveur réussi : push vers Supabase + mise à jour du fichier local.
3. En cas d’échec : marquer le serveur en erreur, logger, continuer.
4. Au prochain lancement : lire l’état, proposer « Reprendre à partir de X » ou « Recommencer ».

### 9.3 Cohérence et upsert
- **Clé unique** : `(run_id, server_code)` ou `(profile_id, server_code, exported_at)` selon le schéma Supabase existant.
- **Upsert** : `ON CONFLICT (profile_id, server_code, exported_at) DO UPDATE` pour éviter les doublons si un serveur est recollecté.

### 9.4 UI Super Admin
- Afficher : « Dernière collecte : 10/23 serveurs, 3 erreurs ».
- Boutons : « Reprendre » (à partir du premier en échec) et « Recommencer ».

---

## 10. Chemin de l’extension

**Emplacement :** `/src/extensions/rankings/`

**Structure proposée :**
```
src/
  extensions/
    rankings/
      manifest.json
      content.js
      background.js (si nécessaire)
      ...
```

**Chargement Electron :** `session.loadExtension(path.join(__dirname, 'extensions', 'rankings'))` — utiliser un chemin résolu pour fonctionner en dev et après build (par ex. `path.join(app.getAppPath(), 'src', 'extensions', 'rankings')` ou équivalent selon la structure du build).

---

## 11. Format JSON de sortie (rappel)

```json
{
  "exportedAt": "2025-02-15T12:00:00.000Z",
  "serverCode": "gbl5",
  "players": [
    {
      "name": "...",
      "grade": "...",
      "top_user_rank": 1,
      "top_user_value": 123456,
      "honor_rank": 1,
      "honor_value": 98765,
      "experience_rank": 1,
      "experience_value": 54321
    }
  ]
}
```

Fusion par serveur au niveau de l’application (même joueur sur plusieurs pages → consolidation).

---

## 12. Récapitulatif des priorités

| Priorité | Thème | Statut |
|----------|-------|--------|
| **CRITIQUE** | Navigation après clic serveur (popups, attente) | Recommandations définies |
| **CRITIQUE** | Multi-langue (sélecteurs structurels) | Recommandations définies |
| **CRITIQUE** | Sauvegarde partielle + reprise | Recommandations définies |
| **HAUTE** | Authentification sécurisée | Recommandations définies |
| **HAUTE** | Timeout 5 min | Spécifié |
| **HAUTE** | Détection erreur « trop de clics » | Spécifié + pause 10 min |
| **MOYENNE** | Ordre de collecte (gbl5 puis alpha) | Spécifié |
| **MOYENNE** | Collecte boosters | Spécifié |
| **BASSE** | Chemin extension | Spécifié |

---

## 13. Questions résolues

| Question | Réponse |
|----------|---------|
| Durée de pause après « trop de clics » | 10 minutes (configurable) |
| Détection popups | Structure HTML + timing + mapping textes fermeture |
| Attente chargement | Polling sur sélecteurs structurels, timeout 5 min |
| Architecture progression | Fichier local + table Supabase `collection_runs` |
| Scraping multi-langue | Sélecteurs structurels uniquement, tests fr1/de2/gbl5 |
| Stockage credentials | Cookies chiffrés via `safeStorage`, pas de mot de passe en clair |

---

## 14. Implémentation (v2.1)

- Extension : `/src/extensions/rankings/` (config, content, background, selectors, utils)
- Contrôleur Electron : `/electron/ranking-collector.js`
- UI : section « Collecte classements » dans Super Admin
- **Authentification** : l'utilisateur doit se connecter manuellement à DarkOrbit dans la fenêtre de collecte (première navigation). Popup credentials prévu en évolution.
