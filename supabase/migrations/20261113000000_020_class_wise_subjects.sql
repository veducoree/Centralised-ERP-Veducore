/*
  # 020 — Class-wise subjects

  Subjects now belong to a class. Admin creates classes first, then adds the
  subjects for a class from the Subjects module and picks which of that class's
  sections study each subject (section_subjects).

  Teachers are then allotted (class, section, subject) rows in class_assignments,
  choosing only from the subjects that exist for that section.

  This migration CLEARS all existing subject data:
    - subject-teacher rows in class_assignments (class-teacher rows are kept)
    - section_subjects
    - subjects
    - the free-text teachers.subject column
  teacher_schedules.subject_id and student_records.subject_id become NULL via
  their existing ON DELETE SET NULL (student_records keeps subject_name).
*/

-- ── 1. Clear old subject data ───────────────────────────────────────────────
-- Delete subject-teacher rows first; otherwise ON DELETE SET NULL would turn
-- them into class-teacher rows (subject_id IS NULL means class teacher).
DELETE FROM class_assignments WHERE subject_id IS NOT NULL;
DELETE FROM section_subjects;
DELETE FROM subjects;
UPDATE teachers SET subject = NULL WHERE subject IS NOT NULL;

-- ── 2. subjects.class_id ───────────────────────────────────────────────────
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE subjects ALTER COLUMN class_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_class_id ON subjects(class_id);

-- Name was unique per school; now it is unique per class.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.subjects'::regclass
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) = 'UNIQUE (school_id, name)'
  LOOP
    EXECUTE format('ALTER TABLE subjects DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subjects'::regclass AND conname = 'subjects_class_id_name_key'
  ) THEN
    ALTER TABLE subjects ADD CONSTRAINT subjects_class_id_name_key UNIQUE (class_id, name);
  END IF;
END $$;

-- ── 3. class_assignments.subject_id: cascade instead of SET NULL ─────────────
-- Deleting a subject must remove its teacher allotments, not convert them into
-- class-teacher rows.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.class_assignments'::regclass
      AND con.contype = 'f'
      AND att.attname = 'subject_id'
  LOOP
    EXECUTE format('ALTER TABLE class_assignments DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE class_assignments
  ADD CONSTRAINT class_assignments_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
