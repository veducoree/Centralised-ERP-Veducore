-- ============================================================
-- 039: Indexes for foreign-key columns that RLS policies and joins
-- filter on but had no index. Only adds indexes; no data changes.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_section_subjects_school ON section_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_class_assignments_class ON class_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_schedules_class ON teacher_schedules(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher ON attendance(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON attendance(school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_fee_structures_class ON fee_structures(class_id);
CREATE INDEX IF NOT EXISTS idx_sidebar_preferences_school ON sidebar_preferences(school_id);
CREATE INDEX IF NOT EXISTS idx_student_transport_assignments_fee ON student_transport_assignments(fee_id);
CREATE INDEX IF NOT EXISTS idx_timetable_substitutions_class ON timetable_substitutions(class_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_school ON push_tokens(school_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_school ON student_enrollments(school_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_section ON student_enrollments(section_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_class ON student_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_classes_class ON exam_classes(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_schedule_class ON exam_schedule(class_id);
-- Marks lookups: one subject of one exam across a section's students.
CREATE INDEX IF NOT EXISTS idx_student_records_subject_exam ON student_records(subject_id, exam_name);
