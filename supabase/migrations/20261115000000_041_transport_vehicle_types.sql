-- ============================================================
-- Migration 041: Transport — Bus / Van vehicle types
--
-- * transport_buses gets vehicle_type ('bus' | 'van') plus
--   registration-paper expiry dates (insurance, fitness, permit)
--   so the admin can see which vehicles need renewal.
-- * apply_for_transport(): parents apply through this RPC. It
--   writes a real pending row in student_transport_assignments
--   (the table admin reads) instead of the old schools.settings /
--   audit_logs path, replaces any earlier pending application for
--   the same child, and notifies the school's admins.
-- Idempotent: safe to re-run.
-- ============================================================

-- ── 1. Vehicle type + paperwork on transport_buses ───────────
ALTER TABLE transport_buses ADD COLUMN IF NOT EXISTS vehicle_type     text NOT NULL DEFAULT 'bus';
ALTER TABLE transport_buses ADD COLUMN IF NOT EXISTS insurance_expiry date;
ALTER TABLE transport_buses ADD COLUMN IF NOT EXISTS fitness_expiry   date;
ALTER TABLE transport_buses ADD COLUMN IF NOT EXISTS permit_expiry    date;

DO $$ BEGIN
  ALTER TABLE transport_buses ADD CONSTRAINT transport_buses_vehicle_type_check
    CHECK (vehicle_type IN ('bus', 'van'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_transport_buses_school_type
  ON transport_buses(school_id, vehicle_type);


-- ── 2. Fix the per-status uniqueness ─────────────────────────
-- UNIQUE (school_id, student_id, status) blocked a student from ever
-- having two rejected or two stopped records (history). Only one
-- pending and one approved assignment per student should be enforced.
ALTER TABLE student_transport_assignments
  DROP CONSTRAINT IF EXISTS student_transport_assignments_school_id_student_id_status_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sta_one_pending
  ON student_transport_assignments(student_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_sta_one_approved
  ON student_transport_assignments(student_id) WHERE status = 'approved';


-- ── 3. Parent application RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION apply_for_transport(p_student uuid, p_stop uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school  uuid := get_current_school_id();
  v_stop    transport_stops%ROWTYPE;
  v_vehicle transport_buses%ROWTYPE;
  v_student text;
  v_id      uuid;
  v_label   text;
BEGIN
  IF v_school IS NULL OR NOT is_parent() OR NOT (p_student = ANY(get_parent_student_ids())) THEN
    RAISE EXCEPTION 'Not allowed to apply for this student';
  END IF;

  SELECT * INTO v_stop FROM transport_stops WHERE id = p_stop AND school_id = v_school;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stop not found'; END IF;

  SELECT * INTO v_vehicle FROM transport_buses WHERE id = v_stop.bus_id;
  IF v_vehicle.status <> 'active' THEN
    RAISE EXCEPTION 'This % is not running right now. Please choose another route.', v_vehicle.vehicle_type;
  END IF;

  -- Already on this exact stop? Nothing to do.
  IF EXISTS (SELECT 1 FROM student_transport_assignments
             WHERE student_id = p_student AND stop_id = p_stop AND status = 'approved') THEN
    RAISE EXCEPTION 'Your child is already assigned to this stop';
  END IF;

  -- One pending application per child: a new one replaces the old.
  DELETE FROM student_transport_assignments
   WHERE school_id = v_school AND student_id = p_student AND status = 'pending';

  INSERT INTO student_transport_assignments (
    school_id, student_id, bus_id, stop_id, status, applied_by_parent, fare_snapshot)
  VALUES (
    v_school, p_student, v_vehicle.id, v_stop.id, 'pending', true,
    jsonb_build_object(
      'amount', v_stop.amount,
      'fare_period', v_stop.fare_period,
      'stop_name', v_stop.stop_name,
      'bus_number', v_vehicle.bus_number,
      'route_name', v_vehicle.route_name,
      'vehicle_type', v_vehicle.vehicle_type))
  RETURNING id INTO v_id;

  SELECT full_name INTO v_student FROM students WHERE id = p_student;
  v_label := CASE v_vehicle.vehicle_type WHEN 'van' THEN 'Van' ELSE 'Bus' END;

  INSERT INTO notifications (school_id, audience, user_id, title, message,
    category, type, link, entity_type, entity_id)
  SELECT v_school, 'user', p.id,
    'New transport application',
    coalesce(v_student, 'A student') || ' applied for ' || v_label || ' '
      || v_vehicle.bus_number || ' — ' || v_stop.stop_name || '.',
    'transport', 'info', '/admin/transport', 'transport_assignment', v_id
  FROM profiles p
  WHERE p.school_id = v_school AND p.role = 'admin';

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION apply_for_transport(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_for_transport(uuid, uuid) TO authenticated;
