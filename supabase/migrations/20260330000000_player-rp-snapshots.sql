-- Snapshots de points de grade (rank points) pour calculer les deltas 24h/7j.
-- DOStats ne fournit pas de classement "top_user" par période — on calcule nous-mêmes
-- en comparant deux snapshots : le plus récent et le plus proche de N heures en arrière.

CREATE TABLE IF NOT EXISTS public.player_rp_snapshots (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  server     TEXT        NOT NULL,
  rank_points BIGINT     NOT NULL,
  snapped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_rp_snapshots_lookup
  ON public.player_rp_snapshots (server, user_id, snapped_at DESC);

ALTER TABLE public.player_rp_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rp_snapshots_select" ON public.player_rp_snapshots;
CREATE POLICY "rp_snapshots_select"
  ON public.player_rp_snapshots FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "rp_snapshots_service_rw" ON public.player_rp_snapshots;
CREATE POLICY "rp_snapshots_service_rw"
  ON public.player_rp_snapshots FOR ALL TO service_role USING (true);

GRANT SELECT ON public.player_rp_snapshots TO anon, authenticated;

-- ─── Insérer des snapshots + nettoyage automatique après 8 jours ─────────────

CREATE OR REPLACE FUNCTION public.insert_rp_snapshots(
  p_server    TEXT,
  p_snapshots JSONB   -- [{ "user_id": "...", "rank_points": 123456 }, ...]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.player_rp_snapshots (user_id, server, rank_points, snapped_at)
  SELECT
    trim(s->>'user_id'),
    p_server,
    (s->>'rank_points')::BIGINT,
    now()
  FROM jsonb_array_elements(p_snapshots) s
  WHERE trim(s->>'user_id') <> ''
    AND (s->>'rank_points') IS NOT NULL;

  -- Garder seulement 8 jours glissants (couvre 24h et 7j)
  DELETE FROM public.player_rp_snapshots
  WHERE snapped_at < now() - INTERVAL '8 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_rp_snapshots(TEXT, JSONB)
  TO authenticated, service_role;

-- ─── Lire les deltas RP pour une liste d'utilisateurs ────────────────────────

CREATE OR REPLACE FUNCTION public.get_rp_deltas(
  p_server   TEXT,
  p_user_ids TEXT[],
  p_hours    INTEGER DEFAULT 24
)
RETURNS TABLE(user_id TEXT, delta BIGINT, latest_rp BIGINT, ref_rp BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (s.user_id)
      s.user_id, s.rank_points, s.snapped_at
    FROM public.player_rp_snapshots s
    WHERE s.server = p_server
      AND s.user_id = ANY(p_user_ids)
    ORDER BY s.user_id, s.snapped_at DESC
  ),
  reference AS (
    SELECT DISTINCT ON (s.user_id)
      s.user_id, s.rank_points, s.snapped_at
    FROM public.player_rp_snapshots s
    WHERE s.server = p_server
      AND s.user_id = ANY(p_user_ids)
      AND s.snapped_at <= (now() - (p_hours || ' hours')::INTERVAL)
    ORDER BY s.user_id, s.snapped_at DESC
  )
  SELECT
    l.user_id::TEXT,
    (l.rank_points - r.rank_points)::BIGINT AS delta,
    l.rank_points  AS latest_rp,
    r.rank_points  AS ref_rp
  FROM latest l
  INNER JOIN reference r ON r.user_id = l.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rp_deltas(TEXT, TEXT[], INTEGER)
  TO authenticated, anon;
