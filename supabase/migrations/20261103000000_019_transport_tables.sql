-- ============================================================
-- Migration 019: Proper Transport Tables
-- Creates transport_buses, transport_stops, and
-- student_transport_assignments tables.
-- Existing schools.settings JSONB data is preserved and still
-- works — the app reads DB first, then falls back to JSONB.
-- ============================================================

-- ── 1. transport_buses ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport_buses (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  bus_number       text        NOT NULL,
  route_name       text        NOT NULL,
  capacity         int         NOT NULL DEFAULT 40 CHECK (capacity > 0),
  driver_name      text,
  driver_phone     text,
  conductor_name   text,
  conductor_phone  text,
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'maintenance', 'inactive')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, bus_number)
);

ALTER TABLE transport_buses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_transport_buses_school_id ON transport_buses(school_id);
DROP TRIGGER IF EXISTS set_updated_at_transport_buses ON transport_buses;
CREATE TRIGGER set_updated_at_transport_buses
  BEFORE UPDATE ON transport_buses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "transport_buses_admin_all"   ON transport_buses;
CREATE POLICY "transport_buses_admin_all" ON transport_buses
  FOR ALL TO authenticated
  USING  (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "transport_buses_read_all"    ON transport_buses;
CREATE POLICY "transport_buses_read_all" ON transport_buses
  FOR SELECT TO authenticated
  USING (school_id = get_current_school_id());


-- ── 2. transport_stops ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport_stops (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  bus_id         uuid        NOT NULL REFERENCES transport_buses(id) ON DELETE CASCADE,
  stop_name      text        NOT NULL,
  area_landmark  text,
  pickup_time    text,
  drop_time      text,
  distance_km    numeric,
  amount         numeric     NOT NULL DEFAULT 0 CHECK (amount >= 0),
  -- Monthly / Quarterly / Yearly
  fare_period    text        NOT NULL DEFAULT 'Monthly'
                             CHECK (fare_period IN ('Monthly', 'Quarterly', 'Yearly')),
  stop_order     int         NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transport_stops ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_transport_stops_bus_id    ON transport_stops(bus_id);
CREATE INDEX IF NOT EXISTS idx_transport_stops_school_id ON transport_stops(school_id);
DROP TRIGGER IF EXISTS set_updated_at_transport_stops ON transport_stops;
CREATE TRIGGER set_updated_at_transport_stops
  BEFORE UPDATE ON transport_stops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "transport_stops_admin_all"  ON transport_stops;
CREATE POLICY "transport_stops_admin_all" ON transport_stops
  FOR ALL TO authenticated
  USING  (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "transport_stops_read_all"   ON transport_stops;
CREATE POLICY "transport_stops_read_all" ON transport_stops
  FOR SELECT TO authenticated
  USING (school_id = get_current_school_id());


-- ── 3. student_transport_assignments ─────────────────────────
CREATE TABLE IF NOT EXISTS student_transport_assignments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id       uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  bus_id           uuid        REFERENCES transport_buses(id) ON DELETE SET NULL,
  stop_id          uuid        NOT NULL REFERENCES transport_stops(id) ON DELETE RESTRICT,

  start_date       date        NOT NULL DEFAULT CURRENT_DATE,
  end_date         date,

  -- Pending → Approved → Stopped  (or Rejected from Pending)
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected','stopped')),

  -- Snapshot of stop fare at approval time — future stop.amount changes do NOT affect this
  fare_snapshot    jsonb       NOT NULL DEFAULT '{}',
  -- Example: {"amount": 1500, "fare_period": "Monthly", "stop_name": "Sector 14"}

  -- Fee record created on approval (links to fees table)
  fee_id           uuid        REFERENCES fees(id) ON DELETE SET NULL,

  applied_by_parent boolean    NOT NULL DEFAULT false,
  approved_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at      timestamptz,
  reject_reason    text,

  assigned_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- One active/pending assignment per student at a time
  UNIQUE (school_id, student_id, status) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE student_transport_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sta_school_id    ON student_transport_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_sta_student_id   ON student_transport_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_sta_bus_id       ON student_transport_assignments(bus_id);
CREATE INDEX IF NOT EXISTS idx_sta_status       ON student_transport_assignments(status);
DROP TRIGGER IF EXISTS set_updated_at_student_transport_assignments ON student_transport_assignments;
CREATE TRIGGER set_updated_at_student_transport_assignments
  BEFORE UPDATE ON student_transport_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Admin: full access
DROP POLICY IF EXISTS "sta_admin_all" ON student_transport_assignments;
CREATE POLICY "sta_admin_all" ON student_transport_assignments
  FOR ALL TO authenticated
  USING  (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());

-- Parent: read own children; insert new pending applications
DROP POLICY IF EXISTS "sta_parent_select" ON student_transport_assignments;
CREATE POLICY "sta_parent_select" ON student_transport_assignments
  FOR SELECT TO authenticated
  USING (
    is_parent()
    AND school_id = get_current_school_id()
    AND student_id = ANY(get_parent_student_ids())
  );

DROP POLICY IF EXISTS "sta_parent_insert" ON student_transport_assignments;
CREATE POLICY "sta_parent_insert" ON student_transport_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    is_parent()
    AND school_id = get_current_school_id()
    AND student_id = ANY(get_parent_student_ids())
    AND status = 'pending'
    AND applied_by_parent = true
  );


-- ── 4. transport_proration_config ────────────────────────────
-- Config option: how to prorate mid-period joins/exits.
-- full_period = charge full period regardless of join date
-- daily       = prorate by days remaining in the period
CREATE TABLE IF NOT EXISTS transport_config (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid        NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
  proration_rule   text        NOT NULL DEFAULT 'full_period'
                               CHECK (proration_rule IN ('full_period', 'daily')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transport_config ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at_transport_config ON transport_config;
CREATE TRIGGER set_updated_at_transport_config
  BEFORE UPDATE ON transport_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "transport_config_admin_all" ON transport_config;
CREATE POLICY "transport_config_admin_all" ON transport_config
  FOR ALL TO authenticated
  USING  (school_id = get_current_school_id() AND is_admin())
  WITH CHECK (school_id = get_current_school_id() AND is_admin());
