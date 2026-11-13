/*
  # 021 — Timetable

  1. timetable_periods: the school's bell schedule (Period 1, Period 2, Lunch …).
     Every timetable slot points at a period, so changing a period's time moves
     every slot that uses it.
  2. teacher_schedules.period_id: links a slot to a period. Old rows without a
     period keep working (period_id stays NULL).
  3. Clash guard on teacher_schedules: a teacher cannot be in two places at the
     same time, and a section cannot have two classes at the same time.
  4. timetable_substitutions: when a teacher is absent, admin puts a free teacher
     on that teacher's slot for one date. The DB checks the substitute is free.

  Working days are stored in schools.settings.timetable_days (int[] of JS
  weekdays, 0 = Sunday); no schema change needed for that.
*/

-- ── 1. Periods ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable_periods (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  start_time  time        NOT NULL,
  end_time    time        NOT NULL,
  is_break    boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_timetable_periods_school_id ON timetable_periods(school_id);

DROP TRIGGER IF EXISTS set_updated_at ON timetable_periods;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON timetable_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE timetable_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timetable_periods_select_school" ON timetable_periods;
CREATE POLICY "timetable_periods_select_school" ON timetable_periods FOR SELECT
TO authenticated
USING (school_id = get_current_school_id());

DROP POLICY IF EXISTS "timetable_periods_admin_insert" ON timetable_periods;
CREATE POLICY "timetable_periods_admin_insert" ON timetable_periods FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "timetable_periods_admin_update" ON timetable_periods;
CREATE POLICY "timetable_periods_admin_update" ON timetable_periods FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "timetable_periods_admin_delete" ON timetable_periods;
CREATE POLICY "timetable_periods_admin_delete" ON timetable_periods FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

-- Periods of one school must not overlap.
CREATE OR REPLACE FUNCTION timetable_periods_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE other_name text;
BEGIN
  SELECT p.name INTO other_name
  FROM timetable_periods p
  WHERE p.school_id = NEW.school_id
    AND p.id <> NEW.id
    AND p.start_time < NEW.end_time
    AND p.end_time > NEW.start_time
  LIMIT 1;
  IF other_name IS NOT NULL THEN
    RAISE EXCEPTION '"%" overlaps with "%". Periods cannot share time.', NEW.name, other_name
      USING ERRCODE = '23P01';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.is_break AND NOT OLD.is_break
     AND EXISTS (SELECT 1 FROM teacher_schedules ts WHERE ts.period_id = NEW.id) THEN
    RAISE EXCEPTION '"%" already has classes in the timetable. Clear them before making it a break.', NEW.name
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS timetable_periods_check ON timetable_periods;
CREATE TRIGGER timetable_periods_check BEFORE INSERT OR UPDATE ON timetable_periods
  FOR EACH ROW EXECUTE FUNCTION timetable_periods_check();

-- ── 2. teacher_schedules.period_id ─────────────────────────────────────────
ALTER TABLE teacher_schedules
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES timetable_periods(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_teacher_schedules_period_id ON teacher_schedules(period_id);
CREATE INDEX IF NOT EXISTS idx_teacher_schedules_section_id ON teacher_schedules(section_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_teacher_schedules_section_slot
  ON teacher_schedules(section_id, day_of_week, period_id) WHERE period_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_teacher_schedules_teacher_slot
  ON teacher_schedules(teacher_id, day_of_week, period_id) WHERE period_id IS NOT NULL;

-- Moving a period's time moves every slot that uses it.
CREATE OR REPLACE FUNCTION timetable_periods_sync_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
    UPDATE teacher_schedules
      SET start_time = NEW.start_time, end_time = NEW.end_time
      WHERE period_id = NEW.id;
    UPDATE timetable_substitutions
      SET start_time = NEW.start_time, end_time = NEW.end_time
      WHERE period_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Clash guard ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION teacher_schedules_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  per   timetable_periods%ROWTYPE;
  clash record;
BEGIN
  IF NEW.period_id IS NOT NULL THEN
    SELECT * INTO per FROM timetable_periods WHERE id = NEW.period_id;
    IF per.is_break THEN
      RAISE EXCEPTION '"%" is a break. Classes cannot be placed in it.', per.name USING ERRCODE = '23514';
    END IF;
    NEW.start_time := per.start_time;
    NEW.end_time   := per.end_time;
  END IF;

  -- A period time change (cascaded from timetable_periods) moves all slots of
  -- that period together; it cannot create a new clash, so skip the checks.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT c.name AS class_name, s.name AS section_name INTO clash
  FROM teacher_schedules ts
  JOIN classes c  ON c.id = ts.class_id
  JOIN sections s ON s.id = ts.section_id
  WHERE ts.teacher_id = NEW.teacher_id
    AND ts.day_of_week = NEW.day_of_week
    AND ts.id <> NEW.id
    AND ts.start_time < NEW.end_time
    AND ts.end_time > NEW.start_time
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Teacher clash: this teacher already teaches % - % at this time.', clash.class_name, clash.section_name
      USING ERRCODE = '23P01';
  END IF;

  SELECT t.full_name AS teacher_name, sub.name AS subject_name INTO clash
  FROM teacher_schedules ts
  JOIN teachers t ON t.id = ts.teacher_id
  LEFT JOIN subjects sub ON sub.id = ts.subject_id
  WHERE ts.section_id = NEW.section_id
    AND ts.day_of_week = NEW.day_of_week
    AND ts.id <> NEW.id
    AND ts.start_time < NEW.end_time
    AND ts.end_time > NEW.start_time
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Section clash: this section already has % (%) at this time.',
      COALESCE(clash.subject_name, 'a class'), clash.teacher_name
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teacher_schedules_check ON teacher_schedules;
CREATE TRIGGER teacher_schedules_check BEFORE INSERT OR UPDATE ON teacher_schedules
  FOR EACH ROW EXECUTE FUNCTION teacher_schedules_check();

-- Parent policy used nested joins; use the SECURITY DEFINER helper from 010
-- like the other parent policies so it cannot recurse.
DROP POLICY IF EXISTS "teacher_schedules_select_parent" ON teacher_schedules;
CREATE POLICY "teacher_schedules_select_parent" ON teacher_schedules FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND section_id = ANY(get_parent_section_ids())
);

-- ── 4. Substitutions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable_substitutions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  date                  date        NOT NULL,
  schedule_id           uuid        NOT NULL REFERENCES teacher_schedules(id) ON DELETE CASCADE,
  original_teacher_id   uuid        REFERENCES teachers(id) ON DELETE SET NULL,
  substitute_teacher_id uuid        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  -- Copied from the slot so teachers and parents can read the substitution
  -- without needing access to the absent teacher's timetable.
  class_id              uuid        REFERENCES classes(id) ON DELETE CASCADE,
  section_id            uuid        REFERENCES sections(id) ON DELETE CASCADE,
  subject_id            uuid        REFERENCES subjects(id) ON DELETE SET NULL,
  period_id             uuid        REFERENCES timetable_periods(id) ON DELETE SET NULL,
  start_time            time,
  end_time              time,
  note                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, date)
);

CREATE INDEX IF NOT EXISTS idx_timetable_subs_school_date ON timetable_substitutions(school_id, date);
CREATE INDEX IF NOT EXISTS idx_timetable_subs_substitute ON timetable_substitutions(substitute_teacher_id, date);
CREATE INDEX IF NOT EXISTS idx_timetable_subs_section ON timetable_substitutions(section_id, date);

DROP TRIGGER IF EXISTS set_updated_at ON timetable_substitutions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON timetable_substitutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS timetable_periods_sync_slots ON timetable_periods;
CREATE TRIGGER timetable_periods_sync_slots AFTER UPDATE ON timetable_periods
  FOR EACH ROW EXECUTE FUNCTION timetable_periods_sync_slots();

CREATE OR REPLACE FUNCTION timetable_substitutions_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slot  teacher_schedules%ROWTYPE;
  clash record;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO slot FROM teacher_schedules WHERE id = NEW.schedule_id;
  IF NOT FOUND OR slot.school_id <> NEW.school_id THEN
    RAISE EXCEPTION 'Timetable slot not found.' USING ERRCODE = '23503';
  END IF;
  IF EXTRACT(DOW FROM NEW.date)::int <> slot.day_of_week THEN
    RAISE EXCEPTION 'This slot is not on that day of the week.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teachers WHERE id = NEW.substitute_teacher_id AND school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'Substitute teacher not found.' USING ERRCODE = '23503';
  END IF;
  IF NEW.substitute_teacher_id = slot.teacher_id THEN
    RAISE EXCEPTION 'The substitute must be a different teacher.' USING ERRCODE = '23514';
  END IF;

  NEW.original_teacher_id := slot.teacher_id;
  NEW.class_id   := slot.class_id;
  NEW.section_id := slot.section_id;
  NEW.subject_id := slot.subject_id;
  NEW.period_id  := slot.period_id;
  NEW.start_time := slot.start_time;
  NEW.end_time   := slot.end_time;

  -- Busy with their own class at that time?
  SELECT c.name AS class_name, s.name AS section_name INTO clash
  FROM teacher_schedules ts
  JOIN classes c  ON c.id = ts.class_id
  JOIN sections s ON s.id = ts.section_id
  WHERE ts.teacher_id = NEW.substitute_teacher_id
    AND ts.day_of_week = slot.day_of_week
    AND ts.start_time < slot.end_time
    AND ts.end_time > slot.start_time
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Substitute is busy: they teach % - % at this time.', clash.class_name, clash.section_name
      USING ERRCODE = '23P01';
  END IF;

  -- Already substituting somewhere else at that time on that date?
  SELECT c.name AS class_name, s.name AS section_name INTO clash
  FROM timetable_substitutions ts
  JOIN classes c  ON c.id = ts.class_id
  JOIN sections s ON s.id = ts.section_id
  WHERE ts.substitute_teacher_id = NEW.substitute_teacher_id
    AND ts.date = NEW.date
    AND ts.id <> NEW.id
    AND ts.schedule_id <> NEW.schedule_id
    AND ts.start_time < slot.end_time
    AND ts.end_time > slot.start_time
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Substitute is busy: already covering % - % at this time.', clash.class_name, clash.section_name
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS timetable_substitutions_check ON timetable_substitutions;
CREATE TRIGGER timetable_substitutions_check BEFORE INSERT OR UPDATE ON timetable_substitutions
  FOR EACH ROW EXECUTE FUNCTION timetable_substitutions_check();

ALTER TABLE timetable_substitutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timetable_subs_select_admin" ON timetable_substitutions;
CREATE POLICY "timetable_subs_select_admin" ON timetable_substitutions FOR SELECT
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "timetable_subs_select_teacher" ON timetable_substitutions;
CREATE POLICY "timetable_subs_select_teacher" ON timetable_substitutions FOR SELECT
TO authenticated
USING (
  is_teacher() AND school_id = get_current_school_id() AND EXISTS (
    SELECT 1 FROM teachers t
    WHERE t.user_id = auth.uid()
      AND t.id IN (timetable_substitutions.substitute_teacher_id, timetable_substitutions.original_teacher_id)
  )
);

DROP POLICY IF EXISTS "timetable_subs_select_parent" ON timetable_substitutions;
CREATE POLICY "timetable_subs_select_parent" ON timetable_substitutions FOR SELECT
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND section_id = ANY(get_parent_section_ids())
);

DROP POLICY IF EXISTS "timetable_subs_admin_insert" ON timetable_substitutions;
CREATE POLICY "timetable_subs_admin_insert" ON timetable_substitutions FOR INSERT
TO authenticated
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "timetable_subs_admin_update" ON timetable_substitutions;
CREATE POLICY "timetable_subs_admin_update" ON timetable_substitutions FOR UPDATE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "timetable_subs_admin_delete" ON timetable_substitutions;
CREATE POLICY "timetable_subs_admin_delete" ON timetable_substitutions FOR DELETE
TO authenticated
USING (school_id = get_current_school_id() AND is_admin());
