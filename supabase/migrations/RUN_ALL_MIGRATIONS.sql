-- Executer dans Supabase SQL Editor (ordre alphabetique)


-- ========== 20260225120000_create-shared-manual-events.sql ==========
-- Table shared_manual_events : événements manuels partagés (admin)
-- Une ligne par push admin, pull récupère la plus récente (order by uploaded_at desc limit 1)
CREATE TABLE IF NOT EXISTS public.shared_manual_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  events_json JSONB NOT NULL DEFAULT '[]',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_manual_events_uploaded_at
  ON public.shared_manual_events(uploaded_at DESC);

ALTER TABLE public.shared_manual_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_manual_events_select_all" ON public.shared_manual_events;
CREATE POLICY "shared_manual_events_select_all"
  ON public.shared_manual_events FOR SELECT
  USING (true);

-- RPC : upsert (INSERT nouvelle ligne) — ADMIN/SUPERADMIN uniquement
-- sync-manager attend : { success: true, count: N }
CREATE OR REPLACE FUNCTION public.upsert_shared_manual_events(p_events JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated', 'count', 0);
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (badge IN ('ADMIN', 'SUPERADMIN') OR role IN ('ADMIN', 'SUPERADMIN'))
  ) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_required', 'count', 0);
  END IF;
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EVENTS', 'count', 0);
  END IF;
  v_count := jsonb_array_length(p_events);
  INSERT INTO public.shared_manual_events (events_json) VALUES (p_events);
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_shared_manual_events(JSONB) TO authenticated;


-- ========== 20260225120001_fix-get-ranking-conflict.sql ==========
-- Impose la version finale get_ranking (create-ranking-rpc) : LEFT JOIN LATERAL, BIGINT
-- Compatible avec ranking.js : p_server, p_companies, p_type, p_limit
DROP FUNCTION IF EXISTS public.get_ranking(text, text[], text, integer);
DROP FUNCTION IF EXISTS public.get_ranking(text, text[], text, int);
CREATE OR REPLACE FUNCTION public.get_ranking(
  p_server TEXT DEFAULT NULL,
  p_companies TEXT[] DEFAULT NULL,
  p_type TEXT DEFAULT 'honor',
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  game_pseudo TEXT,
  company TEXT,
  badge TEXT,
  honor BIGINT,
  xp BIGINT,
  rank_points BIGINT,
  next_rank_points BIGINT,
  current_rank TEXT,
  session_date TEXT,
  session_timestamp BIGINT,
  note TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.game_pseudo,
    p.company,
    p.badge,
    s.honor,
    s.xp,
    s.rank_points,
    s.next_rank_points,
    s.current_rank,
    s.session_date,
    s.session_timestamp,
    s.note
  FROM (
    SELECT pr.id, pr.game_pseudo, pr.company, pr.badge
    FROM profiles_public pr
    WHERE (p_server IS NULL OR trim(p_server) = '' OR pr.server = p_server)
      AND (p_companies IS NULL OR cardinality(p_companies) = 0 OR pr.company = ANY(p_companies))
  ) p
  LEFT JOIN LATERAL (
    SELECT us.honor, us.xp, us.rank_points, us.next_rank_points, us.current_rank,
           us.session_date, us.session_timestamp, us.note
    FROM user_sessions us
    WHERE us.user_id = p.id
    ORDER BY us.session_timestamp DESC NULLS LAST
    LIMIT 1
  ) s ON true
  ORDER BY
    CASE p_type
      WHEN 'xp' THEN s.xp
      WHEN 'rank_points' THEN s.rank_points
      ELSE s.honor
    END DESC NULLS LAST,
    p.id
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
END;
$$;


-- ========== 20260225120002_fix-upsert-shared-events-final.sql ==========
-- Impose la version finale upsert_shared_events (fix-shared-events-id-uuid)
-- UUID fixe, uploaded_by nullable, INSERT ON CONFLICT
CREATE OR REPLACE FUNCTION public.upsert_shared_events(p_events JSONB DEFAULT '[]'::jsonb, p_uploaded_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EVENTS', 'count', 0);
  END IF;
  v_count := jsonb_array_length(p_events);
  INSERT INTO public.shared_events (id, events_json, uploaded_at, uploaded_by)
  VALUES (v_id, p_events, now(), p_uploaded_by)
  ON CONFLICT (id) DO UPDATE SET
    events_json = EXCLUDED.events_json,
    uploaded_at = EXCLUDED.uploaded_at,
    uploaded_by = COALESCE(EXCLUDED.uploaded_by, public.shared_events.uploaded_by);
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO anon;


-- ========== 20260225120004_consolidate-permissions-config.sql ==========
-- Consolidation : permissions_config (src/backend/supabase-rpc-permissions.sql)
-- Table référencée par get_user_permissions, security-step2, etc.
CREATE TABLE IF NOT EXISTS public.permissions_config (
  badge TEXT PRIMARY KEY,
  features JSONB NOT NULL DEFAULT '{}',
  tabs TEXT[] NOT NULL DEFAULT '{}'
);

INSERT INTO public.permissions_config (badge, features, tabs) VALUES
('FREE', '{"statsPersonal":true,"progressionPersonal":true,"historyPersonal":true,"eventsSidebarReadOnly":true,"notificationsWindows":false,"boosterDisplay":false,"usefulLinks":false,"autoSave":false,"streakCounter":false,"eventsTab":false,"eventsCreateEdit":false,"eventsSidebarAddButton":false,"eventsSidebarViewAllButton":false,"dashboardTab":false,"dashboardAdmin":false,"dashboardBanUnban":false,"dashboardPromoteDemote":false,"dashboardViewAdminLogs":false,"advancedStats":false,"customThemes":false,"dataExport":false}'::jsonb, ARRAY['stats','progression','history','settings']),
('PRO', '{"statsPersonal":true,"progressionPersonal":true,"historyPersonal":true,"eventsSidebarReadOnly":true,"notificationsWindows":true,"boosterDisplay":true,"usefulLinks":true,"autoSave":true,"streakCounter":true,"eventsTab":false,"eventsCreateEdit":false,"eventsSidebarAddButton":false,"eventsSidebarViewAllButton":false,"dashboardTab":false,"dashboardAdmin":false,"dashboardBanUnban":false,"dashboardPromoteDemote":false,"dashboardViewAdminLogs":false,"advancedStats":true,"customThemes":true,"dataExport":true}'::jsonb, ARRAY['stats','progression','history','settings']),
('ADMIN', '{"statsPersonal":true,"progressionPersonal":true,"historyPersonal":true,"eventsSidebarReadOnly":true,"notificationsWindows":true,"boosterDisplay":true,"usefulLinks":true,"autoSave":true,"streakCounter":true,"eventsTab":true,"eventsCreateEdit":true,"eventsSidebarAddButton":true,"eventsSidebarViewAllButton":true,"dashboardTab":true,"dashboardAdmin":true,"dashboardBanUnban":true,"dashboardPromoteDemote":false,"dashboardViewAdminLogs":false,"advancedStats":true,"customThemes":true,"dataExport":true}'::jsonb, ARRAY['stats','progression','history','events','settings','superadmin']),
('SUPERADMIN', '{"statsPersonal":true,"progressionPersonal":true,"historyPersonal":true,"eventsSidebarReadOnly":true,"notificationsWindows":true,"boosterDisplay":true,"usefulLinks":true,"autoSave":true,"streakCounter":true,"eventsTab":true,"eventsCreateEdit":true,"eventsSidebarAddButton":true,"eventsSidebarViewAllButton":true,"dashboardTab":true,"dashboardAdmin":true,"dashboardBanUnban":true,"dashboardPromoteDemote":true,"dashboardViewAdminLogs":true,"advancedStats":true,"customThemes":true,"dataExport":true}'::jsonb, ARRAY['stats','progression','history','events','settings','superadmin'])
ON CONFLICT (badge) DO UPDATE SET features = EXCLUDED.features, tabs = EXCLUDED.tabs;


-- ========== 20260225120005_consolidate-admin-messages.sql ==========
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


-- ========== 20260225120006_consolidate-data-tables.sql ==========
-- Consolidation : user_events, user_settings, booster_predictions (src/backend/supabase-schema-data.sql)
-- user_sessions créé par session-limits-rpc-and-rls / RUN_MIGRATIONS_SESSION_LIMITS

CREATE TABLE IF NOT EXISTS public.user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id TEXT,
  event_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_user_events_user ON public.user_events(user_id);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can CRUD own events" ON public.user_events;
CREATE POLICY "Users can CRUD own events" ON public.user_events FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings_json JSONB NOT NULL DEFAULT '{}',
  links_json JSONB DEFAULT '[]',
  booster_config_json JSONB DEFAULT '{}',
  current_stats_json JSONB DEFAULT '{}',
  theme TEXT DEFAULT 'dark',
  view_mode TEXT DEFAULT 'detailed',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can CRUD own settings" ON public.user_settings;
CREATE POLICY "Users can CRUD own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.booster_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prediction_date DATE NOT NULL,
  actual_date DATE NOT NULL,
  predicted_type TEXT,
  actual_type TEXT,
  accuracy BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booster_predictions_user ON public.booster_predictions(user_id);

ALTER TABLE public.booster_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can CRUD own predictions" ON public.booster_predictions;
CREATE POLICY "Users can CRUD own predictions" ON public.booster_predictions FOR ALL USING (auth.uid() = user_id);


-- ========== 20260225120007_consolidate-admin-rpcs.sql ==========
-- Consolidation : RPC admin (src/backend/supabase-rpc-admin.sql)
-- Nécessite : admin_logs, profiles. admin_update_profile dans extend-admin-update-profile-game-fields.
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role IN ('ADMIN','SUPERADMIN') OR badge IN ('ADMIN','SUPERADMIN')));
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'SUPERADMIN' OR badge = 'SUPERADMIN'));
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_ban_user(p_target_id UUID)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid(); v_target RECORD;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN RETURN jsonb_build_object('success', false, 'error', 'Non autorisé'); END IF;
  UPDATE public.profiles SET status = 'banned', updated_at = now() WHERE id = p_target_id RETURNING * INTO v_target;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable'); END IF;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details) VALUES (v_admin_id, p_target_id, 'ban', jsonb_build_object('email', v_target.email));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_unban_user(p_target_id UUID)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid(); v_target RECORD;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN RETURN jsonb_build_object('success', false, 'error', 'Non autorisé'); END IF;
  UPDATE public.profiles SET status = 'active', updated_at = now() WHERE id = p_target_id RETURNING * INTO v_target;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable'); END IF;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details) VALUES (v_admin_id, p_target_id, 'unban', jsonb_build_object('email', v_target.email));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_change_badge(p_target_id UUID, p_new_badge TEXT)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid(); v_target RECORD;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN RETURN jsonb_build_object('success', false, 'error', 'Non autorisé'); END IF;
  IF p_new_badge NOT IN ('FREE','PRO','ADMIN','SUPERADMIN') THEN RETURN jsonb_build_object('success', false, 'error', 'Badge invalide'); END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable'); END IF;
  UPDATE public.profiles SET badge = p_new_badge, updated_at = now() WHERE id = p_target_id;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details) VALUES (v_admin_id, p_target_id, 'badge_change', jsonb_build_object('old', v_target.badge, 'new', p_new_badge));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- [MANUAL] Usage manuel uniquement, pas d'UI associée.
CREATE OR REPLACE FUNCTION public.admin_change_role(p_target_id UUID, p_new_role TEXT)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid(); v_target RECORD;
BEGIN
  IF NOT public.is_superadmin() THEN RETURN jsonb_build_object('success', false, 'error', 'Réservé aux SuperAdmin'); END IF;
  IF p_new_role IS NOT NULL AND p_new_role NOT IN ('USER','ADMIN','SUPERADMIN') THEN RETURN jsonb_build_object('success', false, 'error', 'Rôle invalide'); END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable'); END IF;
  UPDATE public.profiles SET role = NULLIF(p_new_role, 'USER'), updated_at = now() WHERE id = p_target_id;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details) VALUES (v_admin_id, p_target_id, 'role_change', jsonb_build_object('old', v_target.role, 'new', p_new_role));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_add_note(p_target_id UUID, p_note TEXT)
RETURNS JSONB AS $$
DECLARE v_admin_id UUID := auth.uid(); v_meta JSONB; v_notes JSONB;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN RETURN jsonb_build_object('success', false, 'error', 'Non autorisé'); END IF;
  SELECT metadata INTO v_meta FROM public.profiles WHERE id = p_target_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable'); END IF;
  v_notes := COALESCE(v_meta->'admin_notes', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('admin_id', v_admin_id, 'content', p_note, 'ts', now()));
  UPDATE public.profiles SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{admin_notes}', v_notes), updated_at = now() WHERE id = p_target_id;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details) VALUES (v_admin_id, p_target_id, 'add_note', jsonb_build_object('preview', left(p_note, 50)));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_admin_logs(p_target_id UUID)
RETURNS TABLE(id UUID, admin_id UUID, action TEXT, details JSONB, created_at TIMESTAMPTZ) AS $$
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN RETURN; END IF;
  RETURN QUERY SELECT al.id, al.admin_id, al.action, al.details, al.created_at FROM public.admin_logs al WHERE al.target_user_id = p_target_id ORDER BY al.created_at DESC LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_admin_logs(p_limit INT DEFAULT 100, p_offset INT DEFAULT 0)
RETURNS TABLE(id UUID, admin_id UUID, target_user_id UUID, action TEXT, details JSONB, created_at TIMESTAMPTZ) AS $$
BEGIN
  IF NOT public.is_superadmin() THEN RETURN; END IF;
  RETURN QUERY SELECT al.id, al.admin_id, al.target_user_id, al.action, al.details, al.created_at FROM public.admin_logs al ORDER BY al.created_at DESC LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== RUN_MIGRATIONS_SESSION_LIMITS.sql ==========
-- ==========================================
-- Exécuter ce fichier en une fois dans Supabase → SQL Editor
-- pour appliquer les 3 migrations des limites de sessions (FREE=1, PRO=10).
-- Vérifier qu'aucune erreur ne s'affiche.
-- ==========================================

-- ----- 1. fix-rpc-get-user-permissions-security.sql -----
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (role IN ('ADMIN', 'SUPERADMIN') OR badge IN ('ADMIN', 'SUPERADMIN'))
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_profile RECORD;
  v_cfg RECORD;
  v_features JSONB;
  v_tabs TEXT[];
  v_limits JSONB;
BEGIN
  IF v_uid IS NOT NULL AND v_uid != auth.uid() AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès non autorisé aux permissions d''un autre utilisateur';
  END IF;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;
  SELECT id, badge, role, status INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;
  SELECT features, tabs INTO v_cfg FROM public.permissions_config WHERE badge = COALESCE(NULLIF(v_profile.badge, ''), 'FREE');
  IF NOT FOUND THEN SELECT features, tabs INTO v_cfg FROM public.permissions_config WHERE badge = 'FREE'; END IF;
  v_features := COALESCE(v_cfg.features, '{}'::jsonb);
  v_tabs := COALESCE(v_cfg.tabs, ARRAY['stats','progression','history','settings']);
  v_limits := CASE
    WHEN v_profile.badge IN ('ADMIN','SUPERADMIN') THEN '{"maxSessions": -1, "exportFormats": ["json","csv"]}'::jsonb
    WHEN v_profile.badge = 'PRO' THEN '{"maxSessions": 10, "exportFormats": ["json","csv"]}'::jsonb
    ELSE '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb
  END;
  RETURN jsonb_build_object(
    'badge', COALESCE(NULLIF(v_profile.badge, ''), 'FREE'),
    'role', COALESCE(NULLIF(v_profile.role, ''), 'USER'),
    'status', COALESCE(NULLIF(v_profile.status, ''), 'active'),
    'features', v_features, 'tabs', to_jsonb(v_tabs), 'limits', v_limits, 'source', 'supabase'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 2. session-limits-rpc-and-rls.sql -----
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id TEXT,
  honor BIGINT NOT NULL DEFAULT 0,
  xp BIGINT NOT NULL DEFAULT 0,
  rank_points BIGINT NOT NULL DEFAULT 0,
  next_rank_points BIGINT NOT NULL DEFAULT 0,
  current_rank TEXT,
  note TEXT,
  session_date TEXT,
  session_timestamp BIGINT NOT NULL,
  is_baseline BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, local_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_sessions' AND column_name = 'is_baseline'
  ) THEN
    ALTER TABLE user_sessions ADD COLUMN is_baseline BOOLEAN DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_timestamp ON user_sessions(session_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_baseline ON user_sessions(user_id, is_baseline) WHERE is_baseline = true;

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_my_badge()
RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF((SELECT badge FROM public.profiles WHERE id = auth.uid()), ''), 'FREE');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.insert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;
  SELECT public.get_my_badge() INTO v_badge;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');
  v_limit := CASE WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1 WHEN v_badge = 'PRO' THEN 10 ELSE 1 END;
  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count FROM public.user_sessions WHERE user_id = v_uid;
    IF v_count >= v_limit THEN
      IF v_badge = 'FREE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs FREE ne peuvent avoir qu''1 session. Passez en PRO pour plus de sessions.', 'code', 'SESSION_LIMIT_FREE');
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN.', 'code', 'SESSION_LIMIT_PRO');
      END IF;
    END IF;
  END IF;
  INSERT INTO public.user_sessions (user_id, local_id, honor, xp, rank_points, next_rank_points, current_rank, note, session_date, session_timestamp, is_baseline)
  VALUES (v_uid, p_row->>'local_id', COALESCE((p_row->>'honor')::BIGINT, 0), COALESCE((p_row->>'xp')::BIGINT, 0), COALESCE((p_row->>'rank_points')::BIGINT, 0), COALESCE((p_row->>'next_rank_points')::BIGINT, 0), NULLIF(trim(p_row->>'current_rank'), ''), NULLIF(trim(p_row->>'note'), ''), NULLIF(trim(p_row->>'session_date'), ''), COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT), COALESCE((p_row->>'is_baseline')::BOOLEAN, false));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.upsert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
  v_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_sessions WHERE user_id = v_uid AND local_id = (p_row->>'local_id')) INTO v_exists;
  IF v_exists THEN
    UPDATE public.user_sessions SET honor = COALESCE((p_row->>'honor')::BIGINT, 0), xp = COALESCE((p_row->>'xp')::BIGINT, 0), rank_points = COALESCE((p_row->>'rank_points')::BIGINT, 0), next_rank_points = COALESCE((p_row->>'next_rank_points')::BIGINT, 0), current_rank = NULLIF(trim(p_row->>'current_rank'), ''), note = NULLIF(trim(p_row->>'note'), ''), session_date = NULLIF(trim(p_row->>'session_date'), ''), session_timestamp = COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT), is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false), updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id');
    RETURN jsonb_build_object('success', true);
  END IF;
  SELECT public.get_my_badge() INTO v_badge;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');
  v_limit := CASE WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1 WHEN v_badge = 'PRO' THEN 10 ELSE 1 END;
  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count FROM public.user_sessions WHERE user_id = v_uid;
    IF v_count >= v_limit THEN
      IF v_badge = 'FREE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs FREE ne peuvent avoir qu''1 session. Passez en PRO pour plus de sessions.', 'code', 'SESSION_LIMIT_FREE');
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN.', 'code', 'SESSION_LIMIT_PRO');
      END IF;
    END IF;
  END IF;
  INSERT INTO public.user_sessions (user_id, local_id, honor, xp, rank_points, next_rank_points, current_rank, note, session_date, session_timestamp, is_baseline)
  VALUES (v_uid, p_row->>'local_id', COALESCE((p_row->>'honor')::BIGINT, 0), COALESCE((p_row->>'xp')::BIGINT, 0), COALESCE((p_row->>'rank_points')::BIGINT, 0), COALESCE((p_row->>'next_rank_points')::BIGINT, 0), NULLIF(trim(p_row->>'current_rank'), ''), NULLIF(trim(p_row->>'note'), ''), NULLIF(trim(p_row->>'session_date'), ''), COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT), COALESCE((p_row->>'is_baseline')::BOOLEAN, false));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Users can CRUD own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can select own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can select own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.user_sessions;
CREATE POLICY "Users can select own sessions" ON public.user_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.user_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.user_sessions FOR DELETE USING (auth.uid() = user_id);

GRANT EXECUTE ON FUNCTION public.insert_user_session_secure(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_session_secure(JSONB) TO authenticated;

-- ----- 3. fix-get-user-permissions-session-limits (déjà couvert par le bloc 1 ci-dessus) -----
-- Les limites FREE=1, PRO=10 sont déjà dans get_user_permissions du bloc 1. Aucune action supplémentaire.


-- ========== add-admin-send-global-message.sql ==========
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


-- ========== add-bug-reports.sql ==========
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

-- RPC : insérer un bug report et notifier tous les ADMIN/SUPERADMIN via admin_messages
-- SET row_security = off : nécessaire car en SECURITY DEFINER les requêtes appliquent le RLS
-- du rôle appelant ; le rapporteur (user) ne voit que son propre profil, donc 0 admin trouvé.
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

  -- Contourner le RLS pour cette transaction : le rôle appelant ne voit que son profil,
  -- donc sans cela on ne trouve aucun ADMIN/SUPERADMIN et aucun message n'est inséré.
  SET LOCAL row_security = off;

  FOR v_admin IN
    SELECT id FROM public.profiles
    WHERE (badge IN ('ADMIN', 'SUPERADMIN') OR role IN ('ADMIN', 'SUPERADMIN'))
    AND id != v_reporter_id
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


-- ========== add-classement-to-permissions.sql ==========
-- ==========================================
-- Ajout de l'onglet 'classement' dans permissions_config
-- Idempotent : pas de doublon si exécuté plusieurs fois
-- ==========================================

UPDATE permissions_config
SET tabs = array_append(tabs, 'classement')
WHERE NOT ('classement' = ANY(tabs));

-- Vérification finale : afficher badge et tabs pour chaque ligne
SELECT badge, tabs
FROM permissions_config
ORDER BY badge;


-- ========== add-current-events-json-to-user-settings.sql ==========
-- Événements DarkOrbit scrapés (liste), stockés par collecte
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS current_events_json JSONB DEFAULT '[]';


-- ========== add-dashboard-admin-permissions.sql ==========
-- ==========================================
-- Permissions dashboard par rôle
-- ADMIN : sous-onglets contrôlés par permissions_config.features
-- SUPERADMIN : accès total
-- ==========================================

-- Étendre les features ADMIN avec les clés dashboard (sans écraser les existantes)
UPDATE permissions_config
SET features = features || '{
  "dashboardViewUsers": true,
  "dashboardEditBadges": false,
  "dashboardBanUnban": false,
  "dashboardGenerateKeys": false,
  "dashboardCollectRankings": false,
  "dashboardDarkOrbitAccounts": false,
  "dashboardViewSecurityLogs": false
}'::jsonb
WHERE badge = 'ADMIN';

-- RPC : retourne les features du badge ADMIN (SUPERADMIN uniquement)
CREATE OR REPLACE FUNCTION public.get_admin_permissions_config()
RETURNS JSONB AS $$
DECLARE
  v_features JSONB;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;
  SELECT features INTO v_features FROM public.permissions_config WHERE badge = 'ADMIN';
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN COALESCE(v_features, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC : met à jour les features du badge ADMIN (SUPERADMIN uniquement)
CREATE OR REPLACE FUNCTION public.admin_update_admin_permissions(p_features JSONB)
RETURNS JSONB AS $$
DECLARE
  v_current JSONB;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;
  SELECT features INTO v_current FROM public.permissions_config WHERE badge = 'ADMIN';
  IF NOT FOUND THEN
    INSERT INTO public.permissions_config (badge, features, tabs)
    VALUES ('ADMIN', p_features, ARRAY['stats','progression','history','events','settings','superadmin'])
    ON CONFLICT (badge) DO UPDATE SET features = EXCLUDED.features;
  ELSE
    UPDATE public.permissions_config SET features = p_features WHERE badge = 'ADMIN';
  END IF;
  RETURN (SELECT features FROM public.permissions_config WHERE badge = 'ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_admin_permissions_config() IS 'Retourne les features du badge ADMIN. SUPERADMIN uniquement.';
COMMENT ON FUNCTION public.admin_update_admin_permissions(JSONB) IS 'Met à jour les features du badge ADMIN. SUPERADMIN uniquement.';


-- ========== add-dashboard-stats-rpc.sql ==========
-- ==========================================
-- RPC get_dashboard_stats : Vue générale (SUPERADMIN uniquement)
-- Retourne : total_users, free_count, pro_count, admin_count, superadmin_count, sessions_today, connected_users
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
  v_total INT;
  v_free INT;
  v_pro INT;
  v_admin INT;
  v_superadmin INT;
  v_sessions_today BIGINT;
  v_connected INT;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;

  SELECT count(*),
    count(*) FILTER (WHERE badge = 'FREE'),
    count(*) FILTER (WHERE badge = 'PRO'),
    count(*) FILTER (WHERE badge = 'ADMIN'),
    count(*) FILTER (WHERE badge = 'SUPERADMIN')
  INTO v_total, v_free, v_pro, v_admin, v_superadmin
  FROM public.profiles;

  SELECT count(*) INTO v_sessions_today
  FROM public.user_sessions
  WHERE session_timestamp >= (extract(epoch from current_date) * 1000)::bigint
    AND session_timestamp < (extract(epoch from current_date + interval '1 day') * 1000)::bigint;

  SELECT count(*) INTO v_connected
  FROM auth.sessions;

  RETURN jsonb_build_object(
    'total_users', coalesce(v_total, 0),
    'free_count', coalesce(v_free, 0),
    'pro_count', coalesce(v_pro, 0),
    'admin_count', coalesce(v_admin, 0),
    'superadmin_count', coalesce(v_superadmin, 0),
    'sessions_today', coalesce(v_sessions_today, 0),
    'connected_users', coalesce(v_connected, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==========================================
-- RPC get_user_latest_stats : Stats joueur pour popup admin (SUPERADMIN/ADMIN)
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_user_latest_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé aux admins';
  END IF;

  SELECT honor, xp, rank_points, current_rank, session_timestamp
  INTO v_row
  FROM public.user_sessions
  WHERE user_id = p_user_id
  ORDER BY session_timestamp DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('honor', null, 'xp', null, 'rank_points', null, 'grade', null);
  END IF;

  RETURN jsonb_build_object(
    'honor', v_row.honor,
    'xp', v_row.xp,
    'rank_points', v_row.rank_points,
    'grade', v_row.current_rank
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_dashboard_stats() IS 'Stats dashboard vue générale. SUPERADMIN uniquement.';
COMMENT ON FUNCTION public.get_user_latest_stats(UUID) IS 'Dernière session joueur pour popup admin.';


-- ========== add-galaxy-gates-json.sql ==========
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS galaxy_gates_json JSONB DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.upsert_player_profile(
  p_user_id TEXT,
  p_server TEXT,
  p_pseudo TEXT,
  p_company TEXT DEFAULT NULL,
  p_company_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_estimated_rp INTEGER DEFAULT NULL,
  p_total_hours INTEGER DEFAULT NULL,
  p_registered DATE DEFAULT NULL,
  p_npc_kills INTEGER DEFAULT NULL,
  p_ship_kills INTEGER DEFAULT NULL,
  p_galaxy_gates INTEGER DEFAULT NULL,
  p_galaxy_gates_json JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.player_profiles (
    user_id, server, pseudo, company, company_updated_at,
    estimated_rp, total_hours, registered,
    npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, dostats_updated_at
  )
  VALUES (
    p_user_id, p_server, p_pseudo, p_company, p_company_updated_at,
    p_estimated_rp, p_total_hours, p_registered,
    p_npc_kills, p_ship_kills,
    CASE
      WHEN p_galaxy_gates IS NOT NULL THEN p_galaxy_gates
      WHEN p_galaxy_gates_json IS NOT NULL AND jsonb_typeof(p_galaxy_gates_json) = 'object' THEN (SELECT COALESCE(SUM((value)::int), 0) FROM jsonb_each_text(p_galaxy_gates_json) WHERE value ~ '^\d+$')
      ELSE NULL
    END,
    p_galaxy_gates_json,
    NOW()
  )
  ON CONFLICT (user_id, server) DO UPDATE SET
    pseudo = COALESCE(EXCLUDED.pseudo, player_profiles.pseudo),
    estimated_rp = COALESCE(EXCLUDED.estimated_rp, player_profiles.estimated_rp),
    total_hours = COALESCE(EXCLUDED.total_hours, player_profiles.total_hours),
    npc_kills = COALESCE(EXCLUDED.npc_kills, player_profiles.npc_kills),
    ship_kills = COALESCE(EXCLUDED.ship_kills, player_profiles.ship_kills),
    galaxy_gates = CASE
      WHEN EXCLUDED.galaxy_gates IS NOT NULL THEN EXCLUDED.galaxy_gates
      WHEN EXCLUDED.galaxy_gates_json IS NOT NULL AND jsonb_typeof(EXCLUDED.galaxy_gates_json) = 'object' THEN (SELECT COALESCE(SUM((value)::int), 0) FROM jsonb_each_text(EXCLUDED.galaxy_gates_json) WHERE value ~ '^\d+$')
      ELSE player_profiles.galaxy_gates
    END,
    galaxy_gates_json = COALESCE(EXCLUDED.galaxy_gates_json, player_profiles.galaxy_gates_json),
    dostats_updated_at = CASE
      WHEN EXCLUDED.npc_kills IS NOT NULL OR EXCLUDED.ship_kills IS NOT NULL OR EXCLUDED.galaxy_gates IS NOT NULL OR (EXCLUDED.galaxy_gates_json IS NOT NULL AND jsonb_typeof(EXCLUDED.galaxy_gates_json) = 'object') THEN NOW()
      ELSE player_profiles.dostats_updated_at
    END,
    company = CASE
      WHEN EXCLUDED.company IS NOT NULL AND (
        player_profiles.company IS NULL OR
        player_profiles.company_updated_at IS NULL OR
        player_profiles.company_updated_at < NOW() - INTERVAL '30 days'
      ) THEN EXCLUDED.company
      ELSE player_profiles.company
    END,
    company_updated_at = CASE
      WHEN EXCLUDED.company IS NOT NULL AND (
        player_profiles.company IS NULL OR
        player_profiles.company_updated_at IS NULL OR
        player_profiles.company_updated_at < NOW() - INTERVAL '30 days'
      ) THEN NOW()
      ELSE player_profiles.company_updated_at
    END,
    registered = CASE
      WHEN player_profiles.registered IS NULL THEN EXCLUDED.registered
      ELSE player_profiles.registered
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_player_profile(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, DATE, INTEGER, INTEGER, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_player_profile(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, DATE, INTEGER, INTEGER, INTEGER, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.get_ranking_with_profiles(p_server TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players JSONB;
BEGIN
  SELECT
    jsonb_agg(
      p.player || jsonb_build_object(
        'estimated_rp', pp.estimated_rp,
        'total_hours', pp.total_hours,
        'registered', pp.registered,
        'npc_kills', pp.npc_kills,
        'ship_kills', pp.ship_kills,
        'galaxy_gates', pp.galaxy_gates,
        'galaxy_gates_json', pp.galaxy_gates_json,
        'company_from_dostats', pp.company,
        'dostats_updated_at', pp.dostats_updated_at
      )
    )
  INTO v_players
  FROM (
    SELECT jsonb_array_elements(players_json) AS player
    FROM shared_rankings
    WHERE server = p_server
  ) p
  LEFT JOIN player_profiles pp
    ON pp.user_id = (p.player->>'userId')
    AND pp.server = p_server;

  RETURN jsonb_build_object(
    'server', p_server,
    'players', COALESCE(v_players, '[]'::jsonb)
  );
END;
$$;


-- ========== add-heartbeat-last-seen.sql ==========
-- ==========================================
-- HEARTBEAT : last_seen_at dans profiles
-- Utilisateurs "connectés" = last_seen_at > now() - 3 minutes
-- ==========================================

-- 1. Ajouter la colonne last_seen_at
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NULL;

-- 2. RPC update_last_seen : met à jour last_seen_at pour l'utilisateur connecté
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen_at = now()
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.update_last_seen() IS 'Heartbeat : met à jour last_seen_at de l''utilisateur connecté.';

-- 3. Mettre à jour get_dashboard_stats pour utiliser last_seen_at
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
  v_total INT;
  v_free INT;
  v_pro INT;
  v_admin INT;
  v_superadmin INT;
  v_sessions_today BIGINT;
  v_connected INT;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;

  SELECT count(*),
    count(*) FILTER (WHERE badge = 'FREE'),
    count(*) FILTER (WHERE badge = 'PRO'),
    count(*) FILTER (WHERE badge = 'ADMIN'),
    count(*) FILTER (WHERE badge = 'SUPERADMIN')
  INTO v_total, v_free, v_pro, v_admin, v_superadmin
  FROM public.profiles;

  SELECT count(*) INTO v_sessions_today
  FROM public.user_sessions
  WHERE session_timestamp >= (extract(epoch from current_date) * 1000)::bigint
    AND session_timestamp < (extract(epoch from current_date + interval '1 day') * 1000)::bigint;

  -- Joueurs actifs = last_seen_at dans les 3 dernières minutes
  SELECT count(*) INTO v_connected
  FROM public.profiles
  WHERE last_seen_at > now() - interval '3 minutes';

  RETURN jsonb_build_object(
    'total_users', coalesce(v_total, 0),
    'free_count', coalesce(v_free, 0),
    'pro_count', coalesce(v_pro, 0),
    'admin_count', coalesce(v_admin, 0),
    'superadmin_count', coalesce(v_superadmin, 0),
    'sessions_today', coalesce(v_sessions_today, 0),
    'connected_users', coalesce(v_connected, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_dashboard_stats() IS 'Stats dashboard. connected_users = last_seen_at > now()-3min. SUPERADMIN uniquement.';


-- ========== add-imported-rankings-to-user-settings.sql ==========
-- Ajout de la colonne imported_rankings_json pour stocker les classements importés (JSON extension)
-- Structure: { "gbl5": { "exportedAt": 123, "players": [...] }, "fr1": {...} }
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS imported_rankings_json JSONB DEFAULT '{}';


-- ========== add-language-theme-auto-to-user-settings.sql ==========
-- language + theme_auto dans user_settings (sync avec localStorage)
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'fr';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS theme_auto BOOLEAN DEFAULT true;


-- ========== add-paypal-subscription-id.sql ==========
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


-- ========== add-player-id-to-sessions.sql ==========
-- ==========================================
-- Migration : player_id dans user_sessions + limites par (user_id, player_id)
-- + RPC get_darkorbit_account_limit
-- ==========================================

-- Action 1 : Colonnes player_id, player_server, player_pseudo
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS player_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS player_server TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS player_pseudo TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_player_id
  ON user_sessions(user_id, player_id);

-- Action 2 : Vider les sessions existantes
DELETE FROM user_sessions;

-- Action 3 : upsert_user_session_secure avec player_id et limite par (user_id, player_id)
CREATE OR REPLACE FUNCTION public.upsert_user_session_secure(
  p_row JSONB,
  p_player_id TEXT DEFAULT NULL,
  p_player_server TEXT DEFAULT NULL,
  p_player_pseudo TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
  v_exists BOOLEAN;
  v_player_id TEXT := COALESCE(NULLIF(trim(p_player_id), ''), NULLIF(trim(p_row->>'player_id'), ''));
  v_player_server TEXT := COALESCE(NULLIF(trim(p_player_server), ''), NULLIF(trim(p_row->>'player_server'), ''));
  v_player_pseudo TEXT := COALESCE(NULLIF(trim(p_player_pseudo), ''), NULLIF(trim(p_row->>'player_pseudo'), ''));
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
      AND (player_id IS NOT DISTINCT FROM v_player_id)
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE public.user_sessions SET
      honor = COALESCE((p_row->>'honor')::BIGINT, 0),
      xp = COALESCE((p_row->>'xp')::BIGINT, 0),
      rank_points = COALESCE((p_row->>'rank_points')::BIGINT, 0),
      next_rank_points = COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
      current_rank = NULLIF(trim(p_row->>'current_rank'), ''),
      note = NULLIF(trim(p_row->>'note'), ''),
      session_date = NULLIF(trim(p_row->>'session_date'), ''),
      session_timestamp = COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
      is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
      player_id = v_player_id,
      player_server = v_player_server,
      player_pseudo = v_player_pseudo,
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
      AND (player_id IS NOT DISTINCT FROM v_player_id);
    RETURN jsonb_build_object('success', true);
  END IF;

  SELECT public.get_my_badge() INTO v_badge;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');
  v_limit := CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 10
    ELSE 1
  END;

  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count
    FROM public.user_sessions
    WHERE user_id = v_uid
      AND (player_id IS NOT DISTINCT FROM v_player_id)
      AND is_baseline = false;
    IF v_count >= v_limit THEN
      RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte pour ce compte DarkOrbit.', 'code', 'SESSION_LIMIT_PLAYER');
    END IF;
  END IF;

  INSERT INTO public.user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline,
    player_id, player_server, player_pseudo
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
    v_player_id,
    v_player_server,
    v_player_pseudo
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Action 4 : get_user_latest_stats avec filtre optionnel player_id
CREATE OR REPLACE FUNCTION public.get_user_latest_stats(
  p_user_id UUID,
  p_player_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé aux admins';
  END IF;

  SELECT honor, xp, rank_points, current_rank, session_timestamp
  INTO v_row
  FROM public.user_sessions
  WHERE user_id = p_user_id
    AND (p_player_id IS NULL OR player_id = p_player_id)
  ORDER BY session_timestamp DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('honor', null, 'xp', null, 'rank_points', null, 'grade', null);
  END IF;

  RETURN jsonb_build_object(
    'honor', v_row.honor,
    'xp', v_row.xp,
    'rank_points', v_row.rank_points,
    'grade', v_row.current_rank
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Action 5 : get_darkorbit_account_limit
CREATE OR REPLACE FUNCTION public.get_darkorbit_account_limit()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge TEXT;
BEGIN
  SELECT COALESCE(UPPER(trim(badge)), 'FREE') INTO v_badge
  FROM public.profiles WHERE id = auth.uid();
  RETURN CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 5
    ELSE 1
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_session_secure(JSONB, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_latest_stats(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_darkorbit_account_limit() TO authenticated;

COMMENT ON FUNCTION public.upsert_user_session_secure(JSONB, TEXT, TEXT, TEXT) IS 'Upsert session avec limite par (user_id, player_id). FREE=1, PRO=10 par compte DarkOrbit.';
COMMENT ON FUNCTION public.get_user_latest_stats(UUID, TEXT) IS 'Dernière session joueur pour popup admin. Filtre optionnel par player_id.';
COMMENT ON FUNCTION public.get_darkorbit_account_limit() IS 'Limite comptes DarkOrbit : FREE=1, PRO=5, ADMIN/SUPERADMIN=illimité.';


-- ========== add-profiles-last-stats-collected-at.sql ==========
-- Cooldown 6h pour la récolte auto des stats (bouton Statistiques, badge ≠ FREE)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_stats_collected_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_stats_collected_at IS 'Dernière récolte auto des stats (client Flash). Cooldown 6h entre deux récoltes.';


-- ========== add-subscription-status-trial.sql ==========
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

-- RPC activate_trial_key : valide le code et active l'essai
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


-- ========== add-user-preferences-and-darkorbit-accounts.sql ==========
-- ==========================================
-- user_preferences : active_player, events_hidden, ranking_favorite
-- user_darkorbit_accounts : metadata comptes DarkOrbit (pseudo, server) — sans mots de passe
-- ==========================================

-- 1. Table user_preferences
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  active_player_id TEXT,
  active_player_server TEXT,
  events_hidden JSONB NOT NULL DEFAULT '[]',
  ranking_favorite_server TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON public.user_preferences(user_id);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
CREATE POLICY "Users can select own preferences" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Table user_darkorbit_accounts (metadata uniquement, pas de mot de passe)
CREATE TABLE IF NOT EXISTS public.user_darkorbit_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id TEXT,
  player_pseudo TEXT NOT NULL,
  player_server TEXT NOT NULL DEFAULT 'gbl5',
  is_active BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_darkorbit_accounts_user ON public.user_darkorbit_accounts(user_id);
ALTER TABLE public.user_darkorbit_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own darkorbit accounts" ON public.user_darkorbit_accounts;
DROP POLICY IF EXISTS "Users can insert own darkorbit accounts" ON public.user_darkorbit_accounts;
DROP POLICY IF EXISTS "Users can update own darkorbit accounts" ON public.user_darkorbit_accounts;
DROP POLICY IF EXISTS "Users can delete own darkorbit accounts" ON public.user_darkorbit_accounts;
CREATE POLICY "Users can select own darkorbit accounts" ON public.user_darkorbit_accounts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own darkorbit accounts" ON public.user_darkorbit_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own darkorbit accounts" ON public.user_darkorbit_accounts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own darkorbit accounts" ON public.user_darkorbit_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- 3. RPC get_user_preferences
CREATE OR REPLACE FUNCTION public.get_user_preferences()
RETURNS TABLE (
  active_player_id TEXT,
  active_player_server TEXT,
  events_hidden JSONB,
  ranking_favorite_server TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.active_player_id, p.active_player_server, p.events_hidden, p.ranking_favorite_server
  FROM public.user_preferences p
  WHERE p.user_id = auth.uid();
$$;

-- 4. RPC upsert_user_preferences
CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_active_player_id TEXT DEFAULT NULL,
  p_active_player_server TEXT DEFAULT NULL,
  p_events_hidden JSONB DEFAULT NULL,
  p_ranking_favorite_server TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  INSERT INTO public.user_preferences (user_id, active_player_id, active_player_server, events_hidden, ranking_favorite_server, updated_at)
  VALUES (v_uid, NULLIF(trim(p_active_player_id), ''), NULLIF(trim(p_active_player_server), ''), COALESCE(p_events_hidden, '[]'::jsonb), NULLIF(trim(p_ranking_favorite_server), ''))
  ON CONFLICT (user_id) DO UPDATE SET
    active_player_id = CASE WHEN p_active_player_id IS NOT NULL THEN NULLIF(trim(p_active_player_id), '') ELSE user_preferences.active_player_id END,
    active_player_server = CASE WHEN p_active_player_server IS NOT NULL THEN NULLIF(trim(p_active_player_server), '') ELSE user_preferences.active_player_server END,
    events_hidden = COALESCE(p_events_hidden, user_preferences.events_hidden),
    ranking_favorite_server = CASE WHEN p_ranking_favorite_server IS NOT NULL THEN NULLIF(trim(p_ranking_favorite_server), '') ELSE user_preferences.ranking_favorite_server END,
    updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. RPC get_user_darkorbit_accounts
CREATE OR REPLACE FUNCTION public.get_user_darkorbit_accounts()
RETURNS TABLE (
  id UUID,
  player_id TEXT,
  player_pseudo TEXT,
  player_server TEXT,
  is_active BOOLEAN,
  display_order INT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT a.id, a.player_id, a.player_pseudo, a.player_server, a.is_active, a.display_order, a.created_at
  FROM public.user_darkorbit_accounts a
  WHERE a.user_id = auth.uid()
  ORDER BY a.display_order ASC, a.created_at ASC;
$$;

-- 6. RPC upsert_user_darkorbit_account
CREATE OR REPLACE FUNCTION public.upsert_user_darkorbit_account(
  p_id UUID DEFAULT NULL,
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
  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_darkorbit_accounts WHERE id = p_id AND user_id = v_uid) THEN
    UPDATE public.user_darkorbit_accounts SET
      player_id = COALESCE(NULLIF(trim(p_player_id), ''), player_id),
      player_pseudo = v_pseudo,
      player_server = v_server,
      is_active = p_is_active,
      updated_at = now()
    WHERE id = p_id AND user_id = v_uid;
    RETURN jsonb_build_object('success', true, 'id', p_id);
  ELSE
    INSERT INTO public.user_darkorbit_accounts (user_id, player_id, player_pseudo, player_server, is_active, display_order)
    VALUES (v_uid, NULLIF(trim(p_player_id), ''), v_pseudo, v_server, p_is_active,
      (SELECT COALESCE(MAX(display_order), 0) + 1 FROM public.user_darkorbit_accounts WHERE user_id = v_uid))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'id', v_id);
  END IF;
END;
$$;

-- 7. RPC delete_user_darkorbit_account
CREATE OR REPLACE FUNCTION public.delete_user_darkorbit_account(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  DELETE FROM public.user_darkorbit_accounts WHERE id = p_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;


-- ========== create-admin-logs-table.sql ==========
-- ==========================================
-- TABLE ADMIN_LOGS — Journal des actions admin
-- Référencée par les RPC : admin_ban_user, admin_unban_user, admin_change_badge,
-- admin_change_role, admin_add_note, admin_update_profile, get_user_admin_logs, get_admin_logs
-- À exécuter dans l'éditeur SQL Supabase (avant ou avec supabase-rpc-admin.sql)
-- ==========================================

CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  old_value JSONB,
  new_value JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour les requêtes des RPC get_user_admin_logs et get_admin_logs
CREATE INDEX IF NOT EXISTS idx_admin_logs_target_user ON admin_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

-- SELECT : uniquement les utilisateurs dont le rôle ou le badge est ADMIN ou SUPERADMIN
-- (utilise les fonctions SECURITY DEFINER existantes pour éviter récursion RLS sur profiles)
DROP POLICY IF EXISTS "admin_logs_select_admin_superadmin" ON admin_logs;
CREATE POLICY "admin_logs_select_admin_superadmin"
  ON admin_logs FOR SELECT
  USING (
    get_my_profile_role() IN ('ADMIN', 'SUPERADMIN')
    OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN')
  );

-- Pas de policy INSERT : l'insertion se fait uniquement via les RPC SECURITY DEFINER
-- (admin_ban_user, admin_unban_user, admin_change_badge, etc.)
-- Pas de policy UPDATE/DELETE : les logs sont immuables côté utilisateur


-- ========== create-events-table.sql ==========
-- Table events : événements actifs avec timer (sidebar)
-- id, visible, expires_at, created_at. event_data pour affichage (name, description, image).
CREATE TABLE IF NOT EXISTS public.events (
  id TEXT PRIMARY KEY,
  visible BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_data JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_visible ON events(visible) WHERE visible = true;
CREATE INDEX IF NOT EXISTS idx_events_expires ON events(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_visible" ON events;
CREATE POLICY "events_select_visible"
  ON events FOR SELECT
  USING (visible = true);

DROP POLICY IF EXISTS "events_insert_anon" ON events;
CREATE POLICY "events_insert_anon"
  ON events FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "events_update_anon" ON events;
CREATE POLICY "events_update_anon"
  ON events FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "events_delete_anon" ON events;
CREATE POLICY "events_delete_anon"
  ON events FOR DELETE
  USING (true);


-- ========== create-license-keys.sql ==========
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
DROP POLICY IF EXISTS "license_keys_select" ON public.license_keys;
CREATE POLICY "license_keys_select" ON public.license_keys FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE : SUPERADMIN uniquement
DROP POLICY IF EXISTS "license_keys_insert_superadmin" ON public.license_keys;
CREATE POLICY "license_keys_insert_superadmin" ON public.license_keys FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND badge = 'SUPERADMIN')
  );

DROP POLICY IF EXISTS "license_keys_update_superadmin" ON public.license_keys;
CREATE POLICY "license_keys_update_superadmin" ON public.license_keys FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND badge = 'SUPERADMIN')
  );

DROP POLICY IF EXISTS "license_keys_delete_superadmin" ON public.license_keys;
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


-- ========== create-player-profiles-table.sql ==========
-- ==========================================
-- TABLE player_profiles — Profils joueurs DOStats
-- user_id = userId DarkOrbit, server = serveur (gbl5, fr1, etc.)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.player_profiles (
  user_id TEXT NOT NULL,
  server TEXT NOT NULL,
  pseudo TEXT,
  company TEXT,
  company_updated_at TIMESTAMPTZ,
  estimated_rp INTEGER,
  total_hours INTEGER,
  registered DATE,
  npc_kills INTEGER,
  ship_kills INTEGER,
  galaxy_gates INTEGER,
  dostats_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, server)
);

ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.player_profiles;
CREATE POLICY "Public read access" ON public.player_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service insert/update" ON public.player_profiles;
CREATE POLICY "Service insert/update" ON public.player_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_player_profiles_server ON public.player_profiles(server);
CREATE INDEX IF NOT EXISTS idx_player_profiles_pseudo ON public.player_profiles(pseudo);
CREATE INDEX IF NOT EXISTS idx_player_profiles_updated ON public.player_profiles(dostats_updated_at);

CREATE OR REPLACE FUNCTION public.upsert_player_profile(
  p_user_id TEXT,
  p_server TEXT,
  p_pseudo TEXT,
  p_company TEXT DEFAULT NULL,
  p_company_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_estimated_rp INTEGER DEFAULT NULL,
  p_total_hours INTEGER DEFAULT NULL,
  p_registered DATE DEFAULT NULL,
  p_npc_kills INTEGER DEFAULT NULL,
  p_ship_kills INTEGER DEFAULT NULL,
  p_galaxy_gates INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.player_profiles (
    user_id, server, pseudo, company, company_updated_at,
    estimated_rp, total_hours, registered,
    npc_kills, ship_kills, galaxy_gates, dostats_updated_at
  )
  VALUES (
    p_user_id, p_server, p_pseudo, p_company, p_company_updated_at,
    p_estimated_rp, p_total_hours, p_registered,
    p_npc_kills, p_ship_kills, p_galaxy_gates, NOW()
  )
  ON CONFLICT (user_id, server) DO UPDATE SET
    pseudo = EXCLUDED.pseudo,
    estimated_rp = EXCLUDED.estimated_rp,
    total_hours = EXCLUDED.total_hours,
    npc_kills = EXCLUDED.npc_kills,
    ship_kills = EXCLUDED.ship_kills,
    galaxy_gates = EXCLUDED.galaxy_gates,
    dostats_updated_at = NOW(),
    company = CASE
      WHEN EXCLUDED.company IS NOT NULL AND (
        player_profiles.company IS NULL OR
        player_profiles.company_updated_at IS NULL OR
        player_profiles.company_updated_at < NOW() - INTERVAL '30 days'
      ) THEN EXCLUDED.company
      ELSE player_profiles.company
    END,
    company_updated_at = CASE
      WHEN EXCLUDED.company IS NOT NULL AND (
        player_profiles.company IS NULL OR
        player_profiles.company_updated_at IS NULL OR
        player_profiles.company_updated_at < NOW() - INTERVAL '30 days'
      ) THEN NOW()
      ELSE player_profiles.company_updated_at
    END,
    registered = CASE
      WHEN player_profiles.registered IS NULL THEN EXCLUDED.registered
      ELSE player_profiles.registered
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_player_profile(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, DATE, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_player_profile(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, DATE, INTEGER, INTEGER, INTEGER) TO service_role;


-- ========== create-profiles-table.sql ==========
-- ==========================================
-- TABLE PROFILES — Schéma complet
-- Référencée par : auth-manager.js, api.js, super-admin.js, RPC permissions/admin
-- À exécuter dans l'éditeur SQL Supabase (avant le trigger et supabase-fix-profiles-rls.sql)
-- RLS : non activé ici, géré par supabase-fix-profiles-rls.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  email TEXT,
  game_pseudo TEXT,
  server TEXT,
  company TEXT,
  initial_honor BIGINT DEFAULT 0,
  initial_xp BIGINT DEFAULT 0,
  initial_rank TEXT,
  initial_rank_points INTEGER DEFAULT 0,
  next_rank_points INTEGER,
  badge TEXT NOT NULL DEFAULT 'FREE',
  role TEXT DEFAULT 'USER',
  status TEXT NOT NULL DEFAULT 'active',
  verification_status TEXT DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  is_suspect BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ,

  CONSTRAINT profiles_company_check
    CHECK (company IS NULL OR company IN ('EIC', 'MMO', 'VRU')),
  CONSTRAINT profiles_badge_check
    CHECK (badge IN ('FREE', 'PRO', 'ADMIN', 'SUPERADMIN')),
  CONSTRAINT profiles_role_check
    CHECK (role IS NULL OR role IN ('USER', 'ADMIN', 'SUPERADMIN')),
  CONSTRAINT profiles_status_check
    CHECK (status IN ('active', 'pending', 'banned', 'rejected', 'suspended')),
  CONSTRAINT profiles_verification_status_check
    CHECK (verification_status IS NULL OR verification_status IN ('pending', 'approved', 'rejected'))
);

-- Index pour le dashboard admin (filtrage par statut de vérification)
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON profiles(verification_status)
  WHERE verification_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_verification_pending
  ON profiles(verified_at, id)
  WHERE verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_badge ON profiles(badge);


-- ========== create-profiles-trigger.sql ==========
-- ==========================================
-- TRIGGER — Auto-création du profil à l'inscription
-- Après INSERT sur auth.users, crée une ligne dans public.profiles avec valeurs par défaut
-- et optionnellement les champs issus de user_metadata (signUp options.data)
-- À exécuter après create-profiles-table.sql
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    username,
    game_pseudo,
    server,
    company,
    initial_honor,
    initial_xp,
    initial_rank,
    initial_rank_points,
    next_rank_points,
    badge,
    role,
    status,
    verification_status,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      v_meta->>'username',
      v_meta->>'full_name',
      v_meta->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NULLIF(trim(v_meta->>'game_pseudo'), ''),
    NULLIF(trim(v_meta->>'server'), ''),
    NULLIF(trim(v_meta->>'company'), ''),
    COALESCE((v_meta->>'initial_honor')::BIGINT, 0),
    COALESCE((v_meta->>'initial_xp')::BIGINT, 0),
    NULLIF(trim(v_meta->>'initial_rank'), ''),
    COALESCE((v_meta->>'initial_rank_points')::INTEGER, 0),
    (v_meta->>'next_rank_points')::INTEGER,
    'FREE',
    'USER',
    'active',
    'pending',
    '{}'::jsonb,
    now(),
    now()
  );
  RETURN NEW;
END;
$$;

-- Déclencheur : après chaque INSERT sur auth.users (inscription)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ========== create-ranking-rpc.sql ==========
-- ==========================================
-- RPC Classement — Données publiques (profiles_public + dernière session)
-- À exécuter après create-profiles-table, fix-profiles-rls-sensitive-fields, profiles_public
-- ==========================================

-- Retourne le classement : un enregistrement par utilisateur avec sa dernière session.
-- Filtres : serveur, firmes. Tri : honor, xp ou rank_points. Limite : p_limit.
DROP FUNCTION IF EXISTS public.get_ranking(text, text[], text, integer);
DROP FUNCTION IF EXISTS public.get_ranking(text, text[], text, int);
CREATE OR REPLACE FUNCTION public.get_ranking(
  p_server TEXT DEFAULT NULL,
  p_companies TEXT[] DEFAULT NULL,
  p_type TEXT DEFAULT 'honor',
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  game_pseudo TEXT,
  company TEXT,
  badge TEXT,
  honor BIGINT,
  xp BIGINT,
  rank_points BIGINT,
  next_rank_points BIGINT,
  current_rank TEXT,
  session_date TEXT,
  session_timestamp BIGINT,
  note TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.game_pseudo,
    p.company,
    p.badge,
    s.honor,
    s.xp,
    s.rank_points,
    s.next_rank_points,
    s.current_rank,
    s.session_date,
    s.session_timestamp,
    s.note
  FROM (
    SELECT pr.id, pr.game_pseudo, pr.company, pr.badge
    FROM profiles_public pr
    WHERE (p_server IS NULL OR trim(p_server) = '' OR pr.server = p_server)
      AND (p_companies IS NULL OR cardinality(p_companies) = 0 OR pr.company = ANY(p_companies))
  ) p
  LEFT JOIN LATERAL (
    SELECT us.honor, us.xp, us.rank_points, us.next_rank_points, us.current_rank,
           us.session_date, us.session_timestamp, us.note
    FROM user_sessions us
    WHERE us.user_id = p.id
    ORDER BY us.session_timestamp DESC NULLS LAST
    LIMIT 1
  ) s ON true
  ORDER BY
    CASE p_type
      WHEN 'xp' THEN s.xp
      WHEN 'rank_points' THEN s.rank_points
      ELSE s.honor
    END DESC NULLS LAST,
    p.id
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
END;
$$;

-- Mise à jour des tabs dans permissions_config pour inclure 'classement'
UPDATE permissions_config SET tabs = array_append(tabs, 'classement') WHERE NOT ('classement' = ANY(tabs));


-- ========== create-rpc-get-ranking.sql ==========
-- ==========================================
-- RPC get_ranking — Classement (profiles_public + dernière session par user)
-- Cohérent avec l'appel ranking.js : p_server, p_companies, p_type, p_limit
-- ==========================================

DROP FUNCTION IF EXISTS public.get_ranking(text, text[], text, integer);
DROP FUNCTION IF EXISTS public.get_ranking(text, text[], text, int);
CREATE OR REPLACE FUNCTION public.get_ranking(
  p_server TEXT DEFAULT NULL,
  p_companies TEXT[] DEFAULT NULL,
  p_type TEXT DEFAULT 'honor',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  game_pseudo TEXT,
  company TEXT,
  badge TEXT,
  current_rank TEXT,
  honor BIGINT,
  xp BIGINT,
  rank_points INTEGER,
  next_rank_points INTEGER,
  session_date TEXT,
  session_timestamp BIGINT,
  note TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server TEXT := NULLIF(trim(COALESCE(p_server, '')), '');
  v_companies TEXT[] := p_companies;
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
BEGIN
  RETURN QUERY
  WITH latest_sessions AS (
    SELECT DISTINCT ON (user_id)
      user_id,
      honor,
      xp,
      rank_points,
      next_rank_points,
      current_rank,
      session_date,
      session_timestamp,
      note
    FROM user_sessions
    ORDER BY user_id, session_timestamp DESC NULLS LAST
  ),
  filtered AS (
    SELECT
      p.id,
      p.game_pseudo,
      p.company,
      p.badge,
      COALESCE(s.current_rank, 'Pilote de 1ère classe') AS current_rank,
      COALESCE(s.honor, 0) AS honor,
      COALESCE(s.xp, 0) AS xp,
      COALESCE(s.rank_points, 0)::INTEGER AS rank_points,
      COALESCE(s.next_rank_points, 0)::INTEGER AS next_rank_points,
      s.session_date,
      s.session_timestamp,
      s.note
    FROM profiles_public p
    LEFT JOIN latest_sessions s ON s.user_id = p.id
    WHERE
      (v_server IS NULL OR p.server = v_server)
      AND (v_companies IS NULL OR cardinality(v_companies) = 0 OR p.company = ANY(v_companies))
  )
  SELECT
    f.id,
    f.game_pseudo,
    f.company,
    f.badge,
    f.current_rank,
    f.honor,
    f.xp,
    f.rank_points,
    f.next_rank_points,
    f.session_date,
    f.session_timestamp,
    f.note
  FROM filtered f
  ORDER BY
    CASE
      WHEN p_type = 'xp' THEN f.xp
      WHEN p_type IN ('rank_points', 'rank') THEN f.rank_points
      ELSE f.honor
    END DESC NULLS LAST,
    f.id
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.get_ranking(TEXT, TEXT[], TEXT, INTEGER) IS 'Classement : dernière session par user (profiles_public + user_sessions). Filtres serveur/firmes, tri honor/xp/rank_points. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.get_ranking(TEXT, TEXT[], TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking(TEXT, TEXT[], TEXT, INTEGER) TO anon;

-- Inclure l'onglet Classement pour tous les badges (évite que l'onglet disparaisse pour FREE)
UPDATE permissions_config SET tabs = array_append(tabs, 'classement') WHERE NOT ('classement' = ANY(tabs));


-- ========== delete-player-sessions-rpc.sql ==========
-- ==========================================
-- RPC : Supprimer les sessions d'un player_id pour l'utilisateur courant
-- ==========================================
CREATE OR REPLACE FUNCTION public.delete_player_sessions(p_player_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_sessions
  WHERE user_id = auth.uid()
    AND (player_id IS NOT DISTINCT FROM p_player_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_player_sessions(TEXT) TO authenticated;

COMMENT ON FUNCTION public.delete_player_sessions(TEXT) IS 'Supprime les sessions du player_id pour l''utilisateur connecté.';


-- ========== events-cleanup-cron.sql ==========
-- Optionnel : cron horaire pour nettoyer les événements expirés (app fermée au moment de l'expiration)
-- Nécessite l'extension pg_cron (activée dans Supabase Dashboard > Database > Extensions)
-- SELECT cron.schedule('cleanup-expired-events', '0 * * * *', 'SELECT public.cleanup_expired_events()');


-- ========== events-rpc-and-cleanup.sql ==========
-- RPC : upsert événements (scraper/client). event_data contient name, description, imageUrl, etc.
CREATE OR REPLACE FUNCTION public.upsert_sidebar_events(p_events JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev JSONB;
  v_id TEXT;
  v_expires_at TIMESTAMPTZ;
  v_event_data JSONB;
BEGIN
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'count', 0);
  END IF;
  FOR ev IN SELECT * FROM jsonb_array_elements(p_events)
  LOOP
    v_id := nullif(trim(ev->>'id'), '');
    IF v_id IS NULL THEN CONTINUE; END IF;
    v_expires_at := NULL;
    IF (ev->>'expires_at') IS NOT NULL AND (ev->>'expires_at') != '' THEN
      v_expires_at := (ev->>'expires_at')::timestamptz;
    END IF;
    v_event_data := COALESCE(ev->'event_data', ev - 'id' - 'expires_at' - 'visible');
    INSERT INTO events (id, visible, expires_at, event_data)
    VALUES (v_id, COALESCE((ev->>'visible')::boolean, true), v_expires_at, v_event_data)
    ON CONFLICT (id) DO UPDATE SET
      visible = EXCLUDED.visible,
      expires_at = EXCLUDED.expires_at,
      event_data = EXCLUDED.event_data;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'count', jsonb_array_length(p_events));
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_sidebar_events(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_sidebar_events(JSONB) TO anon;

-- RPC : récupérer les événements visibles (non expirés si expires_at présent)
CREATE OR REPLACE FUNCTION public.get_visible_events()
RETURNS SETOF public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM events
  WHERE visible = true
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY expires_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_events() TO anon;

-- RPC : supprimer un événement par id (appelé par le client quand timer = 0)
CREATE OR REPLACE FUNCTION public.delete_event_by_id(p_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM events WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_event_by_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_by_id(TEXT) TO anon;

-- Fonction de nettoyage : supprime les événements expirés (cron horaire)
-- Ne jamais supprimer où expires_at IS NULL
CREATE OR REPLACE FUNCTION public.cleanup_expired_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM events
    WHERE expires_at IS NOT NULL AND expires_at < now()
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_deleted FROM deleted;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_events() TO service_role;


-- ========== extend-admin-update-profile-game-fields.sql ==========
-- Étend admin_update_profile pour permettre aux admins de modifier pseudo, serveur, firme et stats initiales

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id UUID,
  p_status TEXT DEFAULT NULL,
  p_is_suspect BOOLEAN DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_game_pseudo TEXT DEFAULT NULL,
  p_server TEXT DEFAULT NULL,
  p_company TEXT DEFAULT NULL,
  p_initial_honor BIGINT DEFAULT NULL,
  p_initial_xp BIGINT DEFAULT NULL,
  p_initial_rank TEXT DEFAULT NULL,
  p_initial_rank_points INT DEFAULT NULL,
  p_next_rank_points INT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  IF NOT public.is_admin_or_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorisé');
  END IF;
  UPDATE public.profiles SET
    status = COALESCE(p_status, status),
    is_suspect = COALESCE(p_is_suspect, is_suspect),
    email = COALESCE(p_email, email),
    game_pseudo = CASE WHEN p_game_pseudo IS NOT NULL THEN p_game_pseudo ELSE game_pseudo END,
    server = CASE WHEN p_server IS NOT NULL THEN p_server ELSE server END,
    company = CASE WHEN p_company IS NOT NULL THEN p_company ELSE company END,
    initial_honor = CASE WHEN p_initial_honor IS NOT NULL THEN p_initial_honor ELSE initial_honor END,
    initial_xp = CASE WHEN p_initial_xp IS NOT NULL THEN p_initial_xp ELSE initial_xp END,
    initial_rank = CASE WHEN p_initial_rank IS NOT NULL THEN p_initial_rank ELSE initial_rank END,
    initial_rank_points = CASE WHEN p_initial_rank_points IS NOT NULL THEN p_initial_rank_points ELSE initial_rank_points END,
    next_rank_points = CASE WHEN p_next_rank_points IS NOT NULL THEN p_next_rank_points ELSE next_rank_points END,
    updated_at = now()
  WHERE id = p_target_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details)
  VALUES (v_admin_id, p_target_id, 'edit', jsonb_build_object('status', p_status, 'email', p_email));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== fix-admin-permissions-consolidated.sql ==========
-- ==========================================
-- FIX ADMIN PERMISSIONS — À exécuter dans Supabase SQL Editor si les fonctions
-- get_admin_permissions_config / admin_update_admin_permissions n'existent pas.
-- ==========================================

-- S'assurer que la ligne ADMIN existe dans permissions_config
INSERT INTO public.permissions_config (badge, features, tabs)
VALUES (
  'ADMIN',
  '{
    "dashboardViewUsers": true,
    "dashboardEditBadges": false,
    "dashboardBanUnban": false,
    "dashboardGenerateKeys": false,
    "dashboardCollectRankings": false,
    "dashboardDarkOrbitAccounts": false,
    "dashboardViewSecurityLogs": false
  }'::jsonb,
  ARRAY['stats','progression','history','events','settings','superadmin']
)
ON CONFLICT (badge) DO UPDATE
  SET features = permissions_config.features || EXCLUDED.features;

-- RPC : retourne les features du badge ADMIN (SUPERADMIN uniquement)
CREATE OR REPLACE FUNCTION public.get_admin_permissions_config()
RETURNS JSONB AS $$
DECLARE
  v_features JSONB;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;
  SELECT features INTO v_features FROM public.permissions_config WHERE badge = 'ADMIN';
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN COALESCE(v_features, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC : met à jour les features du badge ADMIN (SUPERADMIN uniquement)
CREATE OR REPLACE FUNCTION public.admin_update_admin_permissions(p_features JSONB)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;
  INSERT INTO public.permissions_config (badge, features, tabs)
  VALUES ('ADMIN', p_features, ARRAY['stats','progression','history','events','settings','superadmin'])
  ON CONFLICT (badge) DO UPDATE SET features = EXCLUDED.features;
  RETURN (SELECT features FROM public.permissions_config WHERE badge = 'ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_admin_permissions_config() IS 'Retourne les features du badge ADMIN. SUPERADMIN uniquement.';
COMMENT ON FUNCTION public.admin_update_admin_permissions(JSONB) IS 'Met à jour les features du badge ADMIN. SUPERADMIN uniquement.';

-- Grant execute
GRANT EXECUTE ON FUNCTION public.get_admin_permissions_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_admin_permissions(JSONB) TO authenticated;


-- ========== fix-admin-permissions-merge.sql ==========
-- Fusion des permissions ADMIN au lieu de remplacement total.
-- Le frontend n'envoie que les 7 cases du panneau Permissions Admin ;
-- sans merge, les autres features (dashboardAdmin, etc.) étaient perdues.
CREATE OR REPLACE FUNCTION public.admin_update_admin_permissions(p_features JSONB)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Accès réservé au SUPERADMIN';
  END IF;
  INSERT INTO public.permissions_config (badge, features, tabs)
  VALUES (
    'ADMIN',
    p_features,
    ARRAY['stats','progression','history','events','settings','superadmin']
  )
  ON CONFLICT (badge) DO UPDATE SET
    features = permissions_config.features || EXCLUDED.features;
  RETURN (SELECT features FROM public.permissions_config WHERE badge = 'ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== fix-get-user-permissions-session-limits.sql ==========
-- ==========================================
-- Aligner get_user_permissions sur les limites serveur : FREE=1 session, PRO=10 sessions
-- À exécuter après fix-rpc-get-user-permissions-security.sql
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_profile RECORD;
  v_cfg RECORD;
  v_features JSONB;
  v_tabs TEXT[];
  v_limits JSONB;
BEGIN
  IF v_uid IS NOT NULL AND v_uid != auth.uid() AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès non autorisé aux permissions d''un autre utilisateur';
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT id, badge, role, status INTO v_profile
  FROM public.profiles WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT features, tabs INTO v_cfg
  FROM public.permissions_config
  WHERE badge = COALESCE(NULLIF(v_profile.badge, ''), 'FREE');

  IF NOT FOUND THEN
    SELECT features, tabs INTO v_cfg FROM public.permissions_config WHERE badge = 'FREE';
  END IF;

  v_features := COALESCE(v_cfg.features, '{}'::jsonb);
  v_tabs := COALESCE(v_cfg.tabs, ARRAY['stats','progression','history','settings']);

  -- FREE = 1 session, PRO = 10 sessions, ADMIN/SUPERADMIN = illimité (-1)
  v_limits := CASE
    WHEN v_profile.badge IN ('ADMIN','SUPERADMIN') THEN
      '{"maxSessions": -1, "exportFormats": ["json","csv"]}'::jsonb
    WHEN v_profile.badge = 'PRO' THEN
      '{"maxSessions": 10, "exportFormats": ["json","csv"]}'::jsonb
    ELSE
      '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb
  END;

  RETURN jsonb_build_object(
    'badge', COALESCE(NULLIF(v_profile.badge, ''), 'FREE'),
    'role', COALESCE(NULLIF(v_profile.role, ''), 'USER'),
    'status', COALESCE(NULLIF(v_profile.status, ''), 'active'),
    'features', v_features,
    'tabs', to_jsonb(v_tabs),
    'limits', v_limits,
    'source', 'supabase'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== fix-profiles-public-security-invoker.sql ==========
-- ==========================================
-- SÉCURITÉ — Vue profiles_public en SECURITY INVOKER
-- La vue était en SECURITY DEFINER (défaut), ce qui contourne le RLS.
-- Recréation avec security_invoker = true pour respecter les politiques RLS.
--
-- Étape optionnelle (identifier la définition actuelle) :
--   SELECT definition FROM pg_views WHERE schemaname = 'public' AND viewname = 'profiles_public';
--
-- À exécuter dans le SQL Editor Supabase.
--
-- Comportement après migration :
-- - Requête directe sur profiles_public par un client : s'exécute avec l'utilisateur,
--   le RLS sur profiles s'applique (chaque utilisateur ne voit que ce que les policies autorisent).
-- - La RPC get_ranking (SECURITY DEFINER) interroge la vue : la vue s'exécute avec le rôle
--   du propriétaire de la RPC, donc le classement continue d'afficher tous les profils publics.
--
-- Vérifications après exécution :
-- - Classement (onglet Classements) : doit afficher le top comme avant.
-- - Super Admin liste utilisateurs : utilise profiles, pas profiles_public → inchangé.
-- - Avertissement Supabase "SECURITY DEFINER" sur la vue doit disparaître.
-- ==========================================

-- 1. Supprimer la vue existante
DROP VIEW IF EXISTS public.profiles_public;

-- 2. Recréer avec la même définition et security_invoker = true
CREATE VIEW public.profiles_public
  WITH (security_invoker = true)
AS
SELECT
  id,
  username,
  game_pseudo,
  server,
  company,
  badge,
  created_at
FROM public.profiles;

-- 3. Commentaire et droits (inchangés)
COMMENT ON VIEW public.profiles_public IS 'Champs publics des profils. Utiliser pour classement, listing. Respecte le RLS (security_invoker). Table profiles pour son profil ou dashboard admin.';

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;


-- ========== fix-profiles-rls-sensitive-fields.sql ==========
-- ==========================================
-- RLS PROFILES — Restriction des champs sensibles (Option A : vue publique)
-- À exécuter APRÈS supabase-fix-profiles-rls.sql (get_my_profile_role/get_my_profile_badge doivent exister)
--
-- Objectif : les utilisateurs normaux ne voient plus tous les champs de tous les profils.
-- - Vue profiles_public : champs publics uniquement, lisible par tous (authenticated).
-- - Table profiles : SELECT complet uniquement pour soi-même (auth.uid() = id) ou pour admins/superadmins.
--
-- Champs PUBLIC (visibles via profiles_public pour tout le monde) :
--   id, username, game_pseudo, server, company, badge, created_at
--
-- Champs SENSIBLES (table profiles, réservés à soi-même ou aux admins) :
--   email, metadata, is_suspect, verification_status, verified_by, verified_at, last_login, status,
--   role, initial_honor, initial_xp, initial_rank, initial_rank_points, next_rank_points, updated_at
--
-- Changements frontend recommandés (à faire dans l'app, pas dans ce script) :
-- - api.js loadUserProfile() : garder from('profiles').select('*').eq('id', user.id) → profil complet pour soi (inchangé).
-- - super-admin.js loadUsers() : garder from('profiles').select(...) → admins voient tout (inchangé).
-- - auth-manager.js : garder from('profiles') pour .select().eq('id', user.id) et .update() sur son profil (inchangé).
-- - Tout appel qui listerait des profils "pour affichage public" (ex. classement, recherche joueur) : utiliser
--   from('profiles_public') au lieu de from('profiles') pour n'exposer que les colonnes publiques.
-- ==========================================

-- ---------------------------------------------------------------------------
-- 1. Vue publique (colonnes non sensibles uniquement)
-- Exécutée avec les droits du propriétaire → contourne RLS sur profiles
-- pour retourner toutes les lignes avec uniquement les champs publics.
-- ---------------------------------------------------------------------------
-- Vue exécutée avec les droits du propriétaire → lecture complète de profiles (contourne RLS)
DROP VIEW IF EXISTS profiles_public;
CREATE VIEW profiles_public AS
SELECT
  id,
  username,
  game_pseudo,
  server,
  company,
  badge,
  created_at
FROM public.profiles;

COMMENT ON VIEW profiles_public IS 'Champs publics des profils (RLS). Pour listing public utiliser cette vue ; pour son profil ou dashboard admin utiliser la table profiles.';

-- Lecture autorisée pour les rôles Supabase (authenticated = utilisateurs connectés)
GRANT SELECT ON profiles_public TO authenticated;
GRANT SELECT ON profiles_public TO anon;

-- ---------------------------------------------------------------------------
-- 2. RLS sur la table profiles : remplacer "tout le monde voit tout" par règles ciblées
-- ---------------------------------------------------------------------------

-- Supprimer les policies de lecture existantes
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;

-- SELECT : uniquement son propre profil (tous les champs)
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- SELECT : admins et superadmins voient tous les profils (tous les champs)
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  USING (
    get_my_profile_role() IN ('ADMIN', 'SUPERADMIN')
    OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN')
  );

-- Les policies UPDATE, INSERT existantes (profiles_update_own, profiles_update_admin, profiles_insert_own)
-- ne sont pas modifiées par ce script.


-- ========== fix-rpc-get-user-permissions-security.sql ==========
-- ==========================================
-- SÉCURISATION RPC get_user_permissions
-- Empêche un utilisateur de consulter les permissions d'un autre utilisateur
-- sauf si l'appelant est ADMIN ou SUPERADMIN.
--
-- Règle : l'appelant ne peut demander que ses propres permissions (p_user_id = auth.uid())
--         ou être admin/superadmin pour interroger n'importe quel p_user_id.
--
-- Frontend : api.js appelle déjà get_user_permissions(user.id) avec l'utilisateur courant.
-- Cette fonction ne doit être appelée qu'avec auth.uid() côté client pour un utilisateur normal.
-- ==========================================

-- Helper (créée si pas déjà présente, ex. par supabase-rpc-admin.sql)
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (role IN ('ADMIN', 'SUPERADMIN') OR badge IN ('ADMIN', 'SUPERADMIN'))
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- RPC get_user_permissions : même signature et logique, avec contrôle d'accès en tête
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_profile RECORD;
  v_cfg RECORD;
  v_features JSONB;
  v_tabs TEXT[];
  v_limits JSONB;
BEGIN
  -- Vérifier que l'utilisateur demande ses propres permissions OU est admin/superadmin
  IF v_uid IS NOT NULL AND v_uid != auth.uid() AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès non autorisé aux permissions d''un autre utilisateur';
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT id, badge, role, status INTO v_profile
  FROM public.profiles WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT features, tabs INTO v_cfg
  FROM public.permissions_config
  WHERE badge = COALESCE(NULLIF(v_profile.badge, ''), 'FREE');

  IF NOT FOUND THEN
    SELECT features, tabs INTO v_cfg FROM public.permissions_config WHERE badge = 'FREE';
  END IF;

  v_features := COALESCE(v_cfg.features, '{}'::jsonb);
  v_tabs := COALESCE(v_cfg.tabs, ARRAY['stats','progression','history','settings']);

  -- FREE = 1 session, PRO = 10 sessions, ADMIN/SUPERADMIN = illimité
  v_limits := CASE
    WHEN v_profile.badge IN ('ADMIN','SUPERADMIN') THEN
      '{"maxSessions": -1, "exportFormats": ["json","csv"]}'::jsonb
    WHEN v_profile.badge = 'PRO' THEN
      '{"maxSessions": 10, "exportFormats": ["json","csv"]}'::jsonb
    ELSE
      '{"maxSessions": 1, "exportFormats": ["json"]}'::jsonb
  END;

  RETURN jsonb_build_object(
    'badge', COALESCE(NULLIF(v_profile.badge, ''), 'FREE'),
    'role', COALESCE(NULLIF(v_profile.role, ''), 'USER'),
    'status', COALESCE(NULLIF(v_profile.status, ''), 'active'),
    'features', v_features,
    'tabs', to_jsonb(v_tabs),
    'limits', v_limits,
    'source', 'supabase'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== fix-security-search-path.sql ==========
-- Action 1 : SET search_path = public sur les fonctions
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.safe_bigint(TEXT) SET search_path = public;
ALTER FUNCTION public.admin_unban_user(UUID) SET search_path = public;
ALTER FUNCTION public.admin_change_badge(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.admin_change_role(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.admin_add_note(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.is_superadmin() SET search_path = public;
ALTER FUNCTION public.admin_update_profile(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, TEXT, INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION public.get_user_admin_logs(UUID) SET search_path = public;
ALTER FUNCTION public.get_admin_logs(INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION public.admin_send_message(UUID, TEXT, TEXT) SET search_path = public;
-- Action 2 : RLS player_profiles plus strict
DROP POLICY IF EXISTS "Public read access" ON public.player_profiles;
DROP POLICY IF EXISTS "Service insert/update" ON public.player_profiles;

DROP POLICY IF EXISTS "Authenticated read" ON public.player_profiles;
CREATE POLICY "Authenticated read" ON public.player_profiles
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

DROP POLICY IF EXISTS "Service write" ON public.player_profiles;
CREATE POLICY "Service write" ON public.player_profiles
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ========== fix-session-limits.sql ==========
-- ==========================================
-- Correction des limites de sessions
-- Réécrit insert_user_session_secure et upsert_user_session_secure
-- avec les vraies limites métier (baseline exclue du total).
--
-- Règles :
-- - FREE : max 1 session (hors baseline)
-- - PRO : max 10 sessions (hors baseline)
-- - ADMIN / SUPERADMIN : illimité
-- - Badge NULL ou inconnu → limites FREE
--
-- À exécuter dans le SQL Editor Supabase.
-- ==========================================

CREATE OR REPLACE FUNCTION public.insert_user_session_secure(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT COALESCE(NULLIF(trim(badge), ''), 'FREE') INTO v_badge
  FROM public.profiles WHERE id = v_uid;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');

  v_limit := CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 10
    ELSE 1
  END;

  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count
    FROM public.user_sessions
    WHERE user_id = v_uid AND (is_baseline = false OR is_baseline IS NULL);
    IF v_count >= v_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', CASE
          WHEN v_badge = 'FREE' THEN 'Limite atteinte : les utilisateurs FREE ne peuvent avoir qu''1 session. Passez en PRO pour plus de sessions.'
          ELSE 'Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN.'
        END,
        'code', 'LIMIT_REACHED'
      );
    END IF;
  END IF;

  INSERT INTO public.user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_user_session_secure(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
  v_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE public.user_sessions SET
      honor = COALESCE((p_row->>'honor')::BIGINT, 0),
      xp = COALESCE((p_row->>'xp')::BIGINT, 0),
      rank_points = COALESCE((p_row->>'rank_points')::BIGINT, 0),
      next_rank_points = COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
      current_rank = NULLIF(trim(p_row->>'current_rank'), ''),
      note = NULLIF(trim(p_row->>'note'), ''),
      session_date = NULLIF(trim(p_row->>'session_date'), ''),
      session_timestamp = COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
      is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id');
    RETURN jsonb_build_object('success', true);
  END IF;

  SELECT COALESCE(NULLIF(trim(badge), ''), 'FREE') INTO v_badge
  FROM public.profiles WHERE id = v_uid;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');

  v_limit := CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 10
    ELSE 1
  END;

  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count
    FROM public.user_sessions
    WHERE user_id = v_uid AND (is_baseline = false OR is_baseline IS NULL);
    IF v_count >= v_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', CASE
          WHEN v_badge = 'FREE' THEN 'Limite atteinte : les utilisateurs FREE ne peuvent avoir qu''1 session. Passez en PRO pour plus de sessions.'
          ELSE 'Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN.'
        END,
        'code', 'LIMIT_REACHED'
      );
    END IF;
  END IF;

  INSERT INTO public.user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  )
  ON CONFLICT (user_id, local_id) DO UPDATE SET
    honor = EXCLUDED.honor,
    xp = EXCLUDED.xp,
    rank_points = EXCLUDED.rank_points,
    next_rank_points = EXCLUDED.next_rank_points,
    current_rank = EXCLUDED.current_rank,
    note = EXCLUDED.note,
    session_date = EXCLUDED.session_date,
    session_timestamp = EXCLUDED.session_timestamp,
    is_baseline = EXCLUDED.is_baseline,
    updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$function$;

COMMENT ON FUNCTION public.insert_user_session_secure(jsonb) IS 'Insertion session avec limite : FREE=1, PRO=10 (hors baseline), ADMIN/SUPERADMIN=illimité. Code LIMIT_REACHED si quota dépassé.';
COMMENT ON FUNCTION public.upsert_user_session_secure(jsonb) IS 'Upsert session avec limite ; mise à jour d''une session existante ne compte pas dans le quota. Baseline exclue du décompte.';


-- ========== fix-shared-events-id-uuid.sql ==========
-- Corrige shared_events si id est en TEXT (erreur "invalid input syntax for type uuid: default").
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shared_events' AND data_type = 'text' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.shared_events ALTER COLUMN id TYPE UUID USING '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
END $$;
-- uploaded_by : accepter NULL pour les appels sans user (ex. renderer).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shared_events' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE public.shared_events ALTER COLUMN uploaded_by DROP NOT NULL;
  END IF;
END $$;

-- RPC à jour : UUID fixe + uploaded_by pour respecter NOT NULL si présent.
CREATE OR REPLACE FUNCTION public.upsert_shared_events(p_events JSONB DEFAULT '[]'::jsonb, p_uploaded_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EVENTS', 'count', 0);
  END IF;
  v_count := jsonb_array_length(p_events);
  INSERT INTO public.shared_events (id, events_json, uploaded_at, uploaded_by)
  VALUES (v_id, p_events, now(), p_uploaded_by)
  ON CONFLICT (id) DO UPDATE SET
    events_json = EXCLUDED.events_json,
    uploaded_at = EXCLUDED.uploaded_at,
    uploaded_by = COALESCE(EXCLUDED.uploaded_by, public.shared_events.uploaded_by);
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO anon;


-- ========== fix-upsert-shared-events-no-delete.sql ==========
-- Corrige upsert_shared_events : supprimer le DELETE (bloqué par Supabase "require WHERE clause")
-- Utilise INSERT ON CONFLICT à la place
CREATE OR REPLACE FUNCTION public.upsert_shared_events(p_events JSONB DEFAULT '[]'::jsonb, p_uploaded_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EVENTS', 'count', 0);
  END IF;
  v_count := jsonb_array_length(p_events);
  INSERT INTO public.shared_events (id, events_json, uploaded_at, uploaded_by)
  VALUES (v_id, p_events, now(), p_uploaded_by)
  ON CONFLICT (id) DO UPDATE SET
    events_json = EXCLUDED.events_json,
    uploaded_at = EXCLUDED.uploaded_at,
    uploaded_by = COALESCE(EXCLUDED.uploaded_by, public.shared_events.uploaded_by);
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO service_role;


-- ========== get-ranking-with-profiles-rpc.sql ==========
-- RPC : classement enrichi avec player_profiles (DOStats)
CREATE OR REPLACE FUNCTION public.get_ranking_with_profiles(p_server TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players JSONB;
BEGIN
  SELECT
    jsonb_agg(
      p.player || jsonb_build_object(
        'estimated_rp', pp.estimated_rp,
        'total_hours', pp.total_hours,
        'registered', pp.registered,
        'npc_kills', pp.npc_kills,
        'ship_kills', pp.ship_kills,
        'galaxy_gates', pp.galaxy_gates,
        'galaxy_gates_json', pp.galaxy_gates_json,
        'company_from_dostats', pp.company,
        'dostats_updated_at', pp.dostats_updated_at
      )
    )
  INTO v_players
  FROM (
    SELECT jsonb_array_elements(players_json) AS player
    FROM shared_rankings
    WHERE server = p_server
  ) p
  LEFT JOIN player_profiles pp
    ON pp.user_id = (p.player->>'userId')
    AND pp.server = p_server;

  RETURN jsonb_build_object(
    'server', p_server,
    'players', COALESCE(v_players, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranking_with_profiles(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_with_profiles(TEXT) TO anon;


-- ========== get-shared-events-rpc.sql ==========
-- RPC lecture shared_events (contourne RLS, toujours fonctionnel)
CREATE OR REPLACE FUNCTION public.get_shared_events()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('events_json', events_json, 'uploaded_at', uploaded_at)
     FROM public.shared_events ORDER BY uploaded_at DESC LIMIT 1),
    '{"events_json":[],"uploaded_at":null}'::jsonb
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_shared_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_events() TO anon;


-- ========== lock-profiles-pseudo-server-company.sql ==========
-- Verrouillage pseudo, serveur, firme : seul admin/superadmin peut les modifier
-- (initial_* restent modifiables par le user pour "Récupérer mes stats")

CREATE OR REPLACE FUNCTION public.check_profiles_locked_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge TEXT;
BEGIN
  v_badge := COALESCE(get_my_profile_badge(), 'FREE');
  IF v_badge IN ('ADMIN', 'SUPERADMIN') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = NEW.id THEN
    IF (OLD.game_pseudo IS NOT NULL AND (NEW.game_pseudo IS DISTINCT FROM OLD.game_pseudo)) THEN
      RAISE EXCEPTION 'Modification du pseudo non autorisée. Contactez un administrateur.';
    END IF;
    IF (OLD.server IS NOT NULL AND (NEW.server IS DISTINCT FROM OLD.server)) THEN
      RAISE EXCEPTION 'Modification du serveur non autorisée. Contactez un administrateur.';
    END IF;
    IF (OLD.company IS NOT NULL AND (NEW.company IS DISTINCT FROM OLD.company)) THEN
      RAISE EXCEPTION 'Modification de la firme non autorisée. Contactez un administrateur.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_profiles_locked_columns ON public.profiles;
CREATE TRIGGER tr_profiles_locked_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.check_profiles_locked_columns();

COMMENT ON FUNCTION public.check_profiles_locked_columns() IS 'Bloque la modification de game_pseudo, server, company par un utilisateur non-admin. Admin/Superadmin peuvent tout modifier.';


-- ========== 20260225120010_ranking-snapshots-tables.sql ==========
-- Migration directe vers snapshots (remplace shared_rankings)
CREATE TABLE IF NOT EXISTS public.shared_rankings_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  players_json JSONB NOT NULL DEFAULT '[]',
  uploaded_by UUID
);
CREATE INDEX IF NOT EXISTS idx_rankings_snapshots_server_scraped ON public.shared_rankings_snapshots(server_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_snapshots_scraped ON public.shared_rankings_snapshots(scraped_at);
ALTER TABLE public.shared_rankings_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rankings_snapshots_select" ON public.shared_rankings_snapshots;
CREATE POLICY "rankings_snapshots_select" ON public.shared_rankings_snapshots FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.shared_rankings_dostats_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  players_json JSONB NOT NULL DEFAULT '[]',
  uploaded_by UUID
);
CREATE INDEX IF NOT EXISTS idx_dostats_snapshots_server_scraped ON public.shared_rankings_dostats_snapshots(server_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_dostats_snapshots_scraped ON public.shared_rankings_dostats_snapshots(scraped_at);
ALTER TABLE public.shared_rankings_dostats_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dostats_snapshots_select" ON public.shared_rankings_dostats_snapshots;
CREATE POLICY "dostats_snapshots_select" ON public.shared_rankings_dostats_snapshots FOR SELECT USING (true);


-- ========== 20260225120011_ranking-snapshots-rpcs.sql ==========
CREATE OR REPLACE FUNCTION public.insert_ranking_snapshot(p_server_id TEXT, p_players JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF p_server_id IS NULL OR trim(p_server_id) = '' THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_SERVER', 'id', null); END IF;
  IF jsonb_typeof(p_players) != 'array' THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_PLAYERS', 'id', null); END IF;
  INSERT INTO public.shared_rankings_snapshots (server_id, players_json, uploaded_by) VALUES (p_server_id, COALESCE(p_players, '[]'::jsonb), auth.uid()) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'code', 'DB_ERROR', 'error', SQLERRM, 'id', null);
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_ranking_snapshot(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_ranking_snapshot(TEXT, JSONB) TO anon;

CREATE OR REPLACE FUNCTION public.insert_dostats_snapshot(p_server_id TEXT, p_players JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF p_server_id IS NULL OR trim(p_server_id) = '' THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_SERVER', 'id', null); END IF;
  IF jsonb_typeof(p_players) != 'array' THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_PLAYERS', 'id', null); END IF;
  INSERT INTO public.shared_rankings_dostats_snapshots (server_id, players_json, uploaded_by) VALUES (p_server_id, COALESCE(p_players, '[]'::jsonb), auth.uid()) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'code', 'DB_ERROR', 'error', SQLERRM, 'id', null);
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_dostats_snapshot(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_dostats_snapshot(TEXT, JSONB) TO anon;


-- ========== 20260225120012_ranking-snapshots-get-rpcs.sql ==========
CREATE OR REPLACE FUNCTION public.get_ranking_snapshot(p_server_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_players JSONB; v_scraped_at TIMESTAMPTZ;
BEGIN
  SELECT s.players_json, s.scraped_at INTO v_players, v_scraped_at FROM shared_rankings_snapshots s WHERE s.server_id = p_server_id ORDER BY s.scraped_at DESC LIMIT 1;
  IF v_players IS NULL THEN RETURN jsonb_build_object('server', p_server_id, 'players', '[]'::jsonb, 'scraped_at', null); END IF;
  SELECT jsonb_agg(p.player || jsonb_build_object('estimated_rp', pp.estimated_rp,'total_hours', pp.total_hours,'registered', pp.registered,'npc_kills', pp.npc_kills,'ship_kills', pp.ship_kills,'galaxy_gates', pp.galaxy_gates,'galaxy_gates_json', pp.galaxy_gates_json,'company_from_dostats', pp.company,'dostats_updated_at', pp.dostats_updated_at))
  INTO v_players FROM (SELECT jsonb_array_elements(v_players) AS player) p LEFT JOIN player_profiles pp ON pp.user_id = (p.player->>'userId') AND pp.server = p_server_id;
  RETURN jsonb_build_object('server', p_server_id, 'players', COALESCE(v_players, '[]'::jsonb), 'scraped_at', v_scraped_at);
END; $$;

CREATE OR REPLACE FUNCTION public.get_ranking_snapshots_for_comparison(p_server_id TEXT, p_since TIMESTAMPTZ)
RETURNS TABLE(id UUID, scraped_at TIMESTAMPTZ, players_json JSONB) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT s.id, s.scraped_at, s.players_json FROM shared_rankings_snapshots s WHERE s.server_id = p_server_id AND s.scraped_at >= p_since ORDER BY s.scraped_at DESC; END; $$;

CREATE OR REPLACE FUNCTION public.get_ranking_latest_per_server(p_limit INT DEFAULT 24)
RETURNS TABLE(server_id TEXT, scraped_at TIMESTAMPTZ, players_json JSONB) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT s.server_id, s.scraped_at, s.players_json FROM (SELECT DISTINCT ON (server_id) server_id, scraped_at, players_json FROM shared_rankings_snapshots ORDER BY server_id, scraped_at DESC) s ORDER BY s.scraped_at DESC LIMIT p_limit; END; $$;

GRANT EXECUTE ON FUNCTION public.get_ranking_snapshot(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_snapshot(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ranking_snapshots_for_comparison(TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_snapshots_for_comparison(TEXT, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ranking_latest_per_server(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_latest_per_server(INT) TO anon;


-- ========== 20260225120013_migrate-rankings-to-snapshots.sql ==========
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shared_rankings') THEN
    INSERT INTO public.shared_rankings_snapshots (server_id, scraped_at, players_json, uploaded_by)
    SELECT server, COALESCE(uploaded_at, now()), players_json, uploaded_by FROM public.shared_rankings;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_ranking_with_profiles(p_server TEXT, p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_players JSONB; v_scraped_at TIMESTAMPTZ;
BEGIN
  SELECT s.players_json, s.scraped_at INTO v_players, v_scraped_at FROM shared_rankings_snapshots s WHERE s.server_id = p_server AND (p_since IS NULL OR s.scraped_at >= p_since) ORDER BY s.scraped_at DESC LIMIT 1;
  IF v_players IS NULL THEN RETURN jsonb_build_object('server', p_server, 'players', '[]'::jsonb, 'scraped_at', null); END IF;
  SELECT jsonb_agg(p.player || jsonb_build_object('estimated_rp', pp.estimated_rp,'total_hours', pp.total_hours,'registered', pp.registered,'npc_kills', pp.npc_kills,'ship_kills', pp.ship_kills,'galaxy_gates', pp.galaxy_gates,'galaxy_gates_json', pp.galaxy_gates_json,'company_from_dostats', pp.company,'dostats_updated_at', pp.dostats_updated_at))
  INTO v_players FROM (SELECT jsonb_array_elements(v_players) AS player) p LEFT JOIN player_profiles pp ON pp.user_id = (p.player->>'userId') AND pp.server = p_server;
  RETURN jsonb_build_object('server', p_server, 'players', COALESCE(v_players, '[]'::jsonb), 'scraped_at', v_scraped_at);
END; $$;

DROP TABLE IF EXISTS public.shared_rankings CASCADE;


-- ========== query-events-du-jour.sql ==========
-- ============================================================
-- Voir les événements du jour (source sidebar booster)
-- ============================================================
-- La sidebar "Événements du jour" lit le STOCKAGE LOCAL (UnifiedStorage),
-- pas Supabase. Donc si tu vois le booster 50% dans l'app, les données
-- sont en local. Pour les voir ici :
--   - user_settings : après une "Synchronisation serveur" (sync push)
--   - shared_events : rempli par le scraper Electron (Collect Événement)
-- ============================================================

-- 1) shared_events : dernier enregistrement (rempli par Electron scraper)
SELECT events_json, uploaded_at
FROM shared_events
ORDER BY uploaded_at DESC
LIMIT 1;

-- 2) shared_events : une ligne par événement
SELECT
  (e.elem->>'name') AS name,
  (e.elem->>'description') AS description,
  (e.elem->>'timer') AS timer,
  s.uploaded_at
FROM shared_events s,
     jsonb_array_elements(s.events_json) AS e(elem)
ORDER BY s.uploaded_at DESC;

-- 3) user_settings : événements par user (current_events_json)
SELECT
  us.user_id,
  us.updated_at,
  elem->>'name' AS event_name,
  elem->>'description' AS event_description,
  elem->>'timer' AS timer
FROM user_settings us,
     jsonb_array_elements(COALESCE(us.current_events_json, '[]'::jsonb)) AS elem
WHERE COALESCE(us.current_events_json, '[]'::jsonb) != '[]'::jsonb
ORDER BY us.updated_at DESC, us.user_id;


-- ========== remove-booster-learning-column.sql ==========
-- Supprime la colonne booster_learning_json de user_settings (système booster learning obsolète)
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS booster_learning_json;


-- ========== remove-session-limits-unlimited.sql ==========
-- ==========================================
-- Supprimer les limites de sessions : illimité pour FREE, PRO, ADMIN, SUPERADMIN.
-- Conserve le code et la structure existants (clés, RPC) au cas où.
-- ==========================================

-- 1) get_user_permissions : renvoyer maxSessions -1 pour tous les badges
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_profile RECORD;
  v_cfg RECORD;
  v_features JSONB;
  v_tabs TEXT[];
  v_limits JSONB;
BEGIN
  IF v_uid IS NOT NULL AND v_uid != auth.uid() AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Accès non autorisé aux permissions d''un autre utilisateur';
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": -1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT id, badge, role, status INTO v_profile
  FROM public.profiles WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'badge', 'FREE', 'role', 'USER', 'status', 'active',
      'features', '{}'::jsonb, 'tabs', to_jsonb(ARRAY['stats','progression','history','settings']),
      'limits', '{"maxSessions": -1, "exportFormats": ["json"]}'::jsonb,
      'source', 'default'
    );
  END IF;

  SELECT features, tabs INTO v_cfg
  FROM public.permissions_config
  WHERE badge = COALESCE(NULLIF(v_profile.badge, ''), 'FREE');

  IF NOT FOUND THEN
    SELECT features, tabs INTO v_cfg FROM public.permissions_config WHERE badge = 'FREE';
  END IF;

  v_features := COALESCE(v_cfg.features, '{}'::jsonb);
  v_tabs := COALESCE(v_cfg.tabs, ARRAY['stats','progression','history','settings']);

  -- Illimité pour tous les badges
  v_limits := CASE
    WHEN v_profile.badge = 'FREE' THEN '{"maxSessions": -1, "exportFormats": ["json"]}'::jsonb
    ELSE '{"maxSessions": -1, "exportFormats": ["json","csv"]}'::jsonb
  END;

  RETURN jsonb_build_object(
    'badge', COALESCE(NULLIF(v_profile.badge, ''), 'FREE'),
    'role', COALESCE(NULLIF(v_profile.role, ''), 'USER'),
    'status', COALESCE(NULLIF(v_profile.status, ''), 'active'),
    'features', v_features,
    'tabs', to_jsonb(v_tabs),
    'limits', v_limits,
    'source', 'supabase'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2) insert_user_session_secure : ne plus bloquer par limite (v_limit = -1 pour tous)
CREATE OR REPLACE FUNCTION insert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  INSERT INTO user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3) upsert_user_session_secure : ne plus bloquer par limite (v_limit = -1 pour tous)
CREATE OR REPLACE FUNCTION upsert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE user_sessions SET
      honor = COALESCE((p_row->>'honor')::BIGINT, 0),
      xp = COALESCE((p_row->>'xp')::BIGINT, 0),
      rank_points = COALESCE((p_row->>'rank_points')::BIGINT, 0),
      next_rank_points = COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
      current_rank = NULLIF(trim(p_row->>'current_rank'), ''),
      note = NULLIF(trim(p_row->>'note'), ''),
      session_date = NULLIF(trim(p_row->>'session_date'), ''),
      session_timestamp = COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
      is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id');
    RETURN jsonb_build_object('success', true);
  END IF;

  INSERT INTO user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== security-step1-profiles-rls-strict.sql ==========
-- ==========================================
-- SÉCURITÉ ÉTAPE 1 — Policies strictes sur la table profiles
-- Date : février 2026
-- Objectif : Supprimer toute policy permissive (USING true) et limiter
--            la lecture aux utilisateurs eux-mêmes et aux administrateurs.
--
-- PRÉREQUIS : Table profiles existante, avec colonnes id, role, badge.
-- À exécuter dans le SQL Editor Supabase.
-- ==========================================

-- 1. Fonctions SECURITY DEFINER (évitent la récursion RLS)
CREATE OR REPLACE FUNCTION public.get_my_profile_role()
RETURNS TEXT AS $$
  SELECT COALESCE(role, 'USER') FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

CREATE OR REPLACE FUNCTION public.get_my_profile_badge()
RETURNS TEXT AS $$
  SELECT COALESCE(badge, 'FREE') FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- 2. Supprimer la policy permissive (si elle existe)
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;

-- 3. Supprimer les anciennes policies de lecture (au cas où)
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read for users" ON profiles;
DROP POLICY IF EXISTS "Enable read for admins to all profiles" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

-- 4. Créer les policies STRICTES de lecture
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  USING (
    get_my_profile_role() IN ('ADMIN', 'SUPERADMIN')
    OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN')
  );

-- 5. S'assurer que les policies UPDATE et INSERT existent
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update_own') THEN
    CREATE POLICY "profiles_update_own"
      ON profiles FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update_admin') THEN
    CREATE POLICY "profiles_update_admin"
      ON profiles FOR UPDATE
      USING (get_my_profile_role() IN ('ADMIN', 'SUPERADMIN') OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN'))
      WITH CHECK (get_my_profile_role() IN ('ADMIN', 'SUPERADMIN') OR get_my_profile_badge() IN ('ADMIN', 'SUPERADMIN'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_insert_own') THEN
    CREATE POLICY "profiles_insert_own"
      ON profiles FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 6. Vue publique (données non sensibles pour classement, etc.)
DROP VIEW IF EXISTS profiles_public;
CREATE VIEW profiles_public AS
SELECT
  id,
  username,
  game_pseudo,
  server,
  company,
  badge,
  created_at
FROM public.profiles;

COMMENT ON VIEW profiles_public IS 'Champs publics des profils. Utiliser pour classement, listing. Table profiles pour son profil ou dashboard admin.';

GRANT SELECT ON profiles_public TO authenticated;
GRANT SELECT ON profiles_public TO anon;

-- 7. Activer RLS (au cas où)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;


-- ========== security-step2-permissions-config-rls.sql ==========
-- ==========================================
-- SÉCURITÉ ÉTAPE 2 — RLS sur la table permissions_config
-- Date : février 2026
-- Objectif : Bloquer tout accès direct à la table. L'accès se fait
--            uniquement via la RPC get_user_permissions (SECURITY DEFINER).
--
-- PRÉREQUIS : Table permissions_config et RPC get_user_permissions existantes.
-- À exécuter dans le SQL Editor Supabase.
-- ==========================================

-- 1. Révoquer tout accès direct aux rôles clients Supabase
REVOKE ALL ON permissions_config FROM anon;
REVOKE ALL ON permissions_config FROM authenticated;

-- 2. Activer RLS (aucune policy = accès refusé par défaut)
ALTER TABLE permissions_config ENABLE ROW LEVEL SECURITY;

-- 3. Ne pas créer de policy permissive
-- La table n'est lue que par les RPC SECURITY DEFINER (get_user_permissions,
-- et éventuellement d'autres fonctions serveur qui s'exécutent avec les droits
-- du propriétaire et contournent RLS).
-- Les migrations (UPDATE permissions_config) s'exécutent en tant que postgres
-- et contournent également RLS.

COMMENT ON TABLE permissions_config IS 'Configuration des permissions par badge. Accès UNIQUEMENT via RPC get_user_permissions. RLS activé, pas de policy = accès direct refusé.';


-- ========== security-step3-rate-limit-rpcs.sql ==========
-- ==========================================
-- SÉCURITÉ ÉTAPE 3 (suite) — Injection du rate limit dans les RPC
-- À exécuter APRÈS security-step3-rate-limiting.sql
-- Prérequis : Les RPC cibles doivent exister.
--
-- Limites par défaut : insert_session 30/min, upsert_session 60/min,
-- get_user_permissions 120/min, admin_send_message 20/min,
-- admin_send_global_message 5/min.
-- ==========================================

-- insert_user_session_secure : 30 appels/min
CREATE OR REPLACE FUNCTION insert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  PERFORM check_rate_limit('insert_user_session_secure', 30);
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;
  INSERT INTO user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- upsert_user_session_secure : 60 appels/min (sync push plusieurs sessions)
CREATE OR REPLACE FUNCTION upsert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  PERFORM check_rate_limit('upsert_user_session_secure', 60);
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
  ) INTO v_exists;
  IF v_exists THEN
    UPDATE user_sessions SET
      honor = COALESCE((p_row->>'honor')::BIGINT, 0),
      xp = COALESCE((p_row->>'xp')::BIGINT, 0),
      rank_points = COALESCE((p_row->>'rank_points')::BIGINT, 0),
      next_rank_points = COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
      current_rank = NULLIF(trim(p_row->>'current_rank'), ''),
      note = NULLIF(trim(p_row->>'note'), ''),
      session_date = NULLIF(trim(p_row->>'session_date'), ''),
      session_timestamp = COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
      is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id');
    RETURN jsonb_build_object('success', true);
  END IF;
  INSERT INTO user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== security-step3-rate-limiting.sql ==========
-- ==========================================
-- SÉCURITÉ ÉTAPE 3 — Rate limiting sur les RPC sensibles
-- Date : février 2026
-- Objectif : Limiter le nombre d'appels par utilisateur et par minute
--            pour éviter le spam et les abus.
--
-- PRÉREQUIS : Aucun.
-- À exécuter dans le SQL Editor Supabase.
-- ==========================================

-- Table de suivi des appels (fenêtre glissante 1 minute)
CREATE TABLE IF NOT EXISTS rate_limit_tracker (
  user_id UUID NOT NULL,
  rpc_name TEXT NOT NULL,
  bucket_ts TIMESTAMPTZ NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, rpc_name, bucket_ts)
);

-- Index pour le nettoyage
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracker_bucket
  ON rate_limit_tracker(bucket_ts);

-- RLS : seul le propriétaire (postgres) peut lire/écrire
ALTER TABLE rate_limit_tracker ENABLE ROW LEVEL SECURITY;

-- Aucune policy : seules les RPC SECURITY DEFINER peuvent accéder

-- Fonction : vérifier et enregistrer l'appel. Si limite dépassée, RAISE.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_rpc_name TEXT,
  p_max_per_minute INTEGER DEFAULT 60
)
RETURNS VOID AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_bucket TIMESTAMPTZ := date_trunc('minute', now());
  v_count INTEGER;
BEGIN
  -- Utilisateur anonyme : UUID nul, limite plus stricte (ex: 30/min)
  IF v_uid IS NULL THEN
    v_uid := '00000000-0000-0000-0000-000000000000'::UUID;
    p_max_per_minute := LEAST(p_max_per_minute, 30);
  END IF;

  -- Incrémenter et récupérer le compteur (atomique)
  INSERT INTO rate_limit_tracker (user_id, rpc_name, bucket_ts, call_count)
  VALUES (v_uid, p_rpc_name, v_bucket, 1)
  ON CONFLICT (user_id, rpc_name, bucket_ts)
  DO UPDATE SET call_count = rate_limit_tracker.call_count + 1
  RETURNING call_count INTO v_count;

  IF v_count > p_max_per_minute THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: trop d''appels à %. Réessayez dans une minute.', p_rpc_name
      USING ERRCODE = 'resource_exhausted';
  END IF;

  -- Nettoyage des anciennes entrées (fenêtre 5 min)
  DELETE FROM rate_limit_tracker
  WHERE bucket_ts < now() - interval '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION check_rate_limit(TEXT, INTEGER) IS 'Vérifie le quota d''appels par user et par minute. À appeler au début des RPC sensibles.';


-- ========== security-step4-validate-numeric.sql ==========
-- ==========================================
-- SÉCURITÉ ÉTAPE 4 — Validation stricte des valeurs numériques
-- Date : février 2026
-- Objectif : Rejeter les valeurs aberrantes (négatives, hors plage)
--            dans les RPC critiques (sessions, inscription).
--
-- Plages DarkOrbit plausibles :
--   honor, xp, rank_points, next_rank_points : 0 à BIGINT max
--   session_timestamp : 0 à année 2100 (ms)
-- À exécuter APRÈS security-step3-rate-limit-rpcs.sql
-- ==========================================

-- Helper : extraction BIGINT sécurisée (évite exception sur chaîne invalide)
CREATE OR REPLACE FUNCTION safe_bigint(p_val TEXT)
RETURNS BIGINT AS $$
BEGIN
  RETURN COALESCE(NULLIF(trim(COALESCE(p_val, '')), '')::BIGINT, 0);
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Constantes de validation (BIGINT max = 2^63 - 1)
-- session_timestamp : max année 2100 ≈ 4102444800000 ms
CREATE OR REPLACE FUNCTION validate_session_row(p_row JSONB)
RETURNS VOID AS $$
DECLARE
  v_honor BIGINT;
  v_xp BIGINT;
  v_rank_points BIGINT;
  v_next_rank_points BIGINT;
  v_ts BIGINT;
  v_max_bigint BIGINT := 9223372036854775807;
  v_max_ts BIGINT := 4102444800000;  -- ~année 2100
BEGIN
  -- Extraction sécurisée via safe_bigint
  v_honor := safe_bigint(p_row->>'honor');
  v_xp := safe_bigint(p_row->>'xp');
  v_rank_points := safe_bigint(p_row->>'rank_points');
  v_next_rank_points := safe_bigint(p_row->>'next_rank_points');
  v_ts := safe_bigint(p_row->>'session_timestamp');
  IF v_ts = 0 THEN
    v_ts := (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT;
  END IF;

  -- Vérifications
  IF v_honor < 0 OR v_honor > v_max_bigint THEN
    RAISE EXCEPTION 'Valeur honor invalide : %', v_honor USING ERRCODE = 'check_violation';
  END IF;
  IF v_xp < 0 OR v_xp > v_max_bigint THEN
    RAISE EXCEPTION 'Valeur xp invalide : %', v_xp USING ERRCODE = 'check_violation';
  END IF;
  IF v_rank_points < 0 OR v_rank_points > v_max_bigint THEN
    RAISE EXCEPTION 'Valeur rank_points invalide : %', v_rank_points USING ERRCODE = 'check_violation';
  END IF;
  IF v_next_rank_points < 0 OR v_next_rank_points > v_max_bigint THEN
    RAISE EXCEPTION 'Valeur next_rank_points invalide : %', v_next_rank_points USING ERRCODE = 'check_violation';
  END IF;
  IF v_ts < 0 OR v_ts > v_max_ts THEN
    RAISE EXCEPTION 'Valeur session_timestamp invalide : %', v_ts USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== security-step4-validate-rpcs.sql ==========
-- ==========================================
-- SÉCURITÉ ÉTAPE 4 (suite) — Injection de la validation dans les RPC
-- À exécuter APRÈS security-step4-validate-numeric.sql
-- ==========================================

-- insert_user_session_secure
CREATE OR REPLACE FUNCTION insert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  PERFORM check_rate_limit('insert_user_session_secure', 30);
  PERFORM validate_session_row(p_row);
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;
  INSERT INTO user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    GREATEST(0, LEAST(safe_bigint(p_row->>'honor'), 9223372036854775807)),
    GREATEST(0, LEAST(safe_bigint(p_row->>'xp'), 9223372036854775807)),
    GREATEST(0, LEAST(safe_bigint(p_row->>'rank_points'), 9223372036854775807)),
    GREATEST(0, LEAST(safe_bigint(p_row->>'next_rank_points'), 9223372036854775807)),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    LEAST(GREATEST(CASE WHEN safe_bigint(p_row->>'session_timestamp') = 0 THEN (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT ELSE safe_bigint(p_row->>'session_timestamp') END, 0), 4102444800000),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- upsert_user_session_secure
CREATE OR REPLACE FUNCTION upsert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
  v_honor BIGINT;
  v_xp BIGINT;
  v_rp BIGINT;
  v_nrp BIGINT;
  v_ts BIGINT;
BEGIN
  PERFORM check_rate_limit('upsert_user_session_secure', 60);
  PERFORM validate_session_row(p_row);
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  v_honor := GREATEST(0, LEAST(safe_bigint(p_row->>'honor'), 9223372036854775807));
  v_xp := GREATEST(0, LEAST(safe_bigint(p_row->>'xp'), 9223372036854775807));
  v_rp := GREATEST(0, LEAST(safe_bigint(p_row->>'rank_points'), 9223372036854775807));
  v_nrp := GREATEST(0, LEAST(safe_bigint(p_row->>'next_rank_points'), 9223372036854775807));
  v_ts := LEAST(GREATEST(CASE WHEN safe_bigint(p_row->>'session_timestamp') = 0 THEN (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT ELSE safe_bigint(p_row->>'session_timestamp') END, 0), 4102444800000);

  SELECT EXISTS (
    SELECT 1 FROM user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE user_sessions SET
      honor = v_honor,
      xp = v_xp,
      rank_points = v_rp,
      next_rank_points = v_nrp,
      current_rank = NULLIF(trim(p_row->>'current_rank'), ''),
      note = NULLIF(trim(p_row->>'note'), ''),
      session_date = NULLIF(trim(p_row->>'session_date'), ''),
      session_timestamp = v_ts,
      is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id');
    RETURN jsonb_build_object('success', true);
  END IF;

  INSERT INTO user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    v_honor, v_xp, v_rp, v_nrp,
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    v_ts,
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== security-step5-logging-and-export.sql ==========
-- ==========================================
-- SÉCURITÉ ÉTAPE 5 (suite) — Logging des refus + RPC export
-- À exécuter APRÈS security-step5-security-events.sql
-- Modifie check_rate_limit et validate_session_row pour enregistrer les refus.
-- ==========================================

-- check_rate_limit : log avant RAISE
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_rpc_name TEXT,
  p_max_per_minute INTEGER DEFAULT 60
)
RETURNS VOID AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_bucket TIMESTAMPTZ := date_trunc('minute', now());
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    v_uid := '00000000-0000-0000-0000-000000000000'::UUID;
    p_max_per_minute := LEAST(p_max_per_minute, 30);
  END IF;

  INSERT INTO rate_limit_tracker (user_id, rpc_name, bucket_ts, call_count)
  VALUES (v_uid, p_rpc_name, v_bucket, 1)
  ON CONFLICT (user_id, rpc_name, bucket_ts)
  DO UPDATE SET call_count = rate_limit_tracker.call_count + 1
  RETURNING call_count INTO v_count;

  IF v_count > p_max_per_minute THEN
    PERFORM log_security_event('RATE_LIMIT_EXCEEDED', v_uid, p_rpc_name,
      jsonb_build_object('count', v_count, 'max', p_max_per_minute));
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: trop d''appels à %. Réessayez dans une minute.', p_rpc_name
      USING ERRCODE = 'resource_exhausted';
  END IF;

  DELETE FROM rate_limit_tracker
  WHERE bucket_ts < now() - interval '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- validate_session_row : log avant RAISE
CREATE OR REPLACE FUNCTION validate_session_row(p_row JSONB)
RETURNS VOID AS $$
DECLARE
  v_honor BIGINT;
  v_xp BIGINT;
  v_rank_points BIGINT;
  v_next_rank_points BIGINT;
  v_ts BIGINT;
  v_max_bigint BIGINT := 9223372036854775807;
  v_max_ts BIGINT := 4102444800000;
BEGIN
  v_honor := safe_bigint(p_row->>'honor');
  v_xp := safe_bigint(p_row->>'xp');
  v_rank_points := safe_bigint(p_row->>'rank_points');
  v_next_rank_points := safe_bigint(p_row->>'next_rank_points');
  v_ts := safe_bigint(p_row->>'session_timestamp');
  IF v_ts = 0 THEN
    v_ts := (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT;
  END IF;

  IF v_honor < 0 OR v_honor > v_max_bigint THEN
    PERFORM log_security_event('VALIDATION_FAILED', auth.uid(), 'insert/upsert_user_session_secure',
      jsonb_build_object('field', 'honor', 'value', v_honor));
    RAISE EXCEPTION 'Valeur honor invalide : %', v_honor USING ERRCODE = 'check_violation';
  END IF;
  IF v_xp < 0 OR v_xp > v_max_bigint THEN
    PERFORM log_security_event('VALIDATION_FAILED', auth.uid(), 'insert/upsert_user_session_secure',
      jsonb_build_object('field', 'xp', 'value', v_xp));
    RAISE EXCEPTION 'Valeur xp invalide : %', v_xp USING ERRCODE = 'check_violation';
  END IF;
  IF v_rank_points < 0 OR v_rank_points > v_max_bigint THEN
    PERFORM log_security_event('VALIDATION_FAILED', auth.uid(), 'insert/upsert_user_session_secure',
      jsonb_build_object('field', 'rank_points', 'value', v_rank_points));
    RAISE EXCEPTION 'Valeur rank_points invalide : %', v_rank_points USING ERRCODE = 'check_violation';
  END IF;
  IF v_next_rank_points < 0 OR v_next_rank_points > v_max_bigint THEN
    PERFORM log_security_event('VALIDATION_FAILED', auth.uid(), 'insert/upsert_user_session_secure',
      jsonb_build_object('field', 'next_rank_points', 'value', v_next_rank_points));
    RAISE EXCEPTION 'Valeur next_rank_points invalide : %', v_next_rank_points USING ERRCODE = 'check_violation';
  END IF;
  IF v_ts < 0 OR v_ts > v_max_ts THEN
    PERFORM log_security_event('VALIDATION_FAILED', auth.uid(), 'insert/upsert_user_session_secure',
      jsonb_build_object('field', 'session_timestamp', 'value', v_ts));
    RAISE EXCEPTION 'Valeur session_timestamp invalide : %', v_ts USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC : récupérer les événements de sécurité (SUPERADMIN uniquement)
CREATE OR REPLACE FUNCTION get_security_events(
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0,
  p_event_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  user_id UUID,
  rpc_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT se.id, se.event_type, se.user_id, se.rpc_name, se.details, se.created_at
  FROM security_events se
  WHERE (p_event_type IS NULL OR se.event_type = p_event_type)
  ORDER BY se.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- [UTILITY] Export manuel admin_logs pour SUPERADMIN. Non appelé par l'application.
-- RPC : export admin_logs (SUPERADMIN, pour monitoring externe)
CREATE OR REPLACE FUNCTION get_admin_logs_export(
  p_limit INT DEFAULT 500,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  admin_id UUID,
  target_user_id UUID,
  action TEXT,
  details JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT al.id, al.admin_id, al.target_user_id, al.action, al.details, al.created_at
  FROM admin_logs al
  WHERE (p_since IS NULL OR al.created_at >= p_since)
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== security-step5-security-events.sql ==========
-- ==========================================
-- SÉCURITÉ ÉTAPE 5 — Journal des événements de sécurité
-- Date : février 2026
-- Objectif : Enregistrer les dépassements de rate limit et les échecs de
--            validation pour surveillance et détection d'abus.
--
-- À exécuter APRÈS security-step4.
-- ==========================================

-- Table des événements de sécurité
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID,
  rpc_name TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Aucune policy : accès uniquement via RPC SECURITY DEFINER (SUPERADMIN)

-- Fonction : enregistrer un événement de sécurité
CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_rpc_name TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO security_events (event_type, user_id, rpc_name, details)
  VALUES (p_event_type, COALESCE(p_user_id, auth.uid()), p_rpc_name, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ========== session-limits-rpc-and-rls.sql ==========
-- ==========================================
-- Limites de sessions côté serveur (obligatoire)
-- FREE : 1 session max | PRO : 10 sessions max | ADMIN/SUPERADMIN : illimité
-- Insertion uniquement via RPC (insert_user_session_secure / upsert_user_session_secure).
-- ==========================================

-- Table user_sessions (si pas déjà créée par supabase-schema-data.sql)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id TEXT,
  honor BIGINT NOT NULL DEFAULT 0,
  xp BIGINT NOT NULL DEFAULT 0,
  rank_points BIGINT NOT NULL DEFAULT 0,
  next_rank_points BIGINT NOT NULL DEFAULT 0,
  current_rank TEXT,
  note TEXT,
  session_date TEXT,
  session_timestamp BIGINT NOT NULL,
  is_baseline BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, local_id)
);

-- Colonne is_baseline si table existait sans elle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_sessions' AND column_name = 'is_baseline'
  ) THEN
    ALTER TABLE user_sessions ADD COLUMN is_baseline BOOLEAN DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_timestamp ON user_sessions(session_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_baseline ON user_sessions(user_id, is_baseline) WHERE is_baseline = true;

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Helper : badge de l'utilisateur courant
CREATE OR REPLACE FUNCTION public.get_my_badge()
RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF((SELECT badge FROM public.profiles WHERE id = auth.uid()), ''), 'FREE');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- RPC : insertion sécurisée (vérifie la limite avant d'insérer)
-- FREE → bloquer si >= 1 | PRO → bloquer si >= 10
CREATE OR REPLACE FUNCTION public.insert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT public.get_my_badge() INTO v_badge;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');

  v_limit := CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 10
    ELSE 1
  END;

  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count FROM public.user_sessions WHERE user_id = v_uid;
    IF v_count >= v_limit THEN
      IF v_badge = 'FREE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs FREE ne peuvent avoir qu''1 session. Passez en PRO pour plus de sessions.', 'code', 'SESSION_LIMIT_FREE');
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN.', 'code', 'SESSION_LIMIT_PRO');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC : upsert sécurisé (UPDATE si existe, sinon INSERT après vérification limite)
CREATE OR REPLACE FUNCTION public.upsert_user_session_secure(p_row JSONB)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_badge TEXT;
  v_count BIGINT;
  v_limit INT;
  v_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE public.user_sessions SET
      honor = COALESCE((p_row->>'honor')::BIGINT, 0),
      xp = COALESCE((p_row->>'xp')::BIGINT, 0),
      rank_points = COALESCE((p_row->>'rank_points')::BIGINT, 0),
      next_rank_points = COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
      current_rank = NULLIF(trim(p_row->>'current_rank'), ''),
      note = NULLIF(trim(p_row->>'note'), ''),
      session_date = NULLIF(trim(p_row->>'session_date'), ''),
      session_timestamp = COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
      is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id');
    RETURN jsonb_build_object('success', true);
  END IF;

  SELECT public.get_my_badge() INTO v_badge;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');
  v_limit := CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 10
    ELSE 1
  END;

  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count FROM public.user_sessions WHERE user_id = v_uid;
    IF v_count >= v_limit THEN
      IF v_badge = 'FREE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs FREE ne peuvent avoir qu''1 session. Passez en PRO pour plus de sessions.', 'code', 'SESSION_LIMIT_FREE');
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN.', 'code', 'SESSION_LIMIT_PRO');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false)
  );
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RLS : interdire l'INSERT direct ; seul les RPC (SECURITY DEFINER) peuvent insérer
DROP POLICY IF EXISTS "Users can CRUD own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can select own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can select own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.user_sessions;
CREATE POLICY "Users can select own sessions" ON public.user_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.user_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.user_sessions FOR DELETE USING (auth.uid() = user_id);

GRANT EXECUTE ON FUNCTION public.insert_user_session_secure(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_session_secure(JSONB) TO authenticated;

COMMENT ON FUNCTION public.insert_user_session_secure(JSONB) IS 'Insertion session avec limite : FREE=1, PRO=10, ADMIN/SUPERADMIN=illimité. Retourne success/code SESSION_LIMIT_FREE|SESSION_LIMIT_PRO si quota dépassé.';
COMMENT ON FUNCTION public.upsert_user_session_secure(JSONB) IS 'Upsert session avec limite ; mise à jour d''une session existante ne compte pas dans le quota.';


-- ========== shared-events-replace-all.sql ==========
-- shared_events : remplacement total à chaque scrap (DELETE + INSERT)
CREATE OR REPLACE FUNCTION public.upsert_shared_events(p_events JSONB DEFAULT '[]'::jsonb, p_uploaded_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EVENTS', 'count', 0);
  END IF;
  v_count := jsonb_array_length(p_events);
  DELETE FROM public.shared_events;
  INSERT INTO public.shared_events (id, events_json, uploaded_at, uploaded_by)
  VALUES (v_id, p_events, now(), p_uploaded_by);
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO service_role;


-- ========== shared-events-rls-select.sql ==========
-- RLS shared_events : lecture publique (événements du jour partagés)
ALTER TABLE public.shared_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_events_select_all" ON public.shared_events;
CREATE POLICY "shared_events_select_all"
  ON public.shared_events FOR SELECT
  USING (true);


-- ========== shared-events-single-row.sql ==========
-- shared_events : une seule ligne (id fixe). Supprime les doublons créés avant la correction.
DELETE FROM public.shared_events
WHERE id != '00000000-0000-0000-0000-000000000001'::uuid;


-- ========== shared-events-table-and-rpc.sql ==========
-- Table shared_events : un seul enregistrement (événements du jour), remplacé à chaque scan.
CREATE TABLE IF NOT EXISTS public.shared_events (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  events_json JSONB NOT NULL DEFAULT '[]',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID
);
-- Ajouter uploaded_by si la table existait sans (nullable pour compat).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shared_events' AND column_name = 'uploaded_by') THEN
    ALTER TABLE public.shared_events ADD COLUMN uploaded_by UUID;
  END IF;
END $$;

-- RPC : remplace entièrement les événements. p_uploaded_by = user_id du scraper (obligatoire si colonne NOT NULL).
CREATE OR REPLACE FUNCTION public.upsert_shared_events(p_events JSONB DEFAULT '[]'::jsonb, p_uploaded_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EVENTS', 'count', 0);
  END IF;
  v_count := jsonb_array_length(p_events);
  INSERT INTO public.shared_events (id, events_json, uploaded_at, uploaded_by)
  VALUES (v_id, p_events, now(), p_uploaded_by)
  ON CONFLICT (id) DO UPDATE SET
    events_json = EXCLUDED.events_json,
    uploaded_at = EXCLUDED.uploaded_at,
    uploaded_by = COALESCE(EXCLUDED.uploaded_by, public.shared_events.uploaded_by);
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO anon;


-- ========== shared-events-upsert-only-no-delete.sql ==========
-- Corrige upsert_shared_events : supprime DELETE (bloqué par Supabase "DELETE requires WHERE clause")
-- Doit s'exécuter APRÈS shared-events-replace-all.sql
CREATE OR REPLACE FUNCTION public.upsert_shared_events(p_events JSONB DEFAULT '[]'::jsonb, p_uploaded_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EVENTS', 'count', 0);
  END IF;
  v_count := jsonb_array_length(p_events);
  INSERT INTO public.shared_events (id, events_json, uploaded_at, uploaded_by)
  VALUES (v_id, p_events, now(), p_uploaded_by)
  ON CONFLICT (id) DO UPDATE SET
    events_json = EXCLUDED.events_json,
    uploaded_at = EXCLUDED.uploaded_at,
    uploaded_by = COALESCE(EXCLUDED.uploaded_by, public.shared_events.uploaded_by);
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_shared_events(JSONB, UUID) TO service_role;


-- ========== upsert-darkorbit-account-by-server.sql ==========
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


-- ========== verify-session-limits-structure.sql ==========
-- ==========================================
-- VÉRIFICATION STRUCTURELLE (à exécuter après les 3 migrations)
-- Ne modifie rien ; uniquement des SELECT pour valider la config.
-- ==========================================

-- 1. Table user_sessions existe
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'user_sessions'
) AS "table_user_sessions_exists";

-- 2. RLS activé sur user_sessions
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname = 'user_sessions' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 3. Policies sur user_sessions (aucune policy INSERT)
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_sessions'
ORDER BY policyname;
-- Attendu : uniquement SELECT, UPDATE, DELETE (pas de ligne avec cmd = 'INSERT' ou '*' incluant INSERT)

-- 4. Fonctions RPC existent
SELECT proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname IN ('insert_user_session_secure', 'upsert_user_session_secure', 'get_user_permissions', 'get_my_badge')
ORDER BY proname;

-- 5. Résumé : nombre de policies par type sur user_sessions
SELECT cmd, COUNT(*) AS count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_sessions'
GROUP BY cmd;


-- ========== zzz_fix-session-rpcs-final.sql ==========
-- Impose la version finale des RPC sessions : player_id support + sessions illimitées (maxSessions -1)
-- À exécuter APRÈS add-player-id-to-sessions (préfixe zzz pour ordre lexicographique)
-- insert_user_session_secure : player_id optionnel depuis p_row
-- upsert_user_session_secure : structure add-player-id, sans vérification de limite
CREATE OR REPLACE FUNCTION public.insert_user_session_secure(p_row JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_player_id TEXT := NULLIF(trim(p_row->>'player_id'), '');
  v_player_server TEXT := NULLIF(trim(p_row->>'player_server'), '');
  v_player_pseudo TEXT := NULLIF(trim(p_row->>'player_pseudo'), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  INSERT INTO public.user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline,
    player_id, player_server, player_pseudo
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
    v_player_id,
    v_player_server,
    v_player_pseudo
  );
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_user_session_secure(
  p_row JSONB,
  p_player_id TEXT DEFAULT NULL,
  p_player_server TEXT DEFAULT NULL,
  p_player_pseudo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
  v_player_id TEXT := COALESCE(NULLIF(trim(p_player_id), ''), NULLIF(trim(p_row->>'player_id'), ''));
  v_player_server TEXT := COALESCE(NULLIF(trim(p_player_server), ''), NULLIF(trim(p_row->>'player_server'), ''));
  v_player_pseudo TEXT := COALESCE(NULLIF(trim(p_player_pseudo), ''), NULLIF(trim(p_row->>'player_pseudo'), ''));
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié', 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
      AND (player_id IS NOT DISTINCT FROM v_player_id)
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE public.user_sessions SET
      honor = COALESCE((p_row->>'honor')::BIGINT, 0),
      xp = COALESCE((p_row->>'xp')::BIGINT, 0),
      rank_points = COALESCE((p_row->>'rank_points')::BIGINT, 0),
      next_rank_points = COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
      current_rank = NULLIF(trim(p_row->>'current_rank'), ''),
      note = NULLIF(trim(p_row->>'note'), ''),
      session_date = NULLIF(trim(p_row->>'session_date'), ''),
      session_timestamp = COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
      is_baseline = COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
      player_id = v_player_id,
      player_server = v_player_server,
      player_pseudo = v_player_pseudo,
      updated_at = now()
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
      AND (player_id IS NOT DISTINCT FROM v_player_id);
    RETURN jsonb_build_object('success', true);
  END IF;

  INSERT INTO public.user_sessions (
    user_id, local_id, honor, xp, rank_points, next_rank_points,
    current_rank, note, session_date, session_timestamp, is_baseline,
    player_id, player_server, player_pseudo
  ) VALUES (
    v_uid,
    p_row->>'local_id',
    COALESCE((p_row->>'honor')::BIGINT, 0),
    COALESCE((p_row->>'xp')::BIGINT, 0),
    COALESCE((p_row->>'rank_points')::BIGINT, 0),
    COALESCE((p_row->>'next_rank_points')::BIGINT, 0),
    NULLIF(trim(p_row->>'current_rank'), ''),
    NULLIF(trim(p_row->>'note'), ''),
    NULLIF(trim(p_row->>'session_date'), ''),
    COALESCE((p_row->>'session_timestamp')::BIGINT, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
    COALESCE((p_row->>'is_baseline')::BOOLEAN, false),
    v_player_id,
    v_player_server,
    v_player_pseudo
  );
  RETURN jsonb_build_object('success', true);
END;
$$;

