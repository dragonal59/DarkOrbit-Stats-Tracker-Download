-- Cooldown 6h pour la récolte auto des stats (bouton Statistiques, badge ≠ FREE)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_stats_collected_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_stats_collected_at IS 'Dernière récolte auto des stats (client Flash). Cooldown 6h entre deux récoltes.';
