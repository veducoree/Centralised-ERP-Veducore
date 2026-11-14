-- ============================================================
-- 029: Attendance upgrade
--
-- * Admins (with attendance edit) can mark and correct attendance; until
--   now only teachers had write policies.
-- * Server-side reports so a month/term isn't capped by the 1000-row REST
--   limit: daily overview, monthly register, low-attendance list.
-- * notify_low_attendance(): one notification per student's parents.
-- * staff_attendance for teachers.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Admin write access to student attendance
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "attendance_admin_write" ON attendance;
CREATE POLICY "attendance_admin_write" ON attendance FOR ALL TO authenticated
  USING (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());
-- (perm_guard_* restrictive policies from 024 still require "attendance: edit".)

-- ------------------------------------------------------------
-- 2. Reports
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION attendance_daily_overview(p_date date)
RETURNS TABLE (section_id uuid, class_id uuid, label text, grade_level int, students int,
               marked int, present int, absent int, late int, on_leave int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sec.id, c.id, c.name || ' - ' || sec.name, c.grade_level,
         (SELECT count(*) FROM students s WHERE s.section_id = sec.id AND s.status = 'active')::int,
         count(a.id)::int,
         count(a.id) FILTER (WHERE a.status = 'present')::int,
         count(a.id) FILTER (WHERE a.status = 'absent')::int,
         count(a.id) FILTER (WHERE a.status = 'late')::int,
         count(a.id) FILTER (WHERE a.status = 'leave')::int
  FROM sections sec
  JOIN classes c ON c.id = sec.class_id
  LEFT JOIN attendance a ON a.section_id = sec.id AND a.attendance_date = p_date
  WHERE sec.school_id = get_current_school_id()
    AND has_permission(ARRAY['attendance'], 'view')
  GROUP BY sec.id, c.id, c.name, sec.name, c.grade_level
  ORDER BY c.grade_level NULLS LAST, c.name, sec.name;
$$;

-- One row per active student with { "YYYY-MM-DD": "present" | … } for the range.
CREATE OR REPLACE FUNCTION attendance_register(p_section uuid, p_from date, p_to date)
RETURNS TABLE (student_id uuid, full_name text, roll_number int, admission_number text,
               days jsonb, present int, absent int, late int, on_leave int, total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.full_name, s.roll_number, s.admission_number,
         coalesce(jsonb_object_agg(a.attendance_date::text, a.status::text) FILTER (WHERE a.id IS NOT NULL), '{}'::jsonb),
         count(a.id) FILTER (WHERE a.status = 'present')::int,
         count(a.id) FILTER (WHERE a.status = 'absent')::int,
         count(a.id) FILTER (WHERE a.status = 'late')::int,
         count(a.id) FILTER (WHERE a.status = 'leave')::int,
         count(a.id)::int
  FROM students s
  LEFT JOIN attendance a ON a.student_id = s.id AND a.section_id = p_section
                         AND a.attendance_date BETWEEN p_from AND p_to
  WHERE s.section_id = p_section AND s.status = 'active'
    AND s.school_id = get_current_school_id()
    AND (has_permission(ARRAY['attendance'], 'view') OR is_teacher())
  GROUP BY s.id, s.full_name, s.roll_number, s.admission_number
  ORDER BY s.roll_number NULLS LAST, s.full_name;
$$;

-- Students whose attendance % (present + late over marked days) is below
-- the threshold in the range. Students with no marked days are skipped.
CREATE OR REPLACE FUNCTION attendance_defaulters(p_from date, p_to date, p_threshold numeric, p_class uuid DEFAULT NULL)
RETURNS TABLE (student_id uuid, full_name text, admission_number text, roll_number int,
               class_name text, section_name text, present int, absent int, total int, percent numeric,
               parent_phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH agg AS (
    SELECT a.student_id,
           count(*) FILTER (WHERE a.status IN ('present','late'))::int AS present,
           count(*) FILTER (WHERE a.status = 'absent')::int AS absent,
           count(*)::int AS total
    FROM attendance a
    WHERE a.school_id = get_current_school_id() AND a.attendance_date BETWEEN p_from AND p_to
    GROUP BY a.student_id
  )
  SELECT s.id, s.full_name, s.admission_number, s.roll_number, c.name, sec.name,
         agg.present, agg.absent, agg.total,
         round(agg.present * 100.0 / nullif(agg.total, 0), 1),
         coalesce(s.emergency_contact,
                  (SELECT p.phone FROM parent_students ps JOIN parents p ON p.id = ps.parent_id
                   WHERE ps.student_id = s.id AND p.phone IS NOT NULL LIMIT 1))
  FROM agg
  JOIN students s ON s.id = agg.student_id AND s.status = 'active'
  LEFT JOIN classes c ON c.id = s.class_id
  LEFT JOIN sections sec ON sec.id = s.section_id
  WHERE has_permission(ARRAY['attendance'], 'view')
    AND (p_class IS NULL OR s.class_id = p_class)
    AND agg.present * 100.0 / nullif(agg.total, 0) < p_threshold
  ORDER BY agg.present * 100.0 / nullif(agg.total, 0), c.grade_level NULLS LAST, s.full_name;
$$;

CREATE OR REPLACE FUNCTION notify_low_attendance(p_students uuid[], p_from date, p_to date)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  IF NOT (has_permission(ARRAY['attendance'], 'view') AND has_permission(ARRAY['notifications'], 'edit')) THEN
    RAISE EXCEPTION 'Your role cannot send attendance alerts';
  END IF;
  FOR r IN
    SELECT s.id, s.school_id, s.full_name,
           count(*) FILTER (WHERE a.status IN ('present','late')) AS present,
           count(*) AS total
    FROM students s JOIN attendance a ON a.student_id = s.id AND a.attendance_date BETWEEN p_from AND p_to
    WHERE s.id = ANY(p_students) AND s.school_id = get_current_school_id()
    GROUP BY s.id, s.school_id, s.full_name
  LOOP
    PERFORM notify_student(
      r.school_id, r.id,
      'Low attendance: ' || r.full_name,
      r.full_name || '''s attendance is ' || round(r.present * 100.0 / nullif(r.total, 0)) || '% ('
        || r.present || ' of ' || r.total || ' days) between ' || to_char(p_from, 'DD Mon') || ' and '
        || to_char(p_to, 'DD Mon') || '. Please ensure regular attendance.',
      'attendance', 'warning', '/parent/attendance', 'low_attendance', NULL, 'high');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ------------------------------------------------------------
-- 3. Staff attendance
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent','half_day','leave','late')),
  check_in time,
  check_out time,
  note text,
  marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_school_date ON staff_attendance(school_id, attendance_date);
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_attendance_admin_select" ON staff_attendance;
CREATE POLICY "staff_attendance_admin_select" ON staff_attendance FOR SELECT TO authenticated
  USING (school_id = get_current_school_id() AND has_permission(ARRAY['teachers','attendance'], 'view'));
DROP POLICY IF EXISTS "staff_attendance_admin_write" ON staff_attendance;
CREATE POLICY "staff_attendance_admin_write" ON staff_attendance FOR ALL TO authenticated
  USING (school_id = get_current_school_id() AND has_permission(ARRAY['teachers','attendance'], 'edit'))
  WITH CHECK (school_id = get_current_school_id() AND has_permission(ARRAY['teachers','attendance'], 'edit'));
DROP POLICY IF EXISTS "staff_attendance_teacher_own" ON staff_attendance;
CREATE POLICY "staff_attendance_teacher_own" ON staff_attendance FOR SELECT TO authenticated
  USING (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION trg_staff_attendance_meta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.marked_by IS NULL THEN NEW.marked_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_staff_attendance_meta ON staff_attendance;
CREATE TRIGGER trg_staff_attendance_meta BEFORE INSERT OR UPDATE ON staff_attendance
  FOR EACH ROW EXECUTE FUNCTION trg_staff_attendance_meta();

CREATE OR REPLACE FUNCTION staff_attendance_register(p_from date, p_to date)
RETURNS TABLE (teacher_id uuid, full_name text, employee_id text, days jsonb,
               present int, absent int, half_day int, on_leave int, late int, total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, t.full_name, t.employee_id,
         coalesce(jsonb_object_agg(sa.attendance_date::text, sa.status) FILTER (WHERE sa.id IS NOT NULL), '{}'::jsonb),
         count(sa.id) FILTER (WHERE sa.status = 'present')::int,
         count(sa.id) FILTER (WHERE sa.status = 'absent')::int,
         count(sa.id) FILTER (WHERE sa.status = 'half_day')::int,
         count(sa.id) FILTER (WHERE sa.status = 'leave')::int,
         count(sa.id) FILTER (WHERE sa.status = 'late')::int,
         count(sa.id)::int
  FROM teachers t
  LEFT JOIN staff_attendance sa ON sa.teacher_id = t.id AND sa.attendance_date BETWEEN p_from AND p_to
  WHERE t.school_id = get_current_school_id() AND t.status = 'active'
    AND has_permission(ARRAY['teachers','attendance'], 'view')
  GROUP BY t.id, t.full_name, t.employee_id
  ORDER BY t.full_name;
$$;

REVOKE ALL ON FUNCTION attendance_daily_overview(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION attendance_register(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION attendance_defaulters(date, date, numeric, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION notify_low_attendance(uuid[], date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION staff_attendance_register(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION attendance_daily_overview(date) TO authenticated;
GRANT EXECUTE ON FUNCTION attendance_register(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION attendance_defaulters(date, date, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION notify_low_attendance(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION staff_attendance_register(date, date) TO authenticated;
