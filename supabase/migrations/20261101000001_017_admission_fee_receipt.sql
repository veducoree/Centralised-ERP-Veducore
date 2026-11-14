-- ============================================================
-- Migration 017: Admission Fee Receipts
-- Adds receipt_sequences and admission_receipts tables
-- to support fee collection during the New Admission wizard.
-- ============================================================

-- ── 1. receipt_sequences ─────────────────────────────────────
-- Tracks a per-school, per-academic-year sequential counter
-- so receipt numbers are unique and monotonically increasing.
CREATE TABLE IF NOT EXISTS receipt_sequences (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year text        NOT NULL,
  last_seq      int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, academic_year)
);

ALTER TABLE receipt_sequences ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at_receipt_sequences ON receipt_sequences;
CREATE TRIGGER set_updated_at_receipt_sequences
  BEFORE UPDATE ON receipt_sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Only admins may read/write receipt sequences
DROP POLICY IF EXISTS "receipt_sequences_admin_all" ON receipt_sequences;
CREATE POLICY "receipt_sequences_admin_all" ON receipt_sequences
  FOR ALL TO authenticated
  USING  (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());


-- ── 2. admission_receipts ─────────────────────────────────────
-- One row per admission fee receipt.  Stores the full
-- snapshot so it can be printed/re-printed at any time.
CREATE TABLE IF NOT EXISTS admission_receipts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id        uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  admission_number  text        NOT NULL,
  receipt_number    text        NOT NULL,
  academic_year     text        NOT NULL,

  -- Fee line items snapshot (JSON array of {fee_type, amount, include})
  fee_lines         jsonb       NOT NULL DEFAULT '[]',

  -- Discount
  discount_amount   numeric     NOT NULL DEFAULT 0,
  discount_type     text,                           -- 'flat' | 'percent'
  discount_reason   text,                           -- 'Sibling' | 'Staff Child' | 'Merit' | 'Other'
  discount_note     text,

  -- Totals
  total_fees        numeric     NOT NULL DEFAULT 0,
  net_payable       numeric     NOT NULL DEFAULT 0,
  paid_now          numeric     NOT NULL DEFAULT 0,
  balance_due       numeric     NOT NULL DEFAULT 0,

  -- Payment details (nullable – Pay Later has no payment)
  payment_option    text        NOT NULL DEFAULT 'later', -- 'full' | 'partial' | 'later'
  payment_mode      text,                           -- 'Cash' | 'UPI' | 'Card' | 'Cheque' | 'Online/Bank Transfer'
  transaction_ref   text,
  payment_date      date,
  remarks           text,

  -- Audit
  collected_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  collected_by_name text,

  -- Idempotency: prevent double-submission from the same wizard session
  idempotency_key   text        UNIQUE,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT receipt_number_school_unique UNIQUE (school_id, receipt_number)
);

ALTER TABLE admission_receipts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_admission_receipts_school_id  ON admission_receipts(school_id);
CREATE INDEX IF NOT EXISTS idx_admission_receipts_student_id ON admission_receipts(student_id);
CREATE INDEX IF NOT EXISTS idx_admission_receipts_created_at ON admission_receipts(created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_admission_receipts ON admission_receipts;
CREATE TRIGGER set_updated_at_admission_receipts
  BEFORE UPDATE ON admission_receipts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Admin: full access
DROP POLICY IF EXISTS "admission_receipts_admin_all" ON admission_receipts;
CREATE POLICY "admission_receipts_admin_all" ON admission_receipts
  FOR ALL TO authenticated
  USING  (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());

-- Parent: read-only for their own child's receipts
DROP POLICY IF EXISTS "admission_receipts_parent_select" ON admission_receipts;
CREATE POLICY "admission_receipts_parent_select" ON admission_receipts
  FOR SELECT TO authenticated
  USING (
    is_parent()
    AND school_id = get_current_school_id()
    AND student_id = ANY(get_parent_student_ids())
  );
