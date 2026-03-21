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
