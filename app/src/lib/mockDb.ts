import AsyncStorage from '@react-native-async-storage/async-storage';
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
  | 'fee_payments' | 'notifications' | 'audit_logs' | 'parent_students' | 'profiles'
  | 'exam_defs';

const STORAGE_PREFIX = 'mock_db_';
const SEEDED_KEY = 'mock_db_seeded_v7';

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const TODAY = new Date().toISOString().split('T')[0];

const SEED_DATA: Record<TableName, unknown[]> = {
  schools: [MOCK_SCHOOL],
  teachers: MOCK_TEACHERS,
  parents: MOCK_PARENTS,
  students: MOCK_STUDENTS.map((s) => {
    const { class: _c, section: _s, ...rest } = s as Student & { class?: unknown; section?: unknown };
    return rest;
  }),
  classes: MOCK_CLASSES,
  sections: MOCK_SECTIONS,
  subjects: MOCK_SUBJECTS,
  class_assignments: [
    { id: 'ca-001', school_id: 'school-001', teacher_id: 'teacher-001', class_id: 'class-001', section_id: 'sec-001', subject_id: 'sub-001', is_class_teacher: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'ca-002', school_id: 'school-001', teacher_id: 'teacher-001', class_id: 'class-001', section_id: 'sec-002', subject_id: 'sub-002', is_class_teacher: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  teacher_schedules: [
    { id: 'ts-001', school_id: 'school-001', teacher_id: 'teacher-001', class_id: 'class-001', section_id: 'sec-001', subject_id: 'sub-001', day_of_week: 1, start_time: '08:00', end_time: '09:00', room_number: 'Room 101', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'ts-002', school_id: 'school-001', teacher_id: 'teacher-001', class_id: 'class-001', section_id: 'sec-001', subject_id: 'sub-001', day_of_week: 3, start_time: '10:00', end_time: '11:00', room_number: 'Room 101', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  attendance: [
    { id: 'att-001', school_id: 'school-001', student_id: 'student-001', section_id: 'sec-001', teacher_id: 'teacher-001', attendance_date: TODAY, status: 'present', notes: null, markedAt: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'att-002', school_id: 'school-001', student_id: 'student-005', section_id: 'sec-001', teacher_id: 'teacher-001', attendance_date: TODAY, status: 'present', notes: null, markedAt: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'att-003', school_id: 'school-001', student_id: 'student-001', section_id: 'sec-001', teacher_id: 'teacher-001', attendance_date: '2026-10-10', status: 'present', notes: null, markedAt: '2026-10-10T09:00:00Z', created_at: '2026-10-10T09:00:00Z', updated_at: '2026-10-10T09:00:00Z' },
    { id: 'att-004', school_id: 'school-001', student_id: 'student-001', section_id: 'sec-001', teacher_id: 'teacher-001', attendance_date: '2026-10-09', status: 'present', notes: null, markedAt: '2026-10-09T09:00:00Z', created_at: '2026-10-09T09:00:00Z', updated_at: '2026-10-09T09:00:00Z' },
    { id: 'att-005', school_id: 'school-001', student_id: 'student-001', section_id: 'sec-001', teacher_id: 'teacher-001', attendance_date: '2026-10-08', status: 'leave', notes: 'Family function', markedAt: '2026-10-08T09:00:00Z', created_at: '2026-10-08T09:00:00Z', updated_at: '2026-10-08T09:00:00Z' },
    { id: 'att-006', school_id: 'school-001', student_id: 'student-001', section_id: 'sec-001', teacher_id: 'teacher-001', attendance_date: '2026-10-07', status: 'late', notes: 'Traffic delay', markedAt: '2026-10-07T09:00:00Z', created_at: '2026-10-07T09:00:00Z', updated_at: '2026-10-07T09:00:00Z' },
    { id: 'att-007', school_id: 'school-001', student_id: 'student-006', section_id: 'sec-003', teacher_id: 'teacher-001', attendance_date: TODAY, status: 'present', notes: null, markedAt: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ],
  student_records: [
    { id: 'sr-001', school_id: 'school-001', student_id: 'student-001', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'unit_test', exam_name: 'Unit Test 1', marks: 45, max_marks: 50, grade: 'A', date: '2026-01-15', teacher_comment: 'Good performance in problem solving.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'sr-002', school_id: 'school-001', student_id: 'student-005', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'unit_test', exam_name: 'Unit Test 1', marks: 38, max_marks: 50, grade: 'B+', date: '2026-01-15', teacher_comment: 'Good effort, practice more.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'sr-003', school_id: 'school-001', student_id: 'student-001', teacher_id: 'teacher-001', subject_id: 'sub-001', subject_name: 'Mathematics', record_type: 'mid_term', exam_name: 'Mid Term', marks: 88, max_marks: 100, grade: 'A', date: '2026-03-10', teacher_comment: 'Very consistent.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'sr-004', school_id: 'school-001', student_id: 'student-006', teacher_id: 'teacher-001', subject_id: 'sub-003', subject_name: 'English', record_type: 'unit_test', exam_name: 'Unit Test 1', marks: 46, max_marks: 50, grade: 'A+', date: '2026-01-15', teacher_comment: 'Outstanding reading skills.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ],
  exam_defs: [
    { id: 'examdef-001', exam_name: 'Unit Test 1', record_type: 'unit_test', max_marks: 50, section_id: 'sec-001', date: '2026-01-15', school_id: 'school-001', created_by_teacher_id: 'teacher-001' },
    { id: 'examdef-002', exam_name: 'Mid Term', record_type: 'mid_term', max_marks: 100, section_id: 'sec-001', date: '2026-03-10', school_id: 'school-001', created_by_teacher_id: 'teacher-001' },
    { id: 'examdef-003', exam_name: 'Final Exam', record_type: 'final_exam', max_marks: 100, section_id: 'sec-001', date: '2026-05-20', school_id: 'school-001', created_by_teacher_id: 'teacher-001' },
  ],
  remarks: [
    { id: 'rem-001', school_id: 'school-001', student_id: 'student-001', teacher_id: 'teacher-001', category: 'academic', visibility: 'public', remark: 'Excellent performance in Mathematics quarterly test and consistent homework submission.', created_at: new Date(Date.now() - 2 * 86400000).toISOString(), updated_at: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: 'rem-002', school_id: 'school-001', student_id: 'student-001', teacher_id: 'teacher-001', category: 'behaviour', visibility: 'public', remark: 'Very polite, helpful, and participates actively in class discussions.', created_at: new Date(Date.now() - 5 * 86400000).toISOString(), updated_at: new Date(Date.now() - 5 * 86400000).toISOString() },
    { id: 'rem-003', school_id: 'school-001', student_id: 'student-005', teacher_id: 'teacher-001', category: 'performance', visibility: 'public', remark: 'Shows good improvement in problem solving. Keep up the good work!', created_at: new Date(Date.now() - 86400000).toISOString(), updated_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 'rem-004', school_id: 'school-001', student_id: 'student-006', teacher_id: 'teacher-001', category: 'academic', visibility: 'public', remark: 'Great analytical skills demonstrated during group activities.', created_at: new Date(Date.now() - 3 * 86400000).toISOString(), updated_at: new Date(Date.now() - 3 * 86400000).toISOString() },
  ],
  fee_types: [
    { id: 'ft-001', school_id: 'school-001', name: 'Tuition Fee', description: 'Monthly tuition', default_amount: 5000, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  fees: [
    { id: 'fee-001', school_id: 'school-001', student_id: 'student-001', fee_type_id: 'ft-001', fee_type: 'Tuition Fee', amount: 5000, paid_amount: 5000, remaining_amount: 0, due_date: TODAY, payment_date: TODAY, payment_method: 'cash', receipt_number: 'RCP-001', status: 'paid', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'fee-002', school_id: 'school-001', student_id: 'student-002', fee_type_id: 'ft-001', fee_type: 'Tuition Fee', amount: 5000, paid_amount: 0, remaining_amount: 5000, due_date: TODAY, payment_date: null, payment_method: null, receipt_number: null, status: 'pending', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'fee-003', school_id: 'school-001', student_id: 'student-003', fee_type_id: 'ft-001', fee_type: 'Tuition Fee', amount: 5000, paid_amount: 0, remaining_amount: 5000, due_date: '2026-01-01', payment_date: null, payment_method: null, receipt_number: null, status: 'overdue', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'fee-004', school_id: 'school-001', student_id: 'student-004', fee_type_id: 'ft-001', fee_type: 'Tuition Fee', amount: 5000, paid_amount: 5000, remaining_amount: 0, due_date: TODAY, payment_date: TODAY, payment_method: 'online', receipt_number: 'RCP-002', status: 'paid', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'fee-005', school_id: 'school-001', student_id: 'student-005', fee_type_id: 'ft-001', fee_type: 'Tuition Fee', amount: 5000, paid_amount: 2500, remaining_amount: 2500, due_date: TODAY, payment_date: null, payment_method: null, receipt_number: null, status: 'pending', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'fee-006', school_id: 'school-001', student_id: 'student-006', fee_type_id: 'ft-001', fee_type: 'Tuition Fee', amount: 5000, paid_amount: 5000, remaining_amount: 0, due_date: TODAY, payment_date: TODAY, payment_method: 'upi', receipt_number: 'RCP-003', status: 'paid', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  fee_payments: [],
  notifications: [
    { id: 'notif-001', school_id: 'school-001', user_id: null, title: 'Welcome to Veducore', message: 'School ERP system is ready for use.', type: 'info', entity_type: null, entity_id: null, is_read: false, created_at: new Date().toISOString() },
    { id: 'notif-002', school_id: 'school-001', user_id: null, title: 'Annual Day Celebration', message: 'Annual Day is scheduled for 15th March 2027. All teachers must submit their class performances by 1st March.', type: 'info', entity_type: null, entity_id: null, is_read: false, created_at: new Date().toISOString() },
    { id: 'notif-003', school_id: 'school-001', user_id: null, title: 'Parent-Teacher Meeting', message: 'PT Meeting scheduled for 20th February. Please prepare student progress reports.', type: 'info', entity_type: null, entity_id: null, is_read: true, created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 'notif-004', school_id: 'school-001', user_id: null, title: 'Fee Reminder', message: 'February fees are due. Please remind students with pending payments.', type: 'warning', entity_type: null, entity_id: null, is_read: false, created_at: new Date(Date.now() - 172800000).toISOString() },
  ],
  audit_logs: [],
  parent_students: [
    { id: 'ps-001', school_id: 'school-001', parent_id: 'parent-001', student_id: 'student-001', relationship: 'father', created_at: '2026-01-01T00:00:00Z' },
    { id: 'ps-002', school_id: 'school-001', parent_id: 'parent-002', student_id: 'student-002', relationship: 'mother', created_at: '2026-01-01T00:00:00Z' },
    { id: 'ps-003', school_id: 'school-001', parent_id: 'parent-001', student_id: 'student-006', relationship: 'father', created_at: '2026-01-01T00:00:00Z' },
  ],
  profiles: [
    { id: 'user-admin-001', school_id: 'school-001', role: 'admin', full_name: 'Aryan Singh Thakur', email: 'iamaryan721@gmail.com', phone: '+91-9876543210', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'user-teacher-001', school_id: 'school-001', role: 'teacher', full_name: 'Priya Sharma', email: 'teacher1@greenwood.edu', phone: '+91-9876543211', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'user-parent-001', school_id: 'school-001', role: 'parent', full_name: 'Ramesh Verma', email: 'parent1@greenwood.edu', phone: '+91-9876543212', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
};

// Satisfy TypeScript import usage
type _Unused = School | ClassAssignment | TeacherSchedule | Attendance | StudentRecord
  | Remark | FeeType | Fee | FeePayment | Notification | AuditLog | ParentStudent | Profile;

class MockDB {
  private async getTable<T>(table: TableName): Promise<T[]> {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + table);
    if (!raw && SEED_DATA[table]) {
      await this.setTable(table, SEED_DATA[table]);
      return (SEED_DATA[table] as unknown) as T[];
    }
    return raw ? (JSON.parse(raw) as T[]) : [];
  }

  private async setTable<T>(table: TableName, data: T[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_PREFIX + table, JSON.stringify(data));
  }

  async seed(): Promise<void> {
    const seeded = await AsyncStorage.getItem(SEEDED_KEY);
    if (seeded) return;
    for (const [table, records] of Object.entries(SEED_DATA)) {
      await this.setTable(table as TableName, records as unknown[]);
    }
    await AsyncStorage.setItem(SEEDED_KEY, 'true');
  }

  async getAll<T>(table: TableName): Promise<T[]> {
    return this.getTable<T>(table);
  }

  async getById<T extends { id: string }>(table: TableName, id: string): Promise<T | null> {
    const rows = await this.getTable<T>(table);
    return rows.find(r => r.id === id) ?? null;
  }

  async insert<T extends { id?: string; created_at?: string; updated_at?: string }>(
    table: TableName,
    record: Omit<T, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<T, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<T> {
    const rows = await this.getTable<T>(table);
    const now = new Date().toISOString();
    const full = {
      ...record,
      id: (record as Partial<T> & { id?: string }).id ?? genId(),
      created_at: (record as Partial<T> & { created_at?: string }).created_at ?? now,
      updated_at: (record as Partial<T> & { updated_at?: string }).updated_at ?? now,
    } as T;
    rows.push(full);
    await this.setTable(table, rows);
    return full;
  }

  async update<T extends { id: string; updated_at?: string }>(table: TableName, id: string, updates: Partial<T>): Promise<T | null> {
    const rows = await this.getTable<T>(table);
    const idx = rows.findIndex(r => r.id === id);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    rows[idx] = { ...rows[idx], ...updates, updated_at: now };
    await this.setTable(table, rows);
    return rows[idx];
  }

  async delete(table: TableName, id: string): Promise<void> {
    const rows = await this.getTable<{ id: string }>(table);
    await this.setTable(table, rows.filter(r => r.id !== id));
  }

  async query<T>(table: TableName, filters: Partial<Record<string, unknown>>): Promise<T[]> {
    let rows = await this.getTable<Record<string, unknown>>(table);
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
