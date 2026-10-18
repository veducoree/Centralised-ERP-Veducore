/*
# School ERP - Row Level Security Policies (complete, fixed)

Comprehensive RLS policies for all tables:
- School-level data isolation
- Role-based: admin (full), teacher (assigned sections), parent (linked children)
*/

-- ============================================================
-- PROFILES
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_select_school" ON profiles;
CREATE POLICY "profiles_select_school" ON profiles FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE
TO authenticated
USING (is_admin() AND school_id = get_current_school_id())
WITH CHECK (is_admin() AND school_id = get_current_school_id());

-- ============================================================
-- SCHOOLS
-- ============================================================
DROP POLICY IF EXISTS "schools_admin_all" ON schools;
CREATE POLICY "schools_admin_all" ON schools FOR SELECT
TO authenticated
USING (id = get_current_school_id());

-- ============================================================
-- SUBJECTS
-- ============================================================
DROP POLICY IF EXISTS "subjects_select_school" ON subjects;
CREATE POLICY "subjects_select_school" ON subjects FOR SELECT
TO authenticated
USING (school_id = get_current_school_id());

DROP POLICY IF EXISTS "subjects_admin_insert" ON subjects;
CREATE POLICY "subjects_admin_insert" ON subjects FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "subjects_admin_update" ON subjects;
CREATE POLICY "subjects_admin_update" ON subjects FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "subjects_admin_delete" ON subjects;
CREATE POLICY "subjects_admin_delete" ON subjects FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- CLASSES
-- ============================================================
DROP POLICY IF EXISTS "classes_select_school" ON classes;
CREATE POLICY "classes_select_school" ON classes FOR SELECT
TO authenticated
USING (school_id = get_current_school_id());

DROP POLICY IF EXISTS "classes_admin_insert" ON classes;
CREATE POLICY "classes_admin_insert" ON classes FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "classes_admin_update" ON classes;
CREATE POLICY "classes_admin_update" ON classes FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "classes_admin_delete" ON classes;
CREATE POLICY "classes_admin_delete" ON classes FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- SECTIONS
-- ============================================================
DROP POLICY IF EXISTS "sections_select_school" ON sections;
CREATE POLICY "sections_select_school" ON sections FOR SELECT
TO authenticated
USING (school_id = get_current_school_id());

DROP POLICY IF EXISTS "sections_admin_insert" ON sections;
CREATE POLICY "sections_admin_insert" ON sections FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "sections_admin_update" ON sections;
CREATE POLICY "sections_admin_update" ON sections FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "sections_admin_delete" ON sections;
CREATE POLICY "sections_admin_delete" ON sections FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- SECTION_SUBJECTS
-- ============================================================
DROP POLICY IF EXISTS "section_subjects_select_school" ON section_subjects;
CREATE POLICY "section_subjects_select_school" ON section_subjects FOR SELECT
TO authenticated
USING (school_id = get_current_school_id());

DROP POLICY IF EXISTS "section_subjects_admin_insert" ON section_subjects;
CREATE POLICY "section_subjects_admin_insert" ON section_subjects FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "section_subjects_admin_delete" ON section_subjects;
CREATE POLICY "section_subjects_admin_delete" ON section_subjects FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- TEACHERS
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
  is_parent() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM class_assignments ca
    JOIN parent_students ps ON ps.student_id IN (
      SELECT s.id FROM students s
      JOIN parent_students ps2 ON ps2.student_id = s.id
      JOIN parents p ON p.id = ps2.parent_id
      WHERE p.user_id = auth.uid()
    )
    WHERE ca.teacher_id = teachers.id
  )
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
-- PARENTS
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
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN students s ON s.id = ps.student_id
    JOIN class_assignments ca ON ca.section_id = s.section_id
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE ps.parent_id = parents.id AND t.user_id = auth.uid()
  )
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
-- STUDENTS
-- ============================================================
DROP POLICY IF EXISTS "students_select_admin" ON students;
CREATE POLICY "students_select_admin" ON students FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "students_select_teacher" ON students;
CREATE POLICY "students_select_teacher" ON students FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM class_assignments ca
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE ca.section_id = students.section_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "students_select_parent" ON students;
CREATE POLICY "students_select_parent" ON students FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE ps.student_id = students.id AND p.user_id = auth.uid()
  )
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

-- ============================================================
-- PARENT_STUDENTS
-- ============================================================
DROP POLICY IF EXISTS "parent_students_select_admin" ON parent_students;
CREATE POLICY "parent_students_select_admin" ON parent_students FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "parent_students_select_parent" ON parent_students;
CREATE POLICY "parent_students_select_parent" ON parent_students FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM parents p WHERE p.id = parent_students.parent_id AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "parent_students_select_teacher" ON parent_students;
CREATE POLICY "parent_students_select_teacher" ON parent_students FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM class_assignments ca
    JOIN teachers t ON t.id = ca.teacher_id
    JOIN students s ON s.id = parent_students.student_id
    WHERE ca.section_id = s.section_id AND t.user_id = auth.uid()
  )
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
-- CLASS_ASSIGNMENTS
-- ============================================================
DROP POLICY IF EXISTS "class_assignments_select_admin" ON class_assignments;
CREATE POLICY "class_assignments_select_admin" ON class_assignments FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "class_assignments_select_teacher" ON class_assignments;
CREATE POLICY "class_assignments_select_teacher" ON class_assignments FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM teachers t WHERE t.id = class_assignments.teacher_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "class_assignments_select_parent" ON class_assignments;
CREATE POLICY "class_assignments_select_parent" ON class_assignments FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    JOIN students s ON s.id = ps.student_id
    WHERE p.user_id = auth.uid() AND s.section_id = class_assignments.section_id
  )
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
-- TEACHER_SCHEDULES
-- ============================================================
DROP POLICY IF EXISTS "teacher_schedules_select_admin" ON teacher_schedules;
CREATE POLICY "teacher_schedules_select_admin" ON teacher_schedules FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "teacher_schedules_select_teacher" ON teacher_schedules;
CREATE POLICY "teacher_schedules_select_teacher" ON teacher_schedules FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM teachers t WHERE t.id = teacher_schedules.teacher_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "teacher_schedules_select_parent" ON teacher_schedules;
CREATE POLICY "teacher_schedules_select_parent" ON teacher_schedules FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    JOIN students s ON s.id = ps.student_id
    WHERE p.user_id = auth.uid() AND s.section_id = teacher_schedules.section_id
  )
);

DROP POLICY IF EXISTS "teacher_schedules_admin_insert" ON teacher_schedules;
CREATE POLICY "teacher_schedules_admin_insert" ON teacher_schedules FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "teacher_schedules_admin_update" ON teacher_schedules;
CREATE POLICY "teacher_schedules_admin_update" ON teacher_schedules FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "teacher_schedules_admin_delete" ON teacher_schedules;
CREATE POLICY "teacher_schedules_admin_delete" ON teacher_schedules FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- ATTENDANCE
-- ============================================================
DROP POLICY IF EXISTS "attendance_select_admin" ON attendance;
CREATE POLICY "attendance_select_admin" ON attendance FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "attendance_select_teacher" ON attendance;
CREATE POLICY "attendance_select_teacher" ON attendance FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM class_assignments ca
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE ca.section_id = attendance.section_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "attendance_select_parent" ON attendance;
CREATE POLICY "attendance_select_parent" ON attendance FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE ps.student_id = attendance.student_id AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "attendance_insert_teacher" ON attendance;
CREATE POLICY "attendance_insert_teacher" ON attendance FOR INSERT
TO authenticated
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM class_assignments ca
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE ca.section_id = attendance.section_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "attendance_update_teacher" ON attendance;
CREATE POLICY "attendance_update_teacher" ON attendance FOR UPDATE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM class_assignments ca
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE ca.section_id = attendance.section_id AND t.user_id = auth.uid()
  )
)
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM class_assignments ca
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE ca.section_id = attendance.section_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "attendance_delete_teacher" ON attendance;
CREATE POLICY "attendance_delete_teacher" ON attendance FOR DELETE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM class_assignments ca
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE ca.section_id = attendance.section_id AND t.user_id = auth.uid()
  )
);

-- ============================================================
-- STUDENT_RECORDS
-- ============================================================
DROP POLICY IF EXISTS "student_records_select_admin" ON student_records;
CREATE POLICY "student_records_select_admin" ON student_records FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "student_records_select_teacher" ON student_records;
CREATE POLICY "student_records_select_teacher" ON student_records FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM students s
    JOIN class_assignments ca ON ca.section_id = s.section_id
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE s.id = student_records.student_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "student_records_select_parent" ON student_records;
CREATE POLICY "student_records_select_parent" ON student_records FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE ps.student_id = student_records.student_id AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "student_records_insert_teacher" ON student_records;
CREATE POLICY "student_records_insert_teacher" ON student_records FOR INSERT
TO authenticated
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM students s
    JOIN class_assignments ca ON ca.section_id = s.section_id
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE s.id = student_records.student_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "student_records_update_teacher" ON student_records;
CREATE POLICY "student_records_update_teacher" ON student_records FOR UPDATE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM students s
    JOIN class_assignments ca ON ca.section_id = s.section_id
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE s.id = student_records.student_id AND t.user_id = auth.uid()
  )
)
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM students s
    JOIN class_assignments ca ON ca.section_id = s.section_id
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE s.id = student_records.student_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "student_records_delete_teacher" ON student_records;
CREATE POLICY "student_records_delete_teacher" ON student_records FOR DELETE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM students s
    JOIN class_assignments ca ON ca.section_id = s.section_id
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE s.id = student_records.student_id AND t.user_id = auth.uid()
  )
);

-- ============================================================
-- REMARKS
-- ============================================================
DROP POLICY IF EXISTS "remarks_select_admin" ON remarks;
CREATE POLICY "remarks_select_admin" ON remarks FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "remarks_select_teacher" ON remarks;
CREATE POLICY "remarks_select_teacher" ON remarks FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM students s
    JOIN class_assignments ca ON ca.section_id = s.section_id
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE s.id = remarks.student_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "remarks_select_parent" ON remarks;
CREATE POLICY "remarks_select_parent" ON remarks FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id()
  AND visibility != 'staff_only'
  AND EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE ps.student_id = remarks.student_id AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "remarks_insert_teacher" ON remarks;
CREATE POLICY "remarks_insert_teacher" ON remarks FOR INSERT
TO authenticated
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM students s
    JOIN class_assignments ca ON ca.section_id = s.section_id
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE s.id = remarks.student_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "remarks_update_teacher" ON remarks;
CREATE POLICY "remarks_update_teacher" ON remarks FOR UPDATE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM teachers t WHERE t.id = remarks.teacher_id AND t.user_id = auth.uid()
  )
)
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM teachers t WHERE t.id = remarks.teacher_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "remarks_delete_teacher" ON remarks;
CREATE POLICY "remarks_delete_teacher" ON remarks FOR DELETE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM teachers t WHERE t.id = remarks.teacher_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "remarks_delete_admin" ON remarks;
CREATE POLICY "remarks_delete_admin" ON remarks FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- FEES
-- ============================================================
DROP POLICY IF EXISTS "fees_select_admin" ON fees;
CREATE POLICY "fees_select_admin" ON fees FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fees_select_parent" ON fees;
CREATE POLICY "fees_select_parent" ON fees FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE ps.student_id = fees.student_id AND p.user_id = auth.uid()
  )
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

-- ============================================================
-- FEE_PAYMENTS
-- ============================================================
DROP POLICY IF EXISTS "fee_payments_select_admin" ON fee_payments;
CREATE POLICY "fee_payments_select_admin" ON fee_payments FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fee_payments_select_parent" ON fee_payments;
CREATE POLICY "fee_payments_select_parent" ON fee_payments FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN parents p ON p.id = ps.parent_id
    WHERE ps.student_id = fee_payments.student_id AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "fee_payments_admin_insert" ON fee_payments;
CREATE POLICY "fee_payments_admin_insert" ON fee_payments FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_select_admin" ON notifications;
CREATE POLICY "notifications_select_admin" ON notifications FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "notifications_insert_admin" ON notifications;
CREATE POLICY "notifications_insert_admin" ON notifications FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete_admin" ON notifications;
CREATE POLICY "notifications_delete_admin" ON notifications FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- AUDIT_LOGS
-- ============================================================
DROP POLICY IF EXISTS "audit_logs_select_admin" ON audit_logs;
CREATE POLICY "audit_logs_select_admin" ON audit_logs FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
CREATE POLICY "avatars_auth_insert" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
CREATE POLICY "avatars_auth_update" ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_auth_delete" ON storage.objects;
CREATE POLICY "avatars_auth_delete" ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');
