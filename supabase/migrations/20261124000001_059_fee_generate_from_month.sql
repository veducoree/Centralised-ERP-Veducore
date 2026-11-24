/*
  # 059 — "Generate fees" can start from a chosen month

  A school that starts using Veducore mid-session has usually collected the
  earlier months offline. generate_student_fees / generate_school_fees take an
  optional p_from date: instalments due before that month are not created.
  (Admission still generates from the joining date.)
*/

DROP FUNCTION IF EXISTS generate_school_fees(uuid);
DROP FUNCTION IF EXISTS generate_student_fees(uuid, text[]);

CREATE OR REPLACE FUNCTION generate_student_fees(p_student uuid, p_skip text[] DEFAULT '{}', p_from date DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_st students;
  v_sess academic_sessions;
  v_due int;
  v_join date;
  v_count int := 0;
  v_n int;
  h record;
  p record;
  a record;
  v_kind text;
  v_amt numeric;
  v_from date;
  v_to date;
  v_key text;
BEGIN
  SELECT * INTO v_st FROM students WHERE id = p_student;
  IF v_st.id IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;
  -- Called by a signed-in user: only for their own school, with a fees/admissions/transport role.
  IF auth.uid() IS NOT NULL AND (v_st.school_id IS DISTINCT FROM get_current_school_id()
       OR NOT has_permission(ARRAY['fees', 'admissions', 'students', 'transport'], 'edit')) THEN
    RAISE EXCEPTION 'Not allowed to generate fees for this student';
  END IF;
  IF v_st.status <> 'active' THEN RETURN 0; END IF;

  SELECT * INTO v_sess FROM academic_sessions WHERE school_id = v_st.school_id AND is_current LIMIT 1;
  IF v_sess.id IS NULL THEN
    RAISE EXCEPTION 'No current academic session. Set the current session in Academic Sessions first.';
  END IF;
  v_due := fee_due_day(v_st.school_id);
  v_join := greatest(v_sess.start_date, coalesce(v_st.admission_date, v_sess.start_date));
  -- Optional start month (earlier months were collected outside Veducore).
  IF p_from IS NOT NULL THEN v_join := greatest(v_join, date_trunc('month', p_from)::date); END IF;

  -- Class fee heads (one-time heads are only charged at admission)
  IF v_st.class_id IS NOT NULL THEN
    FOR h IN
      SELECT fh.id, fh.name, fh.kind, fa.amount
      FROM fee_heads fh
      JOIN fee_head_amounts fa ON fa.fee_head_id = fh.id AND fa.class_id = v_st.class_id
      WHERE fh.school_id = v_st.school_id AND fh.session_id = v_sess.id
        AND fh.is_active AND fh.kind <> 'one_time' AND fa.amount > 0
    LOOP
      FOR p IN SELECT * FROM fee_periods(h.kind, v_sess.start_date, v_sess.end_date, v_join, v_due, v_sess.name) LOOP
        v_key := 'head:' || h.id || ':' || p.period_key;
        CONTINUE WHEN v_key = ANY (coalesce(p_skip, '{}'));
        INSERT INTO fees (school_id, student_id, fee_type, amount, due_date, status, fee_head_id, source_key)
        VALUES (v_st.school_id, p_student, h.name || CASE WHEN h.kind = 'annual' THEN ' ' ELSE ' - ' END || p.label,
                h.amount, p.due_date, 'pending', h.id, v_key)
        ON CONFLICT (student_id, source_key) WHERE source_key IS NOT NULL DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_count := v_count + v_n;
      END LOOP;
    END LOOP;
  END IF;

  -- Transport: instalments for each approved bus assignment, from its start date
  FOR a IN
      SELECT sta.id, sta.start_date, sta.end_date, sta.fare_snapshot, ts.amount AS stop_amount,
             ts.fare_period AS stop_period, ts.stop_name
      FROM student_transport_assignments sta
      LEFT JOIN transport_stops ts ON ts.id = sta.stop_id
      WHERE sta.student_id = p_student AND sta.status = 'approved'
  LOOP
    v_amt := coalesce(nullif(a.fare_snapshot->>'amount', '')::numeric, a.stop_amount, 0);
    CONTINUE WHEN v_amt <= 0;
    v_kind := CASE coalesce(a.fare_snapshot->>'fare_period', a.stop_period, 'Monthly')
                WHEN 'Quarterly' THEN 'quarterly' WHEN 'Yearly' THEN 'annual' ELSE 'monthly' END;
    v_from := greatest(coalesce(a.start_date, current_date), v_join);
    v_to := least(coalesce(a.end_date, v_sess.end_date), v_sess.end_date);
    CONTINUE WHEN v_from > v_to;
    FOR p IN SELECT * FROM fee_periods(v_kind, v_sess.start_date, v_to, v_from, v_due, v_sess.name) LOOP
      v_key := 'transport:' || a.id || ':' || p.period_key;
      CONTINUE WHEN v_key = ANY (coalesce(p_skip, '{}'));
      INSERT INTO fees (school_id, student_id, fee_type, amount, due_date, status, source_key)
      VALUES (v_st.school_id, p_student,
              'Transport Fee (' || coalesce(a.fare_snapshot->>'stop_name', a.stop_name, 'Bus') || ')'
                || CASE WHEN v_kind = 'annual' THEN ' ' ELSE ' - ' END || p.label,
              v_amt, p.due_date, 'pending', v_key)
      ON CONFLICT (student_id, source_key) WHERE source_key IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_count := v_count + v_n;
    END LOOP;
  END LOOP;

  -- Transport stopped / ended: drop its unpaid dues after the end date
  DELETE FROM fees f
  USING student_transport_assignments sta
  WHERE f.student_id = p_student
    AND sta.student_id = p_student
    AND f.source_key LIKE 'transport:' || sta.id || ':%'
    AND (sta.status IN ('stopped', 'rejected') OR sta.end_date IS NOT NULL)
    AND f.paid_amount = 0
    AND f.due_date > coalesce(sta.end_date, current_date);

  RETURN v_count;
END;
$$;

-- Every active student (optionally one class) — "Generate fees" button.
CREATE OR REPLACE FUNCTION generate_school_fees(p_class uuid DEFAULT NULL, p_from date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  s record;
  v_total int := 0;
  v_students int := 0;
BEGIN
  IF v_school IS NULL OR NOT has_permission(ARRAY['fees'], 'edit') THEN
    RAISE EXCEPTION 'Your role cannot generate fees';
  END IF;
  FOR s IN SELECT id FROM students WHERE school_id = v_school AND status = 'active' AND (p_class IS NULL OR class_id = p_class) LOOP
    v_total := v_total + generate_student_fees(s.id, '{}', p_from);
    v_students := v_students + 1;
  END LOOP;
  RETURN jsonb_build_object('students', v_students, 'created', v_total);
END;
$$;

REVOKE ALL ON FUNCTION generate_student_fees(uuid, text[], date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION generate_school_fees(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_student_fees(uuid, text[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_school_fees(uuid, date) TO authenticated;
