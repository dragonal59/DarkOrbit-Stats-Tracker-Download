-- ==========================================
-- TABLE LICENSE_KEYS — Clés d'activation PRO/ADMIN/SUPERADMIN
-- Workflow : Utilisateur achète → reçoit clé par email → entre clé dans l'app → activation
-- ==========================================

CREATE TABLE IF NOT EXISTS public.license_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  badge TEXT NOT NULL CHECK (badge IN ('PRO', 'ADMIN', 'SUPERADMIN')),
  created_at TIMESTAMPTZ DEFAULT now(),
  activated_at TIMESTAMPTZ,
  activated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_used BOOLEAN DEFAULT false,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_license_keys_key ON public.license_keys(key);
CREATE INDEX IF NOT EXISTS idx_license_keys_is_used ON public.license_keys(is_used);

-- RLS : SELECT pour tous (vérification via RPC), INSERT/UPDATE/DELETE pour SUPERADMIN uniquement
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;

-- SELECT : tout le monde peut lire (la vérification réelle se fait dans la RPC)
CREATE POLICY "license_keys_select" ON public.license_keys FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE : SUPERADMIN uniquement
CREATE POLICY "license_keys_insert_superadmin" ON public.license_keys FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND badge = 'SUPERADMIN')
  );

CREATE POLICY "license_keys_update_superadmin" ON public.license_keys FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND badge = 'SUPERADMIN')
  );

CREATE POLICY "license_keys_delete_superadmin" ON public.license_keys FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND badge = 'SUPERADMIN')
  );

-- ==========================================
-- RPC : activate_license_key — Activer une clé pour l'utilisateur connecté
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

  -- Mettre à jour le badge de l'utilisateur
  UPDATE profiles
  SET badge = v_new_badge, updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'badge', v_new_badge);
END;
$$;

-- ==========================================
-- RPC : insert_license_keys — Insérer des clés (SUPERADMIN uniquement)
-- Paramètre : p_rows JSONB array [{key, badge}, ...]
-- ==========================================
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT (badge = 'SUPERADMIN') INTO v_is_superadmin FROM profiles WHERE id = v_uid LIMIT 1;
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
    IF v_key IS NOT NULL AND length(v_key) >= 12 THEN
      BEGIN
        INSERT INTO license_keys (key, badge)
        VALUES (v_key, v_badge)
        ON CONFLICT (key) DO NOTHING;
        IF FOUND OR (SELECT count(*) FROM license_keys WHERE key = v_key) > 0 THEN
          v_inserted := v_inserted + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := array_append(v_errors, v_key || ': ' || SQLERRM);
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted, 'errors', to_jsonb(v_errors));
END;
$$;
