# Rapport — Corrections Security Advisor Supabase

**Date :** 2026-03-02  
**Contexte :** Correction des warnings du Security Advisor (Function Search Path, RLS Always True, Leaked Password non traité dans le code).

---

## 1. Warning 1 — Function Search Path Mutable (`public.safe_bigint`)

### Problème
La fonction `public.safe_bigint(TEXT)` n’avait pas de `search_path` fixé, ce qui peut être un vecteur d’injection (recherche de schéma mutable).

### Correction appliquée
- **Fichier :** `supabase/migrations/20260302130000_fix_search_path_safe_bigint.sql`
- **Action :** `ALTER FUNCTION public.safe_bigint(TEXT) SET search_path = '';`
- La fonction ne référence aucune table (uniquement `COALESCE`, `NULLIF`, `trim`, cast `::BIGINT`), donc `search_path = ''` n’a pas d’impact fonctionnel.

**Statut :** corrigé.

---

## 2. Warnings 2, 3, 4 — RLS Policy Always True sur `public.events` (×3)

### Problème
Trois policies sur `public.events` utilisaient `USING (true)` ou `WITH CHECK (true)` pour INSERT, UPDATE et DELETE, rendant les écritures trop permissives.

### Définition actuelle de la table
- **Colonnes :** `id`, `visible`, `expires_at`, `created_at`, `event_data`
- **Pas de colonne `user_id`** : la table sert aux événements sidebar (globaux), pas à des données par utilisateur.

### Stratégie retenue
- Les écritures réelles passent **uniquement** par des RPC **SECURITY DEFINER** :
  - `upsert_sidebar_events()`
  - `delete_event_by_id()`
  - `cleanup_expired_events()`
- Le client n’effectue **aucun** INSERT/UPDATE/DELETE direct sur `public.events` (uniquement des appels RPC).
- **Correction :** suppression des trois policies permissives, **sans** recréer de policy INSERT/UPDATE/DELETE pour `authenticated` / `anon`.
- Effet : les clients ne peuvent plus écrire directement sur la table ; les RPC (exécutées avec les droits du propriétaire) contournent RLS et continuent de fonctionner.

### Fichier de migration
- **Fichier :** `supabase/migrations/20260302130001_fix_rls_always_true_events.sql`
- **Actions :**
  - `DROP POLICY "events_insert_anon" ON public.events;`
  - `DROP POLICY "events_update_anon" ON public.events;`
  - `DROP POLICY "events_delete_anon" ON public.events;`
- Aucune nouvelle policy d’écriture pour les rôles client.

**Statut :** corrigé.

### Vérification manuelle
- **Colonne `user_id` :** la table `events` n’en dispose pas ; la logique métier (sidebar globale + RPC) justifie de ne pas en ajouter et de réserver l’écriture aux RPC.
- **Logique métier :** cohérente avec l’usage actuel (sidebar, timers, nettoyage par RPC).

---

## 3. Warning 5 — Leaked Password Protection

- À activer dans le **dashboard Supabase** : Authentication → Email → option dédiée.
- Aucune modification de code demandée.

**Statut :** non traité dans ce rapport (réglage manuel).

---

## 4. Vérification transversale — Autres tables avec policies « always true » en écriture

Recherche dans `supabase/migrations/` des policies **INSERT / UPDATE / DELETE / ALL** utilisant `USING (true)` ou `WITH CHECK (true)` :

| Table / Fichier | Policy | Remarque |
|-----------------|--------|----------|
| **public.events** | `events_insert_anon`, `events_update_anon`, `events_delete_anon` | Corrigé par `20260302130001_fix_rls_always_true_events.sql` (suppression des policies). |
| **public.player_profiles** | `"Service insert/update"` FOR ALL USING (true) WITH CHECK (true) | Définie dans `create-player-profiles-table.sql`. Déjà remplacée dans `fix-security-search-path.sql` par des policies strictes : `"Authenticated read"` (SELECT) et `"Service write"` (ALL avec `auth.role() = 'service_role'`). Aucune action supplémentaire. |

**Autres policies `USING (true)` trouvées :**
- Uniquement sur **SELECT** (lecture) : `shared_events`, `shared_rankings_snapshots`, `shared_rankings_dostats_snapshots`, `license_keys`, etc. Ce sont des politiques de lecture publique, hors périmètre « écriture trop permissive ».

**Conclusion :** Aucune autre table ne nécessite de correction pour des policies d’écriture « always true » dans le périmètre demandé.

---

## 5. Récapitulatif

| Élément | Statut |
|--------|--------|
| **public.safe_bigint** — `SET search_path = ''` | Corrigé (migration `20260302130000`) |
| **public.events** — 3 policies RLS toujours vraies | Corrigé (migration `20260302130001`, policies supprimées) |
| **Leaked Password Protection** | À régler manuellement dans le dashboard Supabase |
| **Autres tables (write policies always true)** | Aucune à corriger (player_profiles déjà durci ailleurs) |

---

## 6. Ordre d’application des migrations

À appliquer après les migrations existantes, dans l’ordre :

1. `20260302130000_fix_search_path_safe_bigint.sql`
2. `20260302130001_fix_rls_always_true_events.sql`

Après application, vérifier dans le Security Advisor que les alertes concernées disparaissent.
