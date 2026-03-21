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
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.user_sessions;
CREATE POLICY "Users can select own sessions" ON public.user_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.user_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.user_sessions FOR DELETE USING (auth.uid() = user_id);

GRANT EXECUTE ON FUNCTION public.insert_user_session_secure(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_session_secure(JSONB) TO authenticated;

COMMENT ON FUNCTION public.insert_user_session_secure(JSONB) IS 'Insertion session avec limite : FREE=1, PRO=10, ADMIN/SUPERADMIN=illimité. Retourne success/code SESSION_LIMIT_FREE|SESSION_LIMIT_PRO si quota dépassé.';
COMMENT ON FUNCTION public.upsert_user_session_secure(JSONB) IS 'Upsert session avec limite ; mise à jour d''une session existante ne compte pas dans le quota.';
