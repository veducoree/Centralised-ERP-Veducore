-- ============================================================
-- 022: Notification system
--
-- * Audience targeting: all / parents / teachers / class / section /
--   student / user. Visibility is enforced in RLS, so every client just
--   selects from `notifications` and only sees what is meant for it.
-- * Per-user read state for broadcast notifications (notification_reads).
-- * Expo push tokens + per-user muted categories.
-- * Push dispatch: an AFTER INSERT trigger calls the `push-dispatch`
--   edge function through pg_net when configured (see app_settings).
-- * Automatic notifications for attendance, fees, payments, marks,
--   remarks, holidays and substitutions.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns on notifications
-- ------------------------------------------------------------
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'user';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES sections(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipients_count int NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_status text NOT NULL DEFAULT 'pending';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_sent_count int NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_audience_check
    CHECK (audience IN ('all','parents','teachers','class','section','student','user'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_priority_check
    CHECK (priority IN ('normal','high','urgent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_push_status_check
    CHECK (push_status IN ('pending','sending','sent','skipped','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill existing rows: null user_id used to mean "school-wide",
-- attendance rows pointed at a student through entity_id.
UPDATE notifications SET audience = 'student', student_id = entity_id, category = 'attendance'
  WHERE user_id IS NULL AND entity_type = 'attendance' AND entity_id IS NOT NULL AND audience = 'user';
UPDATE notifications SET audience = 'all'
  WHERE user_id IS NULL AND audience = 'user';
-- Old rows were never pushed; don't push them now.
UPDATE notifications SET push_status = 'skipped' WHERE push_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notifications_school_created ON notifications(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_section ON notifications(section_id) WHERE section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_class ON notifications(class_id) WHERE class_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Supporting tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_categories text[] NOT NULL DEFAULT '{}',
  push_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Private key/value settings (push dispatch URL + secret). No policies:
-- only SECURITY DEFINER functions and the service role can read it.
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. Recipient resolution + visibility
-- ------------------------------------------------------------

-- Parent user ids linked to a set of students.
CREATE OR REPLACE FUNCTION parent_user_ids_for_students(p_student_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT DISTINCT p.user_id
  FROM parent_students ps
  JOIN parents p ON p.id = ps.parent_id
  WHERE ps.student_id = ANY(p_student_ids)
    AND p.user_id IS NOT NULL
    AND p.status = 'active';
$$;

CREATE OR REPLACE FUNCTION resolve_notification_recipients(
  p_school uuid, p_audience text, p_user uuid,
  p_class uuid, p_section uuid, p_student uuid
)
RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF p_audience = 'user' THEN
    IF p_user IS NOT NULL THEN RETURN NEXT p_user; END IF;
    RETURN;
  ELSIF p_audience = 'all' THEN
    RETURN QUERY SELECT id FROM profiles
      WHERE school_id = p_school AND status = 'active' AND role IN ('teacher','parent');
  ELSIF p_audience = 'parents' THEN
    RETURN QUERY SELECT id FROM profiles
      WHERE school_id = p_school AND status = 'active' AND role = 'parent';
  ELSIF p_audience = 'teachers' THEN
    RETURN QUERY SELECT id FROM profiles
      WHERE school_id = p_school AND status = 'active' AND role = 'teacher';
  ELSIF p_audience = 'class' THEN
    RETURN QUERY SELECT parent_user_ids_for_students(ARRAY(
      SELECT id FROM students WHERE class_id = p_class AND school_id = p_school AND status = 'active'));
  ELSIF p_audience = 'section' THEN
    RETURN QUERY SELECT parent_user_ids_for_students(ARRAY(
      SELECT id FROM students WHERE section_id = p_section AND school_id = p_school AND status = 'active'));
  ELSIF p_audience = 'student' THEN
    RETURN QUERY SELECT parent_user_ids_for_students(ARRAY[p_student]);
  END IF;
END;
$$;

-- Students linked to the calling parent.
CREATE OR REPLACE FUNCTION my_student_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT ps.student_id
  FROM parent_students ps
  JOIN parents p ON p.id = ps.parent_id
  WHERE p.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION can_view_notification(
  p_school uuid, p_audience text, p_user uuid,
  p_class uuid, p_section uuid, p_student uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_role text;
  v_school uuid;
BEGIN
  IF p_user = auth.uid() THEN RETURN true; END IF;

  SELECT role::text, school_id INTO v_role, v_school
    FROM profiles WHERE id = auth.uid() AND status = 'active';
  IF v_role IS NULL OR v_school IS DISTINCT FROM p_school THEN RETURN false; END IF;

  IF v_role = 'admin' THEN RETURN true; END IF;
  IF p_audience = 'all' THEN RETURN true; END IF;
  IF p_audience = 'parents' THEN RETURN v_role = 'parent'; END IF;
  IF p_audience = 'teachers' THEN RETURN v_role = 'teacher'; END IF;

  IF v_role = 'parent' THEN
    IF p_audience = 'student' THEN
      RETURN p_student IN (SELECT my_student_ids());
    ELSIF p_audience = 'section' THEN
      RETURN EXISTS (SELECT 1 FROM students s
        WHERE s.id IN (SELECT my_student_ids()) AND s.section_id = p_section);
    ELSIF p_audience = 'class' THEN
      RETURN EXISTS (SELECT 1 FROM students s
        WHERE s.id IN (SELECT my_student_ids()) AND s.class_id = p_class);
    END IF;
  END IF;

  -- Teachers see class/section notices for sections they teach.
  IF v_role = 'teacher' AND p_audience IN ('class','section') THEN
    RETURN EXISTS (
      SELECT 1 FROM class_assignments ca
      JOIN teachers t ON t.id = ca.teacher_id
      WHERE t.user_id = auth.uid()
        AND ((p_audience = 'section' AND ca.section_id = p_section)
          OR (p_audience = 'class' AND ca.class_id = p_class))
    );
  END IF;

  RETURN false;
END;
$$;

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
DROP POLICY IF EXISTS "notifications_select_admin" ON notifications;
DROP POLICY IF EXISTS "notifications_select_audience" ON notifications;
CREATE POLICY "notifications_select_audience" ON notifications FOR SELECT
TO authenticated
USING (can_view_notification(school_id, audience, user_id, class_id, section_id, student_id));

-- Teachers may notify the classes/sections/students they teach.
DROP POLICY IF EXISTS "notifications_insert_teacher" ON notifications;
CREATE POLICY "notifications_insert_teacher" ON notifications FOR INSERT
TO authenticated
WITH CHECK (
  school_id = get_current_school_id() AND is_teacher()
  AND audience IN ('class','section','student')
  AND sent_by = auth.uid()
);

DROP POLICY IF EXISTS "notification_reads_own" ON notification_reads;
CREATE POLICY "notification_reads_own" ON notification_reads FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_reads_admin_select" ON notification_reads;
CREATE POLICY "notification_reads_admin_select" ON notification_reads FOR SELECT
TO authenticated
USING (is_admin() AND EXISTS (
  SELECT 1 FROM notifications n
  WHERE n.id = notification_id AND n.school_id = get_current_school_id()));

DROP POLICY IF EXISTS "push_tokens_own" ON push_tokens;
CREATE POLICY "push_tokens_own" ON push_tokens FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_preferences_own" ON notification_preferences;
CREATE POLICY "notification_preferences_own" ON notification_preferences FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------
-- 5. Client RPCs
-- ------------------------------------------------------------

-- Notifications visible to the caller, with per-user read state.
CREATE OR REPLACE FUNCTION fetch_my_notifications(p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, school_id uuid, user_id uuid, title text, message text, type text,
  entity_type text, entity_id uuid, audience text, class_id uuid, section_id uuid,
  student_id uuid, category text, priority text, link text, created_at timestamptz,
  is_read boolean
)
LANGUAGE sql SECURITY INVOKER STABLE SET search_path = public
AS $$
  SELECT n.id, n.school_id, n.user_id, n.title, n.message, n.type,
         n.entity_type, n.entity_id, n.audience, n.class_id, n.section_id,
         n.student_id, n.category, n.priority, n.link, n.created_at,
         (n.is_read AND n.user_id = auth.uid())
           OR EXISTS (SELECT 1 FROM notification_reads r
                      WHERE r.notification_id = n.id AND r.user_id = auth.uid())
  FROM notifications n
  -- Admins can read every row through RLS; their personal feed is only
  -- what was addressed to them.
  WHERE n.user_id = auth.uid()
     OR (n.audience <> 'user' AND get_current_role() <> 'admin')
  ORDER BY n.created_at DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION mark_notifications_read(p_ids uuid[])
RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  INSERT INTO notification_reads (notification_id, user_id)
  SELECT n.id, auth.uid() FROM notifications n WHERE n.id = ANY(p_ids)
  ON CONFLICT DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  INSERT INTO notification_reads (notification_id, user_id)
  SELECT n.id, auth.uid() FROM notifications n
  WHERE n.user_id = auth.uid()
     OR (n.audience <> 'user' AND get_current_role() <> 'admin')
  ON CONFLICT DO NOTHING;
$$;

-- Read counts for the admin history list.
CREATE OR REPLACE FUNCTION notification_read_counts(p_ids uuid[])
RETURNS TABLE (notification_id uuid, reads bigint)
LANGUAGE sql SECURITY INVOKER STABLE SET search_path = public
AS $$
  SELECT r.notification_id, count(*) FROM notification_reads r
  WHERE r.notification_id = ANY(p_ids)
  GROUP BY r.notification_id;
$$;

-- ------------------------------------------------------------
-- 6. Insert triggers: recipient count + push dispatch
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notifications_before_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.audience = 'user' AND NEW.user_id IS NULL THEN
    NEW.audience := 'all';
  END IF;
  IF NEW.audience = 'student' AND NEW.student_id IS NULL AND NEW.entity_id IS NOT NULL THEN
    NEW.student_id := NEW.entity_id;
  END IF;
  IF NEW.sent_by IS NULL THEN NEW.sent_by := auth.uid(); END IF;
  SELECT count(*) INTO NEW.recipients_count FROM resolve_notification_recipients(
    NEW.school_id, NEW.audience, NEW.user_id, NEW.class_id, NEW.section_id, NEW.student_id);
  IF NEW.recipients_count = 0 THEN NEW.push_status := 'skipped'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_before_insert ON notifications;
CREATE TRIGGER trg_notifications_before_insert
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notifications_before_insert();

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net not available; push dispatch will rely on client calls';
END $$;

-- Calls the push-dispatch edge function. Configure with:
--   INSERT INTO app_settings VALUES
--     ('push_dispatch_url', 'https://<ref>.supabase.co/functions/v1/push-dispatch'),
--     ('push_dispatch_secret', '<same value as PUSH_DISPATCH_SECRET>');
CREATE OR REPLACE FUNCTION notifications_after_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  IF NEW.push_status <> 'pending' THEN RETURN NEW; END IF;
  SELECT value INTO v_url FROM app_settings WHERE key = 'push_dispatch_url';
  SELECT value INTO v_secret FROM app_settings WHERE key = 'push_dispatch_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN NEW; END IF;

  BEGIN
    EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3)'
      USING v_url,
            jsonb_build_object('notification_id', NEW.id),
            jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push dispatch failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_after_insert ON notifications;
CREATE TRIGGER trg_notifications_after_insert
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notifications_after_insert();

-- ------------------------------------------------------------
-- 7. Automatic event notifications
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_student(
  p_school uuid, p_student uuid, p_title text, p_message text,
  p_category text, p_type text, p_link text,
  p_entity_type text, p_entity_id uuid, p_priority text DEFAULT 'normal'
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO notifications (school_id, audience, student_id, title, message,
    category, type, link, entity_type, entity_id, priority)
  VALUES (p_school, 'student', p_student, p_title, p_message,
    p_category, p_type, p_link, p_entity_type, p_entity_id, p_priority);
$$;

-- Attendance: absent / late / leave. Present is the default and not news.
CREATE OR REPLACE FUNCTION trg_notify_attendance()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
  v_date text;
BEGIN
  IF NEW.status = 'present' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  SELECT full_name INTO v_name FROM students WHERE id = NEW.student_id;
  v_date := to_char(NEW.attendance_date, 'DD Mon YYYY');
  PERFORM notify_student(
    NEW.school_id, NEW.student_id,
    CASE NEW.status WHEN 'absent' THEN v_name || ' was absent'
                    WHEN 'late' THEN v_name || ' arrived late'
                    ELSE v_name || ' is on leave' END,
    v_name || ' was marked ' || upper(NEW.status::text) || ' on ' || v_date || '.',
    'attendance',
    CASE NEW.status WHEN 'absent' THEN 'error' ELSE 'warning' END,
    '/parent/attendance', 'attendance', NEW.id,
    CASE NEW.status WHEN 'absent' THEN 'high' ELSE 'normal' END
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_attendance_notify ON attendance;
CREATE TRIGGER trg_attendance_notify
  AFTER INSERT OR UPDATE OF status ON attendance
  FOR EACH ROW EXECUTE FUNCTION trg_notify_attendance();

-- New fee assigned.
CREATE OR REPLACE FUNCTION trg_notify_fee_created()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text;
BEGIN
  IF NEW.amount <= 0 OR NEW.status = 'paid' THEN RETURN NEW; END IF;
  SELECT full_name INTO v_name FROM students WHERE id = NEW.student_id;
  PERFORM notify_student(
    NEW.school_id, NEW.student_id,
    'New fee: ' || NEW.fee_type,
    NEW.fee_type || ' of ₹' || to_char(NEW.amount, 'FM99,99,99,990') || ' for ' || v_name
      || ' is due on ' || to_char(NEW.due_date, 'DD Mon YYYY') || '.',
    'fee', 'info', '/parent/fees', 'fee', NEW.id
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fee_created_notify ON fees;
CREATE TRIGGER trg_fee_created_notify
  AFTER INSERT ON fees
  FOR EACH ROW EXECUTE FUNCTION trg_notify_fee_created();

-- Payment received.
CREATE OR REPLACE FUNCTION trg_notify_fee_payment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text; v_fee text;
BEGIN
  SELECT full_name INTO v_name FROM students WHERE id = NEW.student_id;
  SELECT fee_type INTO v_fee FROM fees WHERE id = NEW.fee_id;
  PERFORM notify_student(
    NEW.school_id, NEW.student_id,
    'Payment received',
    '₹' || to_char(NEW.amount, 'FM99,99,99,990') || ' received towards ' || coalesce(v_fee, 'fees')
      || ' for ' || v_name
      || coalesce('. Receipt #' || NEW.receipt_number, '') || '. Thank you!',
    'fee', 'success', '/parent/fees', 'fee_payment', NEW.id
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fee_payment_notify ON fee_payments;
CREATE TRIGGER trg_fee_payment_notify
  AFTER INSERT ON fee_payments
  FOR EACH ROW EXECUTE FUNCTION trg_notify_fee_payment();

-- Marks published.
CREATE OR REPLACE FUNCTION trg_notify_marks()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text;
BEGIN
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
DROP TRIGGER IF EXISTS trg_marks_notify ON student_records;
CREATE TRIGGER trg_marks_notify
  AFTER INSERT ON student_records
  FOR EACH ROW EXECUTE FUNCTION trg_notify_marks();

-- Teacher remark visible to parents.
CREATE OR REPLACE FUNCTION trg_notify_remark()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text; v_teacher text;
BEGIN
  IF NEW.visibility = 'staff_only' THEN RETURN NEW; END IF;
  SELECT full_name INTO v_name FROM students WHERE id = NEW.student_id;
  SELECT full_name INTO v_teacher FROM teachers WHERE id = NEW.teacher_id;
  PERFORM notify_student(
    NEW.school_id, NEW.student_id,
    'New remark for ' || v_name,
    coalesce(v_teacher, 'A teacher') || ': ' || left(NEW.remark, 160),
    'remark', 'info', '/parent/remarks', 'remark', NEW.id
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_remark_notify ON remarks;
CREATE TRIGGER trg_remark_notify
  AFTER INSERT ON remarks
  FOR EACH ROW EXECUTE FUNCTION trg_notify_remark();

-- Holiday declared.
CREATE OR REPLACE FUNCTION trg_notify_holiday()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.type NOT IN ('holiday','festival') OR NEW.date < CURRENT_DATE THEN RETURN NEW; END IF;
  INSERT INTO notifications (school_id, audience, title, message, category, type, link, entity_type, entity_id)
  VALUES (NEW.school_id, 'all',
    'Holiday: ' || coalesce(NEW.label, to_char(NEW.date, 'DD Mon')),
    'School will remain closed on ' || to_char(NEW.date, 'FMDay, DD Mon YYYY')
      || coalesce(' for ' || NEW.label, '') || '.',
    'holiday', 'info', NULL, 'holiday', NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_holiday_notify ON holidays;
CREATE TRIGGER trg_holiday_notify
  AFTER INSERT ON holidays
  FOR EACH ROW EXECUTE FUNCTION trg_notify_holiday();

-- Substitution assigned: tell the substitute teacher.
CREATE OR REPLACE FUNCTION trg_notify_substitution()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid; v_class text; v_section text; v_subject text;
BEGIN
  SELECT user_id INTO v_user FROM teachers WHERE id = NEW.substitute_teacher_id;
  IF v_user IS NULL THEN RETURN NEW; END IF;
  SELECT name INTO v_class FROM classes WHERE id = NEW.class_id;
  SELECT name INTO v_section FROM sections WHERE id = NEW.section_id;
  SELECT name INTO v_subject FROM subjects WHERE id = NEW.subject_id;
  INSERT INTO notifications (school_id, audience, user_id, title, message, category, type, link, entity_type, entity_id, priority)
  VALUES (NEW.school_id, 'user', v_user,
    'Substitution assigned',
    'You are covering ' || coalesce(v_subject, 'a period') || ' for '
      || coalesce(v_class, '') || coalesce('-' || v_section, '')
      || ' on ' || to_char(NEW.date, 'DD Mon')
      || coalesce(' at ' || to_char(NEW.start_time, 'HH12:MI AM'), '') || '.',
    'timetable', 'warning', '/teacher/schedule', 'substitution', NEW.id, 'high');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_substitution_notify ON timetable_substitutions;
CREATE TRIGGER trg_substitution_notify
  AFTER INSERT ON timetable_substitutions
  FOR EACH ROW EXECUTE FUNCTION trg_notify_substitution();

-- ------------------------------------------------------------
-- 8. Fee reminders (admin button + optional daily cron)
-- ------------------------------------------------------------
-- One reminder per student, at most once per 3 days, for fees that are
-- overdue or due within the next 3 days.
CREATE OR REPLACE FUNCTION send_fee_reminders(p_school uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid := coalesce(p_school, get_current_school_id());
  v_count int := 0;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    -- cron / service role only (anon has no EXECUTE grant)
    NULL;
  ELSIF NOT (is_admin() AND v_school = get_current_school_id()) THEN
    RAISE EXCEPTION 'Only school admins can send fee reminders';
  END IF;

  FOR r IN
    SELECT f.school_id, f.student_id, s.full_name,
           sum(f.amount - f.paid_amount) AS due,
           min(f.due_date) AS first_due
    FROM fees f JOIN students s ON s.id = f.student_id
    WHERE f.status <> 'paid'
      AND f.amount > f.paid_amount
      AND f.due_date <= CURRENT_DATE + 3
      AND s.status = 'active'
      AND (v_school IS NULL OR f.school_id = v_school)
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.student_id = f.student_id AND n.entity_type = 'fee_reminder'
          AND n.created_at > now() - interval '3 days')
    GROUP BY f.school_id, f.student_id, s.full_name
  LOOP
    PERFORM notify_student(
      r.school_id, r.student_id,
      CASE WHEN r.first_due < CURRENT_DATE THEN 'Fee overdue' ELSE 'Fee due soon' END,
      '₹' || to_char(r.due, 'FM99,99,99,990') || ' pending for ' || r.full_name
        || CASE WHEN r.first_due < CURRENT_DATE
             THEN ' (overdue since ' || to_char(r.first_due, 'DD Mon') || ').'
             ELSE ', due on ' || to_char(r.first_due, 'DD Mon') || '.' END
        || ' Please pay at the earliest.',
      'fee', CASE WHEN r.first_due < CURRENT_DATE THEN 'error' ELSE 'warning' END,
      '/parent/fees', 'fee_reminder', NULL,
      CASE WHEN r.first_due < CURRENT_DATE THEN 'high' ELSE 'normal' END
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('veducore-fee-reminders', '30 3 * * *', 'SELECT send_fee_reminders(NULL)');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available; fee reminders are manual only';
END $$;

-- ------------------------------------------------------------
-- 9. Lock down function access
-- ------------------------------------------------------------
-- Internal helpers: only SECURITY DEFINER code and the service role
-- (push-dispatch edge function) may call them.
REVOKE ALL ON FUNCTION parent_user_ids_for_students(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION resolve_notification_recipients(uuid, text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION notify_student(uuid, uuid, text, text, text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_notification_recipients(uuid, text, uuid, uuid, uuid, uuid) TO service_role;

-- Admin-facing recipient preview (counts only, own school only).
CREATE OR REPLACE FUNCTION count_notification_recipients(
  p_audience text, p_user uuid DEFAULT NULL, p_class uuid DEFAULT NULL,
  p_section uuid DEFAULT NULL, p_student uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT is_admin() THEN RETURN 0; END IF;
  SELECT count(*) INTO v_count FROM resolve_notification_recipients(
    get_current_school_id(), p_audience, p_user, p_class, p_section, p_student);
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION count_notification_recipients(text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION count_notification_recipients(text, uuid, uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION send_fee_reminders(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION send_fee_reminders(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION fetch_my_notifications(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mark_notifications_read(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION notification_read_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fetch_my_notifications(int) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notifications_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION notification_read_counts(uuid[]) TO authenticated;

-- Realtime so apps can update badges live.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
