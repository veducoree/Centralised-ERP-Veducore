/*
# Migration 051: Annual report card templates

The Veducore team uploads a school's own blank report card (as an image) in
/superadmin/report-cards and places fields on it: student details, photo box
and the marks grid. Schools then print the year-end report card on top of
that background, filled from published exam results.

- `report_card_templates`  one per school: background + field layout (jsonb)
- `report_card_exam_map`   per school + session: which exam fills which
                           column ("slot") of the card
- `set_report_card_print_offset()` lets the school nudge print alignment
- storage bucket `report-cards` (public): background images, managers write

Idempotent.
*/

-- ------------------------------------------------------------
-- 1. Templates (one per school)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_card_templates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid        NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  name              text        NOT NULL DEFAULT 'Annual report card',
  background_url    text,
  background_path   text,
  orientation       text        NOT NULL DEFAULT 'portrait',
  -- [{ key, label, max_marks }] — exam columns the card expects
  slots             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- positioned fields, photo box and marks tables (millimetres on the page)
  elements          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  print_offset_x_mm numeric(5,2) NOT NULL DEFAULT 0,
  print_offset_y_mm numeric(5,2) NOT NULL DEFAULT 0,
  is_active         boolean     NOT NULL DEFAULT true,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.report_card_templates ADD CONSTRAINT report_card_templates_orientation_check
    CHECK (orientation IN ('portrait', 'landscape'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.report_card_templates ADD CONSTRAINT report_card_templates_offset_check
    CHECK (abs(print_offset_x_mm) <= 20 AND abs(print_offset_y_mm) <= 20);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS set_updated_at ON public.report_card_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.report_card_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.report_card_templates ENABLE ROW LEVEL SECURITY;

-- School admins read their own school's template.
DROP POLICY IF EXISTS rct_school_read ON public.report_card_templates;
CREATE POLICY rct_school_read ON public.report_card_templates
  FOR SELECT TO authenticated
  USING (school_id = get_current_school_id() AND is_admin());

-- The Veducore team designs templates.
DROP POLICY IF EXISTS rct_manager_all ON public.report_card_templates;
CREATE POLICY rct_manager_all ON public.report_card_templates
  FOR ALL TO authenticated
  USING (is_veducore_manager())
  WITH CHECK (is_veducore_manager());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_card_templates TO authenticated;

-- ------------------------------------------------------------
-- 2. Which exam fills which column, per session
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_card_exam_map (
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  slot_key   text NOT NULL,
  exam_id    uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, session_id, slot_key)
);

ALTER TABLE public.report_card_exam_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rcem_select ON public.report_card_exam_map;
CREATE POLICY rcem_select ON public.report_card_exam_map
  FOR SELECT TO authenticated
  USING (school_id = get_current_school_id() AND is_admin());

DROP POLICY IF EXISTS rcem_write ON public.report_card_exam_map;
CREATE POLICY rcem_write ON public.report_card_exam_map
  FOR ALL TO authenticated
  USING (school_id = get_current_school_id() AND has_permission(ARRAY['exams'], 'edit'))
  WITH CHECK (
    school_id = get_current_school_id() AND has_permission(ARRAY['exams'], 'edit')
    AND EXISTS (SELECT 1 FROM public.exams e
                WHERE e.id = exam_id AND e.school_id = report_card_exam_map.school_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_card_exam_map TO authenticated;

-- ------------------------------------------------------------
-- 3. Printer alignment, adjustable by the school
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_report_card_print_offset(p_x numeric, p_y numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_admin() AND has_permission(ARRAY['exams'], 'edit')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE report_card_templates
     SET print_offset_x_mm = greatest(-20, least(20, coalesce(p_x, 0))),
         print_offset_y_mm = greatest(-20, least(20, coalesce(p_y, 0)))
   WHERE school_id = get_current_school_id();
END $$;

REVOKE ALL ON FUNCTION public.set_report_card_print_offset(numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_report_card_print_offset(numeric, numeric) TO authenticated;

-- ------------------------------------------------------------
-- 4. Storage for background images
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('report-cards', 'report-cards', true, 10485760, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS report_cards_public_read ON storage.objects;
CREATE POLICY report_cards_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'report-cards');

DROP POLICY IF EXISTS report_cards_manager_insert ON storage.objects;
CREATE POLICY report_cards_manager_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'report-cards' AND is_veducore_manager());

DROP POLICY IF EXISTS report_cards_manager_update ON storage.objects;
CREATE POLICY report_cards_manager_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'report-cards' AND is_veducore_manager())
  WITH CHECK (bucket_id = 'report-cards' AND is_veducore_manager());

DROP POLICY IF EXISTS report_cards_manager_delete ON storage.objects;
CREATE POLICY report_cards_manager_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'report-cards' AND is_veducore_manager());

NOTIFY pgrst, 'reload schema';
