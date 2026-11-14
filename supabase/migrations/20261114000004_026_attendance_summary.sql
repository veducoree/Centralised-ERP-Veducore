-- ============================================================
-- 026: Per-student attendance totals for a section and date range
-- (report cards, attendance reports). Server-side so a full year
-- isn't capped by the REST row limit.
-- ============================================================
CREATE OR REPLACE FUNCTION attendance_summary(p_section uuid, p_from date, p_to date)
RETURNS TABLE (student_id uuid, present int, absent int, late int, on_leave int, total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.student_id,
         count(*) FILTER (WHERE a.status = 'present')::int,
         count(*) FILTER (WHERE a.status = 'absent')::int,
         count(*) FILTER (WHERE a.status = 'late')::int,
         count(*) FILTER (WHERE a.status = 'leave')::int,
         count(*)::int
  FROM attendance a
  JOIN sections s ON s.id = a.section_id
  WHERE a.section_id = p_section
    AND a.attendance_date BETWEEN p_from AND p_to
    AND s.school_id = get_current_school_id()
    AND (has_permission(ARRAY['attendance','exams','students'], 'view') OR is_teacher())
  GROUP BY a.student_id;
$$;

REVOKE ALL ON FUNCTION attendance_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION attendance_summary(uuid, date, date) TO authenticated;
