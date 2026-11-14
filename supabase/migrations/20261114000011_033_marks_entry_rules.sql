-- ============================================================
-- 033: Who creates exams and who enters marks
--
-- * Exams are created only by the office (Exams module). Teachers can no
--   longer create, edit or delete exam_defs.
-- * A subject teacher enters marks only for the subject they teach in
--   that section; the class teacher (assignment with no subject) enters
--   marks for every subject of their section.
-- ============================================================

DROP POLICY IF EXISTS "exam_defs_teacher_insert" ON exam_defs;
DROP POLICY IF EXISTS "exam_defs_teacher_update" ON exam_defs;
DROP POLICY IF EXISTS "exam_defs_teacher_delete" ON exam_defs;

-- True when the calling teacher may enter marks for this student + subject.
CREATE OR REPLACE FUNCTION can_enter_marks(p_student uuid, p_subject uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM students s
    JOIN class_assignments ca ON ca.section_id = s.section_id
    JOIN teachers t ON t.id = ca.teacher_id
    WHERE s.id = p_student
      AND t.user_id = auth.uid()
      AND t.status = 'active'
      AND (ca.subject_id IS NULL                        -- class teacher: all subjects
           OR (p_subject IS NOT NULL AND ca.subject_id = p_subject))  -- subject teacher
  );
$$;
REVOKE ALL ON FUNCTION can_enter_marks(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_enter_marks(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "student_records_insert_teacher" ON student_records;
CREATE POLICY "student_records_insert_teacher" ON student_records FOR INSERT TO authenticated
  WITH CHECK (is_teacher() AND school_id = get_current_school_id() AND can_enter_marks(student_id, subject_id));

DROP POLICY IF EXISTS "student_records_update_teacher" ON student_records;
CREATE POLICY "student_records_update_teacher" ON student_records FOR UPDATE TO authenticated
  USING (is_teacher() AND school_id = get_current_school_id() AND can_enter_marks(student_id, subject_id))
  WITH CHECK (is_teacher() AND school_id = get_current_school_id() AND can_enter_marks(student_id, subject_id));

DROP POLICY IF EXISTS "student_records_delete_teacher" ON student_records;
CREATE POLICY "student_records_delete_teacher" ON student_records FOR DELETE TO authenticated
  USING (is_teacher() AND school_id = get_current_school_id() AND can_enter_marks(student_id, subject_id));
