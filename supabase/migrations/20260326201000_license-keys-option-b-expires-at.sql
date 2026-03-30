-- ==========================================
-- Option B — Expiration clés non utilisées garantie côté DB (expires_at)
-- expires_at = création + 5 jours ; RPC refuse si expires_at < now()
-- ==========================================

-- 1) Colonne : existe déjà depuis 20260326170000 ; backfill + contraintes
ALTER TABLE public.license_keys
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE public.license_keys
SET expires_at = created_at + interval '5 days'
WHERE expires_at IS NULL;

ALTER TABLE public.license_keys
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '5 days');

ALTER TABLE public.license_keys
  ALTER COLUMN expires_at SET NOT NULL;

COMMENT ON COLUMN public.license_keys.expires_at IS
  'Date limite pour activer la clé sans usage (création + 5 jours). Vérifié dans activate_license_key.';

-- 2) Trigger : si INSERT sans expires_at, coalesce(created_at, now()) + 5 jours
CREATE OR REPLACE FUNCTION public.license_keys_set_expires_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at, now()) + interval '5 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_license_keys_set_expires_at ON public.license_keys;
CREATE TRIGGER trg_license_keys_set_expires_at
  BEFORE INSERT ON public.license_keys
  FOR EACH ROW
  EXECUTE PROCEDURE public.license_keys_set_expires_at();

-- 3) RPC activate_license_key — ordre : introuvable → déjà utilisée → expirée → already_premium → activation
CREATE OR REPLACE FUNCTION public.activate_license_key(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
  v_badge TEXT;
  v_expires_after_activation INTERVAL;
  v_is_used BOOLEAN;
  v_expires_at TIMESTAMPTZ;
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
    lk.badge,
    lk.expires_after_activation,
    lk.is_used,
    lk.expires_at
  INTO
    v_id,
    v_badge,
    v_expires_after_activation,
    v_is_used,
    v_expires_at
  FROM license_keys lk
  WHERE replace(upper(lk.key), '-', '') = p_key
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_used_key');
  END IF;

  IF v_is_used THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_used_key');
  END IF;

  IF v_expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'key_expired');
  END IF;

  SELECT COALESCE(p.subscription_status, 'free')
  INTO v_sub
  FROM public.profiles p
  WHERE p.id = v_uid;

  v_sub := COALESCE(v_sub, 'free');

  IF v_expires_after_activation IS NOT NULL AND v_sub = 'premium' THEN
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
  WHERE id = v_id;

  IF v_expires_after_activation IS NULL THEN
    UPDATE public.profiles
    SET
      badge = COALESCE(NULLIF(trim(v_badge), ''), 'PRO'),
      subscription_status = 'premium',
      trial_expires_at = NULL,
      updated_at = now()
    WHERE id = v_uid;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'permanent',
      'badge', COALESCE(NULLIF(trim(v_badge), ''), 'PRO')
    );
  END IF;

  UPDATE public.profiles
  SET
    badge = 'PRO',
    subscription_status = 'trial',
    trial_expires_at = now() + v_expires_after_activation,
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

-- 4) insert_license_keys : expires_at = now() + 5 jours ; expires_after_activation depuis expires_in (même mapping qu’avant)
CREATE OR REPLACE FUNCTION public.insert_license_keys(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_superadmin BOOLEAN;
  v_row JSONB;
  v_key TEXT;
  v_badge TEXT;
  v_inserted INT := 0;
  v_errors TEXT[] := '{}';
  v_expires_in TEXT := NULL;
  v_expires_after_activation INTERVAL := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT (badge = 'SUPERADMIN') INTO v_is_superadmin
  FROM profiles
  WHERE id = v_uid
  LIMIT 1;

  IF NOT coalesce(v_is_superadmin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'empty_rows');
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_key := nullif(trim(v_row->>'key'), '');
    v_badge := nullif(trim(upper(v_row->>'badge')), '');
    IF v_badge NOT IN ('PRO', 'ADMIN', 'SUPERADMIN') THEN
      v_badge := 'PRO';
    END IF;

    v_expires_after_activation := NULL;
    v_expires_in := nullif(trim(lower(coalesce(v_row->>'expires_in', ''))), '');

    IF v_expires_in IS NOT NULL AND v_expires_in <> 'indefinite' THEN
      v_expires_after_activation := CASE v_expires_in
        WHEN '1d' THEN interval '1 day'
        WHEN '3d' THEN interval '3 days'
        WHEN '1w' THEN interval '7 days'
        WHEN '2w' THEN interval '14 days'
        WHEN '1m' THEN interval '30 days'
        ELSE NULL
      END;
    END IF;

    IF v_key IS NOT NULL AND length(v_key) >= 12 THEN
      BEGIN
        INSERT INTO license_keys (key, badge, expires_at, expires_after_activation)
        VALUES (v_key, v_badge, now() + interval '5 days', v_expires_after_activation)
        ON CONFLICT (key) DO NOTHING;

        IF FOUND OR (SELECT count(*) FROM license_keys WHERE key = v_key) > 0 THEN
          v_inserted := v_inserted + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := array_append(v_errors, v_key || ': ' || SQLERRM);
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'inserted', v_inserted,
    'errors', to_jsonb(v_errors)
  );
END;
$$;
