-- ==========================================
-- Fix activate_license_key : synchroniser badge + subscription_status
-- ==========================================
-- Problème :
-- - activate_license_key ne met à jour que `profiles.badge`
-- - l'UI (account-panel) lit `profiles.subscription_status` pour afficher l'abonnement
--
-- Correction :
-- - badge PRO/ADMIN/SUPERADMIN => subscription_status = 'premium'
-- - trial_expires_at = NULL
-- ==========================================

CREATE OR REPLACE FUNCTION public.activate_license_key(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row RECORD;
  v_new_badge TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  -- Normaliser la clé : supprimer espaces, tirets pour la recherche
  p_key := upper(regexp_replace(trim(coalesce(p_key, '')), '\s|-', '', 'g'));
  IF length(p_key) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_used_key');
  END IF;

  -- Rechercher la clé (compare sans les tirets)
  SELECT lk.id, lk.key, lk.badge INTO v_row
  FROM license_keys lk
  WHERE replace(upper(lk.key), '-', '') = p_key
    AND lk.is_used = false
  LIMIT 1;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_used_key');
  END IF;

  v_new_badge := v_row.badge;

  -- Marquer la clé comme utilisée
  UPDATE license_keys
  SET is_used = true, activated_at = now(), activated_by = v_uid
  WHERE id = v_row.id;

  -- Mettre à jour badge + abonnement côté utilisateur
  UPDATE profiles
  SET badge = v_new_badge,
      subscription_status = 'premium',
      trial_expires_at = NULL,
      updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'badge', v_new_badge);
END;
$$;

-- Rattrapage des utilisateurs déjà activés avec l'ancienne fonction
-- (badge PRO/ADMIN/SUPERADMIN mais subscription_status resté 'free').
UPDATE public.profiles
SET subscription_status = 'premium',
    trial_expires_at = NULL,
    updated_at = now()
WHERE badge IN ('PRO', 'ADMIN', 'SUPERADMIN')
  AND (subscription_status IS NULL OR subscription_status = 'free');

