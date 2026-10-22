/*
# Add UPDATE policy on schools table for admin users

Allows school admins to update institutional branding, logo, motto, affiliation, and settings.
*/

DROP POLICY IF EXISTS "schools_admin_update" ON schools;
CREATE POLICY "schools_admin_update" ON schools FOR UPDATE
TO authenticated
USING (id = get_current_school_id() AND is_admin())
WITH CHECK (id = get_current_school_id() AND is_admin());
