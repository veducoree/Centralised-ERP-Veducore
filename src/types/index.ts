export type UserRole = 'admin' | 'teacher' | 'parent';
export type ActiveStatus = 'active' | 'inactive';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave';
export type FeeStatus = 'paid' | 'partially_paid' | 'pending' | 'overdue';
export type RemarkCategory = 'academic' | 'behaviour' | 'attendance' | 'performance' | 'general';
export type RemarkVisibility = 'public' | 'parents_only' | 'staff_only';
export type RecordType = 'unit_test' | 'mid_term' | 'final_exam' | 'assignment' | 'practical';

export interface ExamDef {
  id: string;           // uuid
  exam_name: string;
  record_type: string;  // unit_test | mid_term | final_exam | assignment | practical
  max_marks: number;
  section_id: string;
  date: string;         // YYYY-MM-DD
  school_id: string;
  created_by_teacher_id: string;
}

export interface School {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  academic_year: string;
  timezone: string;
  currency: string;
  currency_symbol: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  school_id: string | null;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  status: ActiveStatus;
  created_at: string;
  updated_at: string;
}

export interface Teacher {
  id: string;
  school_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  employee_id: string;
  qualification: string | null;
  subject: string | null;
  date_of_joining: string | null;
  avatar_url: string | null;
  status: ActiveStatus;
  password?: string;
  created_at: string;
  updated_at: string;
}

export interface Parent {
  id: string;
  school_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  occupation: string | null;
  address: string | null;
  avatar_url: string | null;
  status: ActiveStatus;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  school_id: string;
  admission_number: string;
  full_name: string;
  father_name: string | null;
  mother_name?: string | null;
  parent_email?: string | null;
  date_of_birth: string | null;
  gender: string | null;
  class_id: string | null;
  section_id: string | null;
  roll_number: number | null;
  address: string | null;
  admission_date: string | null;
  avatar_url: string | null;
  status: ActiveStatus;
  created_at: string;
  updated_at: string;
  class?: Class;
  section?: Section;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  grade_level: number | null;
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
  class?: Class;
}

export interface Subject {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
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
  teacher?: Teacher;
  class?: Class;
  section?: Section;
  subject?: Subject;
}

export interface TeacherSchedule {
  id: string;
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
  subject_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room_number: string | null;
  created_at: string;
  updated_at: string;
  teacher?: Teacher;
  class?: Class;
  section?: Section;
  subject?: Subject;
}

export interface Attendance {
  id: string;
  school_id: string;
  student_id: string;
  section_id: string;
  teacher_id: string | null;
  attendance_date: string;
  status: AttendanceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  student?: Student;
}

export interface StudentRecord {
  id: string;
  school_id: string;
  student_id: string;
  teacher_id: string | null;
  subject_id: string | null;
  subject_name: string;
  record_type: RecordType;
  exam_name: string;
  marks: number;
  max_marks: number;
  grade: string | null;
  date: string;
  teacher_comment: string | null;
  created_at: string;
  updated_at: string;
  student?: Student;
  teacher?: Teacher;
  subject?: Subject;
}

export interface Remark {
  id: string;
  school_id: string;
  student_id: string;
  teacher_id: string;
  category: RemarkCategory;
  remark: string;
  visibility: RemarkVisibility;
  created_at: string;
  updated_at: string;
  student?: Student;
  teacher?: Teacher;
}

export interface FeeType {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  default_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Fee {
  id: string;
  school_id: string;
  student_id: string;
  fee_type_id: string | null;
  fee_type: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date: string;
  payment_date: string | null;
  payment_method: string | null;
  receipt_number: string | null;
  status: FeeStatus;
  created_at: string;
  updated_at: string;
  student?: Student;
}

export interface FeePayment {
  id: string;
  school_id: string;
  fee_id: string;
  student_id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  receipt_number: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  school_id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  school_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ParentStudent {
  id: string;
  school_id: string;
  parent_id: string;
  student_id: string;
  relationship: string;
  created_at: string;
  student?: Student;
  parent?: Parent;
}

export interface PaymentSetup {
  id: string;
  school_id: string;
  razorpay_key_id: string;
  razorpay_key_secret: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export type FeeFrequency = 'one_time' | 'monthly' | 'quarterly' | 'annual';

export interface FeeStructure {
  id: string;
  school_id: string;
  name: string;
  fee_type: string;
  class_id: string | null;
  amount: number;
  frequency: FeeFrequency;
  due_day: number | null;
  academic_year: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PaymentPlan = 'full' | 'emi' | 'quarterly';
export type OnlinePaymentStatus = 'pending' | 'completed' | 'failed';

export interface OnlinePayment {
  id: string;
  school_id: string;
  fee_id: string;
  student_id: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  amount: number;
  school_amount: number;
  platform_fee: number;
  status: OnlinePaymentStatus;
  payment_plan: PaymentPlan;
  installment_number: number | null;
  created_at: string;
  updated_at: string;
}
