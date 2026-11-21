/*
  # 053 — Employee ID prefix (same idea as the admission prefix in 052)

  1. schools.employee_prefix: set by Veducore (super admin), e.g. 'EMP'.
     The admin's Add Teacher form shows it fixed in front of the number box.
     Locked for school users, like the other registration details.

  2. next_employee_id(): highest existing prefix+digits employee ID plus one,
     keeping the zero padding (EMP009 → EMP010). Null when there is none yet.
     Runs as the caller, so RLS on teachers applies.
*/

ALTER TABLE schools ADD COLUMN IF NOT EXISTS employee_prefix text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schools'::regclass AND conname = 'schools_employee_prefix_format'
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_employee_prefix_format
      CHECK (employee_prefix IS NULL OR employee_prefix ~ '^[A-Za-z0-9/-]{1,12}$');
  END IF;
END $$;

-- Lock it for school users (adds employee_prefix to the 052 list).
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
    -- Registration details: Veducore only (052, 053)
    NEW.name := OLD.name;
    NEW.address := OLD.address;
    NEW.city := OLD.city;
    NEW.contact_number := OLD.contact_number;
    NEW.email := OLD.email;
    NEW.admission_prefix := OLD.admission_prefix;
    NEW.employee_prefix := OLD.employee_prefix;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION next_employee_id()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_prefix text;
  v_suffix text;
BEGIN
  IF v_school IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(employee_prefix, '') INTO v_prefix FROM schools WHERE id = v_school;
  v_prefix := coalesce(v_prefix, '');

  SELECT substr(t.employee_id, length(v_prefix) + 1) INTO v_suffix
  FROM teachers t
  WHERE t.school_id = v_school
    AND upper(left(t.employee_id, length(v_prefix))) = upper(v_prefix)
    AND substr(t.employee_id, length(v_prefix) + 1) ~ '^[0-9]{1,15}$'
  ORDER BY substr(t.employee_id, length(v_prefix) + 1)::numeric DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'prefix', v_prefix,
    'next', CASE WHEN v_suffix IS NULL THEN NULL
                 -- lpad truncates, so never pad to less than the new number's length (999 → 1000)
                 ELSE v_prefix || lpad((v_suffix::numeric + 1)::text,
                                       greatest(length(v_suffix), length((v_suffix::numeric + 1)::text)), '0') END
  );
END;
$$;

REVOKE ALL ON FUNCTION next_employee_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION next_employee_id() TO authenticated;
