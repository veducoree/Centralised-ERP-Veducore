-- ============================================================
-- Migration 044: Weekly off days follow the school's working week
--
-- Settings → "Weekly Working Days" (schools.settings.workingDays):
--   '6' → Monday–Saturday, Sunday off (default)
--   '5' → Monday–Friday, Saturday and Sunday off
-- school_working_days() (used for leave day counts) now honours that
-- instead of always treating only Sunday as off. Declared holidays and
-- declared working days in the holidays table still win.
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION school_weekly_off_days(p_school uuid)
RETURNS int[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN coalesce(settings->>'workingDays', '6') = '5' THEN ARRAY[0, 6] ELSE ARRAY[0] END
       FROM schools WHERE id = p_school),
    ARRAY[0]);
$$;
REVOKE ALL ON FUNCTION school_weekly_off_days(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION school_weekly_off_days(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION school_working_days(p_school uuid, p_from date, p_to date)
RETURNS SETOF date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d::date FROM generate_series(p_from, p_to, interval '1 day') d
  WHERE (NOT (extract(dow FROM d)::int = ANY(school_weekly_off_days(p_school)))
         OR EXISTS (SELECT 1 FROM holidays h WHERE h.school_id = p_school AND h.date = d::date AND h.type = 'working'))
    AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.school_id = p_school AND h.date = d::date AND h.type IN ('holiday','festival'));
$$;
REVOKE ALL ON FUNCTION school_working_days(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION school_working_days(uuid, date, date) TO authenticated;
