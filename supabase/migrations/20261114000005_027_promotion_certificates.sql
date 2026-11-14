-- ============================================================
-- 027: Promotion + certificate register
--
-- * promote_students(): move students from the previous session into
--   the current one (promote / retain / left / passed out), with
--   enrollment history and optional roll renumbering.
-- * certificates: a register with automatic numbers per type and
--   session (e.g. TC/2026-27/0001). Issuing a TC marks the student as
--   left; certificates that state "no dues" check fees first.
-- ============================================================

ALTER TABLE students ADD COLUMN IF NOT EXISTS left_on date;
ALTER TABLE students ADD COLUMN IF NOT EXISTS leaving_reason text;

-- ------------------------------------------------------------
-- 1. Dues helper
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION student_outstanding(p_student uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(sum(f.amount - f.paid_amount), 0)
  FROM fees f JOIN students s ON s.id = f.student_id
  WHERE f.student_id = p_student AND f.amount > f.paid_amount
    AND s.school_id = get_current_school_id()
    AND is_admin();
$$;

-- ------------------------------------------------------------
-- 2. Certificate register
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id uuid REFERENCES academic_sessions(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('transfer','bonafide','character','no_dues')),
  cert_no text NOT NULL,
  issued_on date NOT NULL DEFAULT CURRENT_DATE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
  cancel_reason text,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, cert_no)
);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_school_created ON certificates(school_id, created_at DESC);
-- One live TC per student.
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificates_live_tc ON certificates(student_id)
  WHERE type = 'transfer' AND status = 'issued';
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "certificates_admin_select" ON certificates;
CREATE POLICY "certificates_admin_select" ON certificates FOR SELECT TO authenticated
  USING (school_id = get_current_school_id() AND has_permission(ARRAY['documents','students'], 'view'));
DROP POLICY IF EXISTS "certificates_parent_select" ON certificates;
CREATE POLICY "certificates_parent_select" ON certificates FOR SELECT TO authenticated
  USING (student_id IN (SELECT my_student_ids()) AND status = 'issued');
-- Writes only through the RPCs below.

CREATE TABLE IF NOT EXISTS certificate_sequences (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  last_no int NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, prefix)
);
ALTER TABLE certificate_sequences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION issue_certificate(
  p_student uuid, p_type text, p_data jsonb DEFAULT '{}'::jsonb, p_force boolean DEFAULT false
)
RETURNS certificates
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_student students%ROWTYPE;
  v_session academic_sessions%ROWTYPE;
  v_due numeric;
  v_prefix text;
  v_no int;
  v_row certificates;
  v_left date;
BEGIN
  IF NOT has_permission(ARRAY['documents'], 'edit') THEN
    RAISE EXCEPTION 'Your role cannot issue certificates';
  END IF;
  SELECT * INTO v_student FROM students WHERE id = p_student AND school_id = v_school;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;
  IF p_type NOT IN ('transfer','bonafide','character','no_dues') THEN RAISE EXCEPTION 'Unknown certificate type'; END IF;

  SELECT * INTO v_session FROM academic_sessions WHERE school_id = v_school AND is_current;
  v_due := student_outstanding(p_student);

  IF p_type = 'no_dues' AND v_due > 0 THEN
    RAISE EXCEPTION 'DUES_PENDING:%', v_due USING HINT = 'Fees are outstanding, so a no-dues certificate cannot be issued.';
  END IF;
  IF p_type = 'transfer' AND v_due > 0 AND NOT p_force THEN
    RAISE EXCEPTION 'DUES_PENDING:%', v_due USING HINT = 'Clear the dues or confirm to issue the TC anyway.';
  END IF;
  IF p_type = 'transfer' AND EXISTS (SELECT 1 FROM certificates WHERE student_id = p_student AND type = 'transfer' AND status = 'issued') THEN
    RAISE EXCEPTION 'A transfer certificate was already issued for this student. Cancel it first to issue a new one.';
  END IF;

  v_prefix := CASE p_type WHEN 'transfer' THEN 'TC' WHEN 'bonafide' THEN 'BC' WHEN 'character' THEN 'CC' ELSE 'ND' END
              || '/' || coalesce(v_session.name, to_char(CURRENT_DATE, 'YYYY'));
  INSERT INTO certificate_sequences (school_id, prefix, last_no) VALUES (v_school, v_prefix, 1)
  ON CONFLICT (school_id, prefix) DO UPDATE SET last_no = certificate_sequences.last_no + 1
  RETURNING last_no INTO v_no;

  INSERT INTO certificates (school_id, student_id, session_id, type, cert_no, data, issued_by)
  VALUES (v_school, p_student, v_session.id, p_type, v_prefix || '/' || lpad(v_no::text, 4, '0'),
          p_data || jsonb_build_object(
            'snapshot', jsonb_build_object(
              'full_name', v_student.full_name, 'admission_number', v_student.admission_number,
              'class', (SELECT name FROM classes WHERE id = v_student.class_id),
              'section', (SELECT name FROM sections WHERE id = v_student.section_id),
              'father_name', v_student.father_name, 'mother_name', v_student.mother_name,
              'date_of_birth', v_student.date_of_birth, 'admission_date', v_student.admission_date,
              'gender', v_student.gender),
            'dues_at_issue', v_due),
          auth.uid())
  RETURNING * INTO v_row;

  IF p_type = 'transfer' THEN
    v_left := coalesce(nullif(p_data->>'leaving_date', '')::date, CURRENT_DATE);
    UPDATE students SET status = 'inactive', left_on = v_left,
      leaving_reason = nullif(p_data->>'reason', ''), updated_at = now()
    WHERE id = p_student;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_certificate(p_id uuid, p_reason text, p_reactivate boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_cert certificates%ROWTYPE;
BEGIN
  IF NOT has_permission(ARRAY['documents'], 'edit') THEN RAISE EXCEPTION 'Your role cannot cancel certificates'; END IF;
  SELECT * INTO v_cert FROM certificates WHERE id = p_id AND school_id = get_current_school_id();
  IF v_cert.id IS NULL THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  IF v_cert.status = 'cancelled' THEN RETURN; END IF;
  UPDATE certificates SET status = 'cancelled', cancel_reason = nullif(trim(p_reason), '') WHERE id = p_id;
  IF v_cert.type = 'transfer' AND p_reactivate THEN
    UPDATE students SET status = 'active', left_on = NULL, leaving_reason = NULL, updated_at = now()
    WHERE id = v_cert.student_id;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 3. Promotion
-- ------------------------------------------------------------
-- The session before the current one (by start date).
CREATE OR REPLACE FUNCTION previous_session_id(p_school uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id FROM academic_sessions p
  JOIN academic_sessions c ON c.school_id = p.school_id AND c.is_current
  WHERE p.school_id = p_school AND p.start_date < c.start_date
  ORDER BY p.start_date DESC LIMIT 1;
$$;

-- p_moves: [{ "student_id": uuid, "action": "promote"|"retain"|"leave"|"graduate",
--             "class_id": uuid, "section_id": uuid }]
-- Students move from the previous session into the current session.
CREATE OR REPLACE FUNCTION promote_students(p_moves jsonb, p_renumber boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_to uuid;
  v_from uuid;
  m jsonb;
  v_student students%ROWTYPE;
  v_action text;
  v_class uuid;
  v_section uuid;
  v_sections uuid[] := '{}';
  v_counts jsonb := '{"promote":0,"retain":0,"leave":0,"graduate":0}'::jsonb;
BEGIN
  IF NOT has_permission(ARRAY['students'], 'edit') THEN RAISE EXCEPTION 'Your role cannot promote students'; END IF;
  v_to := current_session_id(v_school);
  v_from := previous_session_id(v_school);
  IF v_to IS NULL OR v_from IS NULL THEN
    RAISE EXCEPTION 'Create the new session and make it current before promoting';
  END IF;

  -- Free roll numbers of everyone moving so the (section, roll) unique key
  -- can't collide mid-way.
  UPDATE students SET roll_number = NULL
  WHERE school_id = v_school AND id IN (SELECT (x->>'student_id')::uuid FROM jsonb_array_elements(p_moves) x);

  FOR m IN SELECT * FROM jsonb_array_elements(p_moves) LOOP
    SELECT * INTO v_student FROM students WHERE id = (m->>'student_id')::uuid AND school_id = v_school;
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Student % not found', m->>'student_id'; END IF;
    v_action := m->>'action';
    v_class := nullif(m->>'class_id', '')::uuid;
    v_section := nullif(m->>'section_id', '')::uuid;

    -- Snapshot of where they were last year (if missing).
    INSERT INTO student_enrollments (school_id, session_id, student_id, class_id, section_id, roll_number, status)
    VALUES (v_school, v_from, v_student.id, v_student.class_id, v_student.section_id, NULL, 'studying')
    ON CONFLICT (session_id, student_id) DO NOTHING;

    IF v_action IN ('promote','retain') THEN
      IF v_class IS NULL OR v_section IS NULL THEN RAISE EXCEPTION 'Class and section are required for %', v_student.full_name; END IF;
      IF NOT EXISTS (SELECT 1 FROM sections WHERE id = v_section AND class_id = v_class AND school_id = v_school) THEN
        RAISE EXCEPTION 'Section does not belong to the class for %', v_student.full_name;
      END IF;
      UPDATE student_enrollments SET status = CASE WHEN v_action = 'promote' THEN 'promoted' ELSE 'retained' END, updated_at = now()
      WHERE session_id = v_from AND student_id = v_student.id;
      -- Updating students syncs the current-session enrollment (trigger).
      UPDATE students SET class_id = v_class, section_id = v_section, status = 'active', updated_at = now()
      WHERE id = v_student.id;
      v_sections := array_append(v_sections, v_section);
    ELSIF v_action IN ('leave','graduate') THEN
      UPDATE student_enrollments SET status = CASE WHEN v_action = 'leave' THEN 'left' ELSE 'graduated' END, updated_at = now()
      WHERE session_id = v_from AND student_id = v_student.id;
      UPDATE students SET status = 'inactive', left_on = coalesce(left_on, CURRENT_DATE),
        leaving_reason = coalesce(leaving_reason, CASE WHEN v_action = 'graduate' THEN 'Passed out' ELSE 'Left school' END),
        updated_at = now()
      WHERE id = v_student.id;
      DELETE FROM student_enrollments WHERE session_id = v_to AND student_id = v_student.id;
    ELSE
      RAISE EXCEPTION 'Unknown action %', v_action;
    END IF;
    v_counts := jsonb_set(v_counts, ARRAY[v_action], to_jsonb((v_counts->>v_action)::int + 1));
  END LOOP;

  -- Roll numbers: alphabetical per section, or fill gaps after the
  -- highest existing roll.
  IF p_renumber THEN
    UPDATE students SET roll_number = NULL
    WHERE section_id = ANY(v_sections) AND status = 'active';
    UPDATE students s SET roll_number = r.rn
    FROM (SELECT id, row_number() OVER (PARTITION BY section_id ORDER BY lower(full_name), admission_number) AS rn
          FROM students WHERE section_id = ANY(v_sections) AND status = 'active') r
    WHERE s.id = r.id;
  ELSE
    UPDATE students s SET roll_number = r.rn
    FROM (SELECT st.id,
                 coalesce((SELECT max(roll_number) FROM students x WHERE x.section_id = st.section_id), 0)
                   + row_number() OVER (PARTITION BY st.section_id ORDER BY lower(st.full_name)) AS rn
          FROM students st
          WHERE st.section_id = ANY(v_sections) AND st.status = 'active' AND st.roll_number IS NULL) r
    WHERE s.id = r.id;
  END IF;

  RETURN v_counts;
END;
$$;

-- Where each student of a previous-session class stands (for the
-- promotion screen): their last-session enrollment status.
CREATE OR REPLACE FUNCTION promotion_status(p_class uuid)
RETURNS TABLE (student_id uuid, from_status text, current_class uuid, current_section uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, e.status, s.class_id, s.section_id
  FROM students s
  LEFT JOIN student_enrollments e ON e.student_id = s.id AND e.session_id = previous_session_id(s.school_id)
  WHERE s.school_id = get_current_school_id() AND has_permission(ARRAY['students'], 'view')
    AND (s.class_id = p_class OR e.class_id = p_class);
$$;

REVOKE ALL ON FUNCTION student_outstanding(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION issue_certificate(uuid, text, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION cancel_certificate(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION previous_session_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION promote_students(jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION promotion_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION student_outstanding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION issue_certificate(uuid, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_certificate(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION previous_session_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION promote_students(jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION promotion_status(uuid) TO authenticated;
