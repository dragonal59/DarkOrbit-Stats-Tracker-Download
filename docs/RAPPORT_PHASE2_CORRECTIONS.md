# Rapport Phase 2 — Corrections (Prompts 1 à 15)

---

## Section 1 — RAPPORT DES CORRECTIONS

### Prompt 1 — Try/catch sur appels async (sessions, auth-manager)

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `src/backend/auth-manager.js` | L18 | `supabase.rpc('update_last_seen', { p_user_id: ... })` → `supabase.rpc('update_last_seen')` (sans paramètre). | ✅ Fait |
| `src/backend/sessions.js` | L12–38 | `refreshSessionsFromSupabase()` : corps async enveloppé dans try/catch, `console.error` en cas d’erreur. | ✅ Fait |
| `src/backend/sessions.js` | L41–51 | `restoreSessionToSupabase()` : try/catch, retourne false + `console.error`. | ✅ Fait |
| `src/backend/sessions.js` | L132–155 | `addSessionFromScan()` : bloc async (getUser → rpc → refresh → renders) dans try/catch, `showToast` erreur + return false. | ✅ Fait |

### Prompt 2 — Try/catch (ranking, stats-collect, account-panel, sync-manager, super-admin, electron)

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `src/backend/ranking.js` | L275–285 | `enrichImportedWithProfiles()` : `await supabase.from('player_profiles').select(...)` dans try/catch, retourne `rows` en cas d’erreur (pas de remontée). | ✅ Fait |
| `src/backend/stats-collect-auto.js` | L338–344 | Bloc `supabase.from('profiles').select('last_stats_collected_at')` enveloppé dans try/catch + `console.error`. | ✅ Fait |
| `src/backend/account-panel.js` | L207–220 | `supabase.auth.updateUser({ data: { avatar_url } }).then(...).catch(e => showToast(...) + console.error)`. | ✅ Fait |
| `src/backend/sync-manager.js` | L137 | Après `await supabase.from('user_events').upsert(...)` : `const { error: _ueError } = await ...` et `if (_ueError) console.warn(...)`. | ✅ Fait |
| `src/backend/super-admin.js` | L265–278 | `suspendUser()` et `markSuspect()` déclarées `async`, `await this.updateUser(...)`. | ✅ Fait |
| `electron/darkorbit-accounts.js` | L11–16 | `require(app.getSrcPath('backend/server-mappings.js'))` dans try/catch, fallback `_serverNamesCache = {}` + `console.warn`. | ✅ Fait |

### Prompt 3 — Centralisation des fonctions dupliquées (utils.js)

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `src/backend/utils.js` | Avant COMPRESSION | Ajout : `formatNumberDisplay`, `formatNumberCompact`, `formatSignedGain(num, compact)`, `getGainClass(num, variant)`, `escapeHtml(s)`. | ✅ Fait |
| `src/backend/stats.js` | L572–577 | Suppression de `formatNumberDisplay` (usage de la version utils). | ✅ Fait |
| `src/backend/progression.js` | L375–413 | Suppression de `formatNumberCompact`, `formatNumberDisplay`, `formatSignedGain`, `getGainClass`. | ✅ Fait |
| `src/backend/history.js` | L136–154, L280–291 | Suppression des 4 fonctions ; appelants mis à jour : `getGainClass(..., 'pn')`, `formatSignedGain(..., true)`. | ✅ Fait |
| `src/frontend/messages.js` | L166–171 | Suppression de `escapeHtml` (remplacé par utils). | ✅ Fait |
| `src/frontend/ranking-ui.js` | L594–599 | Suppression de `escapeHtml`. | ✅ Fait |

### Prompt 4 — Guards d’existence (auth, charts, gadgets, ui-improvements)

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `src/frontend/auth.js` | Avant L259, avant L290 | `if (typeof getSupabaseClient !== 'function') return;` avant chaque `getSupabaseClient()`. | ✅ Fait |
| `src/frontend/charts.js` | Début de `refreshChartColors()` | `if (typeof getSessions !== 'function') return;`. | ✅ Fait |
| `src/frontend/gadgets.js` | Début de `calculateStreak()` | `if (typeof getSessions !== 'function') return 0;` puis `const sessions = getSessions();`. | ✅ Fait |
| `src/frontend/ui-improvements.js` | 3 blocs style | Chaque injection `<style>` : id unique (`ui-improvements-styles-1`, `-2`, `-3`), `if (!document.getElementById(STYLE_ID)) { ... }` avant appendChild. | ✅ Fait |

### Prompt 5 — RPC / préférences (update_last_seen, p_uploaded_by, getUserServer, hiddenEventIds)

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `src/backend/auth-manager.js` | L18 | Déjà traité en Prompt 1 (update_last_seen sans paramètre). | ✅ Fait |
| `electron/session-scraper.js` | L512 | Ajout de `p_uploaded_by: global.currentUserId \|\| null` dans l’appel `upsert_shared_events`. | ✅ Fait |
| `src/backend/user-preferences-api.js` | Nouveaux membres | `getUserServer()`, `getHiddenEventIds()`, `setHiddenEventIds(ids)`. | ✅ Fait |
| `src/frontend/ranking-ui.js` | L164–180 | Remplacement de l’accès direct `supabase.from('profiles').select('server')` par `UserPreferencesAPI.getUserServer()`. | ✅ Fait |
| `src/backend/events-manual.js` | L151–164 | `getHiddenEventIds()` et `saveHiddenEventIds()` délèguent à `UserPreferencesAPI.getHiddenEventIds()` et `UserPreferencesAPI.setHiddenEventIds()`. | ✅ Fait |

### Prompt 6 — activate_trial_key, upsert_user_preferences, validate_session_row, search_path admin, get_admin_ids

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `src/backend/license-activation.js` | Après échec activate_license_key | Appel de secours `supabase.rpc('activate_trial_key', { p_key: keyFormatted })` et message « Code d’essai activé ». | ✅ Fait |
| `supabase/migrations/add-subscription-status-trial.sql` | Avant RPC activate_trial_key | Commentaire : appel depuis license-activation.js en fallback. | ✅ Fait |
| `src/backend/user-preferences-api.js` | En-tête module | Commentaire : synchro via upsert direct sur user_preferences (RLS), pas via RPC. | ✅ Fait |
| `supabase/migrations/add-user-preferences-and-darkorbit-accounts.sql` | Avant RPC upsert_user_preferences | Commentaire : RPC disponible, l’app utilise l’upsert direct. | ✅ Fait |
| `supabase/migrations/zzz_fix-session-rpcs-final.sql` | Début du corps insert/upsert | `PERFORM validate_session_row(p_row);` après le test `v_uid IS NULL` dans les deux RPC. | ✅ Fait |
| `src/backend/supabase-rpc-admin.sql` | is_admin_or_superadmin, is_superadmin | Ajout `SET search_path = public` (et réécriture en `AS $$ ... $$`). | ✅ Fait |
| `supabase/migrations/add-bug-reports.sql` | L35–86 | Nouvelle fonction `get_admin_ids()` RETURNS TABLE(id UUID) SECURITY DEFINER SET search_path = public ; suppression de `SET LOCAL row_security = off`, boucle via `SELECT ... FROM get_admin_ids()`. | ✅ Fait |

### Prompt 7 — Index manquants (migration 20260303000004)

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `supabase/migrations/20260303000004_add-missing-indexes.sql` | Fichier entier | Création : `idx_snapshots_lower_server_id`, `idx_player_profiles_lower_user_server`, `idx_profiles_last_seen_at` (partiel WHERE last_seen_at IS NOT NULL). | ✅ Fait |

### Prompt 8 — get_dashboard_stats final et archivage

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `supabase/migrations/20260303000005_final-dashboard-stats-rpc.sql` | Fichier entier | Colonne `last_seen_at`, RPC `update_last_seen`, `get_dashboard_stats` (heartbeat), `get_user_latest_stats` ; tous avec SET search_path. | ✅ Fait |
| `supabase/migrations/archive/` | — | Déplacement de `add-dashboard-stats-rpc.sql` et `add-heartbeat-last-seen.sql` dans archive. | ✅ Fait |

### Prompt 9 — Archivage RPCs shared_rankings

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `supabase/migrations/archive/` | — | Déplacement de `get-ranking-with-profiles-rpc.sql`, `add-galaxy-gates-json.sql`, `optimize-shared-rankings-profile-scraper.sql` dans archive. | ✅ Fait |

### Prompt 10 — RLS sur profiles

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `supabase/migrations/20260303000006_enable-rls-profiles.sql` | Fichier entier | `ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;` | ✅ Fait |

### Prompt 11 — MIGRATION_ORDER.md

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `supabase/migrations/MIGRATION_ORDER.md` | Fichier entier | Documentation : (1) Fichiers timestampés source de vérité, (2) Fichiers legacy non timestampés à ne plus modifier, (3) Fichiers archivés à ne jamais exécuter avec raison. | ✅ Fait |

### Prompt 12 — reference-session.js (exports window)

| Fichier | Ligne / bloc | Modification | Statut |
|---------|--------------|--------------|--------|
| `src/backend/reference-session.js` | L133–135 | Suppression des exports `window.getReferenceSessionForComparison`, `window.calculateDailyGains`, `window.getDayStart` ; commentaire sur absence de références externes et logique “Gain du jour” / reference-manager. | ✅ Fait |

### Prompts 13 à 15

| Prompt | Sujet | Statut |
|--------|--------|--------|
| 13 | — | Aucune tâche distincte fournie dans la Phase 2 ; à remplir si vous avez un prompt 13. |
| 14 | — | Idem. |
| 15 | — | Idem. |

*(Si vous avez des libellés précis pour les prompts 13–15, ils peuvent être ajoutés ici.)*

---

## Section 2 — ORDRE D’EXÉCUTION SQL

Migrations timestampées à exécuter sur Supabase **dans cet ordre** (du plus ancien au plus récent). Les migrations legacy et archivées ne doivent pas être exécutées comme source de vérité (voir MIGRATION_ORDER.md).

| # | Fichier | Contenu résumé | Dépendances | Statut |
|---|--------|----------------|-------------|--------|
| 1 | 20250225120000_fix-upsert-user-preferences.sql | Correction upsert user_preferences | — | À exécuter / À vérifier |
| 2 | 20250225120001_fix-session-ambiguous-function.sql | Résolution ambiguïté fonction session | — | À exécuter / À vérifier |
| 3 | 20260225120000_create-shared-manual-events.sql | Création shared_manual_events (puis supprimée en 20260302140000) | — | À exécuter / À vérifier |
| 4 | 20260225120001_fix-get-ranking-conflict.sql | Correction conflit get_ranking | — | À exécuter / À vérifier |
| 5 | 20260225120002_fix-upsert-shared-events-final.sql | Version finale upsert shared_events | — | À exécuter / À vérifier |
| 6 | 20260225120004_consolidate-permissions-config.sql | Consolidation config permissions | — | À exécuter / À vérifier |
| 7 | 20260225120005_consolidate-admin-messages.sql | Consolidation admin_messages | — | À exécuter / À vérifier |
| 8 | 20260225120006_consolidate-data-tables.sql | Consolidation tables data | — | À exécuter / À vérifier |
| 9 | 20260225120007_consolidate-admin-rpcs.sql | Consolidation RPC admin | — | À exécuter / À vérifier |
| 10 | 20260225120010_ranking-snapshots-tables.sql | Tables shared_rankings_snapshots, shared_rankings_dostats_snapshots | — | À exécuter / À vérifier |
| 11 | 20260225120011_ranking-snapshots-rpcs.sql | RPC insert_ranking_snapshot, etc. | Après 10 | À exécuter / À vérifier |
| 12 | 20260225120012_ranking-snapshots-get-rpcs.sql | RPC get_ranking_snapshot, get_ranking_snapshots_for_comparison | Après 10 | À exécuter / À vérifier |
| 13 | 20260225120013_migrate-rankings-to-snapshots.sql | Migration shared_rankings → snapshots | Après 10 | À exécuter / À vérifier |
| 14 | 20260225140000_add-ranking-period-filter.sql | Filtre période ranking | Après 10 | À exécuter / À vérifier |
| 15 | 20260225150000_fix-upsert-player-profile-preserve-dostats.sql | Upsert player_profile (préservation DOStats) | Table player_profiles | À exécuter / À vérifier |
| 16 | 20260226100000_fix-get-ranking-with-profiles-join.sql | Correction join get_ranking_with_profiles | Après 10 | À exécuter / À vérifier |
| 17 | 20260226100001_fix-upsert-session-single-signature.sql | Signature unique upsert session | — | À exécuter / À vérifier |
| 18 | 20260226100002_add-classement-to-permissions-tabs.sql | Classement dans onglets permissions | — | À exécuter / À vérifier |
| 19 | 20260226100003_add-player-grade-dostats.sql | Colonne grade player_profiles | — | À exécuter / À vérifier |
| 20 | 20260226100004_add-player-level-dostats.sql | Colonne level player_profiles | — | À exécuter / À vérifier |
| 21 | 20260226100005_add-profile-stats-topuser-xp-honor.sql | Colonnes top_user, experience, honor player_profiles | — | À exécuter / À vérifier |
| 22 | 20260302120000_fix_security_definer_profiles_public.sql | Vue profiles_public SECURITY INVOKER | — | À exécuter / À vérifier |
| 23 | 20260302130000_fix_search_path_safe_bigint.sql | safe_bigint SET search_path = '' | — | À exécuter / À vérifier |
| 24 | 20260302130001_fix_rls_always_true_events.sql | RLS events (auth.uid() = user_id) | — | À exécuter / À vérifier |
| 25 | 20260302140000_drop_shared_manual_events.sql | DROP TABLE shared_manual_events | Après 3 | À exécuter / À vérifier |
| 26 | 20260302150000_unique_baseline_per_player_server.sql | Index unique baseline (player_id, player_server) | Table user_sessions | À exécuter / À vérifier |
| 27 | 20260302160000_ranking_comparison_and_cleanup.sql | get_ranking_comparison, cleanup_old_ranking_snapshots | Après 10 | À exécuter / À vérifier |
| 28 | 20260303000001_fix-bigint-profiles.sql | **Phase 1** — profiles initial_rank_points, next_rank_points en BIGINT | Table profiles | À exécuter / À vérifier |
| 29 | 20260303000002_cleanup-orphan-functions.sql | **Phase 1** — DROP handle_updated_at, upsert_shared_ranking | — | À exécuter / À vérifier |
| 30 | 20260303000003_add-fk-uploaded-by.sql | **Phase 1** — FK uploaded_by sur snapshots, shared_events | Tables existantes | À exécuter / À vérifier |
| 31 | 20260303000004_add-missing-indexes.sql | **Phase 2** — Index LOWER(server_id), player_profiles, profiles last_seen_at | Tables/colonnes correspondantes ; last_seen_at après heartbeat | À exécuter / À vérifier |
| 32 | 20260303000005_final-dashboard-stats-rpc.sql | **Phase 2** — last_seen_at, update_last_seen, get_dashboard_stats (heartbeat), get_user_latest_stats | profiles ; is_superadmin, is_admin_or_superadmin | À exécuter / À vérifier |
| 33 | 20260303000006_enable-rls-profiles.sql | **Phase 2** — ENABLE ROW LEVEL SECURITY sur profiles | Table profiles | À exécuter / À vérifier |
| 34 | zzz_fix-session-rpcs-final.sql | insert_user_session_secure, upsert_user_session_secure + validate_session_row | security-step4-validate-numeric (validate_session_row) ; add-player-id-to-sessions | À exécuter / À vérifier |

**Dépendances importantes :**

- `security-step4-validate-numeric.sql` (legacy) doit être exécuté avant `zzz_fix-session-rpcs-final.sql` (définit `validate_session_row`).
- `add-heartbeat-last-seen` est remplacé par `20260303000005` ; si une base a déjà exécuté add-heartbeat, la colonne `last_seen_at` existe déjà (ADD COLUMN IF NOT EXISTS dans 20260303000005).
- `20260303000004` (index sur last_seen_at) suppose que la colonne `last_seen_at` existe (créée par 20260303000005 ou par l’ancienne migration heartbeat). Pour un déploiement strictement dans l’ordre ci‑dessus, exécuter 20260303000005 avant 20260303000004 si vous voulez que l’index soit créé ; en pratique 00004 est souvent exécuté avant 00005 dans l’ordre lexicographique, donc si last_seen_at n’existe pas encore, l’index échoue. À vérifier : soit déplacer l’index dans 00005, soit s’assurer que last_seen_at est créée par une migration antérieure (ex. legacy add-heartbeat).

---

## Section 3 — POINTS EN ATTENTE / DÉCISIONS À CONFIRMER

1. **Ordre 20260303000004 vs 20260303000005**  
   L’index `idx_profiles_last_seen_at` (000004) nécessite la colonne `last_seen_at`, créée dans 000005. En ordre lexicographique, 00004 s’exécute avant 00005. **Décision à confirmer** : exécuter 00005 avant 00004 sur une base vide, ou ajouter dans 000004 un `ADD COLUMN IF NOT EXISTS last_seen_at` avant création de l’index, ou considérer que les bases ont déjà la colonne (ex. via add-heartbeat).

2. **Prompts 13–15**  
   Aucun libellé fourni pour les prompts 13, 14, 15 de la Phase 2. À compléter si vous avez des tâches précises.

3. **reference-session.js**  
   Les fonctions `getReferenceSessionForComparison`, `calculateDailyGains`, `getDayStart` ne sont plus exposées sur `window` ; la logique reste dans le module. Si une feature “Gain du jour” doit être réutilisée ailleurs, à décider : réexposition ciblée ou déplacement vers `reference-manager.js`.

4. **Fichiers legacy**  
   L’ordre d’exécution des migrations legacy (non timestampées) n’est pas détaillé ici. Pour une base neuve en “timestamped-only”, seules les migrations de la Section 2 sont à exécuter ; les legacy servent à la compatibilité avec des bases déjà migrées.

5. **RPC get_dashboard_stats**  
   La version finale utilise `profiles.last_seen_at` pour “connected_users”. Il faut que le client appelle `update_last_seen()` (heartbeat) pour que les chiffres soient cohérents.

---

## Section 4 — RÉSUMÉ CHIFFRÉ

| Indicateur | Valeur |
|------------|--------|
| Corrections effectuées ✅ | 12 (prompts 1–12 traités) |
| Corrections partielles ⚠️ | 0 |
| Corrections non faites ❌ | 0 (prompts 13–15 non définis) |
| Fichiers modifiés (hors migrations) | ~25 (auth-manager, sessions, ranking, stats-collect-auto, account-panel, sync-manager, super-admin, utils, stats, progression, history, messages, ranking-ui, license-activation, user-preferences-api, events-manual, supabase-rpc-admin, reference-session, auth, charts, gadgets, ui-improvements, electron/darkorbit-accounts, electron/session-scraper) |
| Migrations SQL créées (Phase 1 + Phase 2) | Phase 1 : 3 (20260303000001, 000002, 000003). Phase 2 : 3 (20260303000004, 000005, 000006). Total 6. |
| Fichiers déplacés vers archive | 5 (add-dashboard-stats-rpc, add-heartbeat-last-seen, get-ranking-with-profiles-rpc, add-galaxy-gates-json, optimize-shared-rankings-profile-scraper) |
| Fichiers créés (hors migrations) | 1 (docs/RAPPORT_PHASE2_CORRECTIONS.md) |
| Fichiers documentation créés | 2 (MIGRATION_ORDER.md, RAPPORT_PHASE2_CORRECTIONS.md) |

**Liste complète des fichiers touchés (hors archive) :**

- src/backend/auth-manager.js  
- src/backend/sessions.js  
- src/backend/ranking.js  
- src/backend/stats-collect-auto.js  
- src/backend/account-panel.js  
- src/backend/sync-manager.js  
- src/backend/super-admin.js  
- src/backend/utils.js  
- src/backend/stats.js  
- src/backend/progression.js  
- src/backend/history.js  
- src/backend/user-preferences-api.js  
- src/backend/events-manual.js  
- src/backend/license-activation.js  
- src/backend/reference-session.js  
- src/backend/supabase-rpc-admin.sql  
- src/frontend/auth.js  
- src/frontend/charts.js  
- src/frontend/gadgets.js  
- src/frontend/ui-improvements.js  
- src/frontend/messages.js  
- src/frontend/ranking-ui.js  
- electron/darkorbit-accounts.js  
- electron/session-scraper.js  
- supabase/migrations/add-subscription-status-trial.sql  
- supabase/migrations/add-user-preferences-and-darkorbit-accounts.sql  
- supabase/migrations/add-bug-reports.sql  
- supabase/migrations/zzz_fix-session-rpcs-final.sql  
- supabase/migrations/20260303000004_add-missing-indexes.sql (créé)  
- supabase/migrations/20260303000005_final-dashboard-stats-rpc.sql (créé)  
- supabase/migrations/20260303000006_enable-rls-profiles.sql (créé)  
- supabase/migrations/MIGRATION_ORDER.md (créé)  
- docs/RAPPORT_PHASE2_CORRECTIONS.md (créé)

---

*Rapport généré — Phase 2 (Prompts 1 à 15).*
