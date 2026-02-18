-- ==========================================
-- TABLE PROFILES — Schéma complet
-- Référencée par : auth-manager.js, api.js, super-admin.js, RPC permissions/admin
-- À exécuter dans l'éditeur SQL Supabase (avant le trigger et supabase-fix-profiles-rls.sql)
-- RLS : non activé ici, géré par supabase-fix-profiles-rls.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  email TEXT,
  game_pseudo TEXT,
  server TEXT,
  company TEXT,
  initial_honor BIGINT DEFAULT 0,
  initial_xp BIGINT DEFAULT 0,
  initial_rank TEXT,
  initial_rank_points INTEGER DEFAULT 0,
  next_rank_points INTEGER,
  badge TEXT NOT NULL DEFAULT 'FREE',
  role TEXT DEFAULT 'USER',
  status TEXT NOT NULL DEFAULT 'active',
  verification_status TEXT DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  is_suspect BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ,

  CONSTRAINT profiles_company_check
    CHECK (company IS NULL OR company IN ('EIC', 'MMO', 'VRU')),
  CONSTRAINT profiles_badge_check
    CHECK (badge IN ('FREE', 'PRO', 'ADMIN', 'SUPERADMIN')),
  CONSTRAINT profiles_role_check
    CHECK (role IS NULL OR role IN ('USER', 'ADMIN', 'SUPERADMIN')),
  CONSTRAINT profiles_status_check
    CHECK (status IN ('active', 'pending', 'banned', 'rejected', 'suspended')),
  CONSTRAINT profiles_verification_status_check
    CHECK (verification_status IS NULL OR verification_status IN ('pending', 'approved', 'rejected'))
);

-- Index pour le dashboard admin (filtrage par statut de vérification)
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON profiles(verification_status)
  WHERE verification_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_verification_pending
  ON profiles(verified_at, id)
  WHERE verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_badge ON profiles(badge);
