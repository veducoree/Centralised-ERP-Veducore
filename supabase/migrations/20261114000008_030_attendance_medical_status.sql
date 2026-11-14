-- 030: "medical" attendance status (ML). Counts as present in every
-- percentage; shown as ML. Added on its own because a new enum value
-- can't be used in the same transaction that creates it.
ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'medical';
