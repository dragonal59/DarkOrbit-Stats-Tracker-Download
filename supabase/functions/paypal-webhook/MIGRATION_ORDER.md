# Ordre et statut des migrations Supabase

Ce document décrit les trois catégories de fichiers SQL dans `migrations/` et comment les utiliser.

---

## 1. Fichiers timestampés (source de vérité)

À exécuter **dans l’ordre lexicographique** (préfixe date `YYYYMMDD` ou `zzz_` en dernier). Ce sont les migrations de référence pour un nouveau déploiement ou une base propre.

| Fichier |
|--------|
| 20250225120000_fix-upsert-user-preferences.sql |
| 20250225120001_fix-session-ambiguous-function.sql |
| 20260225120000_create-shared-manual-events.sql |
| 20260225120001_fix-get-ranking-conflict.sql |
| 20260225120002_fix-upsert-shared-events-final.sql |
| 20260225120004_consolidate-permissions-config.sql |
| 20260225120005_consolidate-admin-messages.sql |
| 20260225120006_consolidate-data-tables.sql |
| 20260225120007_consolidate-admin-rpcs.sql |
| 20260225120010_ranking-snapshots-tables.sql |
| 20260225120011_ranking-snapshots-rpcs.sql |
| 20260225120012_ranking-snapshots-get-rpcs.sql |
| 20260225120013_migrate-rankings-to-snapshots.sql |
| 20260225140000_add-ranking-period-filter.sql |
| 20260225150000_fix-upsert-player-profile-preserve-dostats.sql |
| 20260226100000_fix-get-ranking-with-profiles-join.sql |
| 20260226100001_fix-upsert-session-single-signature.sql |
| 20260226100002_add-classement-to-permissions-tabs.sql |
| 20260226100003_add-player-grade-dostats.sql |
| 20260226100004_add-player-level-dostats.sql |
| 20260226100005_add-profile-stats-topuser-xp-honor.sql |
| 20260302120000_fix_security_definer_profiles_public.sql |
| 20260302130000_fix_search_path_safe_bigint.sql |
| 20260302130001_fix_rls_always_true_events.sql |
| 20260302140000_drop_shared_manual_events.sql |
| 20260302150000_unique_baseline_per_player_server.sql |
| 20260302160000_ranking_comparison_and_cleanup.sql |
| 20260303000001_fix-bigint-profiles.sql |
| 20260303000002_cleanup-orphan-functions.sql |
| 20260303000003_add-fk-uploaded-by.sql |
| 20260303000004_add-missing-indexes.sql |
| 20260303000005_final-dashboard-stats-rpc.sql |
| 20260303000006_enable-rls-profiles.sql |
| zzz_fix-session-rpcs-final.sql |

---

## 2. Fichiers legacy (non timestampés)

Présents pour historique et bases déjà déployées. **Ne plus modifier** ; les changements doivent passer par de **nouvelles migrations timestampées**. Ordre d’exécution à respecter manuellement si vous partez d’une base vide sans utiliser uniquement les timestampées.

- add-admin-send-global-message.sql
- add-bug-reports.sql
- add-classement-to-permissions.sql
- add-current-events-json-to-user-settings.sql
- add-dashboard-admin-permissions.sql
- add-imported-rankings-to-user-settings.sql
- add-language-theme-auto-to-user-settings.sql
- add-paypal-subscription-id.sql
- add-player-id-to-sessions.sql
- add-profiles-last-stats-collected-at.sql
- add-subscription-status-trial.sql
- add-user-preferences-and-darkorbit-accounts.sql
- create-admin-logs-table.sql
- create-events-table.sql
- create-license-keys.sql
- create-player-profiles-table.sql
- create-profiles-table.sql
- create-profiles-trigger.sql
- create-ranking-rpc.sql
- create-rpc-get-ranking.sql
- delete-player-sessions-rpc.sql
- events-cleanup-cron.sql
- events-rpc-and-cleanup.sql
- extend-admin-update-profile-game-fields.sql
- fix-admin-permissions-consolidated.sql
- fix-admin-permissions-merge.sql
- fix-get-user-permissions-session-limits.sql
- fix-profiles-public-security-invoker.sql
- fix-profiles-rls-sensitive-fields.sql
- fix-rpc-get-user-permissions-security.sql
- fix-security-search-path.sql
- fix-session-limits.sql
- fix-shared-events-id-uuid.sql
- fix-upsert-shared-events-no-delete.sql
- get-shared-events-rpc.sql
- lock-profiles-pseudo-server-company.sql
- query-events-du-jour.sql
- remove-booster-learning-column.sql
- remove-session-limits-unlimited.sql
- RUN_MIGRATIONS_SESSION_LIMITS.sql
- security-step1-profiles-rls-strict.sql
- security-step2-permissions-config-rls.sql
- security-step3-rate-limiting.sql
- security-step3-rate-limit-rpcs.sql
- security-step4-validate-numeric.sql
- security-step4-validate-rpcs.sql
- security-step5-logging-and-export.sql
- security-step5-security-events.sql
- session-limits-rpc-and-rls.sql
- shared-events-replace-all.sql
- shared-events-rls-select.sql
- shared-events-single-row.sql
- shared-events-table-and-rpc.sql
- shared-events-upsert-only-no-delete.sql
- upsert-darkorbit-account-by-server.sql
- verify-session-limits-structure.sql

---

## 3. Fichiers archivés (à ne jamais exécuter)

Déplacés dans `migrations/archive/`. **Ne plus les exécuter** : remplacés par des migrations timestampées ou obsolètes (référence à des tables supprimées, ex. `shared_rankings`).

| Fichier | Raison |
|--------|--------|
| add-dashboard-stats-rpc.sql | Remplacé par 20260303000005_final-dashboard-stats-rpc.sql (version heartbeat + search_path). |
| add-heartbeat-last-seen.sql | Remplacé par 20260303000005_final-dashboard-stats-rpc.sql (colonnes + RPC heartbeat + get_dashboard_stats). |
| get-ranking-with-profiles-rpc.sql | Référence la table supprimée `shared_rankings`. Remplacé par les RPC sur `shared_rankings_snapshots`. |
| add-galaxy-gates-json.sql | Référence `shared_rankings`. Logique reprise dans d’autres migrations (player_profiles, snapshots). |
| optimize-shared-rankings-profile-scraper.sql | Référence la table supprimée `shared_rankings` et RPC `upsert_shared_ranking` obsolète. |

---

*Dernière mise à jour : mars 2026.*
