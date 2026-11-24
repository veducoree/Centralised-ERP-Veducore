/*
  # 058 — Fee heads: simple, class-wise fees that generate themselves

  Replaces the old "fee structures" (a JSON list in schools.settings plus an
  "Assign to Students" button that could double-charge, charged transport to
  everyone and created past months for mid-year admissions).

  1. fee_heads (per session): name + how often it is charged
       one_time  — once, at admission (Admission / Registration fee)
       annual    — once per session
       monthly   — every month of the session (from the joining month)
       quarterly — Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar (from the joining quarter)
  2. fee_head_amounts: amount per class (a grid in the Fees page).
     No amount / 0 = that class doesn't pay this head.
  3. fees.fee_head_id + fees.source_key: every generated due has a key like
     "head:<id>:2026-11" or "transport:<assignment>:2026-11". A unique index
     on (student_id, source_key) means generating again never double-charges.
  4. generate_student_fees(student) — creates the student's dues for the
     current session: annual + every monthly/quarterly instalment from the
     joining month, plus transport instalments for an approved bus assignment
     (fare and period from the stop). Removes unpaid future transport dues
     when transport is stopped. Safe to run any number of times.
     generate_school_fees(class?) — same for every active student.
  5. admission_fee_lines(class, join_date) — what is due at admission
     (one-time + annual + first instalment); admission_fees_and_receipt now
     stores those lines with their keys and then generates the rest.
  6. Existing fee structures from schools.settings are copied into fee heads
     (transport ones are skipped — transport fares come from the bus stop).
*/

-- ── 1. Tables ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_heads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES academic_sessions(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  kind        text NOT NULL CHECK (kind IN ('one_time', 'annual', 'monthly', 'quarterly')),
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_heads_session_name ON fee_heads (session_id, lower(trim(name)));
CREATE INDEX IF NOT EXISTS idx_fee_heads_school ON fee_heads (school_id);

DROP TRIGGER IF EXISTS trg_fee_heads_session ON fee_heads;
CREATE TRIGGER trg_fee_heads_session BEFORE INSERT ON fee_heads
  FOR EACH ROW EXECUTE FUNCTION trg_default_session_id();

CREATE TABLE IF NOT EXISTS fee_head_amounts (
  fee_head_id uuid NOT NULL REFERENCES fee_heads(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  amount      numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fee_head_id, class_id)
);
CREATE INDEX IF NOT EXISTS idx_fee_head_amounts_class ON fee_head_amounts (class_id);

ALTER TABLE fee_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_head_amounts ENABLE ROW LEVEL SECURITY;

-- Current session only; fee staff can read, fee editors can change.
DROP POLICY IF EXISTS fee_heads_select ON fee_heads;
CREATE POLICY fee_heads_select ON fee_heads FOR SELECT TO authenticated
  USING (school_id = get_current_school_id() AND session_id = current_session_id(school_id)
         AND has_permission(ARRAY['fees', 'admissions', 'students'], 'view'));
DROP POLICY IF EXISTS fee_heads_write ON fee_heads;
CREATE POLICY fee_heads_write ON fee_heads FOR ALL TO authenticated
  USING (school_id = get_current_school_id() AND session_id = current_session_id(school_id) AND has_permission(ARRAY['fees'], 'edit'))
  WITH CHECK (school_id = get_current_school_id() AND has_permission(ARRAY['fees'], 'edit'));

DROP POLICY IF EXISTS fee_head_amounts_select ON fee_head_amounts;
CREATE POLICY fee_head_amounts_select ON fee_head_amounts FOR SELECT TO authenticated
  USING (school_id = get_current_school_id() AND has_permission(ARRAY['fees', 'admissions', 'students'], 'view'));
DROP POLICY IF EXISTS fee_head_amounts_write ON fee_head_amounts;
CREATE POLICY fee_head_amounts_write ON fee_head_amounts FOR ALL TO authenticated
  USING (school_id = get_current_school_id() AND has_permission(ARRAY['fees'], 'edit'))
  WITH CHECK (school_id = get_current_school_id() AND has_permission(ARRAY['fees'], 'edit')
              AND EXISTS (SELECT 1 FROM fee_heads h WHERE h.id = fee_head_id AND h.school_id = fee_head_amounts.school_id));

-- ── 2. Link generated dues ──────────────────────────────────────────────────
ALTER TABLE fees ADD COLUMN IF NOT EXISTS fee_head_id uuid REFERENCES fee_heads(id) ON DELETE SET NULL;
ALTER TABLE fees ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fees_student_source_key ON fees (student_id, source_key) WHERE source_key IS NOT NULL;

-- ── 3. Helpers ──────────────────────────────────────────────────────────────
-- Monthly due day from Settings ("Default Monthly Due Date"), 1–28.
CREATE OR REPLACE FUNCTION fee_due_day(p_school uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT least(greatest(coalesce(nullif(settings->>'feeDueDay', '')::int, 10), 1), 28)
  FROM schools WHERE id = p_school;
$$;

-- Due date in a month (clamped to the month's length).
CREATE OR REPLACE FUNCTION fee_due_in_month(p_month date, p_day int)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (date_trunc('month', p_month)::date + (least(p_day,
           extract(day FROM (date_trunc('month', p_month) + interval '1 month - 1 day'))::int) - 1));
$$;

/*
  Instalments of one head for a student joining on p_join in a session.
  Returns (period_key, label, due_date). period_key is unique per head.
*/
CREATE OR REPLACE FUNCTION fee_periods(p_kind text, p_start date, p_end date, p_join date, p_due_day int, p_session_name text)
RETURNS TABLE (period_key text, label text, due_date date)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_from date := greatest(p_start, coalesce(p_join, p_start));
  m date;
  q int;
  qs date;
BEGIN
  IF p_kind IN ('one_time') THEN
    period_key := 'once'; label := ''; due_date := v_from; RETURN NEXT;
  ELSIF p_kind = 'annual' THEN
    period_key := p_session_name; label := p_session_name;
    due_date := greatest(fee_due_in_month(p_start, p_due_day), v_from); RETURN NEXT;
  ELSIF p_kind = 'monthly' THEN
    m := date_trunc('month', v_from)::date;
    WHILE m <= p_end LOOP
      period_key := to_char(m, 'YYYY-MM'); label := to_char(m, 'Mon YYYY');
      due_date := greatest(fee_due_in_month(m, p_due_day), v_from); RETURN NEXT;
      m := (m + interval '1 month')::date;
    END LOOP;
  ELSIF p_kind = 'quarterly' THEN
    FOR q IN 0..3 LOOP
      qs := (date_trunc('month', p_start) + make_interval(months => q * 3))::date;
      IF qs > p_end THEN EXIT; END IF;
      IF (qs + interval '3 months - 1 day')::date < v_from THEN CONTINUE; END IF;  -- quarter over before joining
      period_key := 'Q' || (q + 1);
      label := 'Q' || (q + 1) || ' (' || to_char(qs, 'Mon') || '–' || to_char(qs + interval '2 months', 'Mon') || ')';
      due_date := greatest(fee_due_in_month(qs, p_due_day), v_from); RETURN NEXT;
    END LOOP;
  END IF;
END;
$$;

-- ── 4. Generate a student's dues ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_student_fees(p_student uuid, p_skip text[] DEFAULT '{}')
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
CREATE OR REPLACE FUNCTION generate_school_fees(p_class uuid DEFAULT NULL)
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
    v_total := v_total + generate_student_fees(s.id);
    v_students := v_students + 1;
  END LOOP;
  RETURN jsonb_build_object('students', v_students, 'created', v_total);
END;
$$;

-- ── 5. What is due at admission ─────────────────────────────────────────────
-- One-time + annual + the first instalment of monthly/quarterly heads.
CREATE OR REPLACE FUNCTION admission_fee_lines(p_class uuid, p_join date DEFAULT current_date)
RETURNS TABLE (fee_head_id uuid, source_key text, fee_type text, amount numeric, kind text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_sess academic_sessions;
  v_due int;
  h record;
  p record;
BEGIN
  IF v_school IS NULL OR NOT has_permission(ARRAY['admissions', 'students', 'fees'], 'view') THEN RETURN; END IF;
  SELECT * INTO v_sess FROM academic_sessions WHERE school_id = v_school AND is_current LIMIT 1;
  IF v_sess.id IS NULL THEN RETURN; END IF;
  v_due := fee_due_day(v_school);

  FOR h IN
    SELECT fh.id, fh.name, fh.kind, fa.amount
    FROM fee_heads fh
    JOIN fee_head_amounts fa ON fa.fee_head_id = fh.id AND fa.class_id = p_class
    WHERE fh.school_id = v_school AND fh.session_id = v_sess.id AND fh.is_active AND fa.amount > 0
    ORDER BY CASE fh.kind WHEN 'one_time' THEN 0 WHEN 'annual' THEN 1 WHEN 'quarterly' THEN 2 ELSE 3 END, fh.sort_order, fh.name
  LOOP
    SELECT * INTO p FROM fee_periods(h.kind, v_sess.start_date, v_sess.end_date, coalesce(p_join, current_date), v_due, v_sess.name) LIMIT 1;
    CONTINUE WHEN p.period_key IS NULL;
    fee_head_id := h.id;
    source_key := 'head:' || h.id || ':' || p.period_key;
    fee_type := h.name || CASE WHEN h.kind = 'one_time' THEN '' WHEN h.kind = 'annual' THEN ' ' || p.label ELSE ' - ' || p.label END;
    amount := h.amount;
    kind := h.kind;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ── 6. Admission save: keep each line's key, then generate the rest ─────────
CREATE OR REPLACE FUNCTION admission_fees_and_receipt(p_student uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_student students;
  v_ay text := coalesce(nullif(trim(p->>'academic_year'), ''), '2026-27');
  v_due date := coalesce(nullif(p->>'due_date', '')::date, current_date);
  v_option text := coalesce(p->>'payment_option', 'later');
  v_mode text := nullif(trim(coalesce(p->>'payment_mode', '')), '');
  v_pay_date date := coalesce(nullif(p->>'payment_date', '')::date, current_date);
  v_key text := nullif(trim(coalesce(p->>'idempotency_key', '')), '');
  v_existing admission_receipts;
  v_seq int;
  v_receipt_no text;
  v_receipt_id uuid;
  v_lines jsonb;
  v_skip text[];
  v_n int;
  v_total numeric := 0;
  v_disc numeric := 0;
  v_net numeric;
  v_paid numeric := 0;
  v_disc_left numeric;
  v_pay_left numeric;
  v_line jsonb;
  v_amt numeric;
  v_line_disc numeric;
  v_line_net numeric;
  v_share numeric;
  v_fee_id uuid;
  v_fee_ids uuid[] := '{}';
  v_fee_nets numeric[] := '{}';
  i int;
BEGIN
  IF v_school IS NULL OR NOT has_permission(ARRAY['admissions', 'students'], 'edit') THEN
    RAISE EXCEPTION 'Your role cannot add admissions';
  END IF;

  SELECT * INTO v_student FROM students WHERE id = p_student AND school_id = v_school;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;

  IF current_session_id(v_school) IS NULL THEN
    RAISE EXCEPTION 'No current academic session. Set the current session in Academic Sessions first.';
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM admission_receipts WHERE idempotency_key = v_key AND school_id = v_school;
    IF v_existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'receipt_id', v_existing.id, 'receipt_number', v_existing.receipt_number,
        'total_fees', v_existing.total_fees, 'discount_amount', v_existing.discount_amount,
        'net_payable', v_existing.net_payable, 'paid_now', v_existing.paid_now,
        'balance_due', v_existing.balance_due, 'duplicate', true);
    END IF;
  END IF;

  IF v_option NOT IN ('full', 'partial', 'later') THEN v_option := 'later'; END IF;
  IF v_option <> 'later' AND NOT has_permission(ARRAY['fees'], 'edit') THEN
    RAISE EXCEPTION 'Your role cannot collect fee payments';
  END IF;

  -- Keys the admin unticked: never generate those dues for this student.
  SELECT coalesce(array_agg(l->>'source_key'), '{}') INTO v_skip
  FROM jsonb_array_elements(coalesce(p->'fee_lines', '[]'::jsonb)) l
  WHERE NOT coalesce((l->>'include')::boolean, true) AND coalesce(l->>'source_key', '') <> '';

  SELECT coalesce(jsonb_agg(l), '[]'::jsonb) INTO v_lines
  FROM jsonb_array_elements(coalesce(p->'fee_lines', '[]'::jsonb)) l
  WHERE coalesce((l->>'include')::boolean, true)
    AND coalesce((l->>'amount')::numeric, 0) > 0
    AND trim(coalesce(l->>'fee_type', '')) <> '';
  v_n := jsonb_array_length(v_lines);

  SELECT coalesce(sum((l->>'amount')::numeric), 0) INTO v_total FROM jsonb_array_elements(v_lines) l;

  IF coalesce((p->'discount'->>'value')::numeric, 0) > 0 THEN
    v_disc := CASE WHEN p->'discount'->>'type' = 'percent'
                   THEN round(v_total * least((p->'discount'->>'value')::numeric, 100) / 100, 2)
                   ELSE round((p->'discount'->>'value')::numeric, 2) END;
  END IF;
  v_disc := least(greatest(v_disc, 0), v_total);
  v_net := v_total - v_disc;

  IF v_option <> 'later' THEN
    v_paid := least(greatest(round(coalesce((p->>'amount_paying')::numeric, 0), 2), 0), v_net);
    IF v_paid <= 0 THEN v_option := 'later'; v_paid := 0; END IF;
  END IF;

  INSERT INTO receipt_sequences (school_id, academic_year, last_seq)
  VALUES (v_school, v_ay, 1)
  ON CONFLICT (school_id, academic_year) DO UPDATE SET last_seq = receipt_sequences.last_seq + 1, updated_at = now()
  RETURNING last_seq INTO v_seq;
  v_receipt_no := 'RCPT/' || regexp_replace(v_ay, '^20', '') || '/' || lpad(v_seq::text, 4, '0');

  v_disc_left := v_disc;
  FOR i IN 0 .. v_n - 1 LOOP
    v_line := v_lines->i;
    v_amt := round((v_line->>'amount')::numeric, 2);
    IF i = v_n - 1 THEN v_line_disc := v_disc_left;
    ELSE v_line_disc := least(v_disc_left, round(v_disc * v_amt / nullif(v_total, 0), 2));
    END IF;
    v_disc_left := v_disc_left - v_line_disc;
    v_line_net := v_amt - v_line_disc;
    IF v_line_net <= 0 THEN CONTINUE; END IF;

    INSERT INTO fees (school_id, student_id, fee_type, amount, due_date, status, fee_head_id, source_key)
    VALUES (v_school, p_student, trim(v_line->>'fee_type'), v_line_net, v_due, 'pending',
            nullif(v_line->>'fee_head_id', '')::uuid, nullif(v_line->>'source_key', ''))
    ON CONFLICT (student_id, source_key) WHERE source_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_fee_id;
    IF v_fee_id IS NULL THEN CONTINUE; END IF;
    v_fee_ids := v_fee_ids || v_fee_id;
    v_fee_nets := v_fee_nets || v_line_net;
    v_fee_id := NULL;
  END LOOP;

  IF v_paid > 0 THEN
    v_pay_left := v_paid;
    FOR i IN 1 .. coalesce(array_length(v_fee_ids, 1), 0) LOOP
      IF i = array_length(v_fee_ids, 1) THEN v_share := least(v_pay_left, v_fee_nets[i]);
      ELSE v_share := least(v_pay_left, v_fee_nets[i], round(v_paid * v_fee_nets[i] / nullif(v_net, 0), 2));
      END IF;
      v_pay_left := v_pay_left - v_share;
      IF v_share <= 0 THEN CONTINUE; END IF;

      INSERT INTO fee_payments (school_id, fee_id, student_id, amount, payment_date, payment_method, receipt_number, recorded_by)
      VALUES (v_school, v_fee_ids[i], p_student, v_share, v_pay_date, coalesce(v_mode, 'Cash'), v_receipt_no, auth.uid());

      UPDATE fees SET
        paid_amount = paid_amount + v_share,
        status = CASE WHEN paid_amount + v_share >= amount THEN 'paid'::fee_status ELSE 'partially_paid'::fee_status END,
        payment_date = v_pay_date,
        payment_method = coalesce(v_mode, 'Cash'),
        receipt_number = v_receipt_no
      WHERE id = v_fee_ids[i];
    END LOOP;
  END IF;

  INSERT INTO admission_receipts (
    school_id, student_id, admission_number, receipt_number, academic_year, fee_lines,
    discount_amount, discount_type, discount_reason, discount_note,
    total_fees, net_payable, paid_now, balance_due,
    payment_option, payment_mode, transaction_ref, payment_date, remarks,
    collected_by, collected_by_name, idempotency_key
  ) VALUES (
    v_school, p_student, coalesce(nullif(p->>'admission_number', ''), v_student.admission_number), v_receipt_no, v_ay,
    coalesce(p->'fee_lines', '[]'::jsonb),
    v_disc,
    CASE WHEN v_disc > 0 THEN p->'discount'->>'type' END,
    CASE WHEN v_disc > 0 THEN p->'discount'->>'reason' END,
    CASE WHEN v_disc > 0 THEN nullif(trim(coalesce(p->'discount'->>'reason_note', '')), '') END,
    v_total, v_net, v_paid, v_net - v_paid,
    v_option,
    CASE WHEN v_option <> 'later' THEN v_mode END,
    nullif(trim(coalesce(p->>'transaction_ref', '')), ''),
    CASE WHEN v_option <> 'later' THEN v_pay_date END,
    nullif(trim(coalesce(p->>'remarks', '')), ''),
    auth.uid(), nullif(p->>'collected_by_name', ''), v_key
  ) RETURNING id INTO v_receipt_id;

  -- The rest of the session's instalments (keys already created above are skipped).
  PERFORM generate_student_fees(p_student, v_skip);

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id, 'receipt_number', v_receipt_no,
    'total_fees', v_total, 'discount_amount', v_disc, 'net_payable', v_net,
    'paid_now', v_paid, 'balance_due', v_net - v_paid, 'fee_ids', to_jsonb(v_fee_ids), 'duplicate', false);
END;
$$;

REVOKE ALL ON FUNCTION generate_student_fees(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION generate_school_fees(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admission_fee_lines(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admission_fees_and_receipt(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fee_due_day(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_student_fees(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_school_fees(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admission_fee_lines(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION admission_fees_and_receipt(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fee_due_day(uuid) TO authenticated;

-- ── 7. Copy existing fee structures (schools.settings) into fee heads ───────
DO $$
DECLARE
  s record;
  x jsonb;
  v_sess uuid;
  v_kind text;
  v_name text;
  v_head uuid;
  v_amt numeric;
BEGIN
  FOR s IN SELECT id, settings FROM schools WHERE jsonb_typeof(settings->'fee_structures') = 'array' LOOP
    v_sess := current_session_id(s.id);
    CONTINUE WHEN v_sess IS NULL;
    FOR x IN SELECT * FROM jsonb_array_elements(s.settings->'fee_structures') LOOP
      CONTINUE WHEN coalesce(x->>'id', '') LIKE 'sample-%';
      CONTINUE WHEN coalesce((x->>'is_active')::boolean, true) = false;
      CONTINUE WHEN coalesce(x->>'fee_type', '') = 'Transport';     -- fares come from bus stops
      v_amt := coalesce(nullif(x->>'amount', '')::numeric, 0);
      CONTINUE WHEN v_amt <= 0;

      v_kind := CASE
        WHEN x->>'fee_type' IN ('Admission', 'Registration') OR x->>'frequency' = 'one_time' THEN 'one_time'
        WHEN x->>'frequency' = 'monthly' THEN 'monthly'
        WHEN x->>'frequency' = 'quarterly' THEN 'quarterly'
        ELSE 'annual' END;
      -- One head per fee type + frequency (e.g. class-wise "Monthly Tuition Fee" rows → "Tuition Fee").
      v_name := CASE WHEN coalesce(x->>'fee_type', '') IN ('', 'Other') THEN trim(x->>'name')
                     ELSE (x->>'fee_type') || ' Fee' END;

      SELECT id INTO v_head FROM fee_heads WHERE session_id = v_sess AND lower(trim(name)) = lower(v_name);
      IF v_head IS NULL THEN
        INSERT INTO fee_heads (school_id, session_id, name, kind)
        VALUES (s.id, v_sess, v_name, v_kind) RETURNING id INTO v_head;
      END IF;

      INSERT INTO fee_head_amounts (fee_head_id, class_id, school_id, amount)
      SELECT v_head, c.id, s.id, v_amt
      FROM classes c
      WHERE c.school_id = s.id AND (nullif(x->>'class_id', '') IS NULL OR c.id::text = x->>'class_id')
      ON CONFLICT (fee_head_id, class_id) DO UPDATE SET amount = EXCLUDED.amount;
      v_head := NULL;
    END LOOP;
  END LOOP;
END $$;
