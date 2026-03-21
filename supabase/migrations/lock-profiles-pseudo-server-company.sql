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
