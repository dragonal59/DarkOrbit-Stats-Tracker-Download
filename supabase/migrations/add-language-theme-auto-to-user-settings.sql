-- language + theme_auto dans user_settings (sync avec localStorage)
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'fr';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS theme_auto BOOLEAN DEFAULT true;
