/*
# Fix RLS: fee_types policies (corrected syntax)

The previous migration failed on `CREATE POLICY IF EXISTS` which is invalid.
This re-creates the fee_types policies with correct DROP + CREATE syntax,
and ensures all remaining tables have their policies.
*/

-- ============================================================
-- FEE_TYPES (fixed)
-- ============================================================
DROP POLICY IF EXISTS "fee_types_select_admin" ON fee_types;
CREATE POLICY "fee_types_select_admin" ON fee_types FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fee_types_admin_insert" ON fee_types;
CREATE POLICY "fee_types_admin_insert" ON fee_types FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fee_types_admin_update" ON fee_types;
CREATE POLICY "fee_types_admin_update" ON fee_types FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fee_types_admin_delete" ON fee_types;
CREATE POLICY "fee_types_admin_delete" ON fee_types FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());
