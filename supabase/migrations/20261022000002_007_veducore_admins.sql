/*
# Migration 007: Veducore Management Admin Table

Stores Veducore internal management admins.
These are NOT school admins — they are the Veducore team members
who manage all schools on the platform.

- `veducore_admins` is NOT school-scoped (no school_id)
- Auth is done via Supabase Auth — this table just marks who is a mgmt admin
- First row inserted = first-time setup complete
*/

CREATE TABLE IF NOT EXISTS veducore_admins (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text        NOT NULL UNIQUE,
  full_name  text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only veducore admins can read this table (via service role in edge functions)
-- No RLS needed since client never queries this directly
-- Access is only through edge functions using service role key

ALTER TABLE veducore_admins ENABLE ROW LEVEL SECURITY;

-- No client-side access at all — management portal uses edge functions
CREATE POLICY "veducore_admins_no_client_access" ON veducore_admins
  FOR ALL TO authenticated
  USING (false);
