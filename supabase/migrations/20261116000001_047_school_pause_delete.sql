-- ============================================================
-- 047: Reliable school pause + complete school deletion
--
-- 1. my_account_access(): one call the web + app make on login, on
--    session restore and periodically, to decide whether the signed-in
--    user may enter. Works while the school is paused (reads tables
--    directly, not get_current_school_id()).
-- 2. platform_revoke_school_sessions(): kills refresh tokens of every
--    login of a paused school so open sessions can't keep going.
-- 3. platform_delete_school(): deletes the school and EVERY row tied
--    to it in one transaction, returns the logins to remove from Auth.
--    Child rows go first: many tables reference academic_sessions /
--    transport_stops with ON DELETE RESTRICT (kept on purpose so a school
--    admin can't drop a session that has data), which made a plain
--    cascading DELETE FROM schools fail.
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Access check for the signed-in user
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION my_account_access()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_profile_status text;
  v_school uuid;
  v_status text;
  v_reason text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('blocked', 'no_session');
  END IF;

  SELECT p.role::text, p.status::text, p.school_id
    INTO v_role, v_profile_status, v_school
  FROM profiles p WHERE p.id = v_uid;

  -- Some teacher/parent logins only link through teachers/parents.
  IF v_school IS NULL THEN
    SELECT t.school_id INTO v_school FROM teachers t WHERE t.user_id = v_uid LIMIT 1;
  END IF;
  IF v_school IS NULL THEN
    SELECT pa.school_id INTO v_school FROM parents pa WHERE pa.user_id = v_uid LIMIT 1;
  END IF;

  IF v_role IS NULL AND v_school IS NULL THEN
    RETURN jsonb_build_object('blocked', 'no_account');
  END IF;

  IF v_school IS NOT NULL THEN
    SELECT coalesce(s.status, 'Active'), s.suspension_reason, s.name
      INTO v_status, v_reason, v_name
    FROM schools s WHERE s.id = v_school;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('blocked', 'no_account', 'role', v_role);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'role', v_role,
    'school_id', v_school,
    'school_name', v_name,
    'school_status', coalesce(v_status, 'Active'),
    'suspension_reason', v_reason,
    'profile_status', coalesce(v_profile_status, 'active'),
    'blocked', CASE
      WHEN coalesce(v_status, 'Active') <> 'Active' THEN 'school_paused'
      WHEN coalesce(v_profile_status, 'active') <> 'active' THEN 'account_inactive'
      ELSE NULL
    END
  );
END;
$$;
REVOKE ALL ON FUNCTION my_account_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_account_access() TO authenticated;

-- ------------------------------------------------------------
-- 2. Sign every login of a school out (service role only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform_school_user_ids(p_school_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT x.u), '{}')
  FROM (
    SELECT id AS u FROM profiles WHERE school_id = p_school_id
    UNION SELECT user_id FROM teachers WHERE school_id = p_school_id AND user_id IS NOT NULL
    UNION SELECT user_id FROM parents  WHERE school_id = p_school_id AND user_id IS NOT NULL
  ) x
  -- Never touch a login that belongs to another school or to the Veducore team.
  WHERE NOT EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = x.u AND p.school_id IS NOT NULL AND p.school_id <> p_school_id)
    AND NOT EXISTS (SELECT 1 FROM veducore_admins a WHERE a.id = x.u);
$$;
REVOKE ALL ON FUNCTION platform_school_user_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_school_user_ids(uuid) TO service_role;

CREATE OR REPLACE FUNCTION platform_revoke_school_sessions(p_school_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_users uuid[] := platform_school_user_ids(p_school_id);
  v_n integer := 0;
BEGIN
  BEGIN
    DELETE FROM auth.sessions WHERE user_id = ANY(v_users);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    DELETE FROM auth.refresh_tokens WHERE user_id::text = ANY(v_users::text[]);
  EXCEPTION WHEN OTHERS THEN
    -- Not fatal: the database already hides a paused school's data and
    -- the apps sign the user out on their next access check.
    RAISE WARNING 'platform_revoke_school_sessions: %', SQLERRM;
  END;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION platform_revoke_school_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_revoke_school_sessions(uuid) TO service_role;

-- ------------------------------------------------------------
-- 3. Delete a school and everything tied to it (service role only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform_delete_school(p_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_users uuid[];
  v_table text;
  v_rows bigint;
  v_swept bigint := 0;
  v_pending text[];
  v_failed text[];
  v_err text;
  v_pass int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schools WHERE id = p_school_id) THEN
    RAISE EXCEPTION 'School not found';
  END IF;

  v_users := platform_school_user_ids(p_school_id);

  -- Every public table with a school_id, except the audit trail.
  SELECT array_agg(c.table_name::text) INTO v_pending
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public'
    AND c.column_name = 'school_id'
    AND c.data_type = 'uuid'
    AND t.table_type = 'BASE TABLE'
    AND c.table_name NOT IN ('platform_audit_log');

  -- Delete child rows before parents. A table blocked by a RESTRICT FK
  -- (e.g. academic_sessions while attendance still points at it) is
  -- retried on the next pass once its children are gone.
  FOR v_pass IN 1..30 LOOP
    EXIT WHEN v_pending IS NULL OR cardinality(v_pending) = 0;
    v_failed := '{}';
    FOREACH v_table IN ARRAY v_pending LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE school_id = $1', v_table) USING p_school_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_swept := v_swept + v_rows;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
        v_failed := v_failed || v_table;
        v_err := SQLERRM;
      END;
    END LOOP;
    EXIT WHEN cardinality(v_failed) = cardinality(v_pending);  -- no progress
    v_pending := v_failed;
  END LOOP;

  IF v_pending IS NOT NULL AND cardinality(v_pending) > 0 THEN
    RAISE EXCEPTION 'Could not delete school data in %: %', array_to_string(v_pending, ', '), v_err;
  END IF;

  -- Anything left (rows linked only through a cascading FK) goes with it.
  DELETE FROM schools WHERE id = p_school_id;

  -- Targeted announcements: drop the school from their audience.
  UPDATE platform_announcements
     SET school_ids = array_remove(school_ids, p_school_id)
   WHERE p_school_id = ANY(school_ids);

  RETURN jsonb_build_object('user_ids', to_jsonb(v_users), 'rows_deleted', v_swept);
END;
$$;
REVOKE ALL ON FUNCTION platform_delete_school(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_delete_school(uuid) TO service_role;
