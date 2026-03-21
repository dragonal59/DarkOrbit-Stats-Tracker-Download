-- ==========================================
-- Security Advisor : Function Search Path Mutable
-- La fonction safe_bigint n'avait pas de search_path fixé (vecteur d'injection).
-- On fixe search_path = '' pour que la fonction n'utilise que des noms qualifiés.
-- safe_bigint ne référence aucune table, donc pas d'impact fonctionnel.
-- ==========================================

ALTER FUNCTION public.safe_bigint(TEXT) SET search_path = '';
