# Rapport — Suppression de `shared_manual_events`

**Date :** 2026-03-02  
**Contexte :** La table `public.shared_manual_events` est obsolète ; les événements sont désormais scrapés directement depuis DarkOrbit. Suppression propre dans le code et en base.

---

## 1. Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| **src/index.html** | Tuile Dashboard "Événements" et panel associé (`sa-panel-evenements`) supprimés. |
| **src/backend/super-admin.js** | Panel `evenements` retiré de la liste des sous-onglets du dashboard ; plus de branchement sur `panelId === 'evenements'` / `firstId === 'evenements'`. |
| **src/backend/sync-manager.js** | Méthode `_pushSharedManualEvents()` supprimée ; appel à celle-ci retiré de `sync()` ; dans `pull()`, suppression du `select` sur `shared_manual_events` et du merge de `sharedManualRow.events_json` dans les événements. |
| **docs/APP_CONTEXT.md** | Références à la table et à la RPC `upsert_shared_manual_events` retirées ; sync DataSync décrite sans `shared_manual_events`. |
| **docs/RAPPORT_ETAT_MIGRATION_SUPABASE.md** | Table et RPC retirées des listes ; tableau des tables et flux mis à jour. |
| **docs/RAPPORT_AUDIT_SUPABASE_NETTOYAGE.md** | Section RPC sans migration et table sans migration mises à jour (suppression effectuée) ; liste des RPC appelés mise à jour. |
| **docs/RAPPORT_OPTIMISATION_EGRESS.md** | Ligne sur `sync-manager.js` et `shared_manual_events` remplacée par une note de suppression. |
| **docs/RAPPORT_SECURITY_ADVISOR_FIXES.md** | `shared_manual_events` retirée de la liste des policies SELECT. |

---

## 2. Migration de suppression

**Fichier :** `supabase/migrations/20260302140000_drop_shared_manual_events.sql`

- `DROP FUNCTION IF EXISTS public.upsert_shared_manual_events(JSONB);`
- `DROP TABLE IF EXISTS public.shared_manual_events CASCADE;`

**Dépendances vérifiées avant DROP :**

- Aucune vue, trigger ni clé étrangère d’une autre table ne référence `shared_manual_events`.
- La RPC `upsert_shared_manual_events` est supprimée avant la table.
- CASCADE supprime la policy RLS `shared_manual_events_select_all` et l’index `idx_shared_manual_events_uploaded_at`.

---

## 3. Vérification : aucune référence applicative résiduelle

Recherche `shared_manual_events`, `sharedManualEvents`, `upsert_shared_manual_events` :

- **src/** : aucune occurrence (sync-manager, dashboard, etc. nettoyés).
- **electron/** : aucune occurrence.
- Les seules occurrences restantes sont :
  - la migration de création `20260225120000_create-shared-manual-events.sql` (historique) ;
  - la migration de suppression `20260302140000_drop_shared_manual_events.sql` ;
  - `supabase/RUN_ALL_MIGRATIONS.sql` (fichier consolidé à mettre à jour selon votre processus) ;
  - les docs qui documentent la suppression.

---

## 4. Sidebar événements et autres tables events — intacts

- **Sidebar événements** : non modifiée (colonnes latérales, `events`, `shared_events`, `user_events`).
- **Tables `events`, `shared_events`, `user_events`** : aucun changement.
- **Onglet principal Événements** (hors dashboard) : inchangé ; seuls la tuile et le panel "Événements" du **Dashboard** Super Admin ont été retirés.

---

## 5. Récapitulatif

| Élément | Statut |
|--------|--------|
| Tuile + panel "Événements" du Dashboard | Supprimés |
| Code sync-manager (push/pull shared_manual_events) | Supprimé |
| Migration DROP table + fonction | Créée (20260302140000) |
| Documentation | Mise à jour |
| Références applicatives à `shared_manual_events` | Aucune |
| Sidebar événements / events / shared_events / user_events | Intacts |

Après application de la migration `20260302140000_drop_shared_manual_events.sql` sur la base, la suppression est complète.
