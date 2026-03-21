-- Migration directe vers snapshots (remplace shared_rankings)
-- Tables : shared_rankings_snapshots (classement), shared_rankings_dostats_snapshots (DOStats brut)

-- 1. Table classement (scraping Hall of Fame)
CREATE TABLE IF NOT EXISTS public.shared_rankings_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  players_json JSONB NOT NULL DEFAULT '[]',
  uploaded_by UUID
);

CREATE INDEX IF NOT EXISTS idx_rankings_snapshots_server_scraped
  ON public.shared_rankings_snapshots(server_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_snapshots_scraped
  ON public.shared_rankings_snapshots(scraped_at);

ALTER TABLE public.shared_rankings_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rankings_snapshots_select" ON public.shared_rankings_snapshots;
CREATE POLICY "rankings_snapshots_select"
  ON public.shared_rankings_snapshots FOR SELECT
  USING (true);

-- 2. Table DOStats brut (snapshots indépendants)
CREATE TABLE IF NOT EXISTS public.shared_rankings_dostats_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  players_json JSONB NOT NULL DEFAULT '[]',
  uploaded_by UUID
);

CREATE INDEX IF NOT EXISTS idx_dostats_snapshots_server_scraped
  ON public.shared_rankings_dostats_snapshots(server_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_dostats_snapshots_scraped
  ON public.shared_rankings_dostats_snapshots(scraped_at);

ALTER TABLE public.shared_rankings_dostats_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dostats_snapshots_select" ON public.shared_rankings_dostats_snapshots;
CREATE POLICY "dostats_snapshots_select"
  ON public.shared_rankings_dostats_snapshots FOR SELECT
  USING (true);
