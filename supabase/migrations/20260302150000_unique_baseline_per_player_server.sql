-- Garantir au plus une baseline par (player_id, player_server)
-- Une session baseline est définie par is_baseline = true.
-- Cette contrainte n'empêche pas les sessions sans player_id / player_server,
-- mais pour un couple donné (player_id, player_server), il ne peut exister
-- qu'une seule ligne avec is_baseline = true.

CREATE UNIQUE INDEX IF NOT EXISTS unique_baseline_per_player_server
ON public.user_sessions (player_id, player_server)
WHERE is_baseline = true;

