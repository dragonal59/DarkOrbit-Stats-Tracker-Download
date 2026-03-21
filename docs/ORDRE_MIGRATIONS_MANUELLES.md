# Ordre d'exécution des migrations (manuel)

Exécuter chaque fichier dans Supabase SQL Editor, **dans l'ordre alphabétique** :

1. 20260225120000_create-shared-manual-events.sql
2. 20260225120001_fix-get-ranking-conflict.sql
3. 20260225120002_fix-upsert-shared-events-final.sql
4. 20260225120004_consolidate-permissions-config.sql
5. 20260225120005_consolidate-admin-messages.sql
6. 20260225120006_consolidate-data-tables.sql
7. 20260225120007_consolidate-admin-rpcs.sql
8. add-admin-send-global-message.sql
9. add-bug-reports.sql
10. add-classement-to-permissions.sql
11. add-current-events-json-to-user-settings.sql
12. add-dashboard-admin-permissions.sql
13. add-dashboard-stats-rpc.sql
14. add-galaxy-gates-json.sql
15. add-heartbeat-last-seen.sql
16. add-imported-rankings-to-user-settings.sql
17. add-language-theme-auto-to-user-settings.sql
18. add-paypal-subscription-id.sql
19. add-player-id-to-sessions.sql
20. add-profiles-last-stats-collected-at.sql
21. add-subscription-status-trial.sql
22. add-user-preferences-and-darkorbit-accounts.sql
23. create-admin-logs-table.sql
24. create-events-table.sql
25. create-license-keys.sql
26. create-player-profiles-table.sql
27. create-profiles-table.sql
28. create-profiles-trigger.sql
29. create-ranking-rpc.sql
30. create-rpc-get-ranking.sql
31. delete-player-sessions-rpc.sql
32. events-cleanup-cron.sql
33. events-rpc-and-cleanup.sql
34. extend-admin-update-profile-game-fields.sql
35. fix-admin-permissions-consolidated.sql
36. fix-admin-permissions-merge.sql
37. fix-get-user-permissions-session-limits.sql
38. fix-profiles-public-security-invoker.sql
39. fix-profiles-rls-sensitive-fields.sql
40. fix-rpc-get-user-permissions-security.sql
41. fix-security-search-path.sql
42. fix-session-limits.sql
43. fix-shared-events-id-uuid.sql
44. fix-upsert-shared-events-no-delete.sql
45. get-ranking-with-profiles-rpc.sql
46. get-shared-events-rpc.sql
47. lock-profiles-pseudo-server-company.sql
48. optimize-shared-rankings-profile-scraper.sql
49. query-events-du-jour.sql (optionnel — requêtes SELECT debug)
50. remove-booster-learning-column.sql
51. remove-session-limits-unlimited.sql
52. RUN_MIGRATIONS_SESSION_LIMITS.sql (ou session-limits-rpc-and-rls si déjà appliqué)
53. security-step1-profiles-rls-strict.sql
54. security-step2-permissions-config-rls.sql
55. security-step3-rate-limit-rpcs.sql
56. security-step3-rate-limiting.sql
57. security-step4-validate-numeric.sql
58. security-step4-validate-rpcs.sql
59. security-step5-logging-and-export.sql
60. security-step5-security-events.sql
61. session-limits-rpc-and-rls.sql
62. shared-events-replace-all.sql
63. shared-events-rls-select.sql
64. shared-events-single-row.sql
65. shared-events-table-and-rpc.sql
66. shared-events-upsert-only-no-delete.sql
67. upsert-darkorbit-account-by-server.sql
68. verify-session-limits-structure.sql
69. zzz_fix-session-rpcs-final.sql

**Alternative :** Fichier unique `supabase/RUN_ALL_MIGRATIONS.sql` — coller tout dans SQL Editor (peut dépasser la limite selon la taille).
