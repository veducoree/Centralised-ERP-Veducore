/*
# Automated Parent Provisioning & Linking on Student Creation
1. Creates trigger function `auto_create_parent_for_student()` that runs AFTER INSERT on students table.
2. Derives:
   - Parent name from father_name, mother_name, or "Student's Parent"
   - Parent email from parent_email or admission_number@schoolslug.veducore
   - Secure default password (e.g. name4char + year)
   - Relationship (Father, Mother, or Guardian)
3. Inserts into `parents` if not already present.
4. Links parent to student in `parent_students` table.
5. Backfills any existing unlinked students.
*/

CREATE OR REPLACE FUNCTION auto_create_parent_for_student()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_slug text;
  v_parent_email text;
  v_parent_name text;
  v_password text;
  v_relationship text;
  v_parent_id uuid;
  v_phone text;
  v_year text;
  v_name_part text;
BEGIN
  -- 1. Determine relationship & parent name
  IF NEW.father_name IS NOT NULL AND TRIM(NEW.father_name) <> '' THEN
    v_parent_name := TRIM(NEW.father_name);
    v_relationship := 'Father';
  ELSIF NEW.mother_name IS NOT NULL AND TRIM(NEW.mother_name) <> '' THEN
    v_parent_name := TRIM(NEW.mother_name);
    v_relationship := 'Mother';
  ELSE
    v_parent_name := TRIM(NEW.full_name) || '''s Parent';
    v_relationship := 'Guardian';
  END IF;

  -- 2. Determine school slug
  SELECT LOWER(REGEXP_REPLACE(SPLIT_PART(name, ' ', 1), '[^a-zA-Z0-9]', '', 'g'))
  INTO v_school_slug
  FROM schools
  WHERE id = NEW.school_id;

  IF v_school_slug IS NULL OR v_school_slug = '' THEN
    v_school_slug := 'veducore';
  END IF;

  -- 3. Determine email
  IF NEW.parent_email IS NOT NULL AND TRIM(NEW.parent_email) <> '' THEN
    v_parent_email := LOWER(TRIM(NEW.parent_email));
  ELSE
    v_parent_email := LOWER(REGEXP_REPLACE(NEW.admission_number, '\s+', '', 'g')) || '@' || v_school_slug || '.veducore';
  END IF;

  -- 4. Determine password
  v_year := TO_CHAR(COALESCE(NEW.admission_date, CURRENT_DATE), 'YYYY');
  v_name_part := LOWER(SUBSTRING(REGEXP_REPLACE(NEW.full_name, '\s+', '', 'g') FROM 1 FOR 4));
  v_password := v_name_part || v_year;

  -- 5. Determine phone
  v_phone := COALESCE(NEW.emergency_contact, NULL);

  -- 6. Check if parent already exists in this school
  SELECT id INTO v_parent_id
  FROM parents
  WHERE school_id = NEW.school_id AND LOWER(email) = v_parent_email
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    INSERT INTO parents (
      school_id,
      full_name,
      email,
      phone,
      address,
      password,
      status
    ) VALUES (
      NEW.school_id,
      v_parent_name,
      v_parent_email,
      v_phone,
      NEW.address,
      v_password,
      'active'
    )
    RETURNING id INTO v_parent_id;
  END IF;

  -- 7. Link to parent_students
  IF v_parent_id IS NOT NULL THEN
    INSERT INTO parent_students (
      school_id,
      parent_id,
      student_id,
      relationship
    ) VALUES (
      NEW.school_id,
      v_parent_id,
      NEW.id,
      v_relationship
    )
    ON CONFLICT (parent_id, student_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_parent_for_student ON students;
CREATE TRIGGER trg_auto_create_parent_for_student
  AFTER INSERT ON students
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_parent_for_student();

-- Backfill any existing students without parent links
DO $$
DECLARE
  r RECORD;
  v_school_slug text;
  v_parent_email text;
  v_parent_name text;
  v_password text;
  v_relationship text;
  v_parent_id uuid;
  v_year text;
  v_name_part text;
BEGIN
  FOR r IN (
    SELECT s.* 
    FROM students s
    LEFT JOIN parent_students ps ON ps.student_id = s.id
    WHERE ps.id IS NULL
  ) LOOP
    IF r.father_name IS NOT NULL AND TRIM(r.father_name) <> '' THEN
      v_parent_name := TRIM(r.father_name);
      v_relationship := 'Father';
    ELSIF r.mother_name IS NOT NULL AND TRIM(r.mother_name) <> '' THEN
      v_parent_name := TRIM(r.mother_name);
      v_relationship := 'Mother';
    ELSE
      v_parent_name := TRIM(r.full_name) || '''s Parent';
      v_relationship := 'Guardian';
    END IF;

    SELECT LOWER(REGEXP_REPLACE(SPLIT_PART(name, ' ', 1), '[^a-zA-Z0-9]', '', 'g'))
    INTO v_school_slug
    FROM schools
    WHERE id = r.school_id;

    IF v_school_slug IS NULL OR v_school_slug = '' THEN
      v_school_slug := 'veducore';
    END IF;

    IF r.parent_email IS NOT NULL AND TRIM(r.parent_email) <> '' THEN
      v_parent_email := LOWER(TRIM(r.parent_email));
    ELSE
      v_parent_email := LOWER(REGEXP_REPLACE(r.admission_number, '\s+', '', 'g')) || '@' || v_school_slug || '.veducore';
    END IF;

    v_year := TO_CHAR(COALESCE(r.admission_date, CURRENT_DATE), 'YYYY');
    v_name_part := LOWER(SUBSTRING(REGEXP_REPLACE(r.full_name, '\s+', '', 'g') FROM 1 FOR 4));
    v_password := v_name_part || v_year;

    SELECT id INTO v_parent_id
    FROM parents
    WHERE school_id = r.school_id AND LOWER(email) = v_parent_email
    LIMIT 1;

    IF v_parent_id IS NULL THEN
      INSERT INTO parents (
        school_id,
        full_name,
        email,
        phone,
        address,
        password,
        status
      ) VALUES (
        r.school_id,
        v_parent_name,
        v_parent_email,
        r.emergency_contact,
        r.address,
        v_password,
        'active'
      )
      RETURNING id INTO v_parent_id;
    END IF;

    IF v_parent_id IS NOT NULL THEN
      INSERT INTO parent_students (
        school_id,
        parent_id,
        student_id,
        relationship
      ) VALUES (
        r.school_id,
        v_parent_id,
        r.id,
        v_relationship
      )
      ON CONFLICT (parent_id, student_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;
