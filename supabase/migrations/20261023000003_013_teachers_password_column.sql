/*
# Add password column to teachers and parents tables

Enables storing and displaying credentials (username and password) to administrators
when creating or viewing staff and parent accounts.
*/

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS password text;
