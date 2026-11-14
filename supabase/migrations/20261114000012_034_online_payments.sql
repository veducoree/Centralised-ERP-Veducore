-- ============================================================
-- 034: Real Razorpay payments
--
-- SECURITY: parents could UPDATE their child's fees (paid_amount,
-- status) and INSERT fee_payments directly, i.e. mark fees paid without
-- paying. Those policies are dropped; online payments are now recorded
-- only by the `payments` edge function after Razorpay confirms them.
--
-- * payment_gateways: each school's Razorpay keys. The secret is readable
--   only by the service role (no RLS policies, no grants).
-- * online_payments: one row per checkout with the server-computed
--   breakdown: fee + 2% convenience + 18% GST on it + ₹5 platform fee.
--   The ₹5 goes to Veducore through Razorpay Route when the school has
--   a Veducore linked account; otherwise it is recorded for settlement.
-- ============================================================

DROP POLICY IF EXISTS "fees_parent_update" ON fees;
DROP POLICY IF EXISTS "fee_payments_parent_insert" ON fee_payments;

CREATE TABLE IF NOT EXISTS payment_gateways (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'razorpay' CHECK (provider IN ('razorpay')),
  key_id text NOT NULL,
  key_secret text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- Razorpay Route linked account (acc_…) that receives Veducore's fee.
  -- Set by Veducore, not by the school.
  veducore_account_id text,
  verified_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_gateways FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS online_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('checkout','link')),
  -- [{ "fee_id": uuid, "amount": paise }]
  allocations jsonb NOT NULL,
  next_due_dates jsonb NOT NULL DEFAULT '{}'::jsonb,
  admission_receipt_id uuid REFERENCES admission_receipts(id) ON DELETE SET NULL,
  -- All money in paise.
  fee_amount bigint NOT NULL CHECK (fee_amount > 0),
  convenience_fee bigint NOT NULL,
  gst_amount bigint NOT NULL,
  platform_fee bigint NOT NULL,
  total_amount bigint NOT NULL,
  razorpay_order_id text UNIQUE,
  razorpay_link_id text UNIQUE,
  razorpay_payment_id text UNIQUE,
  link_url text,
  platform_transfer text NOT NULL DEFAULT 'pending_settlement'
    CHECK (platform_transfer IN ('route','pending_settlement','settled')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','processing','paid','failed','expired')),
  receipt_number text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_online_payments_school ON online_payments(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_payments_student ON online_payments(student_id);
ALTER TABLE online_payments ENABLE ROW LEVEL SECURITY;

-- Read-only for apps; written only by the edge function (service role).
DROP POLICY IF EXISTS "online_payments_parent_select" ON online_payments;
CREATE POLICY "online_payments_parent_select" ON online_payments FOR SELECT TO authenticated
  USING (student_id IN (SELECT my_student_ids()));
DROP POLICY IF EXISTS "online_payments_admin_select" ON online_payments;
CREATE POLICY "online_payments_admin_select" ON online_payments FOR SELECT TO authenticated
  USING (school_id = get_current_school_id() AND has_permission(ARRAY['fees'], 'view'));
REVOKE INSERT, UPDATE, DELETE ON online_payments FROM PUBLIC, anon, authenticated;

-- What apps may know about the gateway (never the secret).
CREATE OR REPLACE FUNCTION payment_gateway_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'active', g.is_active,
      'key_id', g.key_id,
      'mode', CASE WHEN g.key_id LIKE 'rzp_live_%' THEN 'live' ELSE 'test' END,
      'route_linked', g.veducore_account_id IS NOT NULL,
      'verified_at', g.verified_at,
      'key_hint', 'rzp_…' || right(g.key_id, 4))
    FROM payment_gateways g WHERE g.school_id = get_current_school_id()
  ), jsonb_build_object('active', false));
$$;
REVOKE ALL ON FUNCTION payment_gateway_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION payment_gateway_status() TO authenticated;

-- Veducore's settlement view: platform fees per school not yet routed.
CREATE OR REPLACE VIEW platform_fee_ledger AS
  SELECT school_id, date_trunc('month', paid_at)::date AS month,
         count(*) AS payments,
         sum(platform_fee) FILTER (WHERE platform_transfer = 'route') AS routed_paise,
         sum(platform_fee) FILTER (WHERE platform_transfer = 'pending_settlement') AS to_settle_paise
  FROM online_payments WHERE status = 'paid'
  GROUP BY school_id, date_trunc('month', paid_at);
REVOKE ALL ON platform_fee_ledger FROM PUBLIC, anon, authenticated;
