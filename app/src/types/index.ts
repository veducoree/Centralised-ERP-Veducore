// Core school types

export interface School {
  id: string;
  name: string;
  logo_url: string | null;
  address: string;
  contact_number: string;
  email: string;
  academic_year: string;
  timezone: string;
  currency: string;
  currency_symbol: string;
  settings?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  school_id: string;
  role: 'admin' | 'teacher' | 'parent' | 'student';
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Teacher {
  id: string;
  school_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  password?: string;
  phone: string | null;
  employee_id: string;
  qualification: string;
  subject: string;
  date_of_joining: string;
  avatar_url: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Parent {
  id: string;
  school_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  password?: string;
  phone: string | null;
  occupation?: string | null;
  address: string;
  avatar_url: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  grade_level: number;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  school_id: string;
  class_id: string;
  name: string;
  capacity: number;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  school_id: string;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  school_id: string;
  admission_number: string;
  full_name: string;
  father_name: string;
  mother_name: string;
  parent_email: string;
  parent_phone?: string;
  emergency_contact?: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  class_id: string;
  section_id: string;
  roll_number?: number;
  address: string;
  admission_date: string;
  avatar_url: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  class?: Class;
  section?: Section;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave';
export type RecordType = 'unit_test' | 'mid_term' | 'final_exam' | 'assignment' | 'practical';

export interface ExamDef {
  id: string;
  exam_name: string;
  record_type: string;
  max_marks: number;
  section_id: string;
  date: string;
  school_id: string;
  created_by_teacher_id: string;
}

export interface Attendance {
  id: string;
  school_id: string;
  student_id: string;
  section_id: string;
  teacher_id: string;
  attendance_date: string;
  status: 'present' | 'absent' | 'late' | 'leave';
  notes: string | null;
  created_at: string;
  updated_at: string;
  markedAt: string;
}

export interface Fee {
  id: string;
  school_id: string;
  student_id: string;
  fee_type_id: string;
  fee_type: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date: string;
  payment_date: string | null;
  payment_method: string | null;
  receipt_number: string | null;
  status: 'paid' | 'pending' | 'partially_paid' | 'overdue';
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  school_id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface StudentRecord {
  id: string;
  school_id: string;
  student_id: string;
  teacher_id: string;
  subject_id: string;
  subject_name: string;
  record_type: string;
  exam_name: string;
  marks: number;
  max_marks: number;
  grade: string;
  date: string;
  teacher_comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassAssignment {
  id: string;
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
  subject_id: string | null;
  is_class_teacher: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeeType {
  id: string;
  school_id: string;
  name: string;
  description: string;
  default_amount: number;
  created_at: string;
  updated_at: string;
}

export interface FeePayment {
  id: string;
  fee_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  receipt_number: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  school_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: Record<string, unknown>;
  created_at: string;
}

export interface ParentStudent {
  id: string;
  school_id: string;
  parent_id: string;
  student_id: string;
  relationship: string;
  created_at: string;
}

export interface Remark {
  id: string;
  school_id: string;
  student_id: string;
  teacher_id: string;
  category: 'academic' | 'behaviour' | 'attendance' | 'performance' | 'general';
  visibility: 'public' | 'parents_only' | 'staff_only';
  remark: string;
  created_at: string;
  updated_at: string;
}

export interface TeacherSchedule {
  id: string;
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
  subject_id: string;
  /** Bell-schedule period (NULL for old free-time entries). */
  period_id?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room_number: string;
  created_at: string;
  updated_at: string;
  class?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  subject?: { id: string; name: string } | null;
  teacher?: { id: string; full_name: string } | null;
}

/** One row of the school's bell schedule (a teaching period or a break). */
export interface TimetablePeriod {
  id: string;
  school_id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
}

/** A free teacher covering an absent teacher's slot on one date. */
export interface TimetableSubstitution {
  id: string;
  school_id: string;
  date: string;
  schedule_id: string;
  original_teacher_id: string | null;
  substitute_teacher_id: string;
  section_id: string | null;
  period_id: string | null;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  substitute_teacher?: { id: string; full_name: string } | null;
  class?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  subject?: { id: string; name: string } | null;
  period?: { id: string; name: string } | null;
}

export interface MockUser {
  id: string;
  email: string;
  password: string;
  profile: Profile;
}

export interface TransportStop {
  id: string;
  stop_name: string;
  amount: number;
  bus_id?: string;
  bus_number?: string;
  route_name?: string;
  stop_order?: number;
  area_landmark?: string;
  distance_km?: number;
  latitude?: number;
  longitude?: number;
  pickup_time?: string;
  drop_time?: string;
  driver_name?: string;
  driver_phone?: string;
  created_at: string;
}

export interface TransportBus {
  id: string;
  bus_number: string;
  route_name: string;
  driver_name?: string;
  driver_phone?: string;
  total_stops: number;
  stops: TransportStop[];
  created_at: string;
}

export interface StudentTransportAssignment {
  student_id: string;
  student_name?: string;
  class_name?: string;
  section_name?: string;
  bus_id?: string;
  stop_id: string;
  stop_name: string;
  amount: number;
  route_name?: string;
  bus_number?: string;
  area_landmark?: string;
  pickup_time?: string;
  drop_time?: string;
  driver_name?: string;
  driver_phone?: string;
  status?: 'pending' | 'active';
  applied_by_parent?: boolean;
  assigned_at: string;
}
