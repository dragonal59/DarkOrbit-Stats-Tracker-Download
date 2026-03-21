-- ==========================================
-- Fix Security Advisor : vue profiles_public en SECURITY INVOKER
-- La vue était en SECURITY DEFINER (défaut PostgreSQL), ce qui déclenche
-- l'alerte "Security Definer View" dans le Supabase Security Advisor.
-- Recréation avec security_invoker = true, même définition (colonnes et logique).
-- ==========================================

DROP VIEW IF EXISTS public.profiles_public;

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

COMMENT ON VIEW public.profiles_public IS 'Champs publics des profils. Utiliser pour classement, listing. Respecte le RLS (security_invoker). Table profiles pour son profil ou dashboard admin.';

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;
