-- Ajout de la colonne imported_rankings_json pour stocker les classements importés (JSON extension)
-- Structure: { "gbl5": { "exportedAt": 123, "players": [...] }, "fr1": {...} }
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS imported_rankings_json JSONB DEFAULT '{}';
