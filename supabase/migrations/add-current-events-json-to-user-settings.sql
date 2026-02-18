-- Événements DarkOrbit scrapés (liste), stockés par collecte
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS current_events_json JSONB DEFAULT '[]';
