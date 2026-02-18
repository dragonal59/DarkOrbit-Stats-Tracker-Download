-- ==========================================
-- SÉCURITÉ — Vue profiles_public en SECURITY INVOKER
-- La vue était en SECURITY DEFINER (défaut), ce qui contourne le RLS.
-- Recréation avec security_invoker = true pour respecter les politiques RLS.
--
-- Étape optionnelle (identifier la définition actuelle) :
--   SELECT definition FROM pg_views WHERE schemaname = 'public' AND viewname = 'profiles_public';
--
-- À exécuter dans le SQL Editor Supabase.
--
-- Comportement après migration :
-- - Requête directe sur profiles_public par un client : s'exécute avec l'utilisateur,
--   le RLS sur profiles s'applique (chaque utilisateur ne voit que ce que les policies autorisent).
-- - La RPC get_ranking (SECURITY DEFINER) interroge la vue : la vue s'exécute avec le rôle
--   du propriétaire de la RPC, donc le classement continue d'afficher tous les profils publics.
--
-- Vérifications après exécution :
-- - Classement (onglet Classements) : doit afficher le top comme avant.
-- - Super Admin liste utilisateurs : utilise profiles, pas profiles_public → inchangé.
-- - Avertissement Supabase "SECURITY DEFINER" sur la vue doit disparaître.
-- ==========================================

-- 1. Supprimer la vue existante
DROP VIEW IF EXISTS public.profiles_public;

-- 2. Recréer avec la même définition et security_invoker = true
CREATE VIEW public.profiles_public
  WITH (security_invoker = true)
AS
SELECT
  id,
  username,
  game_pseudo,
  server,
  company,
  badge,
  created_at
FROM public.profiles;

-- 3. Commentaire et droits (inchangés)
COMMENT ON VIEW public.profiles_public IS 'Champs publics des profils. Utiliser pour classement, listing. Respecte le RLS (security_invoker). Table profiles pour son profil ou dashboard admin.';

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;
