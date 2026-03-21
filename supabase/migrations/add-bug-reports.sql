-- ==========================================
-- Table bug_reports + RPC insert et notification aux ADMIN/SUPERADMIN
-- ==========================================

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_user ON public.bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON public.bug_reports(created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own bug report" ON public.bug_reports;
DROP POLICY IF EXISTS "Admins read all bug reports" ON public.bug_reports;
CREATE POLICY "Users insert own bug report"
  ON public.bug_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all bug reports"
  ON public.bug_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (badge IN ('ADMIN', 'SUPERADMIN') OR role IN ('ADMIN', 'SUPERADMIN'))
    )
  );

-- Helper : retourne les UUID des profils ADMIN/SUPERADMIN (sans désactiver le RLS global).
CREATE OR REPLACE FUNCTION public.get_admin_ids()
RETURNS TABLE(id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id FROM public.profiles p
  WHERE (p.badge IN ('ADMIN', 'SUPERADMIN') OR p.role IN ('ADMIN', 'SUPERADMIN'));
$$;

-- RPC : insérer un bug report et notifier tous les ADMIN/SUPERADMIN via admin_messages
CREATE OR REPLACE FUNCTION public.insert_bug_report(
  p_category TEXT,
  p_description TEXT,
  p_image_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_reporter_id UUID := auth.uid();
  v_report_id UUID;
  v_admin RECORD;
  v_count INT := 0;
  v_subject TEXT := 'Nouveau rapport de bug';
  v_message TEXT;
BEGIN
  IF v_reporter_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;
  IF p_description IS NULL OR trim(p_description) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Description vide');
  END IF;

  INSERT INTO public.bug_reports (user_id, category, description, image_url)
  VALUES (v_reporter_id, NULLIF(trim(p_category), ''), trim(p_description), NULLIF(trim(p_image_url), ''))
  RETURNING id INTO v_report_id;

  v_message := 'Catégorie: ' || COALESCE(p_category, '—') || E'\n\n' || left(trim(p_description), 500);
  IF length(trim(p_description)) > 500 THEN
    v_message := v_message || '...';
  END IF;
  v_message := v_message || E'\n\n[Rapport ID: ' || v_report_id || ']';

  FOR v_admin IN SELECT aid.id FROM public.get_admin_ids() aid WHERE aid.id != v_reporter_id
  LOOP
    INSERT INTO public.admin_messages (admin_id, user_id, subject, message)
    VALUES (v_reporter_id, v_admin.id, v_subject, v_message);
    v_count := v_count + 1;
    RAISE NOTICE 'insert_bug_report: notification envoyée à admin %', v_admin.id;
  END LOOP;

  RAISE NOTICE 'insert_bug_report: report_id=%, admins_notified=%', v_report_id, v_count;

  RETURN jsonb_build_object('success', true, 'report_id', v_report_id, 'admins_notified', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON TABLE public.bug_reports IS 'Rapports de bug envoyés par les utilisateurs; notifient les ADMIN/SUPERADMIN.';
COMMENT ON FUNCTION public.insert_bug_report(TEXT, TEXT, TEXT) IS 'Insère un bug report et envoie une notification à tous les admins/superadmins.';
