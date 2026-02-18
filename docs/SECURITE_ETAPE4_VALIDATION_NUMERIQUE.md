# Sécurité — Étape 4 : Validation stricte des valeurs numériques

**Date :** février 2026  
**Objectif :** Rejeter les valeurs aberrantes (négatives, hors plage) dans les RPC critiques.

---

## Fichiers créés / modifiés

| Fichier | Description |
|---------|-------------|
| `supabase/migrations/security-step4-validate-numeric.sql` | Fonctions `safe_bigint` et `validate_session_row` |
| `supabase/migrations/security-step4-validate-rpcs.sql` | Injection de la validation dans les RPC sessions |
| `src/backend/sync-manager.js` | Gestion erreur "invalide" / check_violation |

---

## Procédure d'exécution

1. Ouvrir le **Dashboard Supabase** → **SQL Editor**
2. Exécuter **dans l'ordre** :
   - `security-step4-validate-numeric.sql`
   - `security-step4-validate-rpcs.sql`
3. Vérifier qu'aucune erreur n'apparaît

---

## Plages acceptées

| Champ | Min | Max |
|-------|-----|-----|
| honor | 0 | 9223372036854775807 (BIGINT max) |
| xp | 0 | 9223372036854775807 |
| rank_points | 0 | 9223372036854775807 |
| next_rank_points | 0 | 9223372036854775807 |
| session_timestamp | 0 | 4102444800000 (~année 2100 en ms) |

---

## Comportement

- **Valeurs négatives :** Refusées (exception `check_violation`)
- **Valeurs hors plage :** Refusées
- **Chaînes invalides** (ex. "abc") : Interprétées comme 0 via `safe_bigint`
- **session_timestamp = 0 ou absent :** Remplacé par le timestamp actuel

---

## Erreur côté client

En cas de données invalides : *"Données invalides. Vérifiez vos stats."*

---

## Validation

- [ ] Les deux scripts SQL exécutés sans erreur
- [ ] Sauvegarde de session normale fonctionne
- [ ] Test avec valeurs négatives (modification manuelle) → refus attendu
- [ ] Aucune régression

---

**Passer à l'étape 5 uniquement après validation humaine.**
