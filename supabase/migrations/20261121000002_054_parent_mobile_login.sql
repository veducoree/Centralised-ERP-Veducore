/*
  # 054 — Parent login by mobile number

  Parents now sign in with their mobile number. The auth email behind it is
  <10-digit mobile>@parent.veducore (one mobile = one parent login; siblings
  share it). Default password: <parent first name>@<school short name>.
  The login is created by the app through the create-user edge function.

  1. schools.short_name: set by Veducore, e.g. 'gvps'. Locked for school users.

  2. Drop trg_auto_create_parent_for_student (014). It inserted a parents row
     without any login, keyed on admission_number@slug.veducore, before the app
     could create the real login — which then saw the student as "already
     linked" and never made one. The app now creates and links the parent.
*/

-- ── 1. Short name ───────────────────────────────────────────────────────────
ALTER TABLE schools ADD COLUMN IF NOT EXISTS short_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schools'::regclass AND conname = 'schools_short_name_format'
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_short_name_format
      CHECK (short_name IS NULL OR short_name ~ '^[a-z0-9]{2,12}$');
  END IF;
END $$;

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
    -- Registration details: Veducore only (052, 053, 054)
    NEW.name := OLD.name;
    NEW.address := OLD.address;
    NEW.city := OLD.city;
    NEW.contact_number := OLD.contact_number;
    NEW.email := OLD.email;
    NEW.admission_prefix := OLD.admission_prefix;
    NEW.employee_prefix := OLD.employee_prefix;
    NEW.short_name := OLD.short_name;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2. Stop creating login-less parents on student insert ───────────────────
DROP TRIGGER IF EXISTS trg_auto_create_parent_for_student ON students;
DROP FUNCTION IF EXISTS auto_create_parent_for_student();
