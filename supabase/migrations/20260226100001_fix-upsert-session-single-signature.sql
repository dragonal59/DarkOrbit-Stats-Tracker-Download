-- PGRST203 : supprime la surcharge 4-param pour ne garder que upsert_user_session_secure(p_row JSONB)
-- Le client (sessions.js) n'envoie que p_row ; player_id/server/pseudo sont dans p_row
DROP FUNCTION IF EXISTS public.upsert_user_session_secure(JSONB, TEXT, TEXT, TEXT);
