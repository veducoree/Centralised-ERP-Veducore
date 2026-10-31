/*
# Allow Parents to Submit and Read Transport Applications

1. Allows parents to read their own `audit_logs` entries for transport applications (`audit_logs_select_own`).
2. Allows parents to update `schools.settings` for their school when submitting transport applications.
*/

DROP POLICY IF EXISTS "audit_logs_select_own" ON audit_logs;
CREATE POLICY "audit_logs_select_own" ON audit_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR (school_id = get_current_school_id() AND is_parent()));

DROP POLICY IF EXISTS "schools_parent_transport_update" ON schools;
CREATE POLICY "schools_parent_transport_update" ON schools FOR UPDATE
TO authenticated
USING (id = get_current_school_id() AND is_parent())
WITH CHECK (id = get_current_school_id() AND is_parent());

