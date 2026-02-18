# Sécurité — Étape 5 : Logs et alertes

**Date :** février 2026  
**Objectif :** Enregistrer les événements de sécurité (rate limit, validation), permettre l’export des logs admin et documenter la configuration du monitoring Supabase.

---

## Fichiers créés / modifiés

| Fichier | Description |
|---------|-------------|
| `supabase/migrations/security-step5-security-events.sql` | Table `security_events` + fonction `log_security_event` |
| `supabase/migrations/security-step5-logging-and-export.sql` | Logging des refus dans `check_rate_limit` / `validate_session_row`, RPC `get_security_events` et `get_admin_logs_export` |

---

## Procédure d'exécution

1. Ouvrir le **Dashboard Supabase** → **SQL Editor**
2. Exécuter **dans l'ordre** :
   - `security-step5-security-events.sql`
   - `security-step5-logging-and-export.sql`
3. Vérifier qu’aucune erreur n’apparaît

---

## Tables et fonctions

### Table `security_events`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | Identifiant unique |
| event_type | TEXT | `RATE_LIMIT_EXCEEDED`, `VALIDATION_FAILED` |
| user_id | UUID | Utilisateur concerné |
| rpc_name | TEXT | RPC appelée |
| details | JSONB | Détails (ex. count, max, field, value) |
| created_at | TIMESTAMPTZ | Horodatage |

- RLS activé, aucune policy publique : accès uniquement via RPC `get_security_events` (SUPERADMIN).

### RPC `get_security_events`

- **Rôle requis :** SUPERADMIN
- **Paramètres :** `p_limit`, `p_offset`, `p_event_type` (optionnel)
- **Retour :** Liste des événements de sécurité pour surveillance et export.

### RPC `get_admin_logs_export`

- **Rôle requis :** SUPERADMIN
- **Paramètres :** `p_limit`, `p_since` (optionnel)
- **Retour :** Derniers `admin_logs` pour export vers un outil de monitoring externe.

---

## Configuration Supabase Dashboard

### Logs (Logs Explorer)

1. **Supabase Dashboard** → **Logs** → **Logs Explorer**
2. Filtrer par :
   - **API** : requêtes REST, durée, erreurs
   - **Auth** : connexions, inscriptions, erreurs d’authentification
   - **Postgres** : requêtes lentes, erreurs SQL

### Alertes (optionnel)

- Supabase ne fournit pas d’alertes intégrées par défaut.
- Pour une surveillance automatique :
  - Exporter `security_events` et `admin_logs` périodiquement via `get_security_events` / `get_admin_logs_export`
  - Intégrer ces exports dans un outil externe (Grafana, Datadog, webhook, cron) pour créer des alertes sur :
    - Pic de `RATE_LIMIT_EXCEEDED`
    - Pic de `VALIDATION_FAILED`
    - Actions admin sensibles (ban, badge, etc.)

---

## Événements enregistrés

| Type | Contexte | Détails |
|------|----------|---------|
| `RATE_LIMIT_EXCEEDED` | Appelant dépasse le quota RPC | `count`, `max` |
| `VALIDATION_FAILED` | Valeur hors plage dans session | `field`, `value` |

---

## Rétention et nettoyage

- **security_events** : Pas de purge automatique. Pour éviter une croissance excessive, planifier un nettoyage périodique (ex. suppression des entrées > 90 jours) ou utiliser une stratégie de log rotation côté export.
- **admin_logs** : Immutables, pas de suppression prévue par défaut.
