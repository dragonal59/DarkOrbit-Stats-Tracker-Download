-- ==========================================
-- RPC Supabase — Limites de sessions par badge (côté serveur, incontournable)
-- FREE : 1 session max | PRO : 10 sessions max | ADMIN/SUPERADMIN : illimité
-- À exécuter dans l'éditeur SQL Supabase après supabase-schema-data.sql
-- ==========================================

-- Helper : retourne le badge de l'utilisateur (ou FREE par défaut)
CREATE OR REPLACE FUNCTION get_my_badge()
RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF((SELECT badge FROM profiles WHERE id = auth.uid()), ''), 'FREE');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- RPC : insertion sécurisée (vérifie la limite avant d'insérer)
-- Paramètre : p_row JSONB avec local_id, honor, xp, rank_points, next_rank_points, current_rank, note, session_date, session_timestamp, is_baseline
CREATE OR REPLACE FUNCTION insert_user_session_secure(p_row JSONB)
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

  SELECT get_my_badge() INTO v_badge;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');

  -- Limite selon badge : FREE=1, PRO=10, ADMIN/SUPERADMIN=illimité
  v_limit := CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 10
    ELSE 1
  END;

  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count FROM user_sessions WHERE user_id = v_uid;
    IF v_count >= v_limit THEN
      IF v_badge = 'FREE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs FREE ne peuvent avoir qu''1 session. Passez en PRO pour plus de sessions.', 'code', 'SESSION_LIMIT_FREE');
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN.', 'code', 'SESSION_LIMIT_PRO');
      END IF;
    END IF;
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

-- RPC : upsert sécurisé (UPDATE si (user_id, local_id) existe, sinon INSERT après vérification limite)
CREATE OR REPLACE FUNCTION upsert_user_session_secure(p_row JSONB)
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

  -- Vérifier si la session existe déjà (même user_id + local_id)
  SELECT EXISTS (
    SELECT 1 FROM user_sessions
    WHERE user_id = v_uid AND local_id = (p_row->>'local_id')
  ) INTO v_exists;

  IF v_exists THEN
    -- UPDATE autorisé sans vérification de limite
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

  -- Nouvelle session : appliquer la limite
  SELECT get_my_badge() INTO v_badge;
  v_badge := COALESCE(NULLIF(trim(v_badge), ''), 'FREE');
  v_limit := CASE
    WHEN v_badge IN ('ADMIN', 'SUPERADMIN') THEN -1
    WHEN v_badge = 'PRO' THEN 10
    ELSE 1
  END;

  IF v_limit > 0 THEN
    SELECT COUNT(*) INTO v_count FROM user_sessions WHERE user_id = v_uid;
    IF v_count >= v_limit THEN
      IF v_badge = 'FREE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs FREE ne peuvent avoir qu''1 session. Passez en PRO pour plus de sessions.', 'code', 'SESSION_LIMIT_FREE');
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions. Supprimez des anciennes sessions ou passez en ADMIN.', 'code', 'SESSION_LIMIT_PRO');
      END IF;
    END IF;
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

-- ==========================================
-- BONUS SÉCURITÉ : Bloquer les INSERT directs sur user_sessions
-- Forcer le passage par les RPC (insert_user_session_secure / upsert_user_session_secure).
-- Exécuter ce bloc APRÈS avoir déployé les RPC et vérifié que le client utilise bien les RPC.
-- ==========================================
-- DROP POLICY IF EXISTS "Users can CRUD own sessions" ON user_sessions;
-- CREATE POLICY "Users can select own sessions" ON user_sessions FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can update own sessions" ON user_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users can delete own sessions" ON user_sessions FOR DELETE USING (auth.uid() = user_id);
-- (Aucune policy INSERT → seul le propriétaire de la fonction / RPC DEFINER peut insérer.)

-- ==========================================
-- INSTRUCTIONS DE TEST
-- ==========================================
-- 1. Exécuter ce script dans le SQL Editor Supabase.
-- 2. Compte FREE : créer ou utiliser un utilisateur avec badge FREE. Synchroniser 1 session → OK. Tenter d'en ajouter une 2e (nouvelle session locale puis sync) → doit refuser avec toast "Limite atteinte : les utilisateurs FREE ne peuvent avoir qu'1 session..."
-- 3. Compte PRO : badge PRO, ajouter jusqu'à 10 sessions → OK. La 11e doit être refusée avec toast "Limite atteinte : les utilisateurs PRO peuvent avoir maximum 10 sessions..."
-- 4. Compte ADMIN/SUPERADMIN : ajouter autant de sessions que voulu → jamais refusé.
-- 5. Vérifier que la mise à jour d'une session existante (même user_id + local_id) fonctionne sans compter dans la limite (upsert = update autorisé).
