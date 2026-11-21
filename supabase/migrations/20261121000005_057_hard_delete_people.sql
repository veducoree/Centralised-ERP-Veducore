-- ============================================================
-- 057: Deleting a student / parent / teacher really removes it
--
-- Before: the admin panel ran a plain DELETE on students / parents /
-- teachers. The row went, but
--   * the parent / teacher Auth login and profile stayed behind
--     (orphan logins in auth.users),
--   * deleting a student left the parent behind with no children,
--   * an RLS block (no permission, viewing a past session) deleted
--     0 rows and the UI still said "deleted".
--
-- Now each delete is one SECURITY DEFINER function, in one
-- transaction, that raises a clear error instead of silently doing
-- nothing:
--   admin_delete_student(id) - student + every row tied to it (FK
--       cascades) + each parent who has no other child in the school,
--       with that parent's login.
--   admin_delete_parent(id)  - parent + login. Children stay.
--   admin_delete_teacher(id) - teacher + login (+ cascades).
-- Logins are removed straight from auth.users; that cascades to
-- profiles, push tokens, notification reads, sessions, identities.
-- A login is only removed when it belongs to nobody else (not a
-- teacher and parent at once, not a Veducore admin).
-- Also sweeps existing orphan parent/teacher logins.
-- Idempotent.
-- ============================================================

-- Remove one Auth login if nothing else in the school still uses it.
CREATE OR REPLACE FUNCTION _delete_login_if_unused(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM parents WHERE user_id = p_user)
     OR EXISTS (SELECT 1 FROM teachers WHERE user_id = p_user)
     OR EXISTS (SELECT 1 FROM veducore_admins WHERE id = p_user)
     OR EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND role::text NOT IN ('parent', 'teacher')) THEN
    RETURN false;
  END IF;
  DELETE FROM auth.users WHERE id = p_user;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION _delete_login_if_unused(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Student (+ parents left with no child)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_delete_student(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_parent record;
  v_parents_deleted int := 0;
  v_logins_deleted int := 0;
BEGIN
  IF v_school IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Only the school admin can delete students';
  END IF;
  IF NOT has_permission(ARRAY['students', 'admissions'], 'edit') THEN
    RAISE EXCEPTION 'You do not have permission to delete students';
  END IF;
  IF NOT viewing_is_current() THEN
    RAISE EXCEPTION 'Switch to the current academic session to delete a student';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  -- Parents whose only child (in any school) is this student.
  CREATE TEMP TABLE IF NOT EXISTS _del_parents (id uuid, user_id uuid) ON COMMIT DROP;
  TRUNCATE _del_parents;
  INSERT INTO _del_parents
  SELECT p.id, p.user_id
  FROM parent_students ps
  JOIN parents p ON p.id = ps.parent_id
  WHERE ps.student_id = p_student_id
    AND NOT EXISTS (
      SELECT 1 FROM parent_students o
      WHERE o.parent_id = p.id AND o.student_id <> p_student_id
    );

  -- Cascades attendance, marks, fees, payments, receipts, transport,
  -- certificates, enrollments, remarks, notifications, parent links.
  DELETE FROM students WHERE id = p_student_id;

  FOR v_parent IN SELECT * FROM _del_parents LOOP
    DELETE FROM parents WHERE id = v_parent.id;
    v_parents_deleted := v_parents_deleted + 1;
    IF _delete_login_if_unused(v_parent.user_id) THEN
      v_logins_deleted := v_logins_deleted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('parents_deleted', v_parents_deleted, 'logins_deleted', v_logins_deleted);
END;
$$;
REVOKE ALL ON FUNCTION admin_delete_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_delete_student(uuid) TO authenticated;

-- ------------------------------------------------------------
-- Parent (children are kept)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_delete_parent(p_parent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_user uuid;
  v_login boolean;
BEGIN
  IF v_school IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Only the school admin can delete parents';
  END IF;
  IF NOT has_permission(ARRAY['parents', 'admissions', 'students'], 'edit') THEN
    RAISE EXCEPTION 'You do not have permission to delete parents';
  END IF;
  SELECT user_id INTO v_user FROM parents WHERE id = p_parent_id AND school_id = v_school;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent not found';
  END IF;

  DELETE FROM parents WHERE id = p_parent_id;  -- cascades parent_students
  v_login := _delete_login_if_unused(v_user);
  RETURN jsonb_build_object('login_deleted', v_login);
END;
$$;
REVOKE ALL ON FUNCTION admin_delete_parent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_delete_parent(uuid) TO authenticated;

-- ------------------------------------------------------------
-- Teacher
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_delete_teacher(p_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_user uuid;
  v_login boolean;
BEGIN
  IF v_school IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Only the school admin can delete teachers';
  END IF;
  IF NOT has_permission(ARRAY['teachers'], 'edit') THEN
    RAISE EXCEPTION 'You do not have permission to delete teachers';
  END IF;
  SELECT user_id INTO v_user FROM teachers WHERE id = p_teacher_id AND school_id = v_school;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Teacher not found';
  END IF;
  IF v_user = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  -- Cascades class/subject assignments, timetable, staff attendance +
  -- leaves; history (marks entered, attendance taken) keeps the row
  -- with the teacher set to NULL.
  DELETE FROM teachers WHERE id = p_teacher_id;
  v_login := _delete_login_if_unused(v_user);
  RETURN jsonb_build_object('login_deleted', v_login);
END;
$$;
REVOKE ALL ON FUNCTION admin_delete_teacher(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_delete_teacher(uuid) TO authenticated;

-- ------------------------------------------------------------
-- One-time sweep: logins left behind by earlier deletes
-- (parent/teacher profile with no parents/teachers row).
-- ------------------------------------------------------------
DO $$
DECLARE
  v_uid uuid;
BEGIN
  FOR v_uid IN
    SELECT p.id FROM profiles p
    WHERE (p.role::text = 'parent'  AND NOT EXISTS (SELECT 1 FROM parents  x WHERE x.user_id = p.id))
       OR (p.role::text = 'teacher' AND NOT EXISTS (SELECT 1 FROM teachers x WHERE x.user_id = p.id))
  LOOP
    PERFORM _delete_login_if_unused(v_uid);
  END LOOP;
END;
$$;
