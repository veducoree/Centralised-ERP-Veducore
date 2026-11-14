-- ============================================================
-- 031: Attendance rules
--
-- * Student attendance is marked by teachers only; admins view it.
-- * Only the class teacher (class_assignments row with no subject) marks a
--   section. If a section has no class teacher yet, any teacher assigned
--   to it can, so attendance never stops.
-- * "medical" (ML) counts as present everywhere and sends no absence alert.
-- * Teachers mark themselves present each day; half-day / leave is
--   applied at least one day ahead (date range) and approved by the office.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Who can write student attendance
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "attendance_admin_write" ON attendance;

CREATE OR REPLACE FUNCTION can_mark_section_attendance(p_section uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_assignments ca JOIN teachers t ON t.id = ca.teacher_id
    WHERE ca.section_id = p_section AND t.user_id = auth.uid() AND t.status = 'active'
      AND (ca.subject_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM class_assignments x WHERE x.section_id = p_section AND x.subject_id IS NULL))
  );
$$;
REVOKE ALL ON FUNCTION can_mark_section_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_mark_section_attendance(uuid) TO authenticated;

DROP POLICY IF EXISTS "attendance_insert_teacher" ON attendance;
CREATE POLICY "attendance_insert_teacher" ON attendance FOR INSERT TO authenticated
  WITH CHECK (is_teacher() AND school_id = get_current_school_id() AND can_mark_section_attendance(section_id));
DROP POLICY IF EXISTS "attendance_update_teacher" ON attendance;
CREATE POLICY "attendance_update_teacher" ON attendance FOR UPDATE TO authenticated
  USING (is_teacher() AND school_id = get_current_school_id() AND can_mark_section_attendance(section_id))
  WITH CHECK (is_teacher() AND school_id = get_current_school_id() AND can_mark_section_attendance(section_id));
DROP POLICY IF EXISTS "attendance_delete_teacher" ON attendance;
CREATE POLICY "attendance_delete_teacher" ON attendance FOR DELETE TO authenticated
  USING (is_teacher() AND school_id = get_current_school_id() AND can_mark_section_attendance(section_id));

-- Sections the calling teacher may mark (for the teacher screens).
CREATE OR REPLACE FUNCTION my_attendance_sections()
RETURNS TABLE (section_id uuid, class_id uuid, label text, is_class_teacher boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT sec.id, c.id, c.name || ' - ' || sec.name,
         bool_or(ca.subject_id IS NULL) OVER (PARTITION BY sec.id)
  FROM class_assignments ca
  JOIN teachers t ON t.id = ca.teacher_id AND t.user_id = auth.uid()
  JOIN sections sec ON sec.id = ca.section_id
  JOIN classes c ON c.id = sec.class_id
  WHERE can_mark_section_attendance(sec.id);
$$;
REVOKE ALL ON FUNCTION my_attendance_sections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_attendance_sections() TO authenticated;

-- ------------------------------------------------------------
-- 2. ML counts as present; no alert for ML
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_notify_attendance()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
  v_date text;
BEGIN
  IF NEW.status IN ('present', 'medical') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  SELECT full_name INTO v_name FROM students WHERE id = NEW.student_id;
  v_date := to_char(NEW.attendance_date, 'DD Mon YYYY');
  PERFORM notify_student(
    NEW.school_id, NEW.student_id,
    CASE NEW.status WHEN 'absent' THEN v_name || ' was absent'
                    WHEN 'late' THEN v_name || ' arrived late'
                    ELSE v_name || ' is on leave' END,
    v_name || ' was marked ' || upper(NEW.status::text) || ' on ' || v_date || '.',
    'attendance',
    CASE NEW.status WHEN 'absent' THEN 'error' ELSE 'warning' END,
    '/parent/attendance', 'attendance', NEW.id,
    CASE NEW.status WHEN 'absent' THEN 'high' ELSE 'normal' END
  );
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS attendance_daily_overview(date);
CREATE FUNCTION attendance_daily_overview(p_date date)
RETURNS TABLE (section_id uuid, class_id uuid, label text, grade_level int, students int,
               marked int, present int, absent int, late int, on_leave int, medical int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sec.id, c.id, c.name || ' - ' || sec.name, c.grade_level,
         (SELECT count(*) FROM students s WHERE s.section_id = sec.id AND s.status = 'active')::int,
         count(a.id)::int,
         count(a.id) FILTER (WHERE a.status = 'present')::int,
         count(a.id) FILTER (WHERE a.status = 'absent')::int,
         count(a.id) FILTER (WHERE a.status = 'late')::int,
         count(a.id) FILTER (WHERE a.status = 'leave')::int,
         count(a.id) FILTER (WHERE a.status = 'medical')::int
  FROM sections sec
  JOIN classes c ON c.id = sec.class_id
  LEFT JOIN attendance a ON a.section_id = sec.id AND a.attendance_date = p_date
  WHERE sec.school_id = get_current_school_id()
    AND has_permission(ARRAY['attendance'], 'view')
  GROUP BY sec.id, c.id, c.name, sec.name, c.grade_level
  ORDER BY c.grade_level NULLS LAST, c.name, sec.name;
$$;

DROP FUNCTION IF EXISTS attendance_register(uuid, date, date);
CREATE FUNCTION attendance_register(p_section uuid, p_from date, p_to date)
RETURNS TABLE (student_id uuid, full_name text, roll_number int, admission_number text,
               days jsonb, present int, absent int, late int, on_leave int, medical int, total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.full_name, s.roll_number, s.admission_number,
         coalesce(jsonb_object_agg(a.attendance_date::text, a.status::text) FILTER (WHERE a.id IS NOT NULL), '{}'::jsonb),
         count(a.id) FILTER (WHERE a.status = 'present')::int,
         count(a.id) FILTER (WHERE a.status = 'absent')::int,
         count(a.id) FILTER (WHERE a.status = 'late')::int,
         count(a.id) FILTER (WHERE a.status = 'leave')::int,
         count(a.id) FILTER (WHERE a.status = 'medical')::int,
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

CREATE OR REPLACE FUNCTION attendance_defaulters(p_from date, p_to date, p_threshold numeric, p_class uuid DEFAULT NULL)
RETURNS TABLE (student_id uuid, full_name text, admission_number text, roll_number int,
               class_name text, section_name text, present int, absent int, total int, percent numeric,
               parent_phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH agg AS (
    SELECT a.student_id,
           count(*) FILTER (WHERE a.status IN ('present','late','medical'))::int AS present,
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
           count(*) FILTER (WHERE a.status IN ('present','late','medical')) AS present,
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

DROP FUNCTION IF EXISTS attendance_summary(uuid, date, date);
CREATE FUNCTION attendance_summary(p_section uuid, p_from date, p_to date)
RETURNS TABLE (student_id uuid, present int, absent int, late int, on_leave int, medical int, total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.student_id,
         count(*) FILTER (WHERE a.status = 'present')::int,
         count(*) FILTER (WHERE a.status = 'absent')::int,
         count(*) FILTER (WHERE a.status = 'late')::int,
         count(*) FILTER (WHERE a.status = 'leave')::int,
         count(*) FILTER (WHERE a.status = 'medical')::int,
         count(*)::int
  FROM attendance a
  JOIN sections s ON s.id = a.section_id
  WHERE a.section_id = p_section
    AND a.attendance_date BETWEEN p_from AND p_to
    AND s.school_id = get_current_school_id()
    AND (has_permission(ARRAY['attendance','exams','students'], 'view') OR is_teacher())
  GROUP BY a.student_id;
$$;

REVOKE ALL ON FUNCTION attendance_daily_overview(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION attendance_register(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION attendance_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION attendance_daily_overview(date) TO authenticated;
GRANT EXECUTE ON FUNCTION attendance_register(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION attendance_summary(uuid, date, date) TO authenticated;

-- Dashboard: ML counted as present.
CREATE OR REPLACE FUNCTION admin_dashboard()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_tz text;
  v_today date;
  v_month_start date;
  v_result jsonb;
BEGIN
  IF v_school IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Only school admins can view the dashboard';
  END IF;

  -- schools.timezone defaults to 'UTC'; for this product that means "not set".
  SELECT coalesce(nullif(nullif(timezone, ''), 'UTC'), 'Asia/Kolkata') INTO v_tz FROM schools WHERE id = v_school;
  BEGIN
    v_today := (now() AT TIME ZONE v_tz)::date;
  EXCEPTION WHEN OTHERS THEN
    v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  END;
  v_month_start := date_trunc('month', v_today)::date;

  SELECT jsonb_build_object(
    'today', v_today,
    'session', (SELECT jsonb_build_object('id', id, 'name', name, 'start_date', start_date, 'end_date', end_date)
                FROM academic_sessions WHERE school_id = v_school AND is_current),

    'counts', jsonb_build_object(
      'students', (SELECT count(*) FROM students WHERE school_id = v_school AND status = 'active'),
      'boys', (SELECT count(*) FROM students WHERE school_id = v_school AND status = 'active' AND gender = 'male'),
      'girls', (SELECT count(*) FROM students WHERE school_id = v_school AND status = 'active' AND gender = 'female'),
      'teachers', (SELECT count(*) FROM teachers WHERE school_id = v_school AND status = 'active'),
      'parents', (SELECT count(*) FROM parents WHERE school_id = v_school AND status = 'active'),
      'classes', (SELECT count(*) FROM classes WHERE school_id = v_school),
      'sections', (SELECT count(*) FROM sections WHERE school_id = v_school),
      'new_admissions_month', (SELECT count(*) FROM students WHERE school_id = v_school
                                AND coalesce(admission_date, created_at::date) >= v_month_start)
    ),

    'attendance_today', (
      SELECT jsonb_build_object(
        'present', count(*) FILTER (WHERE status IN ('present','medical')),
        'medical', count(*) FILTER (WHERE status = 'medical'),
        'absent', count(*) FILTER (WHERE status = 'absent'),
        'late', count(*) FILTER (WHERE status = 'late'),
        'leave', count(*) FILTER (WHERE status = 'leave'),
        'marked', count(*),
        'sections_marked', count(DISTINCT section_id)
      ) FROM attendance WHERE school_id = v_school AND attendance_date = v_today
    ),

    -- Sections with active students but no attendance today.
    'unmarked_sections', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', x.id, 'label', x.label, 'students', x.students) ORDER BY x.label)
      FROM (
        SELECT sec.id, c.name || ' - ' || sec.name AS label, count(st.id) AS students
        FROM sections sec
        JOIN classes c ON c.id = sec.class_id
        JOIN students st ON st.section_id = sec.id AND st.status = 'active'
        WHERE sec.school_id = v_school
          AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.section_id = sec.id AND a.attendance_date = v_today)
        GROUP BY sec.id, c.name, sec.name
      ) x), '[]'::jsonb),

    'attendance_trend', coalesce((
      SELECT jsonb_agg(jsonb_build_object('date', d.day::date, 'present', coalesce(t.present, 0),
                                          'absent', coalesce(t.absent, 0), 'total', coalesce(t.total, 0))
                       ORDER BY d.day)
      FROM generate_series(v_today - 13, v_today, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT attendance_date,
               count(*) FILTER (WHERE status IN ('present','late','medical')) AS present,
               count(*) FILTER (WHERE status = 'absent') AS absent,
               count(*) AS total
        FROM attendance
        WHERE school_id = v_school AND attendance_date BETWEEN v_today - 13 AND v_today
        GROUP BY attendance_date
      ) t ON t.attendance_date = d.day::date), '[]'::jsonb),

    'fees', (
      SELECT jsonb_build_object(
        'billed', coalesce(sum(amount), 0),
        'collected', coalesce(sum(paid_amount), 0),
        'outstanding', coalesce(sum(amount - paid_amount), 0),
        'overdue_amount', coalesce(sum(amount - paid_amount) FILTER (WHERE due_date < v_today AND amount > paid_amount), 0),
        'overdue_students', count(DISTINCT student_id) FILTER (WHERE due_date < v_today AND amount > paid_amount),
        'collected_today', (SELECT coalesce(sum(amount), 0) FROM fee_payments
                            WHERE school_id = v_school AND payment_date = v_today),
        'collected_month', (SELECT coalesce(sum(amount), 0) FROM fee_payments
                            WHERE school_id = v_school AND payment_date >= v_month_start)
      )
      FROM fees
      WHERE school_id = v_school
        AND (session_id IS NULL OR session_id = current_session_id(v_school))
    ),

    'monthly_collection', coalesce((
      SELECT jsonb_agg(jsonb_build_object('month', to_char(m.month, 'Mon'), 'amount', coalesce(p.amount, 0)) ORDER BY m.month)
      FROM generate_series(v_month_start - interval '5 months', v_month_start, interval '1 month') AS m(month)
      LEFT JOIN (
        SELECT date_trunc('month', payment_date) AS month, sum(amount) AS amount
        FROM fee_payments
        WHERE school_id = v_school AND payment_date >= v_month_start - interval '5 months'
        GROUP BY 1
      ) p ON p.month = m.month), '[]'::jsonb),

    'top_defaulters', coalesce((
      SELECT jsonb_agg(d ORDER BY (d->>'due')::numeric DESC)
      FROM (
        SELECT jsonb_build_object(
          'student_id', s.id, 'name', s.full_name, 'admission_number', s.admission_number,
          'class', coalesce(c.name, '') || coalesce(' - ' || sec.name, ''),
          'due', sum(f.amount - f.paid_amount),
          'since', min(f.due_date)) AS d
        FROM fees f
        JOIN students s ON s.id = f.student_id AND s.status = 'active'
        LEFT JOIN classes c ON c.id = s.class_id
        LEFT JOIN sections sec ON sec.id = s.section_id
        WHERE f.school_id = v_school AND f.due_date < v_today AND f.amount > f.paid_amount
        GROUP BY s.id, s.full_name, s.admission_number, c.name, sec.name
        ORDER BY sum(f.amount - f.paid_amount) DESC
        LIMIT 5
      ) q), '[]'::jsonb),

    'class_strength', coalesce((
      SELECT jsonb_agg(jsonb_build_object('class', c.name, 'grade_level', c.grade_level, 'students', cnt.n) ORDER BY c.grade_level NULLS LAST, c.name)
      FROM classes c
      JOIN LATERAL (SELECT count(*) AS n FROM students s WHERE s.class_id = c.id AND s.status = 'active') cnt ON true
      WHERE c.school_id = v_school), '[]'::jsonb),

    'birthdays_today', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name,
               'class', coalesce(c.name, '') || coalesce(' - ' || sec.name, '')))
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN sections sec ON sec.id = s.section_id
      WHERE s.school_id = v_school AND s.status = 'active' AND s.date_of_birth IS NOT NULL
        AND extract(month FROM s.date_of_birth) = extract(month FROM v_today)
        AND extract(day FROM s.date_of_birth) = extract(day FROM v_today)), '[]'::jsonb),

    'upcoming_holidays', coalesce((
      SELECT jsonb_agg(jsonb_build_object('date', date, 'label', label, 'type', type) ORDER BY date)
      FROM (SELECT date, label, type FROM holidays
            WHERE school_id = v_school AND type IN ('holiday','festival')
              AND date BETWEEN v_today AND v_today + 30
            ORDER BY date LIMIT 5) h), '[]'::jsonb),

    'pending_transport', (SELECT count(*) FROM student_transport_assignments
                          WHERE school_id = v_school AND status = 'pending'),

    'recent_notifications', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'category', category,
               'audience', audience, 'created_at', created_at, 'recipients', recipients_count) ORDER BY created_at DESC)
      FROM (SELECT * FROM notifications WHERE school_id = v_school ORDER BY created_at DESC LIMIT 5) n), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ------------------------------------------------------------
-- 3. Teacher self attendance + leave
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION school_local_date(p_school uuid)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE coalesce(nullif(nullif(timezone, ''), 'UTC'), 'Asia/Kolkata'))::date
  FROM schools WHERE id = p_school;
$$;

-- Teacher marks themself present (or checks out) for today.
CREATE OR REPLACE FUNCTION mark_my_attendance(p_check_out boolean DEFAULT false)
RETURNS staff_attendance
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_teacher teachers%ROWTYPE;
  v_today date;
  v_now time;
  v_row staff_attendance;
BEGIN
  SELECT * INTO v_teacher FROM teachers WHERE user_id = auth.uid() AND status = 'active';
  IF v_teacher.id IS NULL THEN RAISE EXCEPTION 'Only teachers can mark their attendance'; END IF;
  v_today := school_local_date(v_teacher.school_id);
  v_now := (now() AT TIME ZONE coalesce((SELECT nullif(nullif(timezone, ''), 'UTC') FROM schools WHERE id = v_teacher.school_id), 'Asia/Kolkata'))::time;

  SELECT * INTO v_row FROM staff_attendance WHERE teacher_id = v_teacher.id AND attendance_date = v_today;

  IF p_check_out THEN
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Mark yourself present first'; END IF;
    UPDATE staff_attendance SET check_out = v_now WHERE id = v_row.id RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  IF v_row.id IS NOT NULL THEN
    IF v_row.status = 'leave' THEN RAISE EXCEPTION 'You are on approved leave today'; END IF;
    RETURN v_row; -- already marked (present / half day)
  END IF;

  INSERT INTO staff_attendance (school_id, teacher_id, attendance_date, status, check_in, marked_by, note)
  VALUES (v_teacher.school_id, v_teacher.id, v_today, 'present', v_now, auth.uid(), 'Self-marked')
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE TABLE IF NOT EXISTS staff_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('full_day','half_day')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  days numeric(5,1) NOT NULL DEFAULT 1,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date),
  CHECK (leave_type = 'full_day' OR from_date = to_date)
);
CREATE INDEX IF NOT EXISTS idx_staff_leaves_teacher ON staff_leaves(teacher_id, from_date);
CREATE INDEX IF NOT EXISTS idx_staff_leaves_school_status ON staff_leaves(school_id, status);
ALTER TABLE staff_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_leaves_own_select" ON staff_leaves;
CREATE POLICY "staff_leaves_own_select" ON staff_leaves FOR SELECT TO authenticated
  USING (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "staff_leaves_admin_select" ON staff_leaves;
CREATE POLICY "staff_leaves_admin_select" ON staff_leaves FOR SELECT TO authenticated
  USING (school_id = get_current_school_id() AND has_permission(ARRAY['teachers','attendance'], 'view'));
-- Writes go through the RPCs below.

-- Working days in a range (skips Sundays and declared holidays; honours
-- declared working days).
CREATE OR REPLACE FUNCTION school_working_days(p_school uuid, p_from date, p_to date)
RETURNS SETOF date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d::date FROM generate_series(p_from, p_to, interval '1 day') d
  WHERE (extract(dow FROM d) <> 0
         OR EXISTS (SELECT 1 FROM holidays h WHERE h.school_id = p_school AND h.date = d::date AND h.type = 'working'))
    AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.school_id = p_school AND h.date = d::date AND h.type IN ('holiday','festival'));
$$;

CREATE OR REPLACE FUNCTION apply_leave(p_type text, p_from date, p_to date, p_reason text)
RETURNS staff_leaves
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_teacher teachers%ROWTYPE;
  v_today date;
  v_days numeric;
  v_row staff_leaves;
  v_admin uuid;
BEGIN
  SELECT * INTO v_teacher FROM teachers WHERE user_id = auth.uid() AND status = 'active';
  IF v_teacher.id IS NULL THEN RAISE EXCEPTION 'Only teachers can apply for leave'; END IF;
  IF p_type NOT IN ('full_day','half_day') THEN RAISE EXCEPTION 'Choose full day or half day'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Please give a reason'; END IF;
  IF p_type = 'half_day' THEN p_to := p_from; END IF;
  IF p_to < p_from THEN RAISE EXCEPTION 'End date is before start date'; END IF;

  v_today := school_local_date(v_teacher.school_id);
  IF p_from <= v_today THEN
    RAISE EXCEPTION 'Leave must be applied at least one day in advance (from % onwards)', to_char(v_today + 1, 'DD Mon');
  END IF;
  IF p_to > p_from + 60 THEN RAISE EXCEPTION 'A single application can cover at most 60 days'; END IF;

  IF EXISTS (SELECT 1 FROM staff_leaves WHERE teacher_id = v_teacher.id AND status IN ('pending','approved')
             AND from_date <= p_to AND to_date >= p_from) THEN
    RAISE EXCEPTION 'You already have a leave request covering some of these dates';
  END IF;

  SELECT count(*) INTO v_days FROM school_working_days(v_teacher.school_id, p_from, p_to);
  IF v_days = 0 THEN RAISE EXCEPTION 'These dates are all holidays'; END IF;
  IF p_type = 'half_day' THEN v_days := 0.5; END IF;

  INSERT INTO staff_leaves (school_id, teacher_id, leave_type, from_date, to_date, days, reason)
  VALUES (v_teacher.school_id, v_teacher.id, p_type, p_from, p_to, v_days, trim(p_reason))
  RETURNING * INTO v_row;

  -- Tell the office (owners + staff who can edit teachers).
  FOR v_admin IN
    SELECT p.id FROM profiles p LEFT JOIN staff_roles r ON r.id = p.staff_role_id
    WHERE p.school_id = v_teacher.school_id AND p.role = 'admin' AND p.status = 'active'
      AND (p.staff_role_id IS NULL OR r.permissions->>'teachers' = 'edit' OR r.permissions->>'attendance' = 'edit')
  LOOP
    INSERT INTO notifications (school_id, audience, user_id, title, message, category, type, link, entity_type, entity_id)
    VALUES (v_teacher.school_id, 'user', v_admin, 'Leave request: ' || v_teacher.full_name,
      v_teacher.full_name || ' applied for ' || CASE WHEN p_type = 'half_day' THEN 'a half day on ' || to_char(p_from, 'DD Mon')
        ELSE v_days || ' day(s) leave, ' || to_char(p_from, 'DD Mon') || CASE WHEN p_to <> p_from THEN ' – ' || to_char(p_to, 'DD Mon') ELSE '' END END
        || '. Reason: ' || left(trim(p_reason), 120),
      'attendance', 'info', '/admin/attendance', 'staff_leave', v_row.id);
  END LOOP;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION review_leave(p_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_leave staff_leaves%ROWTYPE;
  v_user uuid;
  d date;
BEGIN
  IF NOT has_permission(ARRAY['teachers','attendance'], 'edit') THEN RAISE EXCEPTION 'Your role cannot approve leave'; END IF;
  SELECT * INTO v_leave FROM staff_leaves WHERE id = p_id AND school_id = get_current_school_id();
  IF v_leave.id IS NULL THEN RAISE EXCEPTION 'Leave request not found'; END IF;
  IF v_leave.status <> 'pending' THEN RAISE EXCEPTION 'This request was already %', v_leave.status; END IF;

  UPDATE staff_leaves SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_id;

  IF p_approve THEN
    FOR d IN SELECT * FROM school_working_days(v_leave.school_id, v_leave.from_date, v_leave.to_date) LOOP
      INSERT INTO staff_attendance (school_id, teacher_id, attendance_date, status, note, marked_by)
      VALUES (v_leave.school_id, v_leave.teacher_id, d,
              CASE WHEN v_leave.leave_type = 'half_day' THEN 'half_day' ELSE 'leave' END,
              'Approved leave', auth.uid())
      ON CONFLICT (teacher_id, attendance_date) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note;
    END LOOP;
  END IF;

  SELECT user_id INTO v_user FROM teachers WHERE id = v_leave.teacher_id;
  IF v_user IS NOT NULL THEN
    INSERT INTO notifications (school_id, audience, user_id, title, message, category, type, entity_type, entity_id)
    VALUES (v_leave.school_id, 'user', v_user,
      CASE WHEN p_approve THEN 'Leave approved' ELSE 'Leave not approved' END,
      'Your ' || CASE WHEN v_leave.leave_type = 'half_day' THEN 'half day' ELSE 'leave' END || ' for '
        || to_char(v_leave.from_date, 'DD Mon') || CASE WHEN v_leave.to_date <> v_leave.from_date THEN ' – ' || to_char(v_leave.to_date, 'DD Mon') ELSE '' END
        || CASE WHEN p_approve THEN ' was approved.' ELSE ' was not approved.' END
        || coalesce(' Note: ' || nullif(trim(p_note), ''), ''),
      'attendance', CASE WHEN p_approve THEN 'success' ELSE 'warning' END, 'staff_leave', p_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_my_leave(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_leave staff_leaves%ROWTYPE;
BEGIN
  SELECT l.* INTO v_leave FROM staff_leaves l JOIN teachers t ON t.id = l.teacher_id
  WHERE l.id = p_id AND t.user_id = auth.uid();
  IF v_leave.id IS NULL THEN RAISE EXCEPTION 'Leave request not found'; END IF;
  IF v_leave.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'This request is already %', v_leave.status; END IF;
  IF v_leave.from_date <= school_local_date(v_leave.school_id) THEN
    RAISE EXCEPTION 'Leave that has already started can only be changed by the office';
  END IF;
  UPDATE staff_leaves SET status = 'cancelled' WHERE id = p_id;
  IF v_leave.status = 'approved' THEN
    DELETE FROM staff_attendance WHERE teacher_id = v_leave.teacher_id
      AND attendance_date BETWEEN v_leave.from_date AND v_leave.to_date AND note = 'Approved leave';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION school_local_date(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mark_my_attendance(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION school_working_days(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION apply_leave(text, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION review_leave(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION cancel_my_leave(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION school_local_date(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_my_attendance(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION school_working_days(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_leave(text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION review_leave(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_my_leave(uuid) TO authenticated;
