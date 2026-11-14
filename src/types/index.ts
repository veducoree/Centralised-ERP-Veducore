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
  created_by_teacher_id: string | null;
  /** Set when the exam was scheduled by the school (Exams module). */
  exam_id?: string | null;
}

export interface Holiday {
  id: string;
  school_id: string;
  date: string;
  type: 'working' | 'holiday' | 'festival';
  label: string | null;
  created_at: string;
  updated_at: string;
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
  motto?: string | null;
  affiliation_board?: string | null;
  affiliation_code?: string | null;
  settings?: Record<string, any> | null;
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
  occupation?: string | null;
  address: string | null;
  avatar_url: string | null;
  status: ActiveStatus;
  password?: string;
  parent_students?: (ParentStudent & { student?: Student })[];
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
  emergency_contact?: string | null;
  parent_phone?: string | null;
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
  class_id: string;
  name: string;
  code: string | null;
  created_at: string;
  updated_at: string;
  /** Sections of the class that study this subject (from section_subjects). */
  section_ids: string[];
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
  /** Bell-schedule period this slot sits in (NULL for old free-time entries). */
  period_id: string | null;
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

/** One row of the school's bell schedule (a teaching period or a break). */
export interface TimetablePeriod {
  id: string;
  school_id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
  created_at: string;
  updated_at: string;
}

/** A free teacher covering an absent teacher's slot on one date. */
export interface TimetableSubstitution {
  id: string;
  school_id: string;
  date: string;
  schedule_id: string;
  original_teacher_id: string | null;
  substitute_teacher_id: string;
  class_id: string | null;
  section_id: string | null;
  subject_id: string | null;
  period_id: string | null;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  original_teacher?: Pick<Teacher, 'id' | 'full_name'> | null;
  substitute_teacher?: Pick<Teacher, 'id' | 'full_name'> | null;
  class?: Pick<Class, 'id' | 'name'> | null;
  section?: Pick<Section, 'id' | 'name'> | null;
  subject?: Pick<Subject, 'id' | 'name'> | null;
  period?: Pick<TimetablePeriod, 'id' | 'name'> | null;
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
  audience?: NotificationAudience;
  class_id?: string | null;
  section_id?: string | null;
  student_id?: string | null;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  link?: string | null;
  sent_by?: string | null;
  recipients_count?: number;
  push_status?: 'pending' | 'sending' | 'sent' | 'skipped' | 'failed';
  push_sent_count?: number;
}

export type NotificationAudience = 'all' | 'parents' | 'teachers' | 'class' | 'section' | 'student' | 'user';
export type NotificationPriority = 'normal' | 'high' | 'urgent';
export type NotificationCategory =
  | 'general' | 'announcement' | 'attendance' | 'fee' | 'exam' | 'homework'
  | 'holiday' | 'event' | 'transport' | 'remark' | 'timetable' | 'emergency';

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
  // razorpay_key_secret is intentionally omitted — secrets must not be stored client-side
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

// Reserved for future DB implementation — online_payments table not yet created
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

export interface TransportStop {
  id: string;
  stop_name: string;
  amount: number;
  /** Monthly | Quarterly | Yearly */
  fare_period?: 'Monthly' | 'Quarterly' | 'Yearly';
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
  /** Seat capacity — approved students must not exceed this */
  capacity?: number;
  driver_name?: string;
  driver_phone?: string;
  conductor_name?: string;
  conductor_phone?: string;
  /** active | maintenance | inactive */
  status?: 'active' | 'maintenance' | 'inactive';
  total_stops: number;
  stops: TransportStop[];
  created_at: string;
}

export type TransportAssignmentStatus = 'pending' | 'approved' | 'rejected' | 'stopped' | 'active';

export interface TransportFareSnapshot {
  amount: number;
  fare_period: 'Monthly' | 'Quarterly' | 'Yearly';
  stop_name: string;
  bus_number?: string;
  route_name?: string;
}

export interface StudentTransportAssignment {
  id?: string;
  student_id: string;
  student_name?: string;
  class_name?: string;
  section_name?: string;
  bus_id?: string;
  stop_id: string;
  stop_name: string;
  amount: number;
  fare_period?: 'Monthly' | 'Quarterly' | 'Yearly';
  /** Fare snapshot at approval time — does not change when stop fare changes */
  fare_snapshot?: TransportFareSnapshot;
  route_name?: string;
  bus_number?: string;
  area_landmark?: string;
  pickup_time?: string;
  drop_time?: string;
  driver_name?: string;
  driver_phone?: string;
  status?: TransportAssignmentStatus;
  start_date?: string;
  end_date?: string;
  applied_by_parent?: boolean;
  approved_by?: string;
  approved_at?: string;
  reject_reason?: string;
  fee_id?: string;
  assigned_at: string;
}

// ─── Admission Fees Step Types ────────────────────────────────────────────────

/** One fee line item shown in the wizard Fees step table */
export interface AdmissionFeeLineItem {
  fee_type: string;   // label, e.g. "Registration Fee"
  amount: number;     // editable by admin
  include: boolean;   // checkbox — admin can untick
  editable: boolean;  // whether amount field is editable
}

/** Discount applied at admission time */
export interface AdmissionDiscount {
  type: 'flat' | 'percent';
  value: number;
  reason: 'Sibling' | 'Staff Child' | 'Merit' | 'Other';
  reason_note: string;
}

/** Payment option chosen in the Fees step */
export type AdmissionPaymentOption = 'full' | 'partial' | 'later';

/** Payment mode options */
export type AdmissionPaymentMode = 'Cash' | 'UPI' | 'Card' | 'Cheque' | 'Online/Bank Transfer';

/** Full fees step data stored inside FormData */
export interface AdmissionFeesData {
  line_items: AdmissionFeeLineItem[];
  discount: AdmissionDiscount;
  payment_option: AdmissionPaymentOption;
  amount_paying: string;       // string so input is controlled
  payment_mode: AdmissionPaymentMode;
  transaction_ref: string;
  payment_date: string;        // YYYY-MM-DD
  remarks: string;
  fee_structures_loaded: boolean; // tracks whether auto-load has run
  no_structure_warning: boolean;  // true when no structure found for class
}

/** Receipt record returned after successful admission + fee submission */
export interface AdmissionReceipt {
  id: string;
  school_id: string;
  student_id: string;
  admission_number: string;
  receipt_number: string;
  academic_year: string;
  fee_lines: AdmissionFeeLineItem[];
  discount_amount: number;
  discount_type: 'flat' | 'percent' | null;
  discount_reason: string | null;
  discount_note: string | null;
  total_fees: number;
  net_payable: number;
  paid_now: number;
  balance_due: number;
  payment_option: AdmissionPaymentOption;
  payment_mode: string | null;
  transaction_ref: string | null;
  payment_date: string | null;
  remarks: string | null;
  collected_by: string | null;
  collected_by_name: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Sidebar Preferences ──────────────────────────────────────────────────────

export interface SidebarPreference {
  id: string;
  profile_id: string;
  school_id: string | null;
  role: string;
  /** Ordered array of pinned route paths. null = user has never customised (use role default). */
  ordered_paths: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface AcademicSession {
  id: string;
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  status: 'upcoming' | 'active' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface AdminDashboardSummary {
  today: string;
  session: { id: string; name: string; start_date: string; end_date: string } | null;
  counts: {
    students: number; boys: number; girls: number; teachers: number; parents: number;
    classes: number; sections: number; new_admissions_month: number;
  };
  attendance_today: { present: number; absent: number; late: number; leave: number; marked: number; sections_marked: number };
  unmarked_sections: { id: string; label: string; students: number }[];
  attendance_trend: { date: string; present: number; absent: number; total: number }[];
  fees: {
    billed: number; collected: number; outstanding: number; overdue_amount: number;
    overdue_students: number; collected_today: number; collected_month: number;
  };
  monthly_collection: { month: string; amount: number }[];
  top_defaulters: { student_id: string; name: string; admission_number: string; class: string; due: number; since: string }[];
  class_strength: { class: string; grade_level: number | null; students: number }[];
  birthdays_today: { id: string; name: string; class: string }[];
  upcoming_holidays: { date: string; label: string | null; type: string }[];
  pending_transport: number;
  recent_notifications: { id: string; title: string; category: string; audience: string; created_at: string; recipients: number }[];
}

export type PermissionLevel = 'none' | 'view' | 'edit';

export interface StaffRole {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  permissions: Record<string, PermissionLevel>;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'inactive';
  staff_role_id: string | null;
  created_at: string;
}

export interface MyPermissions {
  owner?: boolean;
  role?: string;
  modules?: Record<string, PermissionLevel>;
}

export type ExamStatus = 'draft' | 'scheduled' | 'published';

export interface Exam {
  id: string;
  school_id: string;
  session_id: string | null;
  name: string;
  record_type: RecordType;
  start_date: string | null;
  end_date: string | null;
  grading_scale_id: string | null;
  status: ExamStatus;
  published_at: string | null;
  instructions: string | null;
  created_at: string;
  class_ids: string[];
}

export interface ExamScheduleRow {
  id?: string;
  exam_id: string;
  class_id: string;
  subject_id: string;
  exam_date: string | null;
  start_time: string | null;
  end_time: string | null;
  max_marks: number;
  pass_marks: number | null;
  room: string | null;
}

export interface GradeBand {
  id?: string;
  scale_id?: string;
  grade: string;
  min_percent: number;
  grade_point: number | null;
  remark: string | null;
}

export interface GradingScale {
  id: string;
  school_id: string;
  name: string;
  is_default: boolean;
  pass_percent: number;
  bands: GradeBand[];
}

export interface ExamResultSubject {
  subject_id: string | null;
  subject: string;
  marks: number;
  max_marks: number;
  pass_marks: number;
  grade: string | null;
}

export interface ExamResultRow {
  student_id: string;
  full_name: string;
  admission_number: string;
  roll_number: number | null;
  class_name: string | null;
  section_id: string | null;
  section_name: string | null;
  total: number | null;
  max_total: number | null;
  percent: number | null;
  grade: string | null;
  passed: boolean | null;
  subjects_failed: number;
  rank: number | null;
  subjects: ExamResultSubject[];
}

export interface ExamProgressRow {
  section_id: string;
  label: string;
  subject_id: string;
  subject: string;
  students: number;
  entered: number;
}
