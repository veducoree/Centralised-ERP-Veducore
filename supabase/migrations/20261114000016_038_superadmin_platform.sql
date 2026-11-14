-- ============================================================
-- 038: Veducore superadmin platform
--
-- * Veducore team roles (owner / admin / support) + status.
-- * School suspension that is enforced in the database:
--   get_current_school_id() returns NULL for a suspended school, so
--   every RLS policy built on it stops returning rows.
-- * Per-school module switches (disabled_modules).
-- * Plans, subscriptions and Veducore's own invoices to schools.
-- * Platform announcements shown to school admins.
-- * Support tickets between school admins and Veducore.
-- * Platform audit log of every superadmin action.
--
-- Platform tables have RLS on and no client policies unless noted:
-- the management portal reaches them only through the manage-schools
-- edge function (service role).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Veducore team
-- ------------------------------------------------------------
ALTER TABLE veducore_admins ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner';
ALTER TABLE veducore_admins ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE veducore_admins ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE veducore_admins ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$ BEGIN
  ALTER TABLE veducore_admins ADD CONSTRAINT veducore_admins_role_check
    CHECK (role IN ('owner','admin','support'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE veducore_admins ADD CONSTRAINT veducore_admins_status_check
    CHECK (status IN ('active','disabled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2. School platform columns
-- ------------------------------------------------------------
ALTER TABLE schools ADD COLUMN IF NOT EXISTS disabled_modules text[] NOT NULL DEFAULT '{}';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS suspension_reason text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS city text;

-- School admins may update their own school row (settings page), but
-- never the columns Veducore controls.
CREATE OR REPLACE FUNCTION protect_school_platform_columns()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    NEW.status := OLD.status;
    NEW.suspended_at := OLD.suspended_at;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.disabled_modules := OLD.disabled_modules;
    NEW.admin_password_reference := OLD.admin_password_reference;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_school_platform_columns ON schools;
CREATE TRIGGER trg_protect_school_platform_columns
  BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION protect_school_platform_columns();

-- Suspension enforced everywhere RLS uses the current school.
CREATE OR REPLACE FUNCTION get_current_school_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT p.school_id
  FROM profiles p
  JOIN schools s ON s.id = p.school_id
  WHERE p.id = auth.uid()
    AND coalesce(s.status, 'Active') = 'Active';
$$;

-- ------------------------------------------------------------
-- 3. Plans & subscriptions (money in paise)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  base_price bigint NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  price_per_student bigint NOT NULL DEFAULT 0 CHECK (price_per_student >= 0),
  billing_cycle text NOT NULL DEFAULT 'yearly' CHECK (billing_cycle IN ('monthly','quarterly','yearly')),
  max_students int,
  features text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_plans ENABLE ROW LEVEL SECURITY;

INSERT INTO platform_plans (code, name, description, base_price, price_per_student, billing_cycle, max_students, features, sort_order)
VALUES
  ('trial', 'Free Trial', '30-day trial with every module.', 0, 0, 'monthly', 200,
    ARRAY['All modules','Up to 200 students','Email support'], 0),
  ('starter', 'Starter', 'Core ERP for small schools.', 500000, 30000, 'yearly', 500,
    ARRAY['Students, teachers, parents','Attendance & timetable','Fees','Parent app'], 1),
  ('growth', 'Growth', 'Full academics and finance.', 1000000, 45000, 'yearly', 2000,
    ARRAY['Everything in Starter','Exams & results','Online fee payments','Transport'], 2),
  ('premium', 'Premium', 'Every module with priority support.', 2000000, 60000, 'yearly', NULL,
    ARRAY['Everything in Growth','Student tracking','ID cards','Priority support'], 3)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS school_subscriptions (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES platform_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial','active','past_due','cancelled','expired')),
  billing_cycle text NOT NULL DEFAULT 'yearly' CHECK (billing_cycle IN ('monthly','quarterly','yearly')),
  -- When set, replaces the plan's computed price for one billing cycle.
  price_override bigint CHECK (price_override IS NULL OR price_override >= 0),
  student_limit int,
  trial_ends_at date,
  current_period_start date,
  current_period_end date,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE school_subscriptions ENABLE ROW LEVEL SECURITY;

-- Every school gets a row; existing schools start without a plan.
INSERT INTO school_subscriptions (school_id, status)
SELECT id, 'active' FROM schools
ON CONFLICT (school_id) DO NOTHING;

CREATE OR REPLACE FUNCTION create_school_subscription()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO school_subscriptions (school_id, status) VALUES (NEW.id, 'active')
  ON CONFLICT (school_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_create_school_subscription ON schools;
CREATE TRIGGER trg_create_school_subscription
  AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION create_school_subscription();

CREATE SEQUENCE IF NOT EXISTS platform_invoice_seq START 1001;

CREATE TABLE IF NOT EXISTS platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE
    DEFAULT ('VDC-' || to_char(now(), 'YYYY') || '-' || nextval('platform_invoice_seq')),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  description text NOT NULL,
  period_start date,
  period_end date,
  amount bigint NOT NULL CHECK (amount >= 0),
  tax_amount bigint NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount bigint NOT NULL CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','paid','void')),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  paid_at timestamptz,
  payment_method text,
  payment_reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_invoices_school ON platform_invoices(school_id, issue_date DESC);
ALTER TABLE platform_invoices ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. Platform announcements (shown to school admins)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','critical')),
  -- 'all' = every school; 'selected' = only school_ids.
  target text NOT NULL DEFAULT 'all' CHECK (target IN ('all','selected')),
  school_ids uuid[] NOT NULL DEFAULT '{}',
  -- Also pushed into each school's notifications to this audience.
  push_audience text CHECK (push_audience IS NULL OR push_audience IN ('all','teachers','parents')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_announcements_admin_select" ON platform_announcements;
CREATE POLICY "platform_announcements_admin_select" ON platform_announcements
  FOR SELECT TO authenticated
  USING (
    is_active
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
        AND (target = 'all' OR p.school_id = ANY(school_ids))
    )
  );

-- ------------------------------------------------------------
-- 5. Support tickets
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START 1001;

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigint NOT NULL UNIQUE DEFAULT nextval('support_ticket_seq'),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  raised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  raised_by_name text,
  subject text NOT NULL CHECK (length(trim(subject)) > 0),
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','bug','billing','feature','account','data')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','waiting','resolved','closed')),
  assigned_to uuid,
  last_reply_at timestamptz NOT NULL DEFAULT now(),
  last_reply_by text NOT NULL DEFAULT 'school' CHECK (last_reply_by IN ('school','veducore')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_school ON support_tickets(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, last_reply_at DESC);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('school','veducore')),
  author_id uuid,
  author_name text,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  -- Veducore-only notes, never shown to the school.
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id, created_at);
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_school_select" ON support_tickets;
CREATE POLICY "support_tickets_school_select" ON support_tickets
  FOR SELECT TO authenticated
  USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "support_tickets_school_insert" ON support_tickets;
CREATE POLICY "support_tickets_school_insert" ON support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = get_current_school_id() AND is_admin()
    AND raised_by = auth.uid()
    AND status = 'open' AND assigned_to IS NULL
  );

DROP POLICY IF EXISTS "support_ticket_messages_school_select" ON support_ticket_messages;
CREATE POLICY "support_ticket_messages_school_select" ON support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    NOT is_internal
    AND ticket_id IN (SELECT id FROM support_tickets WHERE school_id = get_current_school_id())
    AND is_admin()
  );

DROP POLICY IF EXISTS "support_ticket_messages_school_insert" ON support_ticket_messages;
CREATE POLICY "support_ticket_messages_school_insert" ON support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_type = 'school' AND author_id = auth.uid() AND NOT is_internal
    AND ticket_id IN (SELECT id FROM support_tickets
                      WHERE school_id = get_current_school_id() AND status <> 'closed')
    AND is_admin()
  );

-- Keep the ticket's reply state in step with its messages. A school
-- reply reopens a ticket that was waiting on them or marked resolved.
CREATE OR REPLACE FUNCTION support_ticket_on_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.is_internal THEN RETURN NEW; END IF;
  UPDATE support_tickets SET
    last_reply_at = NEW.created_at,
    last_reply_by = NEW.author_type,
    updated_at = now(),
    status = CASE
      WHEN NEW.author_type = 'school' AND status IN ('waiting','resolved') THEN 'open'
      ELSE status END
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_support_ticket_on_message ON support_ticket_messages;
CREATE TRIGGER trg_support_ticket_on_message
  AFTER INSERT ON support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION support_ticket_on_message();

-- School admin closes their own ticket.
CREATE OR REPLACE FUNCTION close_my_support_ticket(p_ticket uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Only school admins can close tickets'; END IF;
  UPDATE support_tickets SET status = 'closed', updated_at = now()
  WHERE id = p_ticket AND school_id = get_current_school_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION close_my_support_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_my_support_ticket(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 6. Platform audit log (survives school deletion: no FK)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  actor_email text,
  action text NOT NULL,
  school_id uuid,
  school_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_created ON platform_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_school ON platform_audit_log(school_id, created_at DESC);
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 7. What a signed-in school user may know about their platform state
-- ------------------------------------------------------------
-- Reads profiles directly (not get_current_school_id) so it still works
-- while the school is suspended.
CREATE OR REPLACE FUNCTION school_platform_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'school_id', s.id,
      'school_name', s.name,
      'status', coalesce(s.status, 'Active'),
      'suspension_reason', s.suspension_reason,
      'disabled_modules', to_jsonb(coalesce(s.disabled_modules, '{}')),
      'plan_name', pl.name,
      'subscription_status', sub.status,
      'trial_ends_at', sub.trial_ends_at,
      'current_period_end', sub.current_period_end)
    FROM profiles p
    JOIN schools s ON s.id = p.school_id
    LEFT JOIN school_subscriptions sub ON sub.school_id = s.id
    LEFT JOIN platform_plans pl ON pl.id = sub.plan_id
    WHERE p.id = auth.uid()
  ), '{}'::jsonb);
$$;
REVOKE ALL ON FUNCTION school_platform_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION school_platform_status() TO authenticated;

-- Platform tables: no direct client access beyond the policies above.
REVOKE ALL ON platform_plans, school_subscriptions, platform_invoices, platform_audit_log
  FROM anon, authenticated;
REVOKE ALL ON platform_announcements FROM anon;
REVOKE UPDATE, DELETE ON platform_announcements FROM authenticated;
REVOKE UPDATE, DELETE ON support_tickets, support_ticket_messages FROM anon, authenticated;

-- ------------------------------------------------------------
-- 8. Aggregates for the management portal (service role only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform_school_stats()
RETURNS TABLE (
  school_id uuid,
  students bigint,
  active_students bigint,
  teachers bigint,
  parents bigint,
  classes bigint,
  sections bigint,
  attendance_30d bigint,
  last_attendance date,
  fees_collected_30d numeric,
  online_paid_30d bigint,
  online_volume_30d bigint,
  notifications_30d bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    s.id,
    (SELECT count(*) FROM students x WHERE x.school_id = s.id),
    (SELECT count(*) FROM students x WHERE x.school_id = s.id AND x.status = 'active'),
    (SELECT count(*) FROM teachers x WHERE x.school_id = s.id),
    (SELECT count(*) FROM parents x WHERE x.school_id = s.id),
    (SELECT count(*) FROM classes x WHERE x.school_id = s.id),
    (SELECT count(*) FROM sections x WHERE x.school_id = s.id),
    (SELECT count(*) FROM attendance x WHERE x.school_id = s.id
       AND x.attendance_date >= CURRENT_DATE - 30),
    (SELECT max(x.attendance_date) FROM attendance x WHERE x.school_id = s.id),
    (SELECT coalesce(sum(x.amount), 0) FROM fee_payments x WHERE x.school_id = s.id
       AND x.payment_date >= CURRENT_DATE - 30),
    (SELECT count(*) FROM online_payments x WHERE x.school_id = s.id
       AND x.status = 'paid' AND x.paid_at >= now() - interval '30 days'),
    (SELECT coalesce(sum(x.total_amount), 0)::bigint FROM online_payments x WHERE x.school_id = s.id
       AND x.status = 'paid' AND x.paid_at >= now() - interval '30 days'),
    (SELECT count(*) FROM notifications x WHERE x.school_id = s.id
       AND x.created_at >= now() - interval '30 days')
  FROM schools s;
$$;

CREATE OR REPLACE FUNCTION platform_growth(p_months int DEFAULT 12)
RETURNS TABLE (month date, new_schools bigint, new_students bigint, online_volume bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    m::date,
    (SELECT count(*) FROM schools x
       WHERE x.created_at >= m AND x.created_at < m + interval '1 month'),
    (SELECT count(*) FROM students x
       WHERE x.created_at >= m AND x.created_at < m + interval '1 month'),
    (SELECT coalesce(sum(x.total_amount), 0)::bigint FROM online_payments x
       WHERE x.status = 'paid' AND x.paid_at >= m AND x.paid_at < m + interval '1 month')
  FROM generate_series(
    date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1),
    date_trunc('month', now()),
    interval '1 month'
  ) AS m;
$$;

REVOKE ALL ON FUNCTION platform_school_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform_growth(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_school_stats() TO service_role;
GRANT EXECUTE ON FUNCTION platform_growth(int) TO service_role;
