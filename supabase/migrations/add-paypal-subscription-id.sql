-- Colonne paypal_subscription_id sur profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT;

-- RPC : enregistrer subscription PayPal et passer en PRO
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
      badge = 'PRO',
      updated_at = now()
  WHERE id = v_uid;
  RETURN jsonb_build_object('success', true, 'badge', 'PRO');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_paypal_subscription(TEXT) TO authenticated;
