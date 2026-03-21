-- ==========================================
-- RLS public.license_keys : la policy "license_keys_select" (USING true)
-- exposait toutes les clés (y compris non utilisées) à tous les authentifiés.
-- Un attaquant pouvait lister les clés disponibles et tenter des activations.
--
-- Nouvelle règle : chaque utilisateur ne voit que les lignes qu'il a lui-même
-- activées (activated_by = auth.uid()). La RPC activate_license_key (SECURITY
-- DEFINER) accède à toutes les clés sans passer par cette policy.
-- ==========================================

DROP POLICY IF EXISTS "license_keys_select" ON public.license_keys;
DROP POLICY IF EXISTS "Users can view license keys" ON public.license_keys;

-- Chaque utilisateur ne voit que ses propres clés activées
CREATE POLICY license_keys_select_own ON public.license_keys
  FOR SELECT TO authenticated
  USING (activated_by = auth.uid());
