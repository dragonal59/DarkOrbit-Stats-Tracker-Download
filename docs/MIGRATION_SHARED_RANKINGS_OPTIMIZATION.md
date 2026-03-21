# Migration SQL — Optimisation shared_rankings (Profile Scraper)

**Date :** 21 février 2025  
**Rôle :** Expert DBA PostgreSQL / Supabase  
**Objectif :** Optimiser la base pour les champs `needs_review`, `blacklisted_until`, `profile_scraper_failures`

---

## 1. Analyse de la structure actuelle

### Table `shared_rankings` (inférée du code)

| Colonne       | Type        | Rôle                                      |
|---------------|-------------|-------------------------------------------|
| `server`      | TEXT        | Clé primaire (ex: gbl5, de2, fr1)         |
| `uploaded_at` | TIMESTAMPTZ | Date du dernier scrap                     |
| `players_json`| JSONB       | Tableau de joueurs (nom, points, company…) |

### Structure `players_json` (chaque élément)

```json
{
  "name": "Pseudo",
  "grade": "chief_general",
  "userId": "1lEHc",
  "honor_value": 106148067901,
  "experience_value": 2749270017532,
  "top_user_value": 3810750697,
  "company": "MMO",
  "needs_review": false,
  "blacklisted_until": "2025-02-22T12:00:00.000Z",
  "profile_scraper_failures": 0
}
```

### RPC `upsert_shared_ranking`

- **Paramètres :** `p_server` (TEXT), `p_players` (JSONB)
- **Comportement actuel :** Remplace entièrement `players_json` pour le serveur
- **Merge :** La fusion (classement + company + blacklist) est faite **dans l’application** avant l’appel. La RPC ne fait qu’un remplacement complet.

---

## 2. Gestion ON CONFLICT — Pas d’écrasement des données de classement

**Conclusion :** Aucun risque d’écrasement des données de classement.

- Le profile-scraper lit la ligne complète, modifie les joueurs en mémoire (ajout de `company`, `needs_review`, etc.), puis envoie le tableau complet.
- Le session-scraper et l’extension envoient aussi le tableau complet issu du scrap.
- La RPC remplace `players_json` par la valeur fournie. Tant que l’app envoie un tableau complet et cohérent, aucune donnée n’est perdue.

**Recommandation :** Conserver ce modèle (remplacement complet). Pas de merge côté base nécessaire.

---

## 3. Index — Performance de `fetchPlayersNeedingCompany`

### Situation actuelle

- `fetchPlayersNeedingCompany` fait un `SELECT server, uploaded_at, players_json` sans filtre.
- Le filtrage (userId, company, needs_review) est fait en JavaScript.
- La table contient environ une ligne par serveur (~23 lignes).

### Index proposés

| Index                         | Colonne(s)   | Utilité                                      |
|------------------------------|--------------|----------------------------------------------|
| PK sur `server`              | `server`     | Déjà présent, couvre les upserts             |
| GIN sur `players_json`       | `players_json` | Requêtes JSONB futures (optionnel)         |

**Note :** Pour l’instant, le volume est faible. Un index GIN sur `players_json` prépare des requêtes SQL plus complexes si besoin plus tard.

---

## 4. Colonne `updated_at` automatique

- Ajout de la colonne `updated_at TIMESTAMPTZ DEFAULT now()`.
- Trigger `BEFORE UPDATE` pour mettre à jour `updated_at` à chaque modification.
- La RPC met déjà à jour `uploaded_at` ; `updated_at` suit toute modification de la ligne.

---

## 5. RLS (Row Level Security)

### Stratégie proposée

- **SELECT :** Autorisé pour `authenticated` et `anon` (classement public).
- **INSERT / UPDATE / DELETE :** Aucune policy directe. Seule la RPC `upsert_shared_ranking` (SECURITY DEFINER) peut écrire.
- La RPC s’exécute avec les droits du propriétaire de la fonction et contourne le RLS pour ses opérations.

### Sécurité

- Les utilisateurs ne peuvent pas modifier `shared_rankings` directement.
- Seuls les appels à `upsert_shared_ranking` (avec token valide) permettent les mises à jour.
- Les champs `needs_review`, `blacklisted_until`, `profile_scraper_failures` sont dans `players_json` ; ils sont gérés comme le reste des données par la RPC.

---

## 6. Commandes SQL à exécuter

Exécuter le fichier suivant dans l’éditeur SQL Supabase :

```
supabase/migrations/optimize-shared-rankings-profile-scraper.sql
```

Ou copier-coller son contenu dans l’éditeur SQL du dashboard Supabase.

---

## 7. Vérifications post-migration

```sql
-- Vérifier la structure
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'shared_rankings'
ORDER BY ordinal_position;

-- Vérifier les index
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'shared_rankings';

-- Vérifier les policies RLS
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'shared_rankings';

-- Test RPC
SELECT upsert_shared_ranking('gbl5', '[{"name":"Test","userId":"x","company":"MMO"}]'::jsonb);
```

---

## 8. Résumé des changements

| Élément              | Action                                                |
|----------------------|--------------------------------------------------------|
| Table                | Création si absente, ajout de `updated_at`             |
| Trigger              | Mise à jour automatique de `updated_at`               |
| Index GIN            | Sur `players_json` pour requêtes JSONB                 |
| RPC                  | Création/remplacement de `upsert_shared_ranking`      |
| RLS                  | SELECT pour authenticated/anon, écriture via RPC seule |
