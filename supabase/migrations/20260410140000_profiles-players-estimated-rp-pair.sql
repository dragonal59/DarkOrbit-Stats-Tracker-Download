-- Paire estimated_rp (scrape précédent / dernier scrape) hors de profiles_players
-- pour éviter toute perte lors des merges / réécritures sur profiles_players.

CREATE TABLE IF NOT EXISTS public.profiles_players_estimated_rp_pair (
  user_id text NOT NULL,
  server text NOT NULL,
  estimated_rp_previous bigint,
  estimated_rp_last bigint NOT NULL,
  captured_at_previous timestamptz,
  captured_at_last timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_players_estimated_rp_pair_pkey PRIMARY KEY (user_id, server)
);

CREATE INDEX IF NOT EXISTS idx_profiles_players_estimated_rp_pair_server
  ON public.profiles_players_estimated_rp_pair (server);

COMMENT ON TABLE public.profiles_players_estimated_rp_pair IS
  'Deux derniers estimated_rp connus par (user_id, server) ; rotation à chaque valeur distincte.';

ALTER TABLE public.profiles_players_estimated_rp_pair ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.profiles_players_estimated_rp_pair;
CREATE POLICY "Public read access"
  ON public.profiles_players_estimated_rp_pair FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service insert/update" ON public.profiles_players_estimated_rp_pair;
CREATE POLICY "Service insert/update"
  ON public.profiles_players_estimated_rp_pair FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_profiles_players_estimated_rp_pair()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server text;
  v_uid text;
  v_ts timestamptz;
  rec public.profiles_players_estimated_rp_pair%ROWTYPE;
BEGIN
  IF NEW.estimated_rp IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estimated_rp IS NOT DISTINCT FROM NEW.estimated_rp THEN
    RETURN NEW;
  END IF;

  v_server := lower(trim(COALESCE(NEW.server::text, '')));
  v_uid := trim(COALESCE(NEW.user_id::text, ''));
  IF v_server = '' OR v_uid = '' THEN
    RETURN NEW;
  END IF;

  v_ts := now();
  BEGIN
    IF NEW.dostats_updated_at IS NOT NULL THEN
      v_ts := NEW.dostats_updated_at::timestamptz;
    ELSIF NEW.scraped_at IS NOT NULL THEN
      v_ts := NEW.scraped_at::timestamptz;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_ts := now();
  END;

  SELECT * INTO rec
  FROM public.profiles_players_estimated_rp_pair
  WHERE server = v_server AND user_id = v_uid;

  IF NOT FOUND THEN
    INSERT INTO public.profiles_players_estimated_rp_pair (
      user_id, server,
      estimated_rp_previous, estimated_rp_last,
      captured_at_previous, captured_at_last
    ) VALUES (
      v_uid, v_server,
      NULL, NEW.estimated_rp::bigint,
      NULL, v_ts
    );
  ELSIF rec.estimated_rp_last IS NOT DISTINCT FROM NEW.estimated_rp::bigint THEN
    NULL;
  ELSE
    UPDATE public.profiles_players_estimated_rp_pair SET
      estimated_rp_previous = rec.estimated_rp_last,
      captured_at_previous = rec.captured_at_last,
      estimated_rp_last = NEW.estimated_rp::bigint,
      captured_at_last = v_ts
    WHERE server = v_server AND user_id = v_uid;
  END IF;

  RETURN NEW;
END;
$$;

DO $do$
BEGIN
  IF to_regclass('public.profiles_players') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_profiles_players_estimated_rp_pair ON public.profiles_players;
    CREATE TRIGGER trg_profiles_players_estimated_rp_pair
      AFTER INSERT OR UPDATE OF estimated_rp ON public.profiles_players
      FOR EACH ROW
      EXECUTE PROCEDURE public.tg_profiles_players_estimated_rp_pair();
  END IF;
END
$do$;
