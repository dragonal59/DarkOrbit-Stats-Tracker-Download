-- ==========================================
-- OPTIMISATION shared_rankings — Profile Scraper
-- Champs : needs_review, blacklisted_until, profile_scraper_failures
-- Index, updated_at, RLS
-- À exécuter dans l'éditeur SQL Supabase
-- ==========================================

-- 1. Créer la table si elle n'existe pas (structure de base)
CREATE TABLE IF NOT EXISTS public.shared_rankings (
  server TEXT PRIMARY KEY,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  players_json JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ajouter les colonnes manquantes si la table existait déjà sans elles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shared_rankings' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.shared_rankings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
  -- uploaded_by : UUID de l'utilisateur qui a effectué le dernier upsert classement.
  -- NULL autorisé ici pour compatibilité avec les lignes existantes sans uploader connu.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shared_rankings' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE public.shared_rankings ADD COLUMN uploaded_by UUID;
  END IF;
END $$;

-- 3. Fonction trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_shared_rankings_updated_at ON public.shared_rankings;
CREATE TRIGGER tr_shared_rankings_updated_at
  BEFORE UPDATE ON public.shared_rankings
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

-- 4. Index sur server (déjà couvert par PK, mais explicite pour les requêtes)
-- La PK sur server crée automatiquement un index unique.

-- 5. Index GIN sur players_json pour les requêtes JSONB (userId, needs_review, etc.)
-- Utile si on filtre en SQL ; actuellement le filtrage est en JS, mais prépare l'avenir.
CREATE INDEX IF NOT EXISTS idx_shared_rankings_players_gin
  ON public.shared_rankings USING GIN (players_json jsonb_path_ops);

-- 6. Index partiel pour fetchPlayersNeedingCompany : joueurs sans company et non blacklistés
-- (Optionnel — le filtrage se fait en JS, mais peut aider pour des vues matérialisées futures)
-- CREATE INDEX idx_shared_rankings_players_userid
--   ON public.shared_rankings USING GIN ((players_json->'userId') jsonb_path_ops);
-- Non créé : structure players_json = array, pas objet avec userId au niveau racine.

-- 7. RPC upsert_shared_ranking — FUSION (MERGE) au lieu de remplacement total
-- Pour chaque joueur dans p_players : si userId existe déjà, fusionne (garde points + ajoute firme/blacklist).
-- Évite d'effacer des données si deux scrapers travaillent en parallèle.
CREATE OR REPLACE FUNCTION public.upsert_shared_ranking(
  p_server TEXT,
  p_players JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merged JSONB;
  v_count INT;
BEGIN
  -- Validation : p_server requis
  IF p_server IS NULL OR trim(p_server) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_SERVER', 'count', 0);
  END IF;
  -- Validation : p_players doit être un tableau bien formé
  IF jsonb_typeof(p_players) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PLAYERS', 'count', 0);
  END IF;
  -- Si p_players vide : ne rien faire pour éviter de vider la base par erreur
  IF jsonb_array_length(p_players) = 0 THEN
    RETURN jsonb_build_object('success', true, 'count', 0);
  END IF;

  -- Fusion : construire le tableau mergé par userId
  WITH current_row AS (
    SELECT players_json FROM public.shared_rankings WHERE server = p_server
  ),
  current_elems AS (
    SELECT elem->>'userId' AS uid, elem
    FROM jsonb_array_elements(COALESCE((SELECT players_json FROM current_row), '[]'::jsonb)) AS elem
  ),
  new_elems AS (
    SELECT elem->>'userId' AS uid, elem
    FROM jsonb_array_elements(p_players) AS elem
  ),
  all_uids AS (
    SELECT DISTINCT uid FROM (
      SELECT uid FROM current_elems WHERE uid IS NOT NULL AND trim(uid) != ''
      UNION
      SELECT uid FROM new_elems WHERE uid IS NOT NULL AND trim(uid) != ''
    ) t
  ),
  merged_by_uid AS (
    SELECT
      -- Base merge : n écrase c pour les clés communes
      (COALESCE(c.elem, '{}'::jsonb) || COALESCE(n.elem, '{}'::jsonb))
      -- Protection company : si n n'apporte pas de firme valide, restaurer celle de c
      -- Garantit que le scraper classement (qui n'a jamais de company) ne peut pas écraser
      -- une firme existante, même si une ancienne version de la fonction faisait un replace.
      || CASE
          WHEN (COALESCE(n.elem, '{}'::jsonb)->>'company') IS NULL
               OR trim(COALESCE(n.elem, '{}'::jsonb)->>'company') = ''
          THEN CASE
                WHEN (c.elem->>'company') IS NOT NULL
                     AND trim(c.elem->>'company') != ''
                THEN jsonb_build_object('company', c.elem->'company')
                ELSE '{}'::jsonb
               END
          ELSE '{}'::jsonb
         END AS merged
    FROM all_uids a
    LEFT JOIN current_elems c ON a.uid = c.uid
    LEFT JOIN new_elems n ON a.uid = n.uid
  ),
  new_without_uid AS (
    SELECT elem FROM jsonb_array_elements(p_players) AS elem
    WHERE (elem->>'userId') IS NULL OR trim(COALESCE(elem->>'userId', '')) = ''
  ),
  current_without_uid AS (
    SELECT elem FROM jsonb_array_elements(COALESCE((SELECT players_json FROM current_row), '[]'::jsonb)) AS elem
    WHERE (elem->>'userId') IS NULL OR trim(COALESCE(elem->>'userId', '')) = ''
  ),
  merged_with_uid AS (
    SELECT jsonb_agg(merged ORDER BY
      (merged->>'top_user_rank')::int NULLS LAST,
      (merged->>'honor_rank')::int NULLS LAST,
      (merged->>'honor_value')::bigint NULLS LAST,
      merged->>'name') AS arr
    FROM merged_by_uid
  ),
  combined AS (
    SELECT
      COALESCE((SELECT arr FROM merged_with_uid), '[]'::jsonb)
      || COALESCE((SELECT jsonb_agg(elem) FROM new_without_uid), '[]'::jsonb)
      || COALESCE((SELECT jsonb_agg(elem) FROM current_without_uid), '[]'::jsonb)
      AS final_arr
  )
  SELECT final_arr INTO v_merged FROM combined;

  v_count := jsonb_array_length(COALESCE(v_merged, '[]'::jsonb));

  -- Upsert avec la clé primaire server
  INSERT INTO public.shared_rankings (server, uploaded_at, uploaded_by, players_json)
  VALUES (p_server, now(), auth.uid(), COALESCE(v_merged, '[]'::jsonb))
  ON CONFLICT (server) DO UPDATE SET
    uploaded_at  = now(),
    uploaded_by  = COALESCE(auth.uid(), public.shared_rankings.uploaded_by),
    players_json = COALESCE(v_merged, public.shared_rankings.players_json);

  RETURN jsonb_build_object('success', true, 'count', v_count);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'DB_ERROR', 'error', SQLERRM, 'count', 0);
END;
$$;

COMMENT ON FUNCTION public.upsert_shared_ranking(TEXT, JSONB) IS
  'Upsert classement partagé par serveur. FUSION par userId : si userId existe, merge (existing || new) — garde points du classement et ajoute firme/blacklist. Si p_players vide ou mal formé, ne fait rien.';

-- 8. Permissions RPC
GRANT EXECUTE ON FUNCTION public.upsert_shared_ranking(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_ranking(TEXT, JSONB) TO anon;

-- 9. RLS sur shared_rankings
ALTER TABLE public.shared_rankings ENABLE ROW LEVEL SECURITY;

-- Policy SELECT : tous les utilisateurs authentifiés peuvent lire (classement public)
DROP POLICY IF EXISTS "shared_rankings_select_authenticated" ON public.shared_rankings;
CREATE POLICY "shared_rankings_select_authenticated"
  ON public.shared_rankings FOR SELECT
  TO authenticated
  USING (true);

-- Policy SELECT pour anon (lecture classement sans auth, ex. page publique)
DROP POLICY IF EXISTS "shared_rankings_select_anon" ON public.shared_rankings;
CREATE POLICY "shared_rankings_select_anon"
  ON public.shared_rankings FOR SELECT
  TO anon
  USING (true);

-- Pas de policy INSERT/UPDATE/DELETE direct : seules les RPC (SECURITY DEFINER) peuvent écrire.
-- La RPC upsert_shared_ranking bypass RLS car SECURITY DEFINER.
-- Ainsi, un utilisateur ne peut pas modifier shared_rankings directement, mais peut appeler la RPC
-- (qui vérifie qu'il est authentifié via le token).

-- 10. Vérification : structure players_json attendue
-- Chaque élément du tableau peut contenir :
--   name, grade, userId, honor_value, experience_value, top_user_value,
--   company, needs_review, blacklisted_until, profile_scraper_failures
-- Aucune contrainte CHECK sur le JSONB pour garder la flexibilité.
