import type {
  School, Teacher, Parent, Student, Class, Section, Subject,
  ClassAssignment, TeacherSchedule, Attendance, StudentRecord,
  Remark, FeeType, Fee, FeePayment, Notification, AuditLog,
  ParentStudent, Profile,
} from '@/types';
import {
  MOCK_SCHOOL,
  MOCK_CLASSES,
  MOCK_SECTIONS,
  MOCK_SUBJECTS,
  MOCK_TEACHERS,
  MOCK_PARENTS,
  MOCK_STUDENTS,
} from '@/lib/mockData';

type TableName =
  | 'schools' | 'teachers' | 'parents' | 'students' | 'classes'
  | 'sections' | 'subjects' | 'class_assignments' | 'teacher_schedules'
  | 'attendance' | 'student_records' | 'remarks' | 'fee_types' | 'fees'
  | 'fee_payments' | 'notifications' | 'audit_logs' | 'parent_students' | 'profiles';

const STORAGE_PREFIX = 'mock_db_';
const SEEDED_KEY = 'mock_db_seeded_v6';

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const TODAY = new Date().toISOString().split('T')[0];

const SEED_DATA: Record<TableName, unknown[]> = {
  schools: [MOCK_SCHOOL],
  teachers: MOCK_TEACHERS,
  parents: MOCK_PARENTS,
  students: MOCK_STUDENTS.map(s => {
    // Strip embedded class/section objects — stored separately
    const { class: _c, section: _s, ...rest } = s as Student & { class?: unknown; section?: unknown };
    return rest;
  }),
  classes: MOCK_CLASSES,
  sections: MOCK_SECTIONS,
  subjects: MOCK_SUBJECTS,
  class_assignments: [
    {
      id: 'ca-001',
      school_id: 'school-001',
      teacher_id: 'teacher-001',
      class_id: 'class-001',
      section_id: 'sec-001',
      subject_id: 'sub-001',
      is_class_teacher: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ca-002',
      school_id: 'school-001',
      teacher_id: 'teacher-001',
      class_id: 'class-002',
      section_id: 'sec-002',
      subject_id: 'sub-002',
      is_class_teacher: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ca-003',
      school_id: 'school-001',
      teacher_id: 'teacher-002',
      class_id: 'class-003',
      section_id: 'sec-003',
      subject_id: 'sub-002',
      is_class_teacher: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  teacher_schedules: [
    {
      id: 'ts-001',
      school_id: 'school-001',
      teacher_id: 'teacher-001',
      class_id: 'class-001',
      section_id: 'sec-001',
      subject_id: 'sub-001',
      day_of_week: 1,
      start_time: '08:00',
      end_time: '09:00',
      room_number: 'Room 101',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  attendance: [
    {
      id: 'att-001',
      school_id: 'school-001',
      student_id: 'student-001',
      section_id: 'sec-001',
      teacher_id: 'teacher-001',
      attendance_date: TODAY,
      status: 'present',
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'att-002',
      school_id: 'school-001',
      student_id: 'student-005',
      section_id: 'sec-001',
      teacher_id: 'teacher-001',
      attendance_date: TODAY,
      status: 'present',
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  student_records: [
    // ── Unit Test 1 (sr-001..sr-006) ──────────────────────────────────
    { id: 'sr-001', school_id: 'school-001', student_id: 'student-001', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'unit_test', exam_name: 'Unit Test 1', marks: 45, max_marks: 50, grade: 'A+', date: '2026-01-15', teacher_comment: 'Excellent work', created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' },
    { id: 'sr-002', school_id: 'school-001', student_id: 'student-005', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'unit_test', exam_name: 'Unit Test 1', marks: 38, max_marks: 50, grade: 'B+', date: '2026-01-15', teacher_comment: 'Good effort', created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' },
    { id: 'sr-003', school_id: 'school-001', student_id: 'student-007', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'unit_test', exam_name: 'Unit Test 1', marks: 42, max_marks: 50, grade: 'A', date: '2026-01-15', teacher_comment: null, created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' },
    { id: 'sr-004', school_id: 'school-001', student_id: 'student-008', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'unit_test', exam_name: 'Unit Test 1', marks: 28, max_marks: 50, grade: 'C', date: '2026-01-15', teacher_comment: 'Needs improvement', created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' },
    { id: 'sr-005', school_id: 'school-001', student_id: 'student-009', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'unit_test', exam_name: 'Unit Test 1', marks: 35, max_marks: 50, grade: 'B', date: '2026-01-15', teacher_comment: null, created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' },
    { id: 'sr-006', school_id: 'school-001', student_id: 'student-010', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'unit_test', exam_name: 'Unit Test 1', marks: 48, max_marks: 50, grade: 'A+', date: '2026-01-15', teacher_comment: 'Outstanding', created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' },
    // ── Mid Term (sr-011..sr-016) ─────────────────────────────────────
    { id: 'sr-011', school_id: 'school-001', student_id: 'student-001', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'mid_term', exam_name: 'Mid Term', marks: 82, max_marks: 100, grade: 'A', date: '2026-03-10', teacher_comment: 'Consistent improvement', created_at: '2026-03-10T00:00:00Z', updated_at: '2026-03-10T00:00:00Z' },
    { id: 'sr-012', school_id: 'school-001', student_id: 'student-005', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'mid_term', exam_name: 'Mid Term', marks: 67, max_marks: 100, grade: 'B', date: '2026-03-10', teacher_comment: null, created_at: '2026-03-10T00:00:00Z', updated_at: '2026-03-10T00:00:00Z' },
    { id: 'sr-013', school_id: 'school-001', student_id: 'student-007', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'mid_term', exam_name: 'Mid Term', marks: 78, max_marks: 100, grade: 'B+', date: '2026-03-10', teacher_comment: null, created_at: '2026-03-10T00:00:00Z', updated_at: '2026-03-10T00:00:00Z' },
    { id: 'sr-014', school_id: 'school-001', student_id: 'student-008', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'mid_term', exam_name: 'Mid Term', marks: 55, max_marks: 100, grade: 'C', date: '2026-03-10', teacher_comment: 'Improved from unit test', created_at: '2026-03-10T00:00:00Z', updated_at: '2026-03-10T00:00:00Z' },
    { id: 'sr-015', school_id: 'school-001', student_id: 'student-009', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'mid_term', exam_name: 'Mid Term', marks: 63, max_marks: 100, grade: 'B', date: '2026-03-10', teacher_comment: null, created_at: '2026-03-10T00:00:00Z', updated_at: '2026-03-10T00:00:00Z' },
    { id: 'sr-016', school_id: 'school-001', student_id: 'student-010', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'mid_term', exam_name: 'Mid Term', marks: 91, max_marks: 100, grade: 'A+', date: '2026-03-10', teacher_comment: 'Excellent', created_at: '2026-03-10T00:00:00Z', updated_at: '2026-03-10T00:00:00Z' },
    // ── Final Exam (sr-021..sr-026) ───────────────────────────────────
    { id: 'sr-021', school_id: 'school-001', student_id: 'student-001', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'final_exam', exam_name: 'Final Exam', marks: 88, max_marks: 100, grade: 'A', date: '2026-05-20', teacher_comment: 'Well done', created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z' },
    { id: 'sr-022', school_id: 'school-001', student_id: 'student-005', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'final_exam', exam_name: 'Final Exam', marks: 72, max_marks: 100, grade: 'B+', date: '2026-05-20', teacher_comment: null, created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z' },
    { id: 'sr-023', school_id: 'school-001', student_id: 'student-007', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'final_exam', exam_name: 'Final Exam', marks: 80, max_marks: 100, grade: 'A', date: '2026-05-20', teacher_comment: null, created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z' },
    { id: 'sr-024', school_id: 'school-001', student_id: 'student-008', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'final_exam', exam_name: 'Final Exam', marks: 47, max_marks: 100, grade: 'D', date: '2026-05-20', teacher_comment: 'Requires extra attention', created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z' },
    { id: 'sr-025', school_id: 'school-001', student_id: 'student-009', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'final_exam', exam_name: 'Final Exam', marks: 69, max_marks: 100, grade: 'B', date: '2026-05-20', teacher_comment: null, created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z' },
    { id: 'sr-026', school_id: 'school-001', student_id: 'student-010', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'final_exam', exam_name: 'Final Exam', marks: 95, max_marks: 100, grade: 'A+', date: '2026-05-20', teacher_comment: 'Top performer', created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z' },
  ],
  remarks: [],
  fee_types: [
    {
      id: 'ft-001',
      school_id: 'school-001',
      name: 'Tuition Fee',
      description: 'Monthly tuition',
      default_amount: 5000,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  fees: [
    {
      id: 'fee-001',
      school_id: 'school-001',
      student_id: 'student-001',
      fee_type_id: 'ft-001',
      fee_type: 'Tuition Fee',
      amount: 5000,
      paid_amount: 5000,
      remaining_amount: 0,
      due_date: TODAY,
      payment_date: TODAY,
      payment_method: 'cash',
      receipt_number: 'RCP-001',
      status: 'paid',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'fee-002',
      school_id: 'school-001',
      student_id: 'student-002',
      fee_type_id: 'ft-001',
      fee_type: 'Tuition Fee',
      amount: 5000,
      paid_amount: 0,
      remaining_amount: 5000,
      due_date: TODAY,
      payment_date: null,
      payment_method: null,
      receipt_number: null,
      status: 'pending',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  fee_payments: [],
  notifications: [
    {
      id: 'notif-001',
      school_id: 'school-001',
      user_id: null,
      title: 'Welcome to Veducore',
      message: 'School ERP system is ready for use.',
      type: 'info',
      entity_type: null,
      entity_id: null,
      is_read: false,
      created_at: new Date().toISOString(),
    },
  ],
  audit_logs: [],
  parent_students: [
    {
      id: 'ps-001',
      school_id: 'school-001',
      parent_id: 'parent-001',
      student_id: 'student-001',
      relationship: 'father',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ps-002',
      school_id: 'school-001',
      parent_id: 'parent-002',
      student_id: 'student-002',
      relationship: 'mother',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ps-003',
      school_id: 'school-001',
      parent_id: 'parent-001',
      student_id: 'student-006',
      relationship: 'father',
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
  profiles: [
    {
      id: 'user-admin-001',
      school_id: 'school-001',
      role: 'admin',
      full_name: 'Aryan Singh Thakur',
      email: 'iamaryan721@gmail.com',
      phone: '+91-9876543210',
      avatar_url: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'user-teacher-001',
      school_id: 'school-001',
      role: 'teacher',
      full_name: 'Priya Sharma',
      email: 'teacher1@greenwood.edu',
      phone: '+91-9876543211',
      avatar_url: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'user-parent-001',
      school_id: 'school-001',
      role: 'parent',
      full_name: 'Ramesh Verma',
      email: 'parent1@greenwood.edu',
      phone: '+91-9876543212',
      avatar_url: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
};

// Suppress unused import warnings — these types are used via SEED_DATA shape inference
type _Unused = School | ClassAssignment | TeacherSchedule | Attendance | StudentRecord
  | Remark | FeeType | Fee | FeePayment | Notification | AuditLog | ParentStudent | Profile;

class MockDB {
  private getTable<T>(table: TableName): T[] {
    const raw = localStorage.getItem(STORAGE_PREFIX + table);
    return raw ? (JSON.parse(raw) as T[]) : [];
  }

  private setTable<T>(table: TableName, data: T[]): void {
    localStorage.setItem(STORAGE_PREFIX + table, JSON.stringify(data));
  }

  seed(): void {
    if (localStorage.getItem(SEEDED_KEY)) return;
    for (const [table, records] of Object.entries(SEED_DATA)) {
      this.setTable(table as TableName, records as unknown[]);
    }
    localStorage.setItem(SEEDED_KEY, 'true');
  }

  getAll<T>(table: TableName): T[] {
    return this.getTable<T>(table);
  }

  getById<T extends { id: string }>(table: TableName, id: string): T | null {
    const rows = this.getTable<T>(table);
    return rows.find(r => r.id === id) ?? null;
  }

  insert<T extends { id?: string; created_at?: string; updated_at?: string }>(
    table: TableName,
    record: Omit<T, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<T, 'id' | 'created_at' | 'updated_at'>>
  ): T {
    const rows = this.getTable<T>(table);
    const now = new Date().toISOString();
    const full = {
      ...record,
      id: record.id ?? genId(),
      created_at: record.created_at ?? now,
      updated_at: record.updated_at ?? now,
    } as T;
    rows.push(full);
    this.setTable(table, rows);
    return full;
  }

  update<T extends { id: string; updated_at?: string }>(table: TableName, id: string, updates: Partial<T>): T | null {
    const rows = this.getTable<T>(table);
    const idx = rows.findIndex(r => r.id === id);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    rows[idx] = { ...rows[idx], ...updates, updated_at: now };
    this.setTable(table, rows);
    return rows[idx];
  }

  delete(table: TableName, id: string): void {
    const rows = this.getTable<{ id: string }>(table);
    this.setTable(table, rows.filter(r => r.id !== id));
  }

  deleteWhere(table: TableName, filters: Record<string, unknown>): void {
    const rows = this.getTable<Record<string, unknown>>(table);
    this.setTable(table, rows.filter(r => !Object.entries(filters).every(([k, v]) => {
      if (v === null || v === undefined) return r[k] === null || r[k] === undefined;
      return r[k] === v;
    })));
  }

  query<T>(table: TableName, filters: Partial<Record<string, unknown>>): T[] {
    let rows = this.getTable<Record<string, unknown>>(table);
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined) continue;
      if (value === null) {
        rows = rows.filter(r => r[key] === null || r[key] === undefined);
      } else {
        rows = rows.filter(r => r[key] === value);
      }
    }
    return rows as T[];
  }
}

export const mockDb = new MockDB();
// Seed on import
mockDb.seed();
