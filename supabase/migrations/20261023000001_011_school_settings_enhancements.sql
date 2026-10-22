/*
# School Settings Enhancements & Profile Phone Sync

1. Adds settings (jsonb), motto (text), affiliation_board (text), and affiliation_code (text) to schools table.
2. Syncs profiles.phone with schools.contact_number for admin users where phone is null.
*/

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS motto text,
  ADD COLUMN IF NOT EXISTS affiliation_board text DEFAULT 'CBSE',
  ADD COLUMN IF NOT EXISTS affiliation_code text;

-- Sync phone number to admin profile from schools table
UPDATE profiles p
SET phone = s.contact_number
FROM schools s
WHERE p.school_id = s.id
  AND (p.phone IS NULL OR p.phone = '')
  AND s.contact_number IS NOT NULL
  AND s.contact_number != '';
