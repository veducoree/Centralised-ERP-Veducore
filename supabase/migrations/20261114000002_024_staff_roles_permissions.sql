-- ============================================================
-- 024: Staff roles & permissions
--
-- * Admin-panel staff (Principal, Accountant, Receptionist, …) are
--   profiles with role = 'admin' and a staff_role_id. staff_role_id NULL
--   means school owner (full access, can manage staff).
-- * staff_roles.permissions = { "<module>": "none" | "view" | "edit" }.
-- * Writes are enforced in the database with RESTRICTIVE policies, so a
--   staff member without "edit" on a module cannot change its tables even
--   through the API. Reads are gated in the UI (pages need joined data
--   from other modules, e.g. fees pages show student names).
-- * SECURITY FIX: users could update their own profiles.role /
--   school_id / status (e.g. a parent making themselves admin). Those
--   columns are now locked to the service role and owner-only RPCs.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lock privileged profile columns
-- ------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS staff_role_id uuid;

CREATE OR REPLACE FUNCTION trg_protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.school_id IS NOT DISTINCT FROM OLD.school_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.staff_role_id IS NOT DISTINCT FROM OLD.staff_role_id THEN
    RETURN NEW;
  END IF;

  -- Service role (edge functions), SQL editor / migrations, and the
  -- owner-only RPCs below (which set this flag for their transaction).
  IF auth.uid() IS NULL
     OR coalesce(auth.role(), '') = 'service_role'
     OR current_setting('veducore.profile_admin', true) = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to change role, school, status or staff role'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_protect_profile_columns();

-- ------------------------------------------------------------
-- 2. Roles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_staff_role_id_fkey
    FOREIGN KEY (staff_role_id) REFERENCES staff_roles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ON DELETE SET NULL would promote staff to owner if a role were deleted;
-- deletion is blocked while a role is assigned (see delete_staff_role).

CREATE OR REPLACE FUNCTION my_staff_role_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT staff_role_id FROM profiles WHERE id = auth.uid(); $$;

-- Owner = active admin with no staff role.
CREATE OR REPLACE FUNCTION is_school_owner()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active' AND staff_role_id IS NULL);
$$;

-- True when the caller is an admin with at least p_level on any of the
-- given modules. Levels: view < edit.
CREATE OR REPLACE FUNCTION has_permission(p_modules text[], p_level text DEFAULT 'view')
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_is_admin boolean;
  v_perms jsonb;
  m text;
  lvl text;
BEGIN
  SELECT staff_role_id, (role = 'admin' AND status = 'active')
    INTO v_role_id, v_is_admin
    FROM profiles WHERE id = auth.uid();
  IF NOT coalesce(v_is_admin, false) THEN RETURN false; END IF;
  IF v_role_id IS NULL THEN RETURN true; END IF;

  SELECT permissions INTO v_perms FROM staff_roles WHERE id = v_role_id;
  IF v_perms IS NULL THEN RETURN false; END IF;

  FOREACH m IN ARRAY p_modules LOOP
    lvl := v_perms ->> m;
    IF lvl = 'edit' OR (p_level = 'view' AND lvl = 'view') THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "staff_roles_select_admin" ON staff_roles;
CREATE POLICY "staff_roles_select_admin" ON staff_roles FOR SELECT
TO authenticated USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS "staff_roles_owner_write" ON staff_roles;
CREATE POLICY "staff_roles_owner_write" ON staff_roles FOR ALL
TO authenticated
USING (school_id = get_current_school_id() AND is_school_owner())
WITH CHECK (school_id = get_current_school_id() AND is_school_owner());

-- Default roles for a school.
CREATE OR REPLACE FUNCTION seed_staff_roles(p_school uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO staff_roles (school_id, name, description, permissions, is_system) VALUES
  (p_school, 'Principal', 'Runs the school day to day. Everything except staff management.',
   '{"dashboard":"edit","students":"edit","admissions":"edit","teachers":"edit","parents":"edit","classes":"edit","subjects":"edit","timetable":"edit","attendance":"edit","fees":"view","transport":"edit","tracking":"edit","id_cards":"edit","documents":"edit","holidays":"edit","sessions":"edit","notifications":"edit","exams":"edit","settings":"view"}', true),
  (p_school, 'Accountant', 'Collects fees and manages fee structures.',
   '{"dashboard":"view","students":"view","parents":"view","classes":"view","fees":"edit","transport":"view","notifications":"edit"}', true),
  (p_school, 'Receptionist', 'Handles admissions, enquiries and parent communication.',
   '{"dashboard":"view","students":"edit","admissions":"edit","parents":"edit","classes":"view","attendance":"view","transport":"view","id_cards":"edit","documents":"edit","holidays":"view","notifications":"edit"}', true)
  ON CONFLICT (school_id, name) DO NOTHING;
$$;

SELECT seed_staff_roles(id) FROM schools;

CREATE OR REPLACE FUNCTION trg_school_seed_staff_roles()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN PERFORM seed_staff_roles(NEW.id); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_school_seed_staff_roles ON schools;
CREATE TRIGGER trg_school_seed_staff_roles
  AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION trg_school_seed_staff_roles();

-- ------------------------------------------------------------
-- 3. Owner-only RPCs for staff management
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_staff_role(p_user uuid, p_role uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school uuid := get_current_school_id();
BEGIN
  IF NOT is_school_owner() THEN RAISE EXCEPTION 'Only the school owner can manage staff'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND school_id = v_school AND role = 'admin') THEN
    RAISE EXCEPTION 'Staff member not found';
  END IF;
  IF p_role IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff_roles WHERE id = p_role AND school_id = v_school) THEN
    RAISE EXCEPTION 'Role not found';
  END IF;
  PERFORM set_config('veducore.profile_admin', 'on', true);
  UPDATE profiles SET staff_role_id = p_role, updated_at = now() WHERE id = p_user;
END;
$$;

CREATE OR REPLACE FUNCTION set_staff_status(p_user uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_school_owner() THEN RAISE EXCEPTION 'Only the school owner can manage staff'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'You cannot deactivate yourself'; END IF;
  IF p_status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND school_id = get_current_school_id() AND role = 'admin') THEN
    RAISE EXCEPTION 'Staff member not found';
  END IF;
  PERFORM set_config('veducore.profile_admin', 'on', true);
  UPDATE profiles SET status = p_status::active_status, updated_at = now() WHERE id = p_user;
END;
$$;

CREATE OR REPLACE FUNCTION delete_staff_role(p_role uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_school_owner() THEN RAISE EXCEPTION 'Only the school owner can manage roles'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE staff_role_id = p_role) THEN
    RAISE EXCEPTION 'Reassign the staff using this role before deleting it';
  END IF;
  DELETE FROM staff_roles WHERE id = p_role AND school_id = get_current_school_id();
END;
$$;

-- Staff list for the owner (admins of this school with their role).
CREATE OR REPLACE FUNCTION list_school_staff()
RETURNS TABLE (id uuid, full_name text, email text, phone text, status text,
               staff_role_id uuid, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.phone, p.status::text, p.staff_role_id, p.created_at
  FROM profiles p
  WHERE p.school_id = get_current_school_id() AND p.role = 'admin' AND is_admin()
  ORDER BY p.staff_role_id NULLS FIRST, p.full_name;
$$;

-- What the signed-in user may do; the web app uses this for menus/routes.
CREATE OR REPLACE FUNCTION my_permissions()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT CASE
    WHEN p.role <> 'admin' THEN '{}'::jsonb
    WHEN p.staff_role_id IS NULL THEN jsonb_build_object('owner', true)
    ELSE jsonb_build_object('owner', false, 'role', r.name, 'modules', coalesce(r.permissions, '{}'::jsonb))
  END
  FROM profiles p LEFT JOIN staff_roles r ON r.id = p.staff_role_id
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION assign_staff_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION set_staff_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION delete_staff_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION list_school_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION my_permissions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION seed_staff_roles(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assign_staff_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION set_staff_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_staff_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION list_school_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION my_permissions() TO authenticated;

-- ------------------------------------------------------------
-- 4. Write enforcement per module (RESTRICTIVE policies)
-- ------------------------------------------------------------
-- A restrictive policy is ANDed with the existing permissive ones. For
-- non-admins (teachers, parents) "NOT is_admin()" is true, so their
-- current access is unchanged.
CREATE OR REPLACE FUNCTION _add_module_write_guard(p_table text, p_modules text[])
RETURNS void
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_expr text := format('(NOT is_admin() OR has_permission(%L::text[], ''edit''))', p_modules::text);
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE 'skip guard: % does not exist', p_table;
    RETURN;
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS "perm_guard_insert" ON %I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "perm_guard_update" ON %I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "perm_guard_delete" ON %I', p_table);
  EXECUTE format('CREATE POLICY "perm_guard_insert" ON %I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK %s', p_table, v_expr);
  EXECUTE format('CREATE POLICY "perm_guard_update" ON %I AS RESTRICTIVE FOR UPDATE TO authenticated USING %s WITH CHECK %s', p_table, v_expr, v_expr);
  EXECUTE format('CREATE POLICY "perm_guard_delete" ON %I AS RESTRICTIVE FOR DELETE TO authenticated USING %s', p_table, v_expr);
END;
$$;

SELECT _add_module_write_guard('students',                     ARRAY['students','admissions']);
SELECT _add_module_write_guard('parent_students',              ARRAY['students','admissions','parents']);
SELECT _add_module_write_guard('parents',                      ARRAY['parents','admissions','students']);
SELECT _add_module_write_guard('student_enrollments',          ARRAY['students','sessions']);
SELECT _add_module_write_guard('teachers',                     ARRAY['teachers']);
SELECT _add_module_write_guard('class_assignments',            ARRAY['teachers','subjects','timetable']);
SELECT _add_module_write_guard('classes',                      ARRAY['classes']);
SELECT _add_module_write_guard('sections',                     ARRAY['classes']);
SELECT _add_module_write_guard('subjects',                     ARRAY['subjects']);
SELECT _add_module_write_guard('section_subjects',             ARRAY['subjects']);
SELECT _add_module_write_guard('timetable_periods',            ARRAY['timetable']);
SELECT _add_module_write_guard('teacher_schedules',            ARRAY['timetable']);
SELECT _add_module_write_guard('timetable_substitutions',      ARRAY['timetable']);
SELECT _add_module_write_guard('attendance',                   ARRAY['attendance']);
SELECT _add_module_write_guard('fees',                         ARRAY['fees','admissions']);
SELECT _add_module_write_guard('fee_payments',                 ARRAY['fees','admissions']);
SELECT _add_module_write_guard('fee_types',                    ARRAY['fees']);
SELECT _add_module_write_guard('fee_structures',               ARRAY['fees']);
SELECT _add_module_write_guard('payment_setups',               ARRAY['fees']);
SELECT _add_module_write_guard('admission_receipts',           ARRAY['admissions','fees']);
SELECT _add_module_write_guard('receipt_sequences',            ARRAY['admissions','fees']);
SELECT _add_module_write_guard('transport_buses',              ARRAY['transport']);
SELECT _add_module_write_guard('transport_stops',              ARRAY['transport']);
SELECT _add_module_write_guard('transport_config',             ARRAY['transport']);
SELECT _add_module_write_guard('student_transport_assignments', ARRAY['transport']);
SELECT _add_module_write_guard('holidays',                     ARRAY['holidays']);
SELECT _add_module_write_guard('academic_sessions',            ARRAY['sessions']);
SELECT _add_module_write_guard('notifications',                ARRAY['notifications']);
SELECT _add_module_write_guard('schools',                      ARRAY['settings']);
SELECT _add_module_write_guard('exam_defs',                    ARRAY['exams']);
SELECT _add_module_write_guard('student_records',              ARRAY['exams']);
SELECT _add_module_write_guard('remarks',                      ARRAY['students']);

DROP FUNCTION _add_module_write_guard(text, text[]);

REVOKE ALL ON FUNCTION has_permission(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION has_permission(text[], text) TO authenticated;
REVOKE ALL ON FUNCTION is_school_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_school_owner() TO authenticated;
