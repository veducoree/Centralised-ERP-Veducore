-- 061: First / Middle / Last name on students and teachers.
-- full_name stays the name every screen reads; the app writes both.
-- Idempotent.

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS first_name  text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS middle_name text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS last_name   text;

ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS first_name  text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS middle_name text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS last_name   text;

-- Backfill existing rows by splitting full_name:
--   1 word → first; 2 words → first + last; 3+ words → first, middle (the rest), last.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'teachers'] LOOP
    EXECUTE format($f$
      WITH w AS (
        SELECT id, regexp_split_to_array(btrim(regexp_replace(full_name, '\s+', ' ', 'g')), ' ') AS a
        FROM public.%I
        WHERE first_name IS NULL AND coalesce(btrim(full_name), '') <> ''
      )
      UPDATE public.%I x SET
        first_name  = w.a[1],
        middle_name = CASE WHEN cardinality(w.a) >= 3
                           THEN array_to_string(w.a[2:cardinality(w.a) - 1], ' ') END,
        last_name   = CASE WHEN cardinality(w.a) >= 2 THEN w.a[cardinality(w.a)] END
      FROM w
      WHERE x.id = w.id
    $f$, t, t);
  END LOOP;
END $$;
