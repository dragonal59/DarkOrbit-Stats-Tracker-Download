-- ==========================================
-- License keys expiration support
-- Ajoute expires_at + support expires_in à l'insert
-- Et empêche l'activation d'une clé expirée
-- ==========================================

ALTER TABLE public.license_keys
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Activate license key: vérifier clé non expirée + synchroniser badge/subscription_status
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

  p_key := upper(regexp_replace(trim(coalesce(p_key, '')), '\s|-', '', 'g'));
  IF length(p_key) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_used_key');
  END IF;

  SELECT lk.id, lk.key, lk.badge
  INTO v_row
  FROM license_keys lk
  WHERE replace(upper(lk.key), '-', '') = p_key
    AND lk.is_used = false
    AND (lk.expires_at IS NULL OR lk.expires_at > now())
  LIMIT 1;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_used_key');
  END IF;

  v_new_badge := v_row.badge;

  UPDATE license_keys
  SET is_used = true, activated_at = now(), activated_by = v_uid
  WHERE id = v_row.id;

  UPDATE profiles
  SET badge = v_new_badge,
      subscription_status = 'premium',
      trial_expires_at = NULL,
      updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'badge', v_new_badge);
END;
$$;

-- Insert license keys: support p_rows element {key,badge,expires_in}
-- expires_in: 1d | 3d | 1w | 2w | 1m | indefinite
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
  v_expires_at TIMESTAMPTZ := NULL;
  v_expires_in TEXT := NULL;
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

    v_expires_at := NULL;
    v_expires_in := nullif(trim(lower(coalesce(v_row->>'expires_in',''))), '');

    IF v_expires_in IS NOT NULL THEN
      v_expires_at := CASE v_expires_in
        WHEN '1d' THEN now() + interval '1 day'
        WHEN '3d' THEN now() + interval '3 days'
        WHEN '1w' THEN now() + interval '1 week'
        WHEN '2w' THEN now() + interval '2 weeks'
        WHEN '1m' THEN now() + interval '1 month'
        WHEN 'indefinite' THEN NULL
        ELSE NULL
      END;
    END IF;

    IF v_key IS NOT NULL AND length(v_key) >= 12 THEN
      BEGIN
        INSERT INTO license_keys (key, badge, expires_at)
        VALUES (v_key, v_badge, v_expires_at)
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

