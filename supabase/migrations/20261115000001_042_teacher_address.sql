-- ============================================================
-- Migration 042: teacher address
-- Shown under "Contact details" on the teacher's app profile and
-- editable from the admin Teachers page. Idempotent.
-- ============================================================
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS address text;
