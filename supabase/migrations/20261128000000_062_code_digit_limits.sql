/*
  # 062 — Digit limits for admission numbers and employee IDs

  Set by Veducore when the school is registered (e.g. 4–5 digits), so a typing
  mistake can't add an extra digit. The range is always n to n+1 digits: a
  school that uses 4 digits today can grow to 5 later, never less than 4 or
  more than 5.

  1. schools.admission_digits_min / _max and employee_digits_min / _max.
     NULL = no limit (existing schools keep working as before).
     Locked for school users, like the other registration details.

  2. Trigger on students / teachers: the digits in the number part (after the
     school's prefix, if any) must be within the range. Checked only when the
     number is new or changed, so editing other details of an older student
     whose number doesn't fit never fails.
*/

-- ── 1. Columns ───────────────────────────────────────────────────────────────
ALTER TABLE schools ADD COLUMN IF NOT EXISTS admission_digits_min smallint;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS admission_digits_max smallint;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS employee_digits_min smallint;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS employee_digits_max smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schools'::regclass AND conname = 'schools_admission_digits_range') THEN
    ALTER TABLE schools ADD CONSTRAINT schools_admission_digits_range CHECK (
      (admission_digits_min IS NULL AND admission_digits_max IS NULL)
      OR (admission_digits_min BETWEEN 1 AND 15 AND admission_digits_max BETWEEN admission_digits_min AND 15));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schools'::regclass AND conname = 'schools_employee_digits_range') THEN
    ALTER TABLE schools ADD CONSTRAINT schools_employee_digits_range CHECK (
      (employee_digits_min IS NULL AND employee_digits_max IS NULL)
      OR (employee_digits_min BETWEEN 1 AND 15 AND employee_digits_max BETWEEN employee_digits_min AND 15));
  END IF;
END $$;

-- Lock them for school users (adds the digit limits to the 054 list).
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
    -- Registration details: Veducore only (052, 053, 054, 062)
    NEW.name := OLD.name;
    NEW.address := OLD.address;
    NEW.city := OLD.city;
    NEW.contact_number := OLD.contact_number;
    NEW.email := OLD.email;
    NEW.admission_prefix := OLD.admission_prefix;
    NEW.employee_prefix := OLD.employee_prefix;
    NEW.short_name := OLD.short_name;
    NEW.admission_digits_min := OLD.admission_digits_min;
    NEW.admission_digits_max := OLD.admission_digits_max;
    NEW.employee_digits_min := OLD.employee_digits_min;
    NEW.employee_digits_max := OLD.employee_digits_max;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2. Enforce on save ──────────────────────────────────────────────────────

/** Number of digits in `code` after `prefix` (prefix stripped only if present). */
CREATE OR REPLACE FUNCTION code_digit_count(code text, prefix text)
RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT length(regexp_replace(
    CASE WHEN coalesce(prefix, '') <> '' AND upper(left(code, length(prefix))) = upper(prefix)
         THEN substr(code, length(prefix) + 1) ELSE coalesce(code, '') END,
    '[^0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION check_admission_number_digits()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_min smallint; v_max smallint; v_prefix text; v_n int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.admission_number IS NOT DISTINCT FROM OLD.admission_number THEN
    RETURN NEW;
  END IF;
  SELECT admission_digits_min, admission_digits_max, admission_prefix
    INTO v_min, v_max, v_prefix FROM schools WHERE id = NEW.school_id;
  IF v_min IS NULL OR NEW.admission_number IS NULL THEN RETURN NEW; END IF;
  v_n := code_digit_count(NEW.admission_number, v_prefix);
  IF v_n < v_min OR v_n > v_max THEN
    RAISE EXCEPTION 'Admission number % must have % to % digits (it has %)', NEW.admission_number, v_min, v_max, v_n
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_admission_number_digits ON students;
CREATE TRIGGER trg_check_admission_number_digits
  BEFORE INSERT OR UPDATE OF admission_number ON students
  FOR EACH ROW EXECUTE FUNCTION check_admission_number_digits();

CREATE OR REPLACE FUNCTION check_employee_id_digits()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_min smallint; v_max smallint; v_prefix text; v_n int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id THEN
    RETURN NEW;
  END IF;
  SELECT employee_digits_min, employee_digits_max, employee_prefix
    INTO v_min, v_max, v_prefix FROM schools WHERE id = NEW.school_id;
  IF v_min IS NULL OR NEW.employee_id IS NULL THEN RETURN NEW; END IF;
  v_n := code_digit_count(NEW.employee_id, v_prefix);
  IF v_n < v_min OR v_n > v_max THEN
    RAISE EXCEPTION 'Employee ID % must have % to % digits (it has %)', NEW.employee_id, v_min, v_max, v_n
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_employee_id_digits ON teachers;
CREATE TRIGGER trg_check_employee_id_digits
  BEFORE INSERT OR UPDATE OF employee_id ON teachers
  FOR EACH ROW EXECUTE FUNCTION check_employee_id_digits();
