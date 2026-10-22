/*
# Migration 008: Schools Management Enhancements

- Adds `admin_password_reference` to `schools` table so management can securely store and display admin credentials.
- Adds `status` to `schools` table with default 'Active'.
*/

ALTER TABLE schools ADD COLUMN IF NOT EXISTS admin_password_reference text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';
