-- ==========================================
-- SUPPRESSION DES FAUX UTILISATEURS
-- Conserve uniquement : bnoisiez@protonmail.com
-- À exécuter une seule fois dans l'éditeur SQL Supabase
-- ==========================================
-- ATTENTION : opération irréversible. Les données des utilisateurs
-- supprimés (sessions, événements, paramètres, etc.) seront perdues.
-- ==========================================

-- Supprimer tous les utilisateurs auth SAUF bnoisiez@protonmail.com
-- Les tables (profiles, user_sessions, user_events, user_settings, etc.)
-- avec ON DELETE CASCADE sont nettoyées automatiquement.

DELETE FROM auth.users
WHERE email IS DISTINCT FROM 'bnoisiez@protonmail.com';
