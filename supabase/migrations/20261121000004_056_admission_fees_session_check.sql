/*
  # 056 — admission_fees_and_receipt: clear error when the school has no current session

  Fee rows get session_id from the current academic session; without one the
  insert failed with a raw "null value in column session_id" error.
  Same function as 055 plus that check.
*/

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

  -- Fee rows belong to the current session (trg_default_session_id).
  IF current_session_id(v_school) IS NULL THEN
    RAISE EXCEPTION 'No current academic session. Set the current session in Academic Sessions first.';
  END IF;

  -- Same wizard submitted twice → return the first result.
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

  -- Included lines with an amount
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

  -- Receipt number: atomic per school + academic year → RCPT/26-27/0001
  INSERT INTO receipt_sequences (school_id, academic_year, last_seq)
  VALUES (v_school, v_ay, 1)
  ON CONFLICT (school_id, academic_year) DO UPDATE SET last_seq = receipt_sequences.last_seq + 1, updated_at = now()
  RETURNING last_seq INTO v_seq;
  v_receipt_no := 'RCPT/' || regexp_replace(v_ay, '^20', '') || '/' || lpad(v_seq::text, 4, '0');

  -- Fee rows at the discounted amount (discount split in proportion, last line takes the rest)
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

    INSERT INTO fees (school_id, student_id, fee_type, amount, due_date, status)
    VALUES (v_school, p_student, trim(v_line->>'fee_type'), v_line_net, v_due, 'pending')
    RETURNING id INTO v_fee_id;
    v_fee_ids := v_fee_ids || v_fee_id;
    v_fee_nets := v_fee_nets || v_line_net;
  END LOOP;

  -- Payment split across the fee rows in proportion (last row takes the rest)
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

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id, 'receipt_number', v_receipt_no,
    'total_fees', v_total, 'discount_amount', v_disc, 'net_payable', v_net,
    'paid_now', v_paid, 'balance_due', v_net - v_paid, 'fee_ids', to_jsonb(v_fee_ids), 'duplicate', false);
END;
$$;

REVOKE ALL ON FUNCTION admission_fees_and_receipt(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admission_fees_and_receipt(uuid, jsonb) TO authenticated;
