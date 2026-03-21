-- subscription_status : free | trial | premium | suspended
-- trial_expires_at : fin de période d'essai
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IS NULL OR subscription_status IN ('free', 'trial', 'premium', 'suspended'));

-- Migration : badge PRO -> subscription_status premium, badge FREE -> free
UPDATE public.profiles SET subscription_status = 'premium' WHERE badge = 'PRO' AND (subscription_status IS NULL OR subscription_status = 'free');
UPDATE public.profiles SET subscription_status = 'free' WHERE badge = 'FREE' AND (subscription_status IS NULL OR subscription_status = 'free');
UPDATE public.profiles SET subscription_status = COALESCE(subscription_status, 'free') WHERE subscription_status IS NULL;

-- RPC update_paypal_subscription : ne sauvegarde que paypal_subscription_id (le webhook met à jour status)
CREATE OR REPLACE FUNCTION public.update_paypal_subscription(p_subscription_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF p_subscription_id IS NULL OR trim(p_subscription_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_subscription_id');
  END IF;
  UPDATE public.profiles
  SET paypal_subscription_id = trim(p_subscription_id),
      updated_at = now()
  WHERE id = v_uid;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Table clés d'essai (SUPERADMIN insère via SQL Editor)
CREATE TABLE IF NOT EXISTS public.trial_promo_codes (
  code TEXT PRIMARY KEY,
  trial_days INT DEFAULT 7,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.trial_promo_codes ENABLE ROW LEVEL SECURITY;
-- Pas de policy : lecture uniquement via RPC SECURITY DEFINER

-- RPC activate_trial_key : valide le code et active l'essai.
-- Appelée depuis src/backend/license-activation.js en fallback après activate_license_key
-- (même champ de saisie : clé PRO ou code trial).
CREATE OR REPLACE FUNCTION public.activate_trial_key(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_key_norm TEXT;
  v_row RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;
  v_key_norm := upper(regexp_replace(trim(coalesce(p_key, '')), '\s|-', '', 'g'));
  IF length(v_key_norm) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_key');
  END IF;
  SELECT code, trial_days, expires_at, used_at INTO v_row
  FROM trial_promo_codes
  WHERE upper(regexp_replace(code, '\s|-', '', 'g')) = v_key_norm
  LIMIT 1;
  IF v_row IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_key');
  END IF;
  IF v_row.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'key_already_used');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'key_expired');
  END IF;
  UPDATE trial_promo_codes SET used_at = now(), used_by = v_uid WHERE code = v_row.code;
  UPDATE public.profiles
  SET subscription_status = 'trial',
      trial_expires_at = now() + (COALESCE(v_row.trial_days, 7) || ' days')::interval,
      badge = 'PRO',
      updated_at = now()
  WHERE id = v_uid;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.activate_trial_key(TEXT) TO authenticated;
