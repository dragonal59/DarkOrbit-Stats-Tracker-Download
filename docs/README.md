# Documentation — DarkOrbit Stats Tracker Pro

## Document de référence (à jour)

| Fichier | Contenu |
|---------|---------|
| **[APP_CONTEXT.md](./APP_CONTEXT.md)** | Architecture, stack, arborescence, features, Supabase (tables + RPC), flux événements, règles métier, i18n. **Point d’entrée principal pour les développeurs.** |
| **[MIGRATION_ORDER.md](./MIGRATION_ORDER.md)** | Ordre des migrations Supabase, conflits connus, section « migrations récentes » (RPC sessions / évènements). |
| **[RELEASE_WORKFLOW.md](./RELEASE_WORKFLOW.md)** | Publication / build. |
| **[AUTO_UPDATE.md](./AUTO_UPDATE.md)** | Mises à jour auto Electron. |
| **[CONFIG_SUPABASE_AUTH_PAGES.md](./CONFIG_SUPABASE_AUTH_PAGES.md)** | Auth / redirections. |
| **[BUGS_TODO_ELECTRON_PYTHSCRAP.md](./BUGS_TODO_ELECTRON_PYTHSCRAP.md)** | Backlog bugs & dette (scraper, ranking, sync). |
| **[STORAGE_KEYS_AND_USER_ISOLATION.md](./STORAGE_KEYS_AND_USER_ISOLATION.md)** | Portée des clés localStorage / UnifiedStorage, logout, ban, multi-compte. |
| **[RANKING_SOURCES.md](./RANKING_SOURCES.md)** | Matrice des sources de classement (import, snapshots, DOStats, RPC) + `resolveRankingLoadRoute`. |

## Rapports et audits (`RAPPORT_*`, `AUDIT_*`, etc.)

Fichiers **historiques ou ponctuels** : utiles pour comprendre une décision passée, mais **non garantis alignés** sur le code actuel. En cas de doute, se fier à **`APP_CONTEXT.md`** + dépôt (`src/`, `electron/`, `supabase/migrations/`).

## Fichiers supprimés (obsolètes / redondants)

Les documents suivants ont été retirés car **doublons** ou **recommandations contradictoires** avec le code actuel :

- `APPLY_NOW.md` — poussait l’application systématique de `remove-session-limits-unlimited.sql` (non aligné avec les limites FREE/PRO des RPC canoniques).
- `DOCUMENTATION_TECHNIQUE.md` — doublon de `APP_CONTEXT.md` (version v2.1 figée).
- `RAPPORT_CONTEXTE_PROJET.md` — doublon de `APP_CONTEXT.md`.
- `CAHIER_DES_CHARGES_EXTENSION_SCRAPING.md` — extension Chrome scraping **supprimée** du projet ; scraping via Electron uniquement.
- `SYNTHESE_TACHES_RESTANTES.md` — snapshot de tâches ; remplacé par le backlog dans `BUGS_TODO_ELECTRON_PYTHSCRAP.md`.
