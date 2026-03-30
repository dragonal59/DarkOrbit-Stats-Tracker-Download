-- ==========================================
-- ÉTAPE 2 — Tâches planifiées pg_cron (Supabase)
-- Activer l’extension dans Dashboard > Database > Extensions si CREATE EXTENSION échoue.
-- ==========================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Fonctions appelées par pg_cron (SECURITY DEFINER : contourne RLS sur profiles / license_keys)
CREATE OR REPLACE FUNCTION public._cron_expire_trial_profiles()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET subscription_status = 'free',
      badge = 'FREE',
      trial_expires_at = NULL,
      updated_at = now()
  WHERE subscription_status = 'trial'
    AND trial_expires_at IS NOT NULL
    AND trial_expires_at < now();
$$;

CREATE OR REPLACE FUNCTION public._cron_delete_unused_license_keys()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.license_keys
  WHERE is_used = false
    AND created_at < now() - INTERVAL '5 days';
$$;

COMMENT ON FUNCTION public._cron_expire_trial_profiles() IS
  'Job pg_cron : repasse en FREE les profils dont l’essai (trial) est expiré.';
COMMENT ON FUNCTION public._cron_delete_unused_license_keys() IS
  'Job pg_cron : supprime les clés licence jamais utilisées après 5 jours.';

-- Idempotence : retirer les jobs du même nom s’ils existent déjà
DO $$
DECLARE
  jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'expire_trial_profiles_hourly';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

DO $$
DECLARE
  jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'delete_unused_license_keys_daily';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

-- 1) Toutes les heures (minute 0)
SELECT cron.schedule(
  'expire_trial_profiles_hourly',
  '0 * * * *',
  $$SELECT public._cron_expire_trial_profiles();$$
);

-- 2) 1× par jour à minuit UTC
SELECT cron.schedule(
  'delete_unused_license_keys_daily',
  '0 0 * * *',
  $$SELECT public._cron_delete_unused_license_keys();$$
);
