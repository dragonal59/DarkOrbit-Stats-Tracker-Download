-- Migration : aligner initial_rank_points et next_rank_points sur BIGINT
-- Cohérence avec user_sessions.rank_points (BIGINT) et pour éviter un overflow
-- si un joueur dépasse 2.1 milliards de points de classement.

ALTER TABLE public.profiles
  ALTER COLUMN initial_rank_points TYPE BIGINT,
  ALTER COLUMN next_rank_points    TYPE BIGINT;
