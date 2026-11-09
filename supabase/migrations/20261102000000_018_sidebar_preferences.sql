-- ============================================================
-- Migration 018: Sidebar Preferences
-- Per-user, per-school ordered list of pinned module paths.
-- ============================================================

CREATE TABLE IF NOT EXISTS sidebar_preferences (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id    uuid        REFERENCES schools(id) ON DELETE CASCADE,
  role         text        NOT NULL CHECK (role IN ('admin', 'teacher', 'parent')),
  -- Ordered array of route path strings, e.g. ['/admin/fees', '/admin/students']
  -- NULL means "user has never customised → use role default"
  ordered_paths text[],
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, school_id)
);

ALTER TABLE sidebar_preferences ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sidebar_preferences_profile_id
  ON sidebar_preferences(profile_id);

CREATE TRIGGER set_updated_at_sidebar_preferences
  BEFORE UPDATE ON sidebar_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Each user can only read/write their OWN record
DROP POLICY IF EXISTS "sidebar_preferences_self_all" ON sidebar_preferences;
CREATE POLICY "sidebar_preferences_self_all" ON sidebar_preferences
  FOR ALL TO authenticated
  USING  (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
