-- ============================================================
-- Migration 043: Admissions are admin-only
--
-- New students (admission, quick add, bulk import) are added only by the
-- school office (admin). Teachers can view their students; the class
-- teacher may still update their own students (e.g. the photo), subject
-- teachers cannot.
--
-- Also adds student columns the admission form collects but had nowhere
-- to go (parent phone, WhatsApp, previous school, TC).
-- Idempotent.
-- ============================================================

-- ── 1. Columns ───────────────────────────────────────────────
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone    text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS whatsapp_number text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_school text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_board  text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS tc_number       text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS tc_date         date;


-- ── 2. Class-teacher sections of the signed-in teacher ───────
CREATE OR REPLACE FUNCTION get_class_teacher_section_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT ca.section_id), ARRAY[]::uuid[])
  FROM class_assignments ca
  JOIN teachers t ON t.id = ca.teacher_id
  WHERE t.user_id = auth.uid()
    AND ca.subject_id IS NULL
    AND ca.section_id IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION get_class_teacher_section_ids() TO authenticated;


-- ── 3. Teacher write access to students ──────────────────────
-- No inserts by teachers at all (admins keep students_admin_insert).
DROP POLICY IF EXISTS "students_teacher_insert" ON students;

-- Updates only by the class teacher, and only within their section.
DROP POLICY IF EXISTS "students_teacher_update" ON students;
CREATE POLICY "students_teacher_update" ON students FOR UPDATE
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id()
  AND section_id = ANY(get_class_teacher_section_ids())
)
WITH CHECK (
  is_teacher() AND school_id = get_current_school_id()
  AND section_id = ANY(get_class_teacher_section_ids())
);

-- Drop the teacher admission RPC if an earlier draft of this migration created it.
DROP FUNCTION IF EXISTS admit_student(jsonb);
