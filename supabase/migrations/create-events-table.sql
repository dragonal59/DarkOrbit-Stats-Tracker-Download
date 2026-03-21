-- Table events : événements actifs avec timer (sidebar)
-- id, visible, expires_at, created_at. event_data pour affichage (name, description, image).
CREATE TABLE IF NOT EXISTS public.events (
  id TEXT PRIMARY KEY,
  visible BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_data JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_visible ON events(visible) WHERE visible = true;
CREATE INDEX IF NOT EXISTS idx_events_expires ON events(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select_visible"
  ON events FOR SELECT
  USING (visible = true);

CREATE POLICY "events_insert_anon"
  ON events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "events_update_anon"
  ON events FOR UPDATE
  USING (true);

CREATE POLICY "events_delete_anon"
  ON events FOR DELETE
  USING (true);
