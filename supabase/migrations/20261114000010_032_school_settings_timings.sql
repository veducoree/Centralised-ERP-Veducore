-- ============================================================
-- 032: School settings save, timings, security fix
--
-- * SECURITY: "schools_parent_transport_update" let any parent update
--   their school's whole row (name, logo, settings). It served an old
--   transport flow that now has its own table and already tolerates the
--   update failing. Dropped.
-- * update_school_settings(): merges a settings patch on the server
--   (settings || patch) so saving the Settings page can't wipe keys other
--   pages store in settings (transport, timetable days), and raises an
--   error instead of silently saving nothing.
-- * School timings in settings.timings; teachers who mark themselves in
--   after reporting time + grace are recorded as late.
-- ============================================================

DROP POLICY IF EXISTS "schools_parent_transport_update" ON schools;

CREATE OR REPLACE FUNCTION update_school_settings(p_patch jsonb DEFAULT '{}'::jsonb, p_fields jsonb DEFAULT '{}'::jsonb)
RETURNS schools
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid := get_current_school_id();
  v_row schools;
BEGIN
  IF v_school IS NULL OR NOT has_permission(ARRAY['settings'], 'edit') THEN
    RAISE EXCEPTION 'Your role cannot change school settings';
  END IF;
  IF jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Settings must be an object';
  END IF;

  UPDATE schools SET
    settings = coalesce(settings, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb),
    motto = CASE WHEN p_fields ? 'motto' THEN nullif(trim(p_fields->>'motto'), '') ELSE motto END,
    affiliation_board = CASE WHEN p_fields ? 'affiliation_board' THEN p_fields->>'affiliation_board' ELSE affiliation_board END,
    affiliation_code = CASE WHEN p_fields ? 'affiliation_code' THEN nullif(trim(p_fields->>'affiliation_code'), '') ELSE affiliation_code END,
    logo_url = CASE WHEN p_fields ? 'logo_url' THEN nullif(p_fields->>'logo_url', '') ELSE logo_url END,
    updated_at = now()
  WHERE id = v_school
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'School not found'; END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION update_school_settings(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_school_settings(jsonb, jsonb) TO authenticated;

-- Teacher self check-in: late after reporting time + grace (from settings.timings).
CREATE OR REPLACE FUNCTION mark_my_attendance(p_check_out boolean DEFAULT false)
RETURNS staff_attendance
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_teacher teachers%ROWTYPE;
  v_school schools%ROWTYPE;
  v_today date;
  v_now time;
  v_row staff_attendance;
  v_report time;
  v_grace int;
  v_status text := 'present';
BEGIN
  SELECT * INTO v_teacher FROM teachers WHERE user_id = auth.uid() AND status = 'active';
  IF v_teacher.id IS NULL THEN RAISE EXCEPTION 'Only teachers can mark their attendance'; END IF;
  SELECT * INTO v_school FROM schools WHERE id = v_teacher.school_id;
  v_today := school_local_date(v_teacher.school_id);
  v_now := (now() AT TIME ZONE coalesce(nullif(nullif(v_school.timezone, ''), 'UTC'), 'Asia/Kolkata'))::time;

  SELECT * INTO v_row FROM staff_attendance WHERE teacher_id = v_teacher.id AND attendance_date = v_today;

  IF p_check_out THEN
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Mark yourself present first'; END IF;
    UPDATE staff_attendance SET check_out = v_now WHERE id = v_row.id RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  IF v_row.id IS NOT NULL THEN
    IF v_row.status = 'leave' THEN RAISE EXCEPTION 'You are on approved leave today'; END IF;
    RETURN v_row;
  END IF;

  BEGIN
    v_report := nullif(v_school.settings #>> '{timings,staff_reporting}', '')::time;
    v_grace := coalesce(nullif(v_school.settings #>> '{timings,late_after_minutes}', '')::int, 0);
  EXCEPTION WHEN OTHERS THEN
    v_report := NULL;
  END;
  IF v_report IS NOT NULL AND v_now > v_report + make_interval(mins => v_grace) THEN
    v_status := 'late';
  END IF;

  INSERT INTO staff_attendance (school_id, teacher_id, attendance_date, status, check_in, marked_by, note)
  VALUES (v_teacher.school_id, v_teacher.id, v_today, v_status, v_now, auth.uid(), 'Self-marked')
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
