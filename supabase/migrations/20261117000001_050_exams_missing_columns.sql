-- 050: the live `exams` table predates migration 025 (which used
-- CREATE TABLE IF NOT EXISTS), so it never got record_type,
-- grading_scale_id and instructions, and its status check rejects
-- 'scheduled'. Creating an exam failed with "Failed to save exam".
-- Idempotent: safe whether or not 025's version of the table exists.

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT 'mid_term',
  ADD COLUMN IF NOT EXISTS grading_scale_id uuid REFERENCES public.grading_scales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instructions text;

-- Legacy columns from the old table: keep them harmless for new inserts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'exam_type') THEN
    ALTER TABLE public.exams ALTER COLUMN exam_type DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_record_type_check;
ALTER TABLE public.exams ADD CONSTRAINT exams_record_type_check
  CHECK (record_type IN ('unit_test','mid_term','final_exam','assignment','practical'));

-- 025's flow is draft -> scheduled (datesheet saved) -> published.
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_status_check;
ALTER TABLE public.exams ADD CONSTRAINT exams_status_check
  CHECK (status IN ('draft','scheduled','published','closed'));

ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_dates_check;
ALTER TABLE public.exams ADD CONSTRAINT exams_dates_check
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);

CREATE INDEX IF NOT EXISTS idx_exams_school_session ON public.exams(school_id, session_id);

-- Make PostgREST see the new columns immediately.
NOTIFY pgrst, 'reload schema';
