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

-- 4. RPC upsert_user_preferences (disponible pour usage direct ; l'app utilise
--    un upsert sur user_preferences depuis user-preferences-api.js setPreferences())
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
