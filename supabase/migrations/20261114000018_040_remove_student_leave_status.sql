-- Student attendance no longer has a "leave" status (staff leave is separate
-- and untouched). Existing student "leave" rows become "absent", and a check
-- constraint stops new ones. The enum value stays because Postgres cannot drop
-- enum values safely.
-- Silence the parent-notification trigger so old dates don't send fresh "absent" alerts.
ALTER TABLE attendance DISABLE TRIGGER trg_attendance_notify;
UPDATE attendance SET status = 'absent', updated_at = now() WHERE status = 'leave';
ALTER TABLE attendance ENABLE TRIGGER trg_attendance_notify;

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_no_leave_status;
ALTER TABLE attendance ADD CONSTRAINT attendance_no_leave_status CHECK (status <> 'leave');
