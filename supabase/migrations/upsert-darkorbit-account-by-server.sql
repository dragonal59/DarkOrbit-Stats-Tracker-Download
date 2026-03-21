-- [UNUSED] Remplacé par upsert_user_darkorbit_account. Conserver pour compatibilité éventuelle.
-- Upsert user_darkorbit_accounts par (user_id, player_server) — évite doublons
CREATE OR REPLACE FUNCTION public.upsert_user_darkorbit_account_by_server(
  p_player_id TEXT DEFAULT NULL,
  p_player_pseudo TEXT DEFAULT NULL,
  p_player_server TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
  v_pseudo TEXT;
  v_server TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  v_pseudo := NULLIF(trim(COALESCE(p_player_pseudo, '')), '');
  v_server := COALESCE(NULLIF(trim(COALESCE(p_player_server, 'gbl5')), ''), 'gbl5');
  IF v_pseudo IS NULL OR v_pseudo = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'player_pseudo_required');
  END IF;
  IF p_is_active THEN
    UPDATE public.user_darkorbit_accounts SET is_active = false WHERE user_id = v_uid;
  END IF;
  SELECT id INTO v_id FROM public.user_darkorbit_accounts WHERE user_id = v_uid AND player_server = v_server LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.user_darkorbit_accounts SET
      player_id = COALESCE(NULLIF(trim(p_player_id), ''), player_id),
      player_pseudo = v_pseudo,
      is_active = p_is_active,
      updated_at = now()
    WHERE id = v_id AND user_id = v_uid;
    RETURN jsonb_build_object('success', true, 'id', v_id);
  ELSE
    INSERT INTO public.user_darkorbit_accounts (user_id, player_id, player_pseudo, player_server, is_active, display_order)
    VALUES (v_uid, NULLIF(trim(p_player_id), ''), v_pseudo, v_server, p_is_active,
      (SELECT COALESCE(MAX(display_order), 0) + 1 FROM public.user_darkorbit_accounts WHERE user_id = v_uid))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'id', v_id);
  END IF;
END;
$$;
