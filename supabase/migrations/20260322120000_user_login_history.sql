-- Historique des connexions (app DO Stats Tracker) + mise à jour de profiles.last_login
-- Affichage : onglet Mon compte > Informations du compte

CREATE TABLE IF NOT EXISTS public.user_login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  logged_in_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_login_history_user_time
  ON public.user_login_history (user_id, logged_in_at DESC);

ALTER TABLE public.user_login_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_login_history_select_own" ON public.user_login_history;
CREATE POLICY "user_login_history_select_own"
  ON public.user_login_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_login_history IS 'Connexions à l''application (une ligne par appel à record_user_login).';

GRANT SELECT ON public.user_login_history TO authenticated;

-- Insertion + last_login atomiques (évite les écarts client)
CREATE OR REPLACE FUNCTION public.record_user_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.user_login_history (user_id, logged_in_at)
  VALUES (auth.uid(), now());
  UPDATE public.profiles
  SET last_login = now(), updated_at = now()
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_user_login() TO authenticated;

COMMENT ON FUNCTION public.record_user_login() IS 'Enregistre une connexion app et met à jour profiles.last_login (auth.uid()).';
