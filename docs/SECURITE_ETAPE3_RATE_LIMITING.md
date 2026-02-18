# Sécurité — Étape 3 : Rate limiting sur les RPC sensibles

**Date :** février 2026  
**Objectif :** Limiter les appels aux RPC critiques pour éviter le spam et les abus.

---

## Fichiers créés / modifiés

| Fichier | Description |
|---------|-------------|
| `supabase/migrations/security-step3-rate-limiting.sql` | Table `rate_limit_tracker` + fonction `check_rate_limit` |
| `supabase/migrations/security-step3-rate-limit-rpcs.sql` | Injection du rate limit dans `insert_user_session_secure` et `upsert_user_session_secure` |
| `src/backend/sync-manager.js` | Throttle client : min. 15 s entre deux syncs via `queueSync`, gestion erreur RATE_LIMIT |

---

## Procédure d'exécution

1. Ouvrir le **Dashboard Supabase** → **SQL Editor**
2. Exécuter **dans l'ordre** :
   - `security-step3-rate-limiting.sql`
   - `security-step3-rate-limit-rpcs.sql`
3. Vérifier qu'aucune erreur n'apparaît

---

## Limites appliquées

| RPC | Quota | Fenêtre |
|-----|-------|---------|
| `insert_user_session_secure` | 30 appels | par minute |
| `upsert_user_session_secure` | 60 appels | par minute |

**Throttle client :** `queueSync` ne déclenche pas une sync si la précédente date de moins de 15 secondes.

---

## Comportement en cas de dépassement

- **Côté serveur :** la RPC lève l'exception `RATE_LIMIT_EXCEEDED`.
- **Côté client :** le sync-manager détecte l'erreur et affiche : *"Trop de requêtes. Réessayez dans une minute."*

---

## Important : versions des RPC

La migration `security-step3-rate-limit-rpcs.sql` réécrit les fonctions de session avec la logique **sans limite de sessions** (illimité pour tous les badges). Si vous utilisez une version avec limites (FREE=1, PRO=10), il faudra fusionner manuellement le rate limit dans vos RPC existantes.

---

## Vérification post-migration

### 1. Table et fonction

```sql
SELECT * FROM rate_limit_tracker LIMIT 0;
SELECT check_rate_limit('test', 10);
```

Aucune erreur attendue.

### 2. Comportement normal

- Sauvegarde de session → sync déclenché
- Nouvelle sauvegarde dans les 15 s → sync **non** déclenché (throttle)
- Après 15 s → sync autorisé

### 3. Dépassement (test manuel)

Appeler la RPC plus de 30 fois en 1 minute → erreur `RATE_LIMIT_EXCEEDED`.

---

## Validation

- [ ] Les deux scripts SQL exécutés sans erreur
- [ ] Sauvegarde de session fonctionne
- [ ] Toast "Trop de requêtes" en cas de dépassement (optionnel, test manuel)
- [ ] Aucune régression sur le sync normal

---

**Passer à l'étape 4 uniquement après validation humaine.**
