-- Consolidation : admin_messages + RPCs (src/backend/supabase-schema-messages.sql)
CREATE TABLE IF NOT EXISTS public.admin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by_user BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_admin_messages_user ON public.admin_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_admin ON public.admin_messages(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created ON public.admin_messages(created_at DESC);

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own messages" ON public.admin_messages;
CREATE POLICY "Users read own messages" ON public.admin_messages FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own messages" ON public.admin_messages;
CREATE POLICY "Users update own messages" ON public.admin_messages FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read sent messages" ON public.admin_messages;
CREATE POLICY "Admins read sent messages" ON public.admin_messages FOR SELECT USING (auth.uid() = admin_id OR auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_unread_messages_count()
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM public.admin_messages
  WHERE user_id = auth.uid() AND is_read = false AND deleted_by_user = false;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_send_message(p_user_id UUID, p_subject TEXT, p_message TEXT)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND (badge IN ('ADMIN','SUPERADMIN') OR role IN ('ADMIN','SUPERADMIN'))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorisé');
  END IF;
  IF p_message IS NULL OR trim(p_message) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message vide');
  END IF;
  INSERT INTO public.admin_messages (admin_id, user_id, subject, message)
  VALUES (v_admin_id, p_user_id, NULLIF(trim(p_subject), ''), trim(p_message));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_my_messages()
RETURNS TABLE (id UUID, admin_id UUID, admin_name TEXT, subject TEXT, message TEXT, is_read BOOLEAN, created_at TIMESTAMPTZ) AS $$
  SELECT m.id, m.admin_id, COALESCE(p.username, p.email, 'Admin') AS admin_name,
    m.subject, m.message, m.is_read, m.created_at
  FROM public.admin_messages m
  LEFT JOIN public.profiles p ON p.id = m.admin_id
  WHERE m.user_id = auth.uid() AND m.deleted_by_user = false
  ORDER BY m.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;
