/*
# Allow Parents to Record Online Fee Payments for Linked Children

1. Adds UPDATE policy on `fees` for parents (`fees_parent_update`) so online/app fee payments (monthly, quarterly, annual) can update `paid_amount`, `status`, `due_date`, `payment_date`, `payment_method`, and `receipt_number`.
2. Adds INSERT policy on `fee_payments` for parents (`fee_payments_parent_insert`).
*/

DROP POLICY IF EXISTS "fees_parent_update" ON fees;
CREATE POLICY "fees_parent_update" ON fees FOR UPDATE
TO authenticated
USING (
  is_parent() AND school_id = get_current_school_id() AND student_id = ANY(get_parent_student_ids())
)
WITH CHECK (
  is_parent() AND school_id = get_current_school_id() AND student_id = ANY(get_parent_student_ids())
);

DROP POLICY IF EXISTS "fee_payments_parent_insert" ON fee_payments;
CREATE POLICY "fee_payments_parent_insert" ON fee_payments FOR INSERT
TO authenticated
WITH CHECK (
  is_parent() AND school_id = get_current_school_id() AND student_id = ANY(get_parent_student_ids())
);

