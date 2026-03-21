# Rapport Phase 3 — Corrections (RLS, script destructeur, session RPCs canoniques)

---

## Section 1 — RAPPORT DES CORRECTIONS

### Prompt 1 — RLS events (policies permissives) + RLS player_profiles

| Fichier | Ligne / bloc | Avant | Après | Statut |
|---------|--------------|-------|--------|--------|
| `supabase/migrations/20260303000007_fix-rls-events-final.sql` | Fichier entier (créé) | — | DROP policies `events_insert_anon`, `events_update_anon`, `events_delete_anon` ; ADD COLUMN `uploaded_by` si absent ; CREATE `events_insert_auth`, `events_update_own`, `events_delete_own` (authenticated, uploaded_by = auth.uid()). | ✅ Fait |
| `supabase/migrations/20260303000008_fix-rls-player-profiles.sql` | Fichier entier (créé) | — | DROP policy "Service insert/update" (USING true) ; CREATE `player_profiles_service_write` (FOR ALL, USING/WITH CHECK auth.role() = 'service_role'). | ✅ Fait |
| `docs/RAPPORT_RLS_EVENTS_PLAYER_PROFILES.md` | — | — | Rapport : requêtes pg_policies, contenu des migrations, policies actives après correction. | ✅ Fait |

### Prompt 2 — RLS license_keys (exposition des clés)

| Fichier | Ligne / bloc | Avant | Après | Statut |
|---------|--------------|-------|--------|--------|
| `supabase/migrations/20260303000009_fix-rls-license-keys.sql` | Fichier entier (créé) | — | DROP `license_keys_select` et "Users can view license keys" ; CREATE `license_keys_select_own` (FOR SELECT TO authenticated, USING activated_by = auth.uid()). | ✅ Fait |
| `docs/RAPPORT_RLS_LICENSE_KEYS.md` | — | — | Rapport : policies avant/après, confirmation qu’un utilisateur lambda ne peut plus lister les clés des autres. | ✅ Fait |

### Prompt 3 — RUN_FIRST_drop_policies.sql (script destructeur)

| Fichier | Ligne / bloc | Avant | Après | Statut |
|---------|--------------|-------|--------|--------|
| `supabase/RUN_FIRST_drop_policies.sql` | — | À la racine de supabase/, exécutable sans garde. | Fichier supprimé (déplacé). | ✅ Fait |
| `supabase/scripts/admin/RUN_FIRST_drop_policies.sql` | Fichier entier (créé) | — | En-tête : avertissement script destructeur, cas d’usage légitime (dev uniquement, jamais prod). Bloc `DO $$ ... RAISE EXCEPTION 'SÉCURITÉ : Renomme...' $$;` en tête ; instructions pour renommer et supprimer le bloc avant exécution. Puis le corps (DROP policies, DROP get_ranking). | ✅ Fait |
| `docs/RAPPORT_RUN_FIRST_DROP_POLICIES.md` | — | — | Rapport : garde ajoutée, fichier déplacé, confirmation hors migrations. | ✅ Fait |

### Prompt 4 — Session RPCs canoniques (source de vérité unique)

| Fichier | Ligne / bloc | Avant | Après | Statut |
|---------|--------------|-------|--------|--------|
| `supabase/migrations/20260303000010_final-session-rpcs-canonical.sql` | Fichier entier (créé) | — | DROP FUNCTION IF EXISTS pour insert(JSONB), upsert(JSONB), upsert(JSONB,TEXT,TEXT,TEXT). CREATE insert_user_session_secure / upsert_user_session_secure avec : limites FREE=1, PRO=10 (hors baseline), PERFORM validate_session_row(p_row), SET search_path = public, support player_id/player_server/player_pseudo. GRANT et COMMENT. | ✅ Fait |
| `supabase/migrations/archive/` | — | — | Déplacement de 7 fichiers : security-step3-rate-limit-rpcs.sql, remove-session-limits-unlimited.sql, fix-session-limits.sql, RUN_MIGRATIONS_SESSION_LIMITS.sql, 20250225120001_fix-session-ambiguous-function.sql, session-limits-rpc-and-rls.sql, zzz_fix-session-rpcs-final.sql. | ✅ Fait |
| `docs/RAPPORT_SESSION_RPCS_CANONICAL.md` | — | — | Rapport : requête information_schema.routines, tableau des versions archivées, migrations créées, fichiers archivés. | ✅ Fait |

---

## Section 2 — LISTE DES MIGRATIONS SQL CRÉÉES EN PHASE 3 (ORDRE D’EXÉCUTION)

Migrations Phase 3 à exécuter sur Supabase **dans cet ordre** (après les migrations Phase 1 et Phase 2 déjà listées dans RAPPORT_PHASE2_CORRECTIONS.md).

| # | Fichier | Contenu résumé | Dépendances | Statut |
|---|---------|----------------|-------------|--------|
| 1 | `20260303000007_fix-rls-events-final.sql` | RLS events : suppression policies permissives, ajout uploaded_by si absent, policies INSERT/UPDATE/DELETE restreintes (authenticated, uploaded_by = auth.uid()). | Table `events` ; si 20260302130001 déjà appliquée, les DROP sont des no-op. | À exécuter / À vérifier |
| 2 | `20260303000008_fix-rls-player-profiles.sql` | RLS player_profiles : remplacement "Service insert/update" (USING true) par player_profiles_service_write (service_role uniquement). | Table `player_profiles`. | À exécuter / À vérifier |
| 3 | `20260303000009_fix-rls-license-keys.sql` | RLS license_keys : remplacement license_keys_select (USING true) par license_keys_select_own (activated_by = auth.uid()). | Table `license_keys`. | À exécuter / À vérifier |
| 4 | `20260303000010_final-session-rpcs-canonical.sql` | Source de vérité insert_user_session_secure / upsert_user_session_secure : limites FREE=1 / PRO=10, validate_session_row, SET search_path, player_id/player_server/player_pseudo. | Fonction `validate_session_row` (ex. security-step4-validate-numeric.sql ou équivalent). | À exécuter / À vérifier |

**Ordre recommandé par rapport aux autres migrations :**

- 20260303000007, 000008, 000009 : après création des tables concernées (events, player_profiles, license_keys) et après toute migration qui aurait créé les policies permissives.
- 20260303000010 : après toute migration définissant `validate_session_row` (ex. security-step4-validate-numeric.sql). Remplace toute version antérieure des RPC session (y compris zzz_fix-session-rpcs-final, désormais archivé).

---

## Section 3 — POINTS EN ATTENTE / DÉCISIONS À CONFIRMER

1. **Table events et colonne uploaded_by**  
   La migration 20260303000007 ajoute `uploaded_by` si elle n’existe pas. Si la table `events` (sidebar) n’est jamais mise à jour par des clients avec un propriétaire, les policies `events_update_own` / `events_delete_own` (uploaded_by = auth.uid()) ne s’appliquent à aucune ligne tant que uploaded_by n’est pas renseigné. À confirmer : les écritures passent bien par des RPC SECURITY DEFINER ou il faut alimenter uploaded_by côté app.

2. **Vérification de la version active des RPC session**  
   Pour savoir si la base a actuellement les limites FREE/PRO ou une version illimitée, exécuter la requête documentée dans RAPPORT_SESSION_RPCS_CANONICAL.md (information_schema.routines). La migration 20260303000010 impose la version avec limites quelle que soit la version actuelle.

3. **Fichiers non archivés (session)**  
   Les fichiers `security-step4-validate-rpcs.sql` et `add-player-id-to-sessions.sql` restent dans migrations/ ; ils ne sont pas archivés. L’exécution de 20260303000010 écrase les définitions insert/upsert qu’ils contiennent. Aucune action requise sauf si vous souhaitez aussi les archiver pour clarté.

4. **Script RUN_FIRST_drop_policies**  
   Le script dans `supabase/scripts/admin/` lève une exception par défaut. Pour l’utiliser en dev, il faut renommer (convention) et **supprimer ou commenter** le bloc `DO $$ ... RAISE EXCEPTION ... $$;` avant d’exécuter le fichier.

5. **auth.role() = 'service_role' (player_profiles)**  
   La policy `player_profiles_service_write` restreint les écritures au rôle service_role. Les écritures depuis l’app passent par la RPC `upsert_player_profile` (SECURITY DEFINER), qui n’est pas bloquée par cette policy. Vérifier en production que les seuls écrits directs sur la table sont bien le backend (service_role) ou les RPC.

---

## Section 4 — RÉSUMÉ CHIFFRÉ

| Indicateur | Valeur |
|------------|--------|
| Corrections effectuées ✅ | 4 (RLS events + player_profiles, RLS license_keys, RUN_FIRST_drop_policies, session RPCs canoniques) |
| Corrections partielles ⚠️ | 0 |
| Corrections non faites ❌ | 0 |
| Migrations SQL créées (Phase 3) | 4 (20260303000007, 000008, 000009, 000010) |
| Fichiers déplacés vers archive | 7 (session RPCs : security-step3-rate-limit-rpcs, remove-session-limits-unlimited, fix-session-limits, RUN_MIGRATIONS_SESSION_LIMITS, 20250225120001_fix-session-ambiguous-function, session-limits-rpc-and-rls, zzz_fix-session-rpcs-final) |
| Fichiers déplacés (hors archive) | 1 (RUN_FIRST_drop_policies.sql : supabase/ → supabase/scripts/admin/) |
| Fichiers supprimés (ancien emplacement) | 1 (supabase/RUN_FIRST_drop_policies.sql) |
| Fichiers documentation créés | 5 (RAPPORT_RLS_EVENTS_PLAYER_PROFILES.md, RAPPORT_RLS_LICENSE_KEYS.md, RAPPORT_RUN_FIRST_DROP_POLICIES.md, RAPPORT_SESSION_RPCS_CANONICAL.md, RAPPORT_PHASE3_CORRECTIONS.md) |

**Liste des fichiers touchés en Phase 3 :**

- **Migrations créées :**  
  supabase/migrations/20260303000007_fix-rls-events-final.sql  
  supabase/migrations/20260303000008_fix-rls-player-profiles.sql  
  supabase/migrations/20260303000009_fix-rls-license-keys.sql  
  supabase/migrations/20260303000010_final-session-rpcs-canonical.sql  

- **Script déplacé :**  
  supabase/scripts/admin/RUN_FIRST_drop_policies.sql (créé)  
  supabase/RUN_FIRST_drop_policies.sql (supprimé)  

- **Archivés :**  
  supabase/migrations/archive/security-step3-rate-limit-rpcs.sql  
  supabase/migrations/archive/remove-session-limits-unlimited.sql  
  supabase/migrations/archive/fix-session-limits.sql  
  supabase/migrations/archive/RUN_MIGRATIONS_SESSION_LIMITS.sql  
  supabase/migrations/archive/20250225120001_fix-session-ambiguous-function.sql  
  supabase/migrations/archive/session-limits-rpc-and-rls.sql  
  supabase/migrations/archive/zzz_fix-session-rpcs-final.sql  

- **Documentation :**  
  docs/RAPPORT_RLS_EVENTS_PLAYER_PROFILES.md  
  docs/RAPPORT_RLS_LICENSE_KEYS.md  
  docs/RAPPORT_RUN_FIRST_DROP_POLICIES.md  
  docs/RAPPORT_SESSION_RPCS_CANONICAL.md  
  docs/RAPPORT_PHASE3_CORRECTIONS.md  

---

*Rapport généré — Phase 3 (RLS events, player_profiles, license_keys ; script destructeur ; session RPCs canoniques).*
