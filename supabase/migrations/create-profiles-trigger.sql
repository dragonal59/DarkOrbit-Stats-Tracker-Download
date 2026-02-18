-- ==========================================
-- TRIGGER — Auto-création du profil à l'inscription
-- Après INSERT sur auth.users, crée une ligne dans public.profiles avec valeurs par défaut
-- et optionnellement les champs issus de user_metadata (signUp options.data)
-- À exécuter après create-profiles-table.sql
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    username,
    game_pseudo,
    server,
    company,
    initial_honor,
    initial_xp,
    initial_rank,
    initial_rank_points,
    next_rank_points,
    badge,
    role,
    status,
    verification_status,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      v_meta->>'username',
      v_meta->>'full_name',
      v_meta->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NULLIF(trim(v_meta->>'game_pseudo'), ''),
    NULLIF(trim(v_meta->>'server'), ''),
    NULLIF(trim(v_meta->>'company'), ''),
    COALESCE((v_meta->>'initial_honor')::BIGINT, 0),
    COALESCE((v_meta->>'initial_xp')::BIGINT, 0),
    NULLIF(trim(v_meta->>'initial_rank'), ''),
    COALESCE((v_meta->>'initial_rank_points')::INTEGER, 0),
    (v_meta->>'next_rank_points')::INTEGER,
    'FREE',
    'USER',
    'active',
    'pending',
    '{}'::jsonb,
    now(),
    now()
  );
  RETURN NEW;
END;
$$;

-- Déclencheur : après chaque INSERT sur auth.users (inscription)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
