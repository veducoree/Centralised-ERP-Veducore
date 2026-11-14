-- ============================================================
-- 025: Exams & results
--
-- * exams: a school-wide exam (e.g. "Half Yearly") in a session, for
--   chosen classes, with a datesheet per class/subject.
-- * Saving a datesheet creates/updates exam_defs per section so the
--   existing teacher marks screens (web + app) pick the exam up.
-- * student_records.exam_id links marks to the exam (filled from
--   exam_defs by exam name + section when teachers save marks).
-- * Marks of an exam stay hidden from parents until the exam is
--   published; teachers can't change them after publishing.
-- * Publishing sends one result notification per student instead of a
--   notification per subject mark.
-- * grading scales with a default CBSE-style scale per school.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Grading
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grading_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  pass_percent numeric(5,2) NOT NULL DEFAULT 33,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_grading_scales_default ON grading_scales(school_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS grade_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scale_id uuid NOT NULL REFERENCES grading_scales(id) ON DELETE CASCADE,
  grade text NOT NULL,
  min_percent numeric(5,2) NOT NULL,
  grade_point numeric(4,2),
  remark text,
  UNIQUE (scale_id, grade),
  CHECK (min_percent >= 0 AND min_percent <= 100)
);

ALTER TABLE grading_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_bands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grading_scales_select" ON grading_scales;
CREATE POLICY "grading_scales_select" ON grading_scales FOR SELECT TO authenticated
  USING (school_id = get_current_school_id());
DROP POLICY IF EXISTS "grading_scales_admin" ON grading_scales;
CREATE POLICY "grading_scales_admin" ON grading_scales FOR ALL TO authenticated
  USING (school_id = get_current_school_id() AND has_permission(ARRAY['exams'], 'edit'))
  WITH CHECK (school_id = get_current_school_id() AND has_permission(ARRAY['exams'], 'edit'));

DROP POLICY IF EXISTS "grade_bands_select" ON grade_bands;
CREATE POLICY "grade_bands_select" ON grade_bands FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM grading_scales g WHERE g.id = scale_id AND g.school_id = get_current_school_id()));
DROP POLICY IF EXISTS "grade_bands_admin" ON grade_bands;
CREATE POLICY "grade_bands_admin" ON grade_bands FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM grading_scales g WHERE g.id = scale_id AND g.school_id = get_current_school_id())
         AND has_permission(ARRAY['exams'], 'edit'))
  WITH CHECK (EXISTS (SELECT 1 FROM grading_scales g WHERE g.id = scale_id AND g.school_id = get_current_school_id())
         AND has_permission(ARRAY['exams'], 'edit'));

CREATE OR REPLACE FUNCTION seed_grading_scale(p_school uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_scale uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM grading_scales WHERE school_id = p_school) THEN RETURN; END IF;
  INSERT INTO grading_scales (school_id, name, is_default, pass_percent)
  VALUES (p_school, 'Standard (A1–E)', true, 33) RETURNING id INTO v_scale;
  INSERT INTO grade_bands (scale_id, grade, min_percent, grade_point, remark) VALUES
    (v_scale, 'A1', 91, 10, 'Outstanding'),
    (v_scale, 'A2', 81, 9,  'Excellent'),
    (v_scale, 'B1', 71, 8,  'Very Good'),
    (v_scale, 'B2', 61, 7,  'Good'),
    (v_scale, 'C1', 51, 6,  'Above Average'),
    (v_scale, 'C2', 41, 5,  'Average'),
    (v_scale, 'D',  33, 4,  'Needs Improvement'),
    (v_scale, 'E',  0,  0,  'Needs Support');
END;
$$;
SELECT seed_grading_scale(id) FROM schools;

CREATE OR REPLACE FUNCTION trg_school_seed_grading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN PERFORM seed_grading_scale(NEW.id); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_school_seed_grading ON schools;
CREATE TRIGGER trg_school_seed_grading AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION trg_school_seed_grading();

-- Grade for a percentage on a scale (default scale when NULL).
CREATE OR REPLACE FUNCTION grade_for(p_school uuid, p_scale uuid, p_percent numeric)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.grade FROM grade_bands b
  WHERE b.scale_id = coalesce(p_scale,
          (SELECT id FROM grading_scales WHERE school_id = p_school AND is_default LIMIT 1))
    AND b.min_percent <= p_percent
  ORDER BY b.min_percent DESC LIMIT 1;
$$;

-- ------------------------------------------------------------
-- 2. Exams + datesheet
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id uuid REFERENCES academic_sessions(id) ON DELETE SET NULL,
  name text NOT NULL,
  record_type text NOT NULL DEFAULT 'mid_term'
    CHECK (record_type IN ('unit_test','mid_term','final_exam','assignment','practical')),
  start_date date,
  end_date date,
  grading_scale_id uuid REFERENCES grading_scales(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published')),
  published_at timestamptz,
  instructions text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_exams_school_session ON exams(school_id, session_id);

CREATE TABLE IF NOT EXISTS exam_classes (
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, class_id)
);

CREATE TABLE IF NOT EXISTS exam_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_date date,
  start_time time,
  end_time time,
  max_marks numeric(6,2) NOT NULL DEFAULT 100 CHECK (max_marks > 0),
  pass_marks numeric(6,2) CHECK (pass_marks IS NULL OR pass_marks >= 0),
  room text,
  UNIQUE (exam_id, class_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_schedule_exam ON exam_schedule(exam_id);

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_schedule ENABLE ROW LEVEL SECURITY;

-- Everyone in the school can read exams & datesheets (teachers enter
-- marks, parents see the datesheet). Only exams editors write.
DROP POLICY IF EXISTS "exams_select" ON exams;
CREATE POLICY "exams_select" ON exams FOR SELECT TO authenticated
  USING (school_id = get_current_school_id());
DROP POLICY IF EXISTS "exams_admin" ON exams;
CREATE POLICY "exams_admin" ON exams FOR ALL TO authenticated
  USING (school_id = get_current_school_id() AND has_permission(ARRAY['exams'], 'edit'))
  WITH CHECK (school_id = get_current_school_id() AND has_permission(ARRAY['exams'], 'edit'));

DROP POLICY IF EXISTS "exam_classes_select" ON exam_classes;
CREATE POLICY "exam_classes_select" ON exam_classes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM exams e WHERE e.id = exam_id AND e.school_id = get_current_school_id()));
DROP POLICY IF EXISTS "exam_classes_admin" ON exam_classes;
CREATE POLICY "exam_classes_admin" ON exam_classes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM exams e WHERE e.id = exam_id AND e.school_id = get_current_school_id())
         AND has_permission(ARRAY['exams'], 'edit'))
  WITH CHECK (EXISTS (SELECT 1 FROM exams e WHERE e.id = exam_id AND e.school_id = get_current_school_id())
         AND has_permission(ARRAY['exams'], 'edit'));

DROP POLICY IF EXISTS "exam_schedule_select" ON exam_schedule;
CREATE POLICY "exam_schedule_select" ON exam_schedule FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM exams e WHERE e.id = exam_id AND e.school_id = get_current_school_id()));
DROP POLICY IF EXISTS "exam_schedule_admin" ON exam_schedule;
CREATE POLICY "exam_schedule_admin" ON exam_schedule FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM exams e WHERE e.id = exam_id AND e.school_id = get_current_school_id())
         AND has_permission(ARRAY['exams'], 'edit'))
  WITH CHECK (EXISTS (SELECT 1 FROM exams e WHERE e.id = exam_id AND e.school_id = get_current_school_id())
         AND has_permission(ARRAY['exams'], 'edit'));

CREATE OR REPLACE FUNCTION trg_exams_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.session_id IS NULL THEN NEW.session_id := current_session_id(NEW.school_id); END IF;
    IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_exams_defaults ON exams;
CREATE TRIGGER trg_exams_defaults BEFORE INSERT OR UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION trg_exams_defaults();

-- ------------------------------------------------------------
-- 3. Link exam_defs and marks to exams
-- ------------------------------------------------------------
ALTER TABLE exam_defs ADD COLUMN IF NOT EXISTS exam_id uuid REFERENCES exams(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_defs_exam_section ON exam_defs(exam_id, section_id) WHERE exam_id IS NOT NULL;

ALTER TABLE student_records ADD COLUMN IF NOT EXISTS exam_id uuid REFERENCES exams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_student_records_exam ON student_records(exam_id) WHERE exam_id IS NOT NULL;

-- Teachers save marks with exam_name only; resolve the exam from the
-- student's section.
CREATE OR REPLACE FUNCTION trg_student_record_exam_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.exam_id IS NULL THEN
    SELECT d.exam_id INTO NEW.exam_id
    FROM exam_defs d JOIN students s ON s.section_id = d.section_id
    WHERE s.id = NEW.student_id AND d.exam_id IS NOT NULL
      AND lower(d.exam_name) = lower(NEW.exam_name)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_student_record_exam_link ON student_records;
CREATE TRIGGER trg_student_record_exam_link BEFORE INSERT OR UPDATE OF exam_name ON student_records
  FOR EACH ROW EXECUTE FUNCTION trg_student_record_exam_link();

-- Generate/refresh one exam_def per section of each class in the exam.
CREATE OR REPLACE FUNCTION sync_exam_defs(p_exam uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_exam exams%ROWTYPE;
  v_count int := 0;
BEGIN
  SELECT * INTO v_exam FROM exams WHERE id = p_exam;
  IF v_exam.id IS NULL OR v_exam.school_id <> get_current_school_id()
     OR NOT has_permission(ARRAY['exams'], 'edit') THEN
    RAISE EXCEPTION 'Exam not found';
  END IF;

  -- Remove defs for classes no longer in the exam (and their unmarked state).
  DELETE FROM exam_defs d
  WHERE d.exam_id = p_exam
    AND NOT EXISTS (SELECT 1 FROM sections s JOIN exam_classes ec ON ec.class_id = s.class_id
                    WHERE s.id = d.section_id AND ec.exam_id = p_exam);

  INSERT INTO exam_defs (school_id, section_id, exam_name, record_type, max_marks, date, exam_id, session_id)
  SELECT v_exam.school_id, s.id, v_exam.name, v_exam.record_type,
         coalesce((SELECT max(es.max_marks) FROM exam_schedule es WHERE es.exam_id = p_exam AND es.class_id = s.class_id), 100),
         coalesce(v_exam.start_date, CURRENT_DATE), p_exam, v_exam.session_id
  FROM sections s JOIN exam_classes ec ON ec.class_id = s.class_id AND ec.exam_id = p_exam
  ON CONFLICT (exam_id, section_id) WHERE exam_id IS NOT NULL DO UPDATE SET
    exam_name = EXCLUDED.exam_name,
    record_type = EXCLUDED.record_type,
    max_marks = EXCLUDED.max_marks,
    date = EXCLUDED.date,
    updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Older marks saved under the same name before linking.
  UPDATE student_records r SET exam_id = p_exam
  FROM students s JOIN exam_classes ec ON ec.class_id = s.class_id AND ec.exam_id = p_exam
  WHERE r.student_id = s.id AND r.exam_id IS NULL AND lower(r.exam_name) = lower(v_exam.name)
    AND r.school_id = v_exam.school_id;

  IF v_exam.status = 'draft' THEN UPDATE exams SET status = 'scheduled' WHERE id = p_exam; END IF;
  RETURN v_count;
END;
$$;

-- Teachers can't edit or delete admin-created exam_defs.
DROP POLICY IF EXISTS "exam_defs_teacher_lock" ON exam_defs;
CREATE POLICY "exam_defs_teacher_lock" ON exam_defs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT is_teacher() OR exam_id IS NULL);
DROP POLICY IF EXISTS "exam_defs_teacher_lock_delete" ON exam_defs;
CREATE POLICY "exam_defs_teacher_lock_delete" ON exam_defs AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT is_teacher() OR exam_id IS NULL);

-- ------------------------------------------------------------
-- 4. Visibility + lock tied to publishing
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION exam_is_published(p_exam uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce((SELECT status = 'published' FROM exams WHERE id = p_exam), true); $$;

-- Parents only see marks of published exams (or marks not tied to an exam).
DROP POLICY IF EXISTS "student_records_parent_published_only" ON student_records;
CREATE POLICY "student_records_parent_published_only" ON student_records AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT is_parent() OR exam_id IS NULL OR exam_is_published(exam_id));

-- Teachers can't change marks once the exam is published.
DROP POLICY IF EXISTS "student_records_teacher_lock_ins" ON student_records;
CREATE POLICY "student_records_teacher_lock_ins" ON student_records AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT is_teacher() OR exam_id IS NULL OR NOT exam_is_published(exam_id));
DROP POLICY IF EXISTS "student_records_teacher_lock_upd" ON student_records;
CREATE POLICY "student_records_teacher_lock_upd" ON student_records AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT is_teacher() OR exam_id IS NULL OR NOT exam_is_published(exam_id));
DROP POLICY IF EXISTS "student_records_teacher_lock_del" ON student_records;
CREATE POLICY "student_records_teacher_lock_del" ON student_records AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT is_teacher() OR exam_id IS NULL OR NOT exam_is_published(exam_id));

-- Per-mark notifications only for marks not tied to an exam; exam results
-- are announced once on publish.
CREATE OR REPLACE FUNCTION trg_notify_marks()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text;
BEGIN
  IF NEW.exam_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT full_name INTO v_name FROM students WHERE id = NEW.student_id;
  PERFORM notify_student(
    NEW.school_id, NEW.student_id,
    'Marks: ' || coalesce(NEW.subject_name, 'Subject') || ' – ' || NEW.exam_name,
    v_name || ' scored ' || trim(to_char(NEW.marks, 'FM9990.##')) || '/'
      || trim(to_char(NEW.max_marks, 'FM9990.##'))
      || coalesce(' (Grade ' || NEW.grade || ')', '')
      || ' in ' || coalesce(NEW.subject_name, 'the subject') || '.',
    'exam', 'info', '/parent/records', 'student_record', NEW.id
  );
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 5. Results
-- ------------------------------------------------------------
-- One row per student in the section with totals, %, grade, rank and
-- per-subject marks. Max marks per subject come from the datesheet when
-- set, otherwise from the mark itself. Students with no marks are included
-- (absent from results) with NULL totals.
CREATE OR REPLACE FUNCTION exam_results(p_exam uuid, p_section uuid DEFAULT NULL)
RETURNS TABLE (
  student_id uuid, full_name text, admission_number text, roll_number int,
  class_name text, section_id uuid, section_name text,
  total numeric, max_total numeric, percent numeric, grade text,
  passed boolean, subjects_failed int, rank int, subjects jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_exam exams%ROWTYPE;
  v_pass numeric;
BEGIN
  SELECT * INTO v_exam FROM exams WHERE id = p_exam;
  IF v_exam.id IS NULL OR v_exam.school_id IS DISTINCT FROM get_current_school_id() THEN
    RAISE EXCEPTION 'Exam not found';
  END IF;
  -- Staff with exams access, or teachers; parents use their own view.
  IF NOT (has_permission(ARRAY['exams'], 'view') OR is_teacher()
          OR current_setting('veducore.results_internal', true) = 'on') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT coalesce(g.pass_percent, 33) INTO v_pass
  FROM grading_scales g
  WHERE g.id = coalesce(v_exam.grading_scale_id,
                 (SELECT id FROM grading_scales WHERE school_id = v_exam.school_id AND is_default LIMIT 1));
  v_pass := coalesce(v_pass, 33);

  RETURN QUERY
  WITH roster AS (
    SELECT s.id, s.full_name, s.admission_number, s.roll_number, s.class_id, s.section_id,
           c.name AS class_name, sec.name AS section_name
    FROM students s
    JOIN exam_classes ec ON ec.class_id = s.class_id AND ec.exam_id = p_exam
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN sections sec ON sec.id = s.section_id
    WHERE s.status = 'active' AND (p_section IS NULL OR s.section_id = p_section)
  ),
  marks AS (
    SELECT r.student_id, r.subject_id,
           coalesce(sub.name, r.subject_name) AS subject_name,
           r.marks,
           coalesce(es.max_marks, r.max_marks) AS max_marks,
           coalesce(es.pass_marks, round(coalesce(es.max_marks, r.max_marks) * v_pass / 100, 2)) AS pass_marks
    FROM student_records r
    JOIN roster ro ON ro.id = r.student_id
    LEFT JOIN subjects sub ON sub.id = r.subject_id
    LEFT JOIN exam_schedule es ON es.exam_id = p_exam AND es.class_id = ro.class_id AND es.subject_id = r.subject_id
    WHERE r.exam_id = p_exam
  ),
  agg AS (
    SELECT m.student_id,
           sum(m.marks) AS total,
           sum(m.max_marks) AS max_total,
           count(*) FILTER (WHERE m.marks < m.pass_marks)::int AS failed,
           jsonb_agg(jsonb_build_object(
             'subject_id', m.subject_id, 'subject', m.subject_name,
             'marks', m.marks, 'max_marks', m.max_marks, 'pass_marks', m.pass_marks,
             'grade', grade_for(v_exam.school_id, v_exam.grading_scale_id, round(m.marks * 100 / nullif(m.max_marks, 0), 2)))
             ORDER BY m.subject_name) AS subjects
    FROM marks m GROUP BY m.student_id
  ),
  scored AS (
    SELECT ro.*, a.total, a.max_total, a.failed, a.subjects,
           round(a.total * 100 / nullif(a.max_total, 0), 2) AS pct
    FROM roster ro LEFT JOIN agg a ON a.student_id = ro.id
  )
  SELECT sc.id, sc.full_name, sc.admission_number, sc.roll_number,
         sc.class_name, sc.section_id, sc.section_name,
         sc.total, sc.max_total, sc.pct,
         CASE WHEN sc.pct IS NULL THEN NULL ELSE grade_for(v_exam.school_id, v_exam.grading_scale_id, sc.pct) END,
         CASE WHEN sc.pct IS NULL THEN NULL ELSE (sc.failed = 0 AND sc.pct >= v_pass) END,
         coalesce(sc.failed, 0),
         CASE WHEN sc.pct IS NULL THEN NULL
              ELSE (rank() OVER (PARTITION BY sc.class_id, (sc.pct IS NULL) ORDER BY sc.pct DESC NULLS LAST))::int END,
         coalesce(sc.subjects, '[]'::jsonb)
  FROM scored sc
  ORDER BY sc.pct DESC NULLS LAST, sc.roll_number NULLS LAST, sc.full_name;
END;
$$;

-- Marks entry progress: per section & subject, how many students have marks.
CREATE OR REPLACE FUNCTION exam_progress(p_exam uuid)
RETURNS TABLE (section_id uuid, label text, subject_id uuid, subject text, students int, entered int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sec.id, c.name || ' - ' || sec.name, sub.id, sub.name,
         (SELECT count(*) FROM students s WHERE s.section_id = sec.id AND s.status = 'active')::int,
         (SELECT count(DISTINCT r.student_id) FROM student_records r JOIN students s ON s.id = r.student_id
           WHERE r.exam_id = p_exam AND r.subject_id = sub.id AND s.section_id = sec.id)::int
  FROM exams e
  JOIN exam_classes ec ON ec.exam_id = e.id
  JOIN classes c ON c.id = ec.class_id
  JOIN sections sec ON sec.class_id = c.id
  JOIN exam_schedule es ON es.exam_id = e.id AND es.class_id = c.id
  JOIN subjects sub ON sub.id = es.subject_id
  WHERE e.id = p_exam AND e.school_id = get_current_school_id()
    AND (has_permission(ARRAY['exams'], 'view') OR is_teacher())
  ORDER BY c.grade_level NULLS LAST, c.name, sec.name, sub.name;
$$;

-- Publish / unpublish. Publishing notifies each student's parents once.
CREATE OR REPLACE FUNCTION publish_exam(p_exam uuid, p_publish boolean DEFAULT true)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_exam exams%ROWTYPE;
  v_count int := 0;
  r record;
BEGIN
  SELECT * INTO v_exam FROM exams WHERE id = p_exam;
  IF v_exam.id IS NULL OR v_exam.school_id <> get_current_school_id()
     OR NOT has_permission(ARRAY['exams'], 'edit') THEN
    RAISE EXCEPTION 'Exam not found';
  END IF;

  IF NOT p_publish THEN
    UPDATE exams SET status = 'scheduled', published_at = NULL WHERE id = p_exam;
    RETURN 0;
  END IF;

  IF v_exam.status = 'published' THEN RETURN 0; END IF;
  UPDATE exams SET status = 'published', published_at = now() WHERE id = p_exam;

  FOR r IN SELECT * FROM exam_results(p_exam, NULL) WHERE total IS NOT NULL LOOP
    PERFORM notify_student(
      v_exam.school_id, r.student_id,
      'Result: ' || v_exam.name,
      r.full_name || ' scored ' || trim(to_char(r.total, 'FM99990.##')) || '/' || trim(to_char(r.max_total, 'FM99990.##'))
        || ' (' || trim(to_char(r.percent, 'FM990.0')) || '%'
        || coalesce(', Grade ' || r.grade, '') || ')'
        || CASE WHEN r.rank IS NOT NULL THEN '. Rank ' || r.rank ELSE '' END || '.',
      'exam', CASE WHEN r.passed THEN 'success' ELSE 'warning' END,
      '/parent/records', 'exam_result', p_exam
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Parent view: published results of their own children.
CREATE OR REPLACE FUNCTION my_child_exam_results(p_student uuid)
RETURNS TABLE (exam_id uuid, exam_name text, published_at timestamptz,
               total numeric, max_total numeric, percent numeric, grade text, rank int, subjects jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_section uuid;
  e record;
BEGIN
  IF p_student NOT IN (SELECT my_student_ids()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT section_id INTO v_section FROM students WHERE id = p_student;
  FOR e IN SELECT x.id, x.name, x.published_at FROM exams x
           JOIN exam_classes ec ON ec.exam_id = x.id
           JOIN students s ON s.class_id = ec.class_id AND s.id = p_student
           WHERE x.status = 'published' ORDER BY x.published_at DESC
  LOOP
    RETURN QUERY
      SELECT e.id, e.name, e.published_at, er.total, er.max_total, er.percent, er.grade, er.rank, er.subjects
      FROM exam_results_internal(e.id, v_section) er WHERE er.student_id = p_student;
  END LOOP;
END;
$$;

-- exam_results() checks staff/teacher access; parents go through
-- my_child_exam_results which calls this unchecked wrapper.
CREATE OR REPLACE FUNCTION exam_results_internal(p_exam uuid, p_section uuid)
RETURNS TABLE (
  student_id uuid, full_name text, admission_number text, roll_number int,
  class_name text, section_id uuid, section_name text,
  total numeric, max_total numeric, percent numeric, grade text,
  passed boolean, subjects_failed int, rank int, subjects jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM set_config('veducore.results_internal', 'on', true);
  RETURN QUERY SELECT * FROM exam_results(p_exam, p_section);
END;
$$;

REVOKE ALL ON FUNCTION exam_results_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION seed_grading_scale(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_exam_defs(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION exam_results(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION exam_progress(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION publish_exam(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION my_child_exam_results(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION grade_for(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_exam_defs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION exam_results(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION exam_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION publish_exam(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION my_child_exam_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION grade_for(uuid, uuid, numeric) TO authenticated;
