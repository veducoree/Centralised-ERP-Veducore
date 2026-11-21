/*
  # 052 — Admission number prefix + school profile locked to Veducore

  1. schools.admission_prefix: set by Veducore (super admin) when the school is
     registered, e.g. 'STUD'. The admin's student forms show it fixed in front
     of the number box.

  2. School registration details (name, address, city, phone, email and the
     admission prefix) are now controlled by Veducore only. School admins can
     still update their own row for settings / logo / motto / affiliation, but
     these columns are silently kept as they were — same as the platform
     columns already protected in 038.
     academic_year is NOT locked: the sessions module updates it.

  3. next_admission_number(): the number the next student should get.
     Looks at existing admission numbers that are the prefix followed by digits
     only, takes the highest and adds 1, keeping the same zero padding
     (STUD009 → STUD010, STUD453 → STUD454). Returns null when the school has
     no such student yet — the admin types the first number.
     Runs as the caller, so RLS on students applies.
*/

-- ── 1. Column ───────────────────────────────────────────────────────────────
ALTER TABLE schools ADD COLUMN IF NOT EXISTS admission_prefix text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schools'::regclass AND conname = 'schools_admission_prefix_format'
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_admission_prefix_format
      CHECK (admission_prefix IS NULL OR admission_prefix ~ '^[A-Za-z0-9/-]{1,12}$');
  END IF;
END $$;

-- ── 2. Lock registration details for school users ───────────────────────────
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
    -- Registration details: Veducore only (052)
    NEW.name := OLD.name;
    NEW.address := OLD.address;
    NEW.city := OLD.city;
    NEW.contact_number := OLD.contact_number;
    NEW.email := OLD.email;
    NEW.admission_prefix := OLD.admission_prefix;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Next admission number ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION next_admission_number()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_prefix text;
  v_suffix text;
BEGIN
  IF v_school IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(admission_prefix, '') INTO v_prefix FROM schools WHERE id = v_school;
  v_prefix := coalesce(v_prefix, '');

  SELECT substr(s.admission_number, length(v_prefix) + 1) INTO v_suffix
  FROM students s
  WHERE s.school_id = v_school
    AND upper(left(s.admission_number, length(v_prefix))) = upper(v_prefix)
    AND substr(s.admission_number, length(v_prefix) + 1) ~ '^[0-9]{1,15}$'
  ORDER BY substr(s.admission_number, length(v_prefix) + 1)::numeric DESC
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

REVOKE ALL ON FUNCTION next_admission_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION next_admission_number() TO authenticated;
