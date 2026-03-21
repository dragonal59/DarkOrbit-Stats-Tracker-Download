# Audit Supabase — Incohérences, code mort, RPC morts

**Date :** 25 février 2026  
**Type :** Analyse uniquement — aucune modification

---

## 1. RPC utilisés par le code mais SANS migration

| RPC | Fichier appelant | Migration |
|-----|------------------|-----------|
| *(aucun)* | — | La table `shared_manual_events` et la RPC `upsert_shared_manual_events` ont été supprimées (migration 20260302140000_drop_shared_manual_events.sql) — événements désormais scrapés via DarkOrbit. |

---

## 2. RPC définis dans les migrations mais jamais appelés par le code

| RPC | Migration | Usage |
|-----|-----------|-------|
| **upsert_user_darkorbit_account_by_server** | upsert-darkorbit-account-by-server.sql | Jamais appelé — user-preferences-api utilise `upsert_user_darkorbit_account` |
| **get_admin_logs_export** | security-step5-logging-and-export.sql | Jamais appelé — export admin_logs pour SUPERADMIN (monitoring externe) |

**Recommandation :**
- `upsert_user_darkorbit_account_by_server` : RPC mort si l’app n’utilise que `upsert_user_darkorbit_account`. Peut être supprimé ou conservé pour usage futur.
- `get_admin_logs_export` : RPC utilitaire pour export manuel / monitoring. Conserver ou documenter.

---

## 3. RPC définis dans src/backend/ (hors migrations) — exécution manuelle

| Fichier | RPC définis | Inclus dans migrations ? |
|---------|-------------|--------------------------|
| supabase-rpc-admin.sql | admin_ban_user, admin_unban_user, admin_change_badge, admin_change_role, admin_add_note, admin_update_profile, get_user_admin_logs, get_admin_logs | Non — exécution manuelle |
| supabase-schema-messages.sql | get_my_messages, get_unread_messages_count, admin_send_message | Non — exécution manuelle |
| supabase-schema-data.sql | — (tables uniquement) | Non |

**Incohérence :** Les migrations `fix-security-search-path.sql` et `add-admin-send-global-message.sql` supposent que ces RPC existent. Risque d’échec si les scripts `src/backend/*.sql` n’ont pas été exécutés avant les migrations.

---

## 4. Tables sans migration dans supabase/migrations/

| Table | Créée dans | Migration |
|-------|------------|-----------|
| *(shared_manual_events supprimée)* | — | 20260302140000_drop_shared_manual_events.sql |
| **admin_messages** | supabase-schema-messages.sql | Non (src/backend) |
| **permissions_config** | supabase-rpc-permissions.sql | Non (src/backend) |
| **user_settings** (base) | supabase-schema-data.sql | Non — migrations ajoutent des colonnes (add-*-to-user-settings) |

---

## 5. Conflits de migrations (MIGRATION_ORDER.md)

| Conflit | Fichiers | Effet |
|---------|----------|-------|
| **get_ranking** | create-rpc-get-ranking.sql vs create-ranking-rpc.sql | Deux définitions différentes — une seule doit être appliquée |
| **insert/upsert_user_session_secure** | session-limits-rpc-and-rls, security-step3-rate-limit-rpcs, security-step4-validate-rpcs, remove-session-limits-unlimited | RPC réécrites plusieurs fois, logique incompatible |
| **upsert_shared_events** | shared-events-table-and-rpc, shared-events-replace-all, shared-events-upsert-only-no-delete, fix-upsert-shared-events-no-delete, fix-shared-events-id-uuid | Multiples versions — ordre d’exécution critique |

---

## 6. Code mort / références obsolètes

| Élément | Détail |
|--------|--------|
| **booster_learning** | Supprimé (remove-booster-learning-column.sql) — vérifier que keys.js, sync-manager n’y font plus référence |
| **custom_icons** | Supprimé des SYNC_KEYS — pas de référence résiduelle |
| **RAPPORT_ETAT_MIGRATION_SUPABASE.md** | Lignes 92 et 153 : texte mal formaté (tableau cassé) |

---

## 7. Doublons / redondances

| Fichier | Problème |
|---------|----------|
| index.html | unified-storage.js chargé deux fois (déjà signalé) |
| create-player-profiles-table.sql vs add-galaxy-gates-json.sql | `upsert_player_profile` redéfini — add-galaxy-gates-json ajoute le paramètre galaxy_gates_json |
| get-ranking-with-profiles-rpc.sql vs add-galaxy-gates-json.sql | `get_ranking_with_profiles` redéfini dans add-galaxy-gates-json |

---

## 8. RPC / fonctions utilisés uniquement par triggers ou cron

| RPC/Fonction | Usage | Mort ? |
|--------------|-------|--------|
| cleanup_expired_events | Cron pg_cron (events-cleanup-cron.sql) | Non — utilisé par cron |
| check_profiles_locked_columns | Trigger sur profiles | Non |
| handle_updated_at | Trigger sur shared_rankings | Non |
| handle_new_user | Trigger auth.users | Non |

---

## 9. Synthèse des actions de nettoyage (sans rien casser)

| Priorité | Action |
|----------|--------|
| **Résolu** | Table `shared_manual_events` et RPC supprimées (événements scrapés via DarkOrbit) |
| **Moyenne** | Corriger les lignes cassées dans RAPPORT_ETAT_MIGRATION_SUPABASE.md |
| **Basse** | Supprimer `upsert_user_darkorbit_account_by_server` si confirmé inutilisé |
| **Basse** | Documenter ou supprimer `get_admin_logs_export` si inutile |
| **Info** | Consolider les scripts src/backend/*.sql dans des migrations pour traçabilité |

---

## 10. RPC appelés vs définis — récapitulatif

**Appelés par le code :**
- get_user_permissions, insert_user_session_secure, upsert_user_session_secure
- get_ranking, get_ranking_with_profiles
- get_shared_events, upsert_shared_events
- get_visible_events, upsert_sidebar_events, delete_event_by_id
- get_user_preferences, upsert_user_preferences
- get_user_darkorbit_accounts, upsert_user_darkorbit_account, delete_user_darkorbit_account
- get_my_messages, get_unread_messages_count, admin_send_message, admin_send_global_message
- admin_update_profile, admin_ban_user, admin_unban_user, admin_change_badge, admin_add_note
- get_user_admin_logs, get_admin_logs, get_security_events
- get_dashboard_stats, get_user_latest_stats
- admin_update_admin_permissions, get_admin_permissions_config
- insert_license_keys, activate_license_key, activate_trial_key
- update_last_seen, update_paypal_subscription
- insert_bug_report, delete_player_sessions, get_darkorbit_account_limit
- upsert_player_profile (Electron), upsert_shared_ranking (Electron)

**Définis mais non appelés :**
- upsert_user_darkorbit_account_by_server
- get_admin_logs_export
- admin_change_role (défini, pas d’UI — usage manuel possible)
