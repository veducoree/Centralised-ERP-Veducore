-- 028: promotion_status also returns the class a student was in last session.
DROP FUNCTION IF EXISTS promotion_status(uuid);
CREATE FUNCTION promotion_status(p_class uuid)
RETURNS TABLE (student_id uuid, from_status text, from_class uuid, current_class uuid, current_section uuid, active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, e.status, coalesce(e.class_id, s.class_id), s.class_id, s.section_id, s.status = 'active'
  FROM students s
  LEFT JOIN student_enrollments e ON e.student_id = s.id AND e.session_id = previous_session_id(s.school_id)
  WHERE s.school_id = get_current_school_id() AND has_permission(ARRAY['students'], 'view')
    AND coalesce(e.class_id, s.class_id) = p_class;
$$;
REVOKE ALL ON FUNCTION promotion_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION promotion_status(uuid) TO authenticated;
