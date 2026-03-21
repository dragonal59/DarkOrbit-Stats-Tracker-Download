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
