/*
# Fix RLS Infinite Recursion & Optimize Dashboard Performance

Resolves PostgreSQL error 42P17 (infinite recursion detected in policy for relation "class_assignments").
The recursion was caused by circular foreign-table subqueries in RLS policies across:
  - students <-> class_assignments <-> parents <-> parent_students <-> teachers

Solution:
1. Provide SECURITY DEFINER helper functions (run with superuser context, bypassing RLS during lookup):
   - get_teacher_section_ids()
   - get_parent_student_ids()
   - get_parent_section_ids()
   - get_parent_teacher_ids()
   - get_teacher_parent_ids()
2. Re-create all dependent policies on students, class_assignments, parents, parent_students,
   teachers, fees, fee_payments, attendance, student_records, remarks, and exam_defs using these helpers.
*/

-- ============================================================
-- 1. SECURITY DEFINER HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_teacher_section_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT ca.section_id), ARRAY[]::uuid[])
  FROM class_assignments ca
  JOIN teachers t ON t.id = ca.teacher_id
  WHERE t.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_parent_student_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT ps.student_id), ARRAY[]::uuid[])
  FROM parent_students ps
  JOIN parents p ON p.id = ps.parent_id
  WHERE p.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_parent_section_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT s.section_id), ARRAY[]::uuid[])
  FROM students s
  JOIN parent_students ps ON ps.student_id = s.id
  JOIN parents p ON p.id = ps.parent_id
  WHERE p.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_parent_teacher_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT ca.teacher_id), ARRAY[]::uuid[])
  FROM class_assignments ca
  JOIN students s ON s.section_id = ca.section_id
  JOIN parent_students ps ON ps.student_id = s.id
  JOIN parents p ON p.id = ps.parent_id
  WHERE p.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_teacher_parent_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT ps.parent_id), ARRAY[]::uuid[])
  FROM parent_students ps
  JOIN students s ON s.id = ps.student_id
  JOIN class_assignments ca ON ca.section_id = s.section_id
  JOIN teachers t ON t.id = ca.teacher_id
  WHERE t.user_id = auth.uid();
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION get_teacher_section_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION get_parent_student_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION get_parent_section_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION get_parent_teacher_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION get_teacher_parent_ids() TO authenticated;

-- ============================================================
-- 2. CLASS_ASSIGNMENTS POLICIES (No recursion)
-- ============================================================
DROP POLICY IF EXISTS "class_assignments_select_admin" ON class_assignments;
CREATE POLICY "class_assignments_select_admin" ON class_assignments FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "class_assignments_select_teacher" ON class_assignments;
CREATE POLICY "class_assignments_select_teacher" ON class_assignments FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);

DROP POLICY IF EXISTS "class_assignments_select_parent" ON class_assignments;
CREATE POLICY "class_assignments_select_parent" ON class_assignments FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND section_id = ANY(get_parent_section_ids())
);

DROP POLICY IF EXISTS "class_assignments_admin_insert" ON class_assignments;
CREATE POLICY "class_assignments_admin_insert" ON class_assignments FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "class_assignments_admin_update" ON class_assignments;
CREATE POLICY "class_assignments_admin_update" ON class_assignments FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "class_assignments_admin_delete" ON class_assignments;
CREATE POLICY "class_assignments_admin_delete" ON class_assignments FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- 3. STUDENTS POLICIES (No recursion)
-- ============================================================
DROP POLICY IF EXISTS "students_select_admin" ON students;
CREATE POLICY "students_select_admin" ON students FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "students_select_teacher" ON students;
CREATE POLICY "students_select_teacher" ON students FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);

DROP POLICY IF EXISTS "students_select_parent" ON students;
CREATE POLICY "students_select_parent" ON students FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND id = ANY(get_parent_student_ids())
);

DROP POLICY IF EXISTS "students_admin_insert" ON students;
CREATE POLICY "students_admin_insert" ON students FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "students_admin_update" ON students;
CREATE POLICY "students_admin_update" ON students FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "students_admin_delete" ON students;
CREATE POLICY "students_admin_delete" ON students FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "students_teacher_insert" ON students;
CREATE POLICY "students_teacher_insert" ON students FOR INSERT
TO authenticated
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);

DROP POLICY IF EXISTS "students_teacher_update" ON students;
CREATE POLICY "students_teacher_update" ON students FOR UPDATE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
)
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);

-- ============================================================
-- 4. TEACHERS POLICIES (No recursion)
-- ============================================================
DROP POLICY IF EXISTS "teachers_select_admin" ON teachers;
CREATE POLICY "teachers_select_admin" ON teachers FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "teachers_select_own" ON teachers;
CREATE POLICY "teachers_select_own" ON teachers FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "teachers_select_parent" ON teachers;
CREATE POLICY "teachers_select_parent" ON teachers FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND id = ANY(get_parent_teacher_ids())
);

DROP POLICY IF EXISTS "teachers_admin_insert" ON teachers;
CREATE POLICY "teachers_admin_insert" ON teachers FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "teachers_admin_update" ON teachers;
CREATE POLICY "teachers_admin_update" ON teachers FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "teachers_admin_delete" ON teachers;
CREATE POLICY "teachers_admin_delete" ON teachers FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- 5. PARENTS POLICIES (No recursion)
-- ============================================================
DROP POLICY IF EXISTS "parents_select_admin" ON parents;
CREATE POLICY "parents_select_admin" ON parents FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "parents_select_own" ON parents;
CREATE POLICY "parents_select_own" ON parents FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "parents_select_teacher" ON parents;
CREATE POLICY "parents_select_teacher" ON parents FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND id = ANY(get_teacher_parent_ids())
);

DROP POLICY IF EXISTS "parents_admin_insert" ON parents;
CREATE POLICY "parents_admin_insert" ON parents FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "parents_admin_update" ON parents;
CREATE POLICY "parents_admin_update" ON parents FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "parents_admin_delete" ON parents;
CREATE POLICY "parents_admin_delete" ON parents FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- 6. PARENT_STUDENTS POLICIES (No recursion)
-- ============================================================
DROP POLICY IF EXISTS "parent_students_select_admin" ON parent_students;
CREATE POLICY "parent_students_select_admin" ON parent_students FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "parent_students_select_parent" ON parent_students;
CREATE POLICY "parent_students_select_parent" ON parent_students FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND student_id = ANY(get_parent_student_ids())
);

DROP POLICY IF EXISTS "parent_students_select_teacher" ON parent_students;
CREATE POLICY "parent_students_select_teacher" ON parent_students FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND parent_id = ANY(get_teacher_parent_ids())
);

DROP POLICY IF EXISTS "parent_students_admin_insert" ON parent_students;
CREATE POLICY "parent_students_admin_insert" ON parent_students FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "parent_students_admin_delete" ON parent_students;
CREATE POLICY "parent_students_admin_delete" ON parent_students FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- 7. FEES & FEE_PAYMENTS POLICIES (No recursion)
-- ============================================================
DROP POLICY IF EXISTS "fees_select_admin" ON fees;
CREATE POLICY "fees_select_admin" ON fees FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fees_select_parent" ON fees;
CREATE POLICY "fees_select_parent" ON fees FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND student_id = ANY(get_parent_student_ids())
);

DROP POLICY IF EXISTS "fees_admin_insert" ON fees;
CREATE POLICY "fees_admin_insert" ON fees FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fees_admin_update" ON fees;
CREATE POLICY "fees_admin_update" ON fees FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fees_admin_delete" ON fees;
CREATE POLICY "fees_admin_delete" ON fees FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fee_payments_select_admin" ON fee_payments;
CREATE POLICY "fee_payments_select_admin" ON fee_payments FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fee_payments_select_parent" ON fee_payments;
CREATE POLICY "fee_payments_select_parent" ON fee_payments FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND student_id = ANY(get_parent_student_ids())
);

-- ============================================================
-- 8. ATTENDANCE POLICIES (No recursion)
-- ============================================================
DROP POLICY IF EXISTS "attendance_select_admin" ON attendance;
CREATE POLICY "attendance_select_admin" ON attendance FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "attendance_select_teacher" ON attendance;
CREATE POLICY "attendance_select_teacher" ON attendance FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);

DROP POLICY IF EXISTS "attendance_select_parent" ON attendance;
CREATE POLICY "attendance_select_parent" ON attendance FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND student_id = ANY(get_parent_student_ids())
);

DROP POLICY IF EXISTS "attendance_insert_teacher" ON attendance;
CREATE POLICY "attendance_insert_teacher" ON attendance FOR INSERT
TO authenticated
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);

DROP POLICY IF EXISTS "attendance_update_teacher" ON attendance;
CREATE POLICY "attendance_update_teacher" ON attendance FOR UPDATE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
)
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);

DROP POLICY IF EXISTS "attendance_delete_teacher" ON attendance;
CREATE POLICY "attendance_delete_teacher" ON attendance FOR DELETE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);

-- ============================================================
-- 9. STUDENT_RECORDS & REMARKS POLICIES (No recursion)
-- ============================================================
DROP POLICY IF EXISTS "student_records_select_admin" ON student_records;
CREATE POLICY "student_records_select_admin" ON student_records FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "student_records_select_teacher" ON student_records;
CREATE POLICY "student_records_select_teacher" ON student_records FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND student_id = ANY(
    SELECT s.id FROM students s WHERE s.section_id = ANY(get_teacher_section_ids())
  )
);

DROP POLICY IF EXISTS "student_records_select_parent" ON student_records;
CREATE POLICY "student_records_select_parent" ON student_records FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND student_id = ANY(get_parent_student_ids())
);

DROP POLICY IF EXISTS "remarks_select_admin" ON remarks;
CREATE POLICY "remarks_select_admin" ON remarks FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "remarks_select_teacher" ON remarks;
CREATE POLICY "remarks_select_teacher" ON remarks FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND student_id = ANY(
    SELECT s.id FROM students s WHERE s.section_id = ANY(get_teacher_section_ids())
  )
);

DROP POLICY IF EXISTS "remarks_select_parent" ON remarks;
CREATE POLICY "remarks_select_parent" ON remarks FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND student_id = ANY(get_parent_student_ids())
);

-- ============================================================
-- 10. EXAM_DEFS POLICIES (No recursion)
-- ============================================================
DROP POLICY IF EXISTS "exam_defs_teacher_insert" ON exam_defs;
CREATE POLICY "exam_defs_teacher_insert" ON exam_defs FOR INSERT
TO authenticated
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);

DROP POLICY IF EXISTS "exam_defs_teacher_update" ON exam_defs;
CREATE POLICY "exam_defs_teacher_update" ON exam_defs FOR UPDATE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
)
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);

DROP POLICY IF EXISTS "exam_defs_teacher_delete" ON exam_defs;
CREATE POLICY "exam_defs_teacher_delete" ON exam_defs FOR DELETE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND section_id = ANY(get_teacher_section_ids())
);
