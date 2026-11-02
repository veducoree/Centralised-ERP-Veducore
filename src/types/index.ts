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
