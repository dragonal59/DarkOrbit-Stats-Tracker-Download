-- ==========================================
-- RPC : envoyer un message global à tous les utilisateurs (SUPERADMIN/ADMIN)
-- ==========================================

CREATE OR REPLACE FUNCTION admin_send_global_message(
  p_subject TEXT,
  p_message TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_user RECORD;
  v_count INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND (badge IN ('ADMIN', 'SUPERADMIN') OR role IN ('ADMIN', 'SUPERADMIN'))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorisé');
  END IF;
  IF p_message IS NULL OR trim(p_message) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message vide');
  END IF;

  FOR v_user IN SELECT id FROM profiles
  LOOP
    INSERT INTO admin_messages (admin_id, user_id, subject, message)
    VALUES (v_admin_id, v_user.id, NULLIF(trim(p_subject), ''), trim(p_message));
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
