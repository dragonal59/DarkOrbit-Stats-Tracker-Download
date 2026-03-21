-- ==========================================
-- PROFILES — Colonnes inscription enrichie + vérification admin
-- Application : DarkOrbit Stats Tracker Pro
-- À exécuter dans le SQL Editor Supabase
-- ==========================================

-- ---------------------------------------------------------------
-- 1. INFORMATIONS DU JEU
-- ---------------------------------------------------------------

-- Pseudo exact du joueur dans DarkOrbit (nullable au début, pourra devenir NOT NULL plus tard)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS game_pseudo TEXT;

-- Serveur du joueur (liste fournie par l'app)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS server TEXT;

-- Firme : EIC, MMO ou VRU uniquement
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS company TEXT;

-- Contrainte CHECK : company accepte uniquement 'EIC', 'MMO', 'VRU'
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_company_check;
ALTER TABLE profiles
ADD CONSTRAINT profiles_company_check CHECK (company IS NULL OR company IN ('EIC', 'MMO', 'VRU'));

-- ---------------------------------------------------------------
-- 2. STATISTIQUES INITIALES (au moment de l'inscription)
-- ---------------------------------------------------------------

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS initial_honor BIGINT DEFAULT 0;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS initial_xp BIGINT DEFAULT 0;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS initial_rank TEXT;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS initial_rank_points INTEGER DEFAULT 0;

-- Points nécessaires pour atteindre le grade suivant
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS next_rank_points INTEGER;

-- ---------------------------------------------------------------
-- 3. STATUT DE VÉRIFICATION (workflow admin)
-- ---------------------------------------------------------------

-- pending = en attente, approved = validé, rejected = refusé
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending';

ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_verification_status_check;
ALTER TABLE profiles
ADD CONSTRAINT profiles_verification_status_check
  CHECK (verification_status IS NULL OR verification_status IN ('pending', 'approved', 'rejected'));

-- Date de vérification par l'admin
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Admin qui a vérifié (référence auth.users)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 4. INDEX pour le dashboard admin (filtrage par statut)
-- ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON profiles(verification_status)
  WHERE verification_status IS NOT NULL;

-- Optionnel : index pour lister rapidement les comptes en attente
CREATE INDEX IF NOT EXISTS idx_profiles_verification_pending
  ON profiles(verified_at, id)
  WHERE verification_status = 'pending';
