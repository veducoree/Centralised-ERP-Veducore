-- ============================================================
-- 035: Apply a confirmed Razorpay payment atomically.
-- Called only by the `payments` edge function (service role) after it
-- has verified the payment with Razorpay. Idempotent: a payment row is
-- applied once; later calls just return it.
-- ============================================================
CREATE OR REPLACE FUNCTION apply_online_payment(p_id uuid, p_razorpay_payment_id text, p_transfer text DEFAULT NULL)
RETURNS online_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row online_payments;
  v_alloc jsonb;
  v_fee fees%ROWTYPE;
  v_amt numeric;
  v_apply numeric;
  v_new_paid numeric;
  v_due date;
  v_next date;
  v_today date;
  v_receipt text;
  v_total_applied numeric := 0;
BEGIN
  -- Lock the row; only a 'created' payment can be applied.
  SELECT * INTO v_row FROM online_payments WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_row.status = 'paid' THEN RETURN v_row; END IF;
  IF v_row.status NOT IN ('created','processing') THEN
    RAISE EXCEPTION 'Payment is %', v_row.status;
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_receipt := 'ONL-' || to_char(v_today, 'YYMMDD') || '-' || upper(substr(md5(v_row.id::text), 1, 6));

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_row.allocations) LOOP
    SELECT * INTO v_fee FROM fees WHERE id = (v_alloc->>'fee_id')::uuid FOR UPDATE;
    IF v_fee.id IS NULL OR v_fee.school_id <> v_row.school_id THEN CONTINUE; END IF;

    v_amt := round((v_alloc->>'amount')::numeric / 100, 2);
    -- Never over-pay a fee (another payment may have landed meanwhile).
    v_apply := least(v_amt, greatest(v_fee.amount - v_fee.paid_amount, 0));
    IF v_apply <= 0 THEN CONTINUE; END IF;
    v_new_paid := v_fee.paid_amount + v_apply;

    v_due := v_fee.due_date;
    BEGIN
      v_next := nullif(v_row.next_due_dates->>(v_fee.id::text), '')::date;
    EXCEPTION WHEN OTHERS THEN v_next := NULL;
    END;
    -- Next instalment date only moves forward, at most ~13 months.
    IF v_new_paid < v_fee.amount AND v_next IS NOT NULL AND v_next >= v_fee.due_date AND v_next <= v_fee.due_date + 400 THEN
      v_due := v_next;
    END IF;

    INSERT INTO fee_payments (school_id, fee_id, student_id, amount, payment_date, payment_method, receipt_number, recorded_by)
    VALUES (v_row.school_id, v_fee.id, v_fee.student_id, v_apply, v_today, 'Online (Razorpay)', v_receipt, v_row.initiated_by);

    UPDATE fees SET
      paid_amount = v_new_paid,
      status = CASE WHEN v_new_paid >= amount THEN 'paid'::fee_status ELSE 'partially_paid'::fee_status END,
      payment_date = v_today,
      payment_method = 'Online (Razorpay)',
      receipt_number = v_receipt,
      due_date = v_due,
      updated_at = now()
    WHERE id = v_fee.id;

    v_total_applied := v_total_applied + v_apply;
  END LOOP;

  IF v_row.admission_receipt_id IS NOT NULL AND v_total_applied > 0 THEN
    UPDATE admission_receipts SET
      paid_now = paid_now + v_total_applied,
      balance_due = greatest(balance_due - v_total_applied, 0),
      payment_option = CASE WHEN greatest(balance_due - v_total_applied, 0) = 0 THEN 'full' ELSE 'partial' END,
      payment_mode = 'Online (Razorpay)',
      transaction_ref = p_razorpay_payment_id,
      payment_date = v_today,
      updated_at = now()
    WHERE id = v_row.admission_receipt_id;
  END IF;

  UPDATE online_payments SET
    status = 'paid',
    razorpay_payment_id = p_razorpay_payment_id,
    receipt_number = v_receipt,
    platform_transfer = coalesce(p_transfer, platform_transfer),
    paid_at = now(),
    error = NULL
  WHERE id = p_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION apply_online_payment(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_online_payment(uuid, text, text) TO service_role;
