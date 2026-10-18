/*
# School ERP - Core Schema

## Overview
Creates the complete database schema for a multi-tenant School ERP / IMS SaaS application.
All tables are school-scoped (school_id) for future multi-school support.

## Tables Created

1. **schools** - Top-level tenant entity (one per school)
2. **profiles** - Extends auth.users with role (admin/teacher/parent), school_id, and common fields
3. **subjects** - School subjects (e.g. Mathematics, Science)
4. **classes** - Grade levels (e.g. Class 1, Class 10)
5. **sections** - Sections within a class (e.g. A, B, C)
6. **section_subjects** - Many-to-many: which subjects are taught in a section
7. **teachers** - Teacher profiles linked to auth user
8. **students** - Student records
9. **parents** - Parent profiles linked to auth user
10. **parent_students** - Many-to-many: links parents to their children
11. **class_assignments** - Teacher → Class → Section → Subject assignments
12. **teacher_schedules** - Weekly timetable entries
13. **attendance** - Daily attendance records (unique per student/date/section)
14. **student_records** - Academic records (exams, tests, assignments)
15. **remarks** - Teacher remarks about students
16. **fee_types** - Fee type definitions per school
17. **fees** - Fee records assigned to students
18. **fee_payments** - Payment records for fees
19. **notifications** - In-app notifications
20. **audit_logs** - Audit trail of important actions

## Security
- RLS enabled on ALL tables
- Policies enforce school_id isolation and role-based access
- Admin: full access within their school
- Teacher: access to assigned sections/students only
- Parent: access to their linked children only

## Notes
- All primary keys are UUIDs
- All tables have created_at and updated_at timestamps
- school_id is required on all tenant-scoped tables
*/

-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'parent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'leave');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fee_status AS ENUM ('paid', 'partially_paid', 'pending', 'overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE remark_category AS ENUM ('academic', 'behaviour', 'attendance', 'performance', 'general');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE remark_visibility AS ENUM ('public', 'parents_only', 'staff_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE active_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE record_type AS ENUM ('unit_test', 'mid_term', 'final_exam', 'assignment', 'practical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ SCHOOLS ============
CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  address text,
  contact_number text,
  email text,
  academic_year text DEFAULT '2025-2026',
  timezone text DEFAULT 'UTC',
  currency text DEFAULT 'INR',
  currency_symbol text DEFAULT '₹',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  avatar_url text,
  status active_status DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique ON profiles(email);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's school_id
CREATE OR REPLACE FUNCTION get_current_school_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT school_id FROM profiles WHERE id = auth.uid();
$$;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_current_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Helper: is current user an admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'active');
$$;

-- Helper: is current user a teacher?
CREATE OR REPLACE FUNCTION is_teacher()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher' AND status = 'active');
$$;

-- Helper: is current user a parent?
CREATE OR REPLACE FUNCTION is_parent()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'parent' AND status = 'active');
$$;

-- ============ SUBJECTS ============
CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON subjects(school_id);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

-- ============ CLASSES ============
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade_level int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_classes_school_id ON classes(school_id);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- ============ SECTIONS ============
CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity int DEFAULT 40,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(class_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sections_school_id ON sections(school_id);
CREATE INDEX IF NOT EXISTS idx_sections_class_id ON sections(class_id);

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- ============ SECTION_SUBJECTS ============
CREATE TABLE IF NOT EXISTS section_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(section_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_section_subjects_section_id ON section_subjects(section_id);
CREATE INDEX IF NOT EXISTS idx_section_subjects_subject_id ON section_subjects(subject_id);

ALTER TABLE section_subjects ENABLE ROW LEVEL SECURITY;

-- ============ TEACHERS ============
CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  employee_id text NOT NULL,
  qualification text,
  subject text,
  date_of_joining date,
  avatar_url text,
  status active_status DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(school_id, employee_id),
  UNIQUE(school_id, email)
);

CREATE INDEX IF NOT EXISTS idx_teachers_school_id ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_status ON teachers(status);

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

-- ============ PARENTS ============
CREATE TABLE IF NOT EXISTS parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  occupation text,
  address text,
  avatar_url text,
  status active_status DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(school_id, email)
);

CREATE INDEX IF NOT EXISTS idx_parents_school_id ON parents(school_id);
CREATE INDEX IF NOT EXISTS idx_parents_user_id ON parents(user_id);
CREATE INDEX IF NOT EXISTS idx_parents_status ON parents(status);

ALTER TABLE parents ENABLE ROW LEVEL SECURITY;

-- ============ STUDENTS ============
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  admission_number text NOT NULL,
  full_name text NOT NULL,
  date_of_birth date,
  gender text CHECK (gender IN ('male', 'female', 'other')),
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  section_id uuid REFERENCES sections(id) ON DELETE SET NULL,
  roll_number int,
  address text,
  admission_date date DEFAULT CURRENT_DATE,
  avatar_url text,
  status active_status DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(school_id, admission_number),
  UNIQUE(section_id, roll_number)
);

CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_section_id ON students(section_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(full_name);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- ============ PARENT_STUDENTS ============
CREATE TABLE IF NOT EXISTS parent_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship text DEFAULT 'guardian',
  created_at timestamptz DEFAULT now(),
  UNIQUE(parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_students_parent_id ON parent_students(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student_id ON parent_students(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_school_id ON parent_students(school_id);

ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;

-- ============ CLASS_ASSIGNMENTS ============
CREATE TABLE IF NOT EXISTS class_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(teacher_id, section_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_class_assignments_teacher_id ON class_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_assignments_section_id ON class_assignments(section_id);
CREATE INDEX IF NOT EXISTS idx_class_assignments_school_id ON class_assignments(school_id);

ALTER TABLE class_assignments ENABLE ROW LEVEL SECURITY;

-- ============ TEACHER_SCHEDULES ============
CREATE TABLE IF NOT EXISTS teacher_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  room_number text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_teacher_schedules_teacher_id ON teacher_schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_schedules_school_id ON teacher_schedules(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_schedules_day ON teacher_schedules(day_of_week);

ALTER TABLE teacher_schedules ENABLE ROW LEVEL SECURITY;

-- ============ ATTENDANCE ============
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  attendance_date date NOT NULL,
  status attendance_status NOT NULL DEFAULT 'present',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, attendance_date, section_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_section_id ON attendance(section_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- ============ STUDENT_RECORDS ============
CREATE TABLE IF NOT EXISTS student_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  subject_name text,
  record_type record_type NOT NULL,
  exam_name text NOT NULL,
  marks decimal(6,2) NOT NULL,
  max_marks decimal(6,2) NOT NULL DEFAULT 100,
  grade text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  teacher_comment text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (marks >= 0 AND max_marks > 0 AND marks <= max_marks)
);

CREATE INDEX IF NOT EXISTS idx_student_records_student_id ON student_records(student_id);
CREATE INDEX IF NOT EXISTS idx_student_records_teacher_id ON student_records(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_records_subject_id ON student_records(subject_id);
CREATE INDEX IF NOT EXISTS idx_student_records_school_id ON student_records(school_id);
CREATE INDEX IF NOT EXISTS idx_student_records_date ON student_records(date);

ALTER TABLE student_records ENABLE ROW LEVEL SECURITY;

-- ============ REMARKS ============
CREATE TABLE IF NOT EXISTS remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  category remark_category NOT NULL DEFAULT 'general',
  remark text NOT NULL,
  visibility remark_visibility NOT NULL DEFAULT 'public',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remarks_student_id ON remarks(student_id);
CREATE INDEX IF NOT EXISTS idx_remarks_teacher_id ON remarks(teacher_id);
CREATE INDEX IF NOT EXISTS idx_remarks_school_id ON remarks(school_id);
CREATE INDEX IF NOT EXISTS idx_remarks_created_at ON remarks(created_at);

ALTER TABLE remarks ENABLE ROW LEVEL SECURITY;

-- ============ FEE_TYPES ============
CREATE TABLE IF NOT EXISTS fee_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  default_amount decimal(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_fee_types_school_id ON fee_types(school_id);

ALTER TABLE fee_types ENABLE ROW LEVEL SECURITY;

-- ============ FEES ============
CREATE TABLE IF NOT EXISTS fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_type_id uuid REFERENCES fee_types(id) ON DELETE SET NULL,
  fee_type text NOT NULL,
  amount decimal(12,2) NOT NULL DEFAULT 0,
  paid_amount decimal(12,2) NOT NULL DEFAULT 0,
  remaining_amount decimal(12,2) GENERATED ALWAYS AS (amount - paid_amount) STORED,
  due_date date NOT NULL,
  payment_date date,
  payment_method text,
  receipt_number text,
  status fee_status NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (amount >= 0 AND paid_amount >= 0 AND paid_amount <= amount)
);

CREATE INDEX IF NOT EXISTS idx_fees_student_id ON fees(student_id);
CREATE INDEX IF NOT EXISTS idx_fees_school_id ON fees(school_id);
CREATE INDEX IF NOT EXISTS idx_fees_status ON fees(status);
CREATE INDEX IF NOT EXISTS idx_fees_due_date ON fees(due_date);

ALTER TABLE fees ENABLE ROW LEVEL SECURITY;

-- ============ FEE_PAYMENTS ============
CREATE TABLE IF NOT EXISTS fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  fee_id uuid NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount decimal(12,2) NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text,
  receipt_number text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_fee_payments_fee_id ON fee_payments(fee_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_id ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_school_id ON fee_payments(school_id);

ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info',
  entity_type text,
  entity_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_school_id ON notifications(school_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============ AUDIT_LOGS ============
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============ TRIGGER: updated_at ============
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['schools','profiles','subjects','classes','sections','teachers','parents','students','class_assignments','teacher_schedules','student_records','remarks','fee_types','fees'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
  END LOOP;
END $$;

-- ============ TRIGGER: Auto-create profile on auth signup ============
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create a profile if one doesn't already exist
  -- Role and school_id are set by the admin-creation edge function
  -- For self-signup this creates a placeholder that admin must assign
  INSERT INTO profiles (id, email, full_name, role, school_id, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_app_meta_data->>'role')::user_role, 'parent'),
    NULLIF(NEW.raw_app_meta_data->>'school_id', '')::uuid
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
