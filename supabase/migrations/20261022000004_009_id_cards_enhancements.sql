/*
# Migration 009: ID Card Enhancements
Adds support for storing school-level ID card template configuration and design assets.
*/

ALTER TABLE schools ADD COLUMN IF NOT EXISTS id_card_template_url text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS id_card_config jsonb;
ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact text;
