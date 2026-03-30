-- ==========================================
-- ÉTAPE 1 — license_keys.expires_after_activation + activate_license_key
-- NULL = clé indéfinie (PRO permanent après activation)
-- NOT NULL = période trial après activation (trial_expires_at = now() + interval côté Supabase)
-- ==========================================

ALTER TABLE public.license_keys
  ADD COLUMN IF NOT EXISTS expires_after_activation INTERVAL;

COMMENT ON COLUMN public.license_keys.expires_after_activation IS
  'Durée du droit PRO après activation. NULL = permanent (premium). Sinon trial jusqu''à now()+interval au moment de l''activation.';

-- profiles : colonnes déjà ajoutées par add-subscription-status-trial.sql
-- (subscription_status, trial_expires_at). On ne restreint pas badge à FREE|PRO seuls
-- (ADMIN/SUPERADMIN existent dans le projet).

-- ==========================================
-- RPC activate_license_key
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
  v_sub TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  p_key := upper(regexp_replace(trim(coalesce(p_key, '')), '\s|-', '', 'g'));
  IF length(p_key) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_used_key');
  END IF;

  SELECT
    lk.id,
    lk.key,
    lk.badge,
    lk.expires_after_activation
  INTO v_row
  FROM license_keys lk
  WHERE replace(upper(lk.key), '-', '') = p_key
    AND lk.is_used = false
    AND (lk.expires_at IS NULL OR lk.expires_at > now())
  LIMIT 1;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_used_key');
  END IF;

  SELECT COALESCE(p.subscription_status, 'free')
  INTO v_sub
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- Clé temporaire (trial) : ne pas écraser un abonnement PayPal actif
  IF v_row.expires_after_activation IS NOT NULL AND v_sub = 'premium' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_premium',
      'message', 'Vous avez déjà un abonnement actif.'
    );
  END IF;

  UPDATE license_keys
  SET
    is_used = true,
    activated_at = now(),
    activated_by = v_uid
  WHERE id = v_row.id;

  -- CAS 1 — Permanent (NULL) : premium, pas de fin d''essai
  IF v_row.expires_after_activation IS NULL THEN
    UPDATE public.profiles
    SET
      badge = COALESCE(NULLIF(trim(v_row.badge), ''), 'PRO'),
      subscription_status = 'premium',
      trial_expires_at = NULL,
      updated_at = now()
    WHERE id = v_uid;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'permanent',
      'badge', COALESCE(NULLIF(trim(v_row.badge), ''), 'PRO')
    );
  END IF;

  -- CAS 2 — Trial : calcul uniquement côté Supabase
  UPDATE public.profiles
  SET
    badge = 'PRO',
    subscription_status = 'trial',
    trial_expires_at = now() + v_row.expires_after_activation,
    updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'trial',
    'badge', 'PRO',
    'trial_expires_at', (SELECT trial_expires_at FROM public.profiles WHERE id = v_uid)
  );
END;
$$;
