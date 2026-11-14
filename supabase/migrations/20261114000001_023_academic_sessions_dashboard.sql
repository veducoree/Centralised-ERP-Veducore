-- ============================================================
-- 023: Academic sessions, enrollment history, dashboard RPC
--
-- * academic_sessions: one "current" session per school. Its name is
--   mirrored into schools.academic_year so existing code (receipts,
--   settings) keeps working.
-- * student_enrollments: which class/section a student was in for each
--   session. Kept in sync with students for the current session; this
--   is what promotion will build on.
-- * fees / exam_defs / student_records get session_id (defaults to the
--   current session on insert).
-- * admin_dashboard(): every dashboard number computed in one round
--   trip on the server (no 1000-row client limit, school timezone).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Sessions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name),
  CHECK (end_date > start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_sessions_current
  ON academic_sessions(school_id) WHERE is_current;
ALTER TABLE academic_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academic_sessions_select_school" ON academic_sessions;
CREATE POLICY "academic_sessions_select_school" ON academic_sessions FOR SELECT
TO authenticated USING (school_id = get_current_school_id());

DROP POLICY IF EXISTS "academic_sessions_admin_write" ON academic_sessions;
CREATE POLICY "academic_sessions_admin_write" ON academic_sessions FOR ALL
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

CREATE OR REPLACE FUNCTION current_session_id(p_school uuid)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT id FROM academic_sessions WHERE school_id = p_school AND is_current LIMIT 1;
$$;

-- Backfill: one current session per school for the academic year we are in
-- (Indian academic year: April → March).
DO $$
DECLARE
  r record;
  v_start_year int;
  v_name text;
BEGIN
  FOR r IN SELECT id, academic_year FROM schools
           WHERE NOT EXISTS (SELECT 1 FROM academic_sessions a WHERE a.school_id = schools.id)
  LOOP
    v_start_year := extract(year FROM CURRENT_DATE)::int
      - CASE WHEN extract(month FROM CURRENT_DATE) < 4 THEN 1 ELSE 0 END;
    -- Keep the school's own label only if it names the year we're in
    -- (the column default '2025-2026' is often stale).
    IF r.academic_year ~ '^\d{4}-(\d{2}|\d{4})$'
       AND substr(r.academic_year, 1, 4)::int = v_start_year THEN
      v_name := r.academic_year;
    ELSE
      v_name := v_start_year || '-' || lpad(((v_start_year + 1) % 100)::text, 2, '0');
    END IF;
    INSERT INTO academic_sessions (school_id, name, start_date, end_date, is_current, status)
    VALUES (r.id, v_name, make_date(v_start_year, 4, 1), make_date(v_start_year + 1, 3, 31), true, 'active');
  END LOOP;
END $$;

-- Keep schools.academic_year mirrored; only one current session.
CREATE OR REPLACE FUNCTION trg_academic_session_current()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.is_current THEN
    UPDATE academic_sessions SET is_current = false,
      status = CASE WHEN status = 'active' THEN 'closed' ELSE status END
      WHERE school_id = NEW.school_id AND id <> NEW.id AND is_current;
    NEW.status := 'active';
    UPDATE schools SET academic_year = NEW.name WHERE id = NEW.school_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_academic_session_current ON academic_sessions;
CREATE TRIGGER trg_academic_session_current
  BEFORE INSERT OR UPDATE ON academic_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_academic_session_current();

-- New schools get a session automatically.
CREATE OR REPLACE FUNCTION trg_school_default_session()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_start_year int;
BEGIN
  v_start_year := extract(year FROM CURRENT_DATE)::int
    - CASE WHEN extract(month FROM CURRENT_DATE) < 4 THEN 1 ELSE 0 END;
  INSERT INTO academic_sessions (school_id, name, start_date, end_date, is_current)
  VALUES (NEW.id, v_start_year || '-' || lpad(((v_start_year + 1) % 100)::text, 2, '0'),
          make_date(v_start_year, 4, 1), make_date(v_start_year + 1, 3, 31), true)
  ON CONFLICT (school_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_school_default_session ON schools;
CREATE TRIGGER trg_school_default_session
  AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION trg_school_default_session();

-- ------------------------------------------------------------
-- 2. session_id on yearly data
-- ------------------------------------------------------------
ALTER TABLE fees ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES academic_sessions(id) ON DELETE SET NULL;
ALTER TABLE exam_defs ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES academic_sessions(id) ON DELETE SET NULL;
ALTER TABLE student_records ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES academic_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fees_session ON fees(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_defs_session ON exam_defs(session_id);
CREATE INDEX IF NOT EXISTS idx_student_records_session ON student_records(session_id);

UPDATE fees SET session_id = current_session_id(school_id) WHERE session_id IS NULL;
UPDATE exam_defs SET session_id = current_session_id(school_id) WHERE session_id IS NULL;
UPDATE student_records SET session_id = current_session_id(school_id) WHERE session_id IS NULL;

CREATE OR REPLACE FUNCTION trg_default_session_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.session_id IS NULL THEN NEW.session_id := current_session_id(NEW.school_id); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fees_session ON fees;
CREATE TRIGGER trg_fees_session BEFORE INSERT ON fees
  FOR EACH ROW EXECUTE FUNCTION trg_default_session_id();
DROP TRIGGER IF EXISTS trg_exam_defs_session ON exam_defs;
CREATE TRIGGER trg_exam_defs_session BEFORE INSERT ON exam_defs
  FOR EACH ROW EXECUTE FUNCTION trg_default_session_id();
DROP TRIGGER IF EXISTS trg_student_records_session ON student_records;
CREATE TRIGGER trg_student_records_session BEFORE INSERT ON student_records
  FOR EACH ROW EXECUTE FUNCTION trg_default_session_id();

-- ------------------------------------------------------------
-- 3. Enrollment history
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  section_id uuid REFERENCES sections(id) ON DELETE SET NULL,
  roll_number int,
  status text NOT NULL DEFAULT 'studying'
    CHECK (status IN ('studying','promoted','retained','left','graduated')),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_section ON student_enrollments(session_id, section_id);
ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enrollments_admin_all" ON student_enrollments;
CREATE POLICY "enrollments_admin_all" ON student_enrollments FOR ALL
TO authenticated
USING (school_id = get_current_school_id() AND is_admin())
WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "enrollments_teacher_select" ON student_enrollments;
CREATE POLICY "enrollments_teacher_select" ON student_enrollments FOR SELECT
TO authenticated USING (school_id = get_current_school_id() AND is_teacher());

DROP POLICY IF EXISTS "enrollments_parent_select" ON student_enrollments;
CREATE POLICY "enrollments_parent_select" ON student_enrollments FOR SELECT
TO authenticated USING (student_id IN (SELECT my_student_ids()));

INSERT INTO student_enrollments (school_id, session_id, student_id, class_id, section_id, roll_number, status)
SELECT s.school_id, current_session_id(s.school_id), s.id, s.class_id, s.section_id, s.roll_number,
       CASE WHEN s.status = 'active' THEN 'studying' ELSE 'left' END
FROM students s
WHERE current_session_id(s.school_id) IS NOT NULL
ON CONFLICT (session_id, student_id) DO NOTHING;

CREATE OR REPLACE FUNCTION trg_sync_student_enrollment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_session uuid := current_session_id(NEW.school_id);
BEGIN
  IF v_session IS NULL THEN RETURN NEW; END IF;
  INSERT INTO student_enrollments (school_id, session_id, student_id, class_id, section_id, roll_number, status)
  VALUES (NEW.school_id, v_session, NEW.id, NEW.class_id, NEW.section_id, NEW.roll_number,
          CASE WHEN NEW.status = 'active' THEN 'studying' ELSE 'left' END)
  ON CONFLICT (session_id, student_id) DO UPDATE SET
    class_id = EXCLUDED.class_id,
    section_id = EXCLUDED.section_id,
    roll_number = EXCLUDED.roll_number,
    status = CASE
      WHEN student_enrollments.status IN ('promoted','retained','graduated') THEN student_enrollments.status
      ELSE EXCLUDED.status END,
    updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_students_enrollment ON students;
CREATE TRIGGER trg_students_enrollment
  AFTER INSERT OR UPDATE OF class_id, section_id, roll_number, status ON students
  FOR EACH ROW EXECUTE FUNCTION trg_sync_student_enrollment();

-- ------------------------------------------------------------
-- 4. Dashboard
-- ------------------------------------------------------------
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
        'present', count(*) FILTER (WHERE status = 'present'),
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
               count(*) FILTER (WHERE status IN ('present','late')) AS present,
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

REVOKE ALL ON FUNCTION admin_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_dashboard() TO authenticated;
REVOKE ALL ON FUNCTION current_session_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_session_id(uuid) TO authenticated;
