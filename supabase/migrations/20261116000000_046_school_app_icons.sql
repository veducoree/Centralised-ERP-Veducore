/*
# Migration 046: School app icons

`list_school_app_icons()` returns the id, name, city and logo of every school
that has a logo, so the mobile build script (scripts/sync-school-icons.mjs)
can bundle each school's logo as an alternate launcher icon using only the
public anon key. Only non-sensitive branding fields are exposed; suspended /
inactive schools are skipped. Idempotent.
*/

CREATE OR REPLACE FUNCTION list_school_app_icons()
RETURNS TABLE (id uuid, name text, city text, logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.city, s.logo_url
  FROM schools s
  WHERE coalesce(trim(s.logo_url), '') <> ''
    AND coalesce(lower(s.status), 'active') = 'active'
    AND s.suspended_at IS NULL
  ORDER BY s.name;
$$;

REVOKE ALL ON FUNCTION list_school_app_icons() FROM public;
GRANT EXECUTE ON FUNCTION list_school_app_icons() TO anon, authenticated;
