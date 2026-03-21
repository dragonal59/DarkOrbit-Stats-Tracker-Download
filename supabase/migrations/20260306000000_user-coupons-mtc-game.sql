-- ==========================================
-- Tables user_coupons et user_coupon_history (MTC Game)
-- RLS : chaque utilisateur ne voit que ses propres lignes.
-- ==========================================

-- Table des coupons par utilisateur
CREATE TABLE IF NOT EXISTS public.user_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  code TEXT,
  balance_initial NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance_initial >= 0),
  balance_remaining NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance_remaining >= 0),
  alert_threshold NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (alert_threshold >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_coupons_user_id ON public.user_coupons(user_id);

ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_coupons_select_own ON public.user_coupons
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_coupons_insert_own ON public.user_coupons
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_coupons_update_own ON public.user_coupons
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY user_coupons_delete_own ON public.user_coupons
  FOR DELETE USING (auth.uid() = user_id);

-- Historique des modifications de solde
CREATE TABLE IF NOT EXISTS public.user_coupon_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.user_coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ancien_solde NUMERIC(12, 2) NOT NULL,
  nouveau_solde NUMERIC(12, 2) NOT NULL,
  difference NUMERIC(12, 2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_coupon_history_coupon_id ON public.user_coupon_history(coupon_id);
CREATE INDEX IF NOT EXISTS idx_user_coupon_history_user_id ON public.user_coupon_history(user_id);

ALTER TABLE public.user_coupon_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_coupon_history_select_own ON public.user_coupon_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_coupon_history_insert_own ON public.user_coupon_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Pas d'UPDATE/DELETE sur l'historique (append-only)
