# Rapport — Sécurisation de RUN_FIRST_drop_policies.sql

## 1. Problème

Le script `supabase/RUN_FIRST_drop_policies.sql` supprimait toutes les policies RLS de toutes les tables du schéma `public` en une seule exécution, sans confirmation ni contrainte d'environnement. Exécuté en production par erreur, cela reviendrait à désactiver toute la sécurité RLS.

## 2. Corrections effectuées

### 2.1 Garde explicite en tête de fichier

- **Ajout** d’un bloc `DO $$ ... RAISE EXCEPTION ... $$;` en tout début d’exécution (avant les DROP POLICY).
- **Comportement** : si le script est exécuté tel quel, une erreur est levée immédiatement avec le message :  
  `SÉCURITÉ : Renomme ce fichier en RUN_FIRST_drop_policies.CONFIRMED.sql et supprime ce bloc DO avant exécution`
- **Pour exécuter réellement le script** : renommer le fichier (convention) puis **supprimer ou commenter** le bloc `DO $$ ... END $$;` (lignes 18-23) dans la copie utilisée.

### 2.2 Déplacement du fichier

- **Ancien emplacement** : `supabase/RUN_FIRST_drop_policies.sql`
- **Nouvel emplacement** : `supabase/scripts/admin/RUN_FIRST_drop_policies.sql`
- Le fichier n’est plus à la racine de `supabase/` ni dans `supabase/migrations/`, ce qui évite toute exécution automatique par un outil de migrations.

### 2.3 Commentaire de cas d’usage légitime

En tête du fichier (avant la garde) :

- **Cas d’usage** : reset total des policies RLS en **développement uniquement** (schéma local ou base de test à réinitialiser).
- **Avertissement** : à **ne jamais** exécuter en production.

## 3. Confirmation

| Élément | Statut |
|--------|--------|
| Garde (RAISE EXCEPTION) ajoutée | Oui — exécution par défaut bloquée |
| Fichier déplacé vers `supabase/scripts/admin/` | Oui |
| Fichier retiré de `supabase/` (racine) | Oui — ancien fichier supprimé |
| Fichier hors de `supabase/migrations/` | Oui — jamais dans migrations |
| Commentaire cas d’usage (dev only, jamais prod) | Oui — en tête du fichier |

## 4. Structure actuelle

```
supabase/
  scripts/
    admin/
      RUN_FIRST_drop_policies.sql   ← script sécurisé (garde + commentaires)
  migrations/                        ← aucun script drop_policies ici
  RUN_FIRST_drop_policies.sql       ← SUPPRIMÉ
```
