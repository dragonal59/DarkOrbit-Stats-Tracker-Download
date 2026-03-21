-- Supprime la colonne booster_learning_json de user_settings (système booster learning obsolète)
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS booster_learning_json;
