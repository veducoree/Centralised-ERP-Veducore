/*
# Migration 006: Fix triggers on new tables (005 partial failure repair)

Migration 005 failed at the trigger step because the function was named
set_updated_at() but the actual function is update_updated_at_column().

This migration:
1. Safely adds any missing columns/tables from 005
2. Creates correct triggers using update_updated_at_column()
3. Re-applies all RLS policies from 005 (idempotent)
*/

-- ============================================================
-- STUDENTS: missing columns (safe re-run)
-- ============================================================
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS father_name  text,
  ADD COLUMN IF NOT EXISTS mother_name  text,
  ADD COLUMN IF NOT EXISTS parent_email text;

-- ============================================================
-- HOLIDAYS: create table if not exists + correct trigger
-- ============================================================
CREATE TABLE IF NOT EXISTS holidays (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  type       text        NOT NULL CHECK (type IN ('working', 'holiday', 'festival')),
  label      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, date)
);
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at_holidays ON holidays;
CREATE TRIGGER set_updated_at_holidays
  BEFORE UPDATE ON holidays
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "holidays_admin_all"      ON holidays;
CREATE POLICY "holidays_admin_all" ON holidays FOR ALL TO authenticated
  USING  (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "holidays_teacher_select" ON holidays;
CREATE POLICY "holidays_teacher_select" ON holidays FOR SELECT TO authenticated
  USING (is_teacher() AND school_id = get_current_school_id());

DROP POLICY IF EXISTS "holidays_parent_select"  ON holidays;
CREATE POLICY "holidays_parent_select" ON holidays FOR SELECT TO authenticated
  USING (is_parent() AND school_id = get_current_school_id());

-- ============================================================
-- EXAM_DEFS: create table if not exists + correct trigger
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_defs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  section_id            uuid        NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  exam_name             text        NOT NULL,
  record_type           text        NOT NULL,
  max_marks             numeric     NOT NULL DEFAULT 100,
  date                  date        NOT NULL DEFAULT CURRENT_DATE,
  created_by_teacher_id uuid        REFERENCES teachers(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE exam_defs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_exam_defs_school_id  ON exam_defs (school_id);
CREATE INDEX IF NOT EXISTS idx_exam_defs_section_id ON exam_defs (section_id);

DROP TRIGGER IF EXISTS set_updated_at_exam_defs ON exam_defs;
CREATE TRIGGER set_updated_at_exam_defs
  BEFORE UPDATE ON exam_defs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "exam_defs_select_school"  ON exam_defs;
CREATE POLICY "exam_defs_select_school" ON exam_defs FOR SELECT TO authenticated
  USING (school_id = get_current_school_id());

DROP POLICY IF EXISTS "exam_defs_admin_all"      ON exam_defs;
CREATE POLICY "exam_defs_admin_all" ON exam_defs FOR ALL TO authenticated
  USING  (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "exam_defs_teacher_insert" ON exam_defs;
CREATE POLICY "exam_defs_teacher_insert" ON exam_defs FOR INSERT TO authenticated
  WITH CHECK (
    is_teacher() AND school_id = get_current_school_id()
    AND EXISTS (
      SELECT 1 FROM class_assignments ca
      JOIN teachers t ON t.id = ca.teacher_id
      WHERE ca.section_id = exam_defs.section_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "exam_defs_teacher_update" ON exam_defs;
CREATE POLICY "exam_defs_teacher_update" ON exam_defs FOR UPDATE TO authenticated
  USING (
    is_teacher() AND school_id = get_current_school_id()
    AND EXISTS (
      SELECT 1 FROM class_assignments ca
      JOIN teachers t ON t.id = ca.teacher_id
      WHERE ca.section_id = exam_defs.section_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_teacher() AND school_id = get_current_school_id()
    AND EXISTS (
      SELECT 1 FROM class_assignments ca
      JOIN teachers t ON t.id = ca.teacher_id
      WHERE ca.section_id = exam_defs.section_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "exam_defs_teacher_delete" ON exam_defs;
CREATE POLICY "exam_defs_teacher_delete" ON exam_defs FOR DELETE TO authenticated
  USING (
    is_teacher() AND school_id = get_current_school_id()
    AND EXISTS (
      SELECT 1 FROM class_assignments ca
      JOIN teachers t ON t.id = ca.teacher_id
      WHERE ca.section_id = exam_defs.section_id AND t.user_id = auth.uid()
    )
  );

-- ============================================================
-- FEE_STRUCTURES: create table if not exists + correct trigger
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_structures (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  fee_type      text        NOT NULL,
  class_id      uuid        REFERENCES classes(id) ON DELETE SET NULL,
  amount        numeric     NOT NULL DEFAULT 0,
  frequency     text        NOT NULL CHECK (frequency IN ('one_time','monthly','quarterly','annual')),
  due_day       int,
  academic_year text        NOT NULL DEFAULT '2025-2026',
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name, academic_year)
);
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at_fee_structures ON fee_structures;
CREATE TRIGGER set_updated_at_fee_structures
  BEFORE UPDATE ON fee_structures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "fee_structures_admin_all" ON fee_structures;
CREATE POLICY "fee_structures_admin_all" ON fee_structures FOR ALL TO authenticated
  USING  (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "fee_structures_teacher_select" ON fee_structures;
CREATE POLICY "fee_structures_teacher_select" ON fee_structures FOR SELECT TO authenticated
  USING (is_teacher() AND school_id = get_current_school_id());

DROP POLICY IF EXISTS "fee_structures_parent_select" ON fee_structures;
CREATE POLICY "fee_structures_parent_select" ON fee_structures FOR SELECT TO authenticated
  USING (is_parent() AND school_id = get_current_school_id());

-- ============================================================
-- PAYMENT_SETUPS: create table if not exists + correct trigger
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_setups (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid        NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
  razorpay_key_id     text,
  account_holder_name text,
  bank_name           text,
  account_number      text,
  ifsc_code           text,
  is_verified         boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payment_setups ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at_payment_setups ON payment_setups;
CREATE TRIGGER set_updated_at_payment_setups
  BEFORE UPDATE ON payment_setups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "payment_setups_admin_all" ON payment_setups;
CREATE POLICY "payment_setups_admin_all" ON payment_setups FOR ALL TO authenticated
  USING  (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());

-- ============================================================
-- STUDENTS: teacher INSERT/UPDATE policies
-- ============================================================
DROP POLICY IF EXISTS "students_teacher_insert" ON students;
CREATE POLICY "students_teacher_insert" ON students FOR INSERT TO authenticated
  WITH CHECK (
    is_teacher() AND school_id = get_current_school_id()
    AND EXISTS (
      SELECT 1 FROM class_assignments ca
      JOIN teachers t ON t.id = ca.teacher_id
      WHERE ca.section_id = students.section_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "students_teacher_update" ON students;
CREATE POLICY "students_teacher_update" ON students FOR UPDATE TO authenticated
  USING (
    is_teacher() AND school_id = get_current_school_id()
    AND EXISTS (
      SELECT 1 FROM class_assignments ca
      JOIN teachers t ON t.id = ca.teacher_id
      WHERE ca.section_id = students.section_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_teacher() AND school_id = get_current_school_id()
    AND EXISTS (
      SELECT 1 FROM class_assignments ca
      JOIN teachers t ON t.id = ca.teacher_id
      WHERE ca.section_id = students.section_id AND t.user_id = auth.uid()
    )
  );
