-- ============================================================
-- 048: academic_sessions.status was never created on the live DB
-- (023 used CREATE TABLE IF NOT EXISTS on a table that already
-- existed). trg_academic_session_current() writes it, so creating a
-- school (first session) or switching the current session failed with
-- "column status does not exist". Idempotent.
-- ============================================================
ALTER TABLE academic_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'upcoming';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.academic_sessions'::regclass AND conname = 'academic_sessions_status_check'
  ) THEN
    ALTER TABLE academic_sessions
      ADD CONSTRAINT academic_sessions_status_check CHECK (status IN ('upcoming','active','closed'));
  END IF;
END $$;

UPDATE academic_sessions SET status = CASE
    WHEN is_current THEN 'active'
    WHEN end_date IS NOT NULL AND end_date < current_date THEN 'closed'
    ELSE 'upcoming'
  END
WHERE status = 'upcoming' AND (is_current OR (end_date IS NOT NULL AND end_date < current_date));
