-- ============================================================
-- 037: Remove the ₹5 platform fee, Route transfer and its ledger.
-- Online payments are now: fee + 2% convenience fee + 18% GST on that
-- convenience fee, all collected into the school's own Razorpay account.
-- ============================================================

DROP VIEW IF EXISTS platform_fee_ledger;

-- apply_online_payment loses the transfer argument.
DROP FUNCTION IF EXISTS apply_online_payment(uuid, text, text);

ALTER TABLE online_payments DROP COLUMN IF EXISTS platform_transfer;
ALTER TABLE online_payments DROP COLUMN IF EXISTS platform_fee;
ALTER TABLE payment_gateways DROP COLUMN IF EXISTS veducore_account_id;

CREATE OR REPLACE FUNCTION payment_gateway_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'active', g.is_active,
      'key_id', g.key_id,
      'mode', CASE WHEN g.key_id LIKE 'rzp_live_%' THEN 'live' ELSE 'test' END,
      'verified_at', g.verified_at,
      'key_hint', 'rzp_…' || right(g.key_id, 4))
    FROM payment_gateways g WHERE g.school_id = get_current_school_id()
  ), jsonb_build_object('active', false));
$$;
REVOKE ALL ON FUNCTION payment_gateway_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION payment_gateway_status() TO authenticated;

CREATE FUNCTION apply_online_payment(p_id uuid, p_razorpay_payment_id text)
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
  v_unapplied bigint;
BEGIN
  SELECT * INTO v_row FROM online_payments WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_row.status = 'paid' THEN RETURN v_row; END IF;
  IF v_row.status NOT IN ('created','processing','expired','failed') THEN
    RAISE EXCEPTION 'Payment is %', v_row.status;
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_receipt := 'ONL-' || to_char(v_today, 'YYMMDD') || '-' || upper(substr(md5(v_row.id::text), 1, 6));

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_row.allocations) LOOP
    SELECT * INTO v_fee FROM fees WHERE id = (v_alloc->>'fee_id')::uuid FOR UPDATE;
    IF v_fee.id IS NULL OR v_fee.school_id <> v_row.school_id THEN CONTINUE; END IF;

    v_amt := round((v_alloc->>'amount')::numeric / 100, 2);
    v_apply := least(v_amt, greatest(v_fee.amount - v_fee.paid_amount, 0));
    IF v_apply <= 0 THEN CONTINUE; END IF;
    v_new_paid := v_fee.paid_amount + v_apply;

    v_due := v_fee.due_date;
    BEGIN
      v_next := nullif(v_row.next_due_dates->>(v_fee.id::text), '')::date;
    EXCEPTION WHEN OTHERS THEN v_next := NULL;
    END;
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

  v_unapplied := greatest(v_row.fee_amount - round(v_total_applied * 100)::bigint, 0);

  UPDATE online_payments SET
    status = 'paid',
    razorpay_payment_id = p_razorpay_payment_id,
    receipt_number = v_receipt,
    unapplied_amount = v_unapplied,
    refund_status = CASE WHEN v_unapplied > 0 THEN 'needed' ELSE 'none' END,
    paid_at = now(),
    error = CASE WHEN v_unapplied > 0 THEN 'Fee was already paid; ₹' || (v_unapplied / 100.0)::text || ' needs a refund' ELSE NULL END
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_unapplied > 0 THEN
    INSERT INTO notifications (school_id, audience, user_id, title, message, category, type, link, entity_type, entity_id, priority)
    SELECT v_row.school_id, 'user', p.id, 'Online payment needs a refund',
      '₹' || to_char(v_unapplied / 100.0, 'FM99,99,990.00') || ' paid online (receipt ' || v_receipt || ') could not be applied because the fee was already paid. Refund it from the Razorpay dashboard.',
      'fee', 'warning', '/admin/fees', 'online_payment', v_row.id, 'high'
    FROM profiles p LEFT JOIN staff_roles r ON r.id = p.staff_role_id
    WHERE p.school_id = v_row.school_id AND p.role = 'admin' AND p.status = 'active'
      AND (p.staff_role_id IS NULL OR r.permissions->>'fees' = 'edit');
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION apply_online_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_online_payment(uuid, text) TO service_role;
