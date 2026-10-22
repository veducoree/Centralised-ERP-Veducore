import { mockDb } from '@/lib/mockDb';
import type {
  Teacher, Parent, Student, Class, Section, Subject,
  ClassAssignment, TeacherSchedule, Attendance, StudentRecord,
  Remark, FeeType, Fee, FeePayment, ParentStudent, School, Profile,
  Holiday, ExamDef, FeeStructure, PaymentSetup,
} from '@/types';
// Alias to avoid conflict with browser global Notification
import type { Notification as AppNotification } from '@/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function getClass(id: string | null | undefined): Class | undefined {
  if (!id) return undefined;
  return mockDb.getById<Class>('classes', id) ?? undefined;
}

function getSection(id: string | null | undefined): Section | undefined {
  if (!id) return undefined;
  return mockDb.getById<Section>('sections', id) ?? undefined;
}

function getSubject(id: string | null | undefined): Subject | undefined {
  if (!id) return undefined;
  return mockDb.getById<Subject>('subjects', id) ?? undefined;
}

function getTeacher(id: string | null | undefined): Teacher | undefined {
  if (!id) return undefined;
  return mockDb.getById<Teacher>('teachers', id) ?? undefined;
}

function getStudent(id: string | null | undefined): Student | undefined {
  if (!id) return undefined;
  const s = mockDb.getById<Student>('students', id);
  if (!s) return undefined;
  return { ...s, class: getClass(s.class_id), section: getSection(s.section_id) };
}

// ─── School ─────────────────────────────────────────────────────────────────

export async function fetchSchool(schoolId: string): Promise<School | null> {
  return mockDb.getById<School>('schools', schoolId);
}

export async function updateSchool(schoolId: string, updates: Partial<School>): Promise<School | null> {
  return mockDb.update<School>('schools', schoolId, updates);
}

// ─── Teachers ───────────────────────────────────────────────────────────────

export async function fetchTeachers(schoolId: string): Promise<Teacher[]> {
  return mockDb.query<Teacher>('teachers', { school_id: schoolId })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function createTeacherAccount(params: {
  email: string;
  password: string;
  full_name: string;
  school_id: string;
  phone?: string;
  employee_id: string;
  qualification?: string;
  subject?: string;
  date_of_joining?: string;
}): Promise<{ teacher: Teacher; profile: Profile }> {
  const userId = crypto.randomUUID ? crypto.randomUUID() : 'user-' + Date.now();
  const teacher = mockDb.insert<Teacher>('teachers', {
    school_id: params.school_id,
    user_id: userId,
    full_name: params.full_name,
    email: params.email,
    password: params.password,
    phone: params.phone ?? null,
    employee_id: params.employee_id,
    qualification: params.qualification ?? null,
    subject: params.subject ?? null,
    date_of_joining: params.date_of_joining ?? null,
    avatar_url: null,
    status: 'active',
  });
  const profile = mockDb.insert<Profile>('profiles', {
    id: userId,
    school_id: params.school_id,
    role: 'teacher',
    full_name: params.full_name,
    email: params.email,
    phone: params.phone ?? null,
    avatar_url: null,
    status: 'active',
  });
  return { teacher, profile };
}

export async function updateTeacher(id: string, updates: Partial<Teacher>): Promise<Teacher | null> {
  return mockDb.update<Teacher>('teachers', id, updates);
}

export async function deleteTeacher(id: string): Promise<void> {
  mockDb.delete('teachers', id);
}

export async function fetchTeacherByUserId(userId: string): Promise<Teacher | null> {
  return mockDb.query<Teacher>('teachers', { user_id: userId })[0] ?? null;
}

export async function fetchTeacherProfileForDisplay(teacherId: string): Promise<Teacher | null> {
  return mockDb.getById<Teacher>('teachers', teacherId);
}

// ─── Parents ────────────────────────────────────────────────────────────────

export async function fetchParents(schoolId: string): Promise<Parent[]> {
  return mockDb.query<Parent>('parents', { school_id: schoolId })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function createParentAccount(params: {
  email: string;
  password: string;
  full_name: string;
  school_id: string;
  phone?: string;
  occupation?: string;
  address?: string;
}): Promise<{ parent: Parent; profile: Profile }> {
  const userId = crypto.randomUUID ? crypto.randomUUID() : 'user-' + Date.now();
  const parent = mockDb.insert<Parent>('parents', {
    school_id: params.school_id,
    user_id: userId,
    full_name: params.full_name,
    email: params.email,
    phone: params.phone ?? null,
    occupation: params.occupation ?? null,
    address: params.address ?? null,
    avatar_url: null,
    status: 'active',
  });
  const profile = mockDb.insert<Profile>('profiles', {
    id: userId,
    school_id: params.school_id,
    role: 'parent',
    full_name: params.full_name,
    email: params.email,
    phone: params.phone ?? null,
    avatar_url: null,
    status: 'active',
  });
  return { parent, profile };
}

export async function updateParent(id: string, updates: Partial<Parent>): Promise<Parent | null> {
  return mockDb.update<Parent>('parents', id, updates);
}

export async function deleteParent(id: string): Promise<void> {
  mockDb.delete('parents', id);
}

export async function fetchParentByUserId(userId: string): Promise<Parent | null> {
  return mockDb.query<Parent>('parents', { user_id: userId })[0] ?? null;
}

// ─── Students ───────────────────────────────────────────────────────────────

export async function fetchStudents(
  schoolId: string,
  filters?: { classId?: string; sectionId?: string; search?: string }
): Promise<Student[]> {
  let rows = mockDb.query<Student>('students', { school_id: schoolId });
  if (filters?.classId) rows = rows.filter(s => s.class_id === filters.classId);
  if (filters?.sectionId) rows = rows.filter(s => s.section_id === filters.sectionId);
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(s =>
      s.full_name.toLowerCase().includes(q) ||
      s.admission_number.toLowerCase().includes(q)
    );
  }
  return rows
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map(s => ({ ...s, class: getClass(s.class_id), section: getSection(s.section_id) }));
}

export async function fetchStudentById(id: string): Promise<Student | null> {
  const s = mockDb.getById<Student>('students', id);
  if (!s) return null;
  return { ...s, class: getClass(s.class_id), section: getSection(s.section_id) };
}

export async function createStudent(
  student: Partial<Student> & { school_id: string; admission_number: string; full_name: string }
): Promise<Student | null> {
  const { class: _c, section: _s, ...rest } = student as Student & { class?: unknown; section?: unknown };
  const created = mockDb.insert<Student>('students', rest as Omit<Student, 'id' | 'created_at' | 'updated_at'>);
  return { ...created, class: getClass(created.class_id), section: getSection(created.section_id) };
}

export async function updateStudent(id: string, updates: Partial<Student>): Promise<Student | null> {
  const { class: _c, section: _s, ...rest } = updates as Partial<Student> & { class?: unknown; section?: unknown };
  const updated = mockDb.update<Student>('students', id, rest as Partial<Student>);
  if (!updated) return null;
  return { ...updated, class: getClass(updated.class_id), section: getSection(updated.section_id) };
}

export async function deleteStudent(id: string): Promise<void> {
  mockDb.delete('students', id);
}

export async function fetchStudentsBySection(sectionId: string): Promise<Student[]> {
  return mockDb.query<Student>('students', { section_id: sectionId, status: 'active' })
    .sort((a, b) => (a.roll_number ?? 0) - (b.roll_number ?? 0))
    .map(s => ({ ...s, class: getClass(s.class_id), section: getSection(s.section_id) }));
}

// ─── Classes & Sections ─────────────────────────────────────────────────────

export async function fetchClasses(schoolId: string): Promise<(Class & { sections: Section[] })[]> {
  const classes = mockDb.query<Class>('classes', { school_id: schoolId })
    .sort((a, b) => (a.grade_level ?? 0) - (b.grade_level ?? 0));
  return classes.map(c => ({
    ...c,
    sections: mockDb.query<Section>('sections', { class_id: c.id }),
  }));
}

export async function createClass(
  schoolId: string,
  name: string,
  gradeLevel?: number
): Promise<Class | null> {
  return mockDb.insert<Class>('classes', {
    school_id: schoolId,
    name,
    grade_level: gradeLevel ?? null,
  });
}

export async function updateClass(id: string, updates: Partial<Class>): Promise<Class | null> {
  return mockDb.update<Class>('classes', id, updates);
}

export async function deleteClass(id: string): Promise<void> {
  mockDb.delete('classes', id);
}

export async function createSection(
  schoolId: string,
  classId: string,
  name: string,
  capacity?: number
): Promise<Section | null> {
  return mockDb.insert<Section>('sections', {
    school_id: schoolId,
    class_id: classId,
    name,
    capacity: capacity ?? 40,
  });
}

export async function deleteSection(id: string): Promise<void> {
  mockDb.delete('sections', id);
}

// ─── Subjects ───────────────────────────────────────────────────────────────

export async function fetchSubjects(schoolId: string): Promise<Subject[]> {
  return mockDb.query<Subject>('subjects', { school_id: schoolId })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createSubject(
  schoolId: string,
  name: string,
  code?: string
): Promise<Subject | null> {
  return mockDb.insert<Subject>('subjects', {
    school_id: schoolId,
    name,
    code: code ?? null,
  });
}

export async function deleteSubject(id: string): Promise<void> {
  mockDb.delete('subjects', id);
}

// ─── Class Assignments ──────────────────────────────────────────────────────

export async function fetchClassAssignments(schoolId: string): Promise<ClassAssignment[]> {
  const rows = mockDb.query<ClassAssignment>('class_assignments', { school_id: schoolId });
  return rows
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .map(r => ({
      ...r,
      teacher: getTeacher(r.teacher_id),
      class: getClass(r.class_id),
      section: getSection(r.section_id),
      subject: getSubject(r.subject_id),
    }));
}

export async function createClassAssignment(assignment: {
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
  subject_id: string;
}): Promise<ClassAssignment | null> {
  return mockDb.insert<ClassAssignment>('class_assignments', { ...assignment, is_class_teacher: false });
}

export async function deleteClassAssignment(id: string): Promise<void> {
  mockDb.delete('class_assignments', id);
}

export async function fetchTeacherAssignments(teacherId: string): Promise<ClassAssignment[]> {
  const rows = mockDb.query<ClassAssignment>('class_assignments', { teacher_id: teacherId });
  return rows.map(r => ({
    ...r,
    class: getClass(r.class_id),
    section: getSection(r.section_id),
    subject: getSubject(r.subject_id),
  }));
}

export async function fetchClassTeacherForSection(
  sectionId: string
): Promise<(ClassAssignment & { teacher: Teacher }) | null> {
  const rows = mockDb.query<ClassAssignment>('class_assignments', { section_id: sectionId });
  const ct = rows.find(r => r.subject_id === null || r.subject_id === undefined);
  if (!ct) return null;
  const teacher = getTeacher(ct.teacher_id);
  if (!teacher) return null;
  return { ...ct, teacher };
}

export async function assignClassTeacher(params: {
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
}): Promise<ClassAssignment | null> {
  // Remove existing class-teacher entry (subject_id null)
  const existing = mockDb.query<ClassAssignment>('class_assignments', { section_id: params.section_id });
  const toDelete = existing.filter(r => r.subject_id === null || r.subject_id === undefined);
  toDelete.forEach(r => mockDb.delete('class_assignments', r.id));

  return mockDb.insert<ClassAssignment>('class_assignments', {
    ...params,
    subject_id: null,
    is_class_teacher: true,
  });
}

export async function removeClassTeacher(sectionId: string): Promise<void> {
  const existing = mockDb.query<ClassAssignment>('class_assignments', { section_id: sectionId });
  existing
    .filter(r => r.subject_id === null || r.subject_id === undefined)
    .forEach(r => mockDb.delete('class_assignments', r.id));
}

export async function fetchSubjectAssignmentsForSection(
  sectionId: string
): Promise<(ClassAssignment & { teacher: Teacher; subject: Subject })[]> {
  const rows = mockDb.query<ClassAssignment>('class_assignments', { section_id: sectionId })
    .filter(r => r.subject_id !== null && r.subject_id !== undefined);
  return rows.map(r => ({
    ...r,
    teacher: getTeacher(r.teacher_id) as Teacher,
    subject: getSubject(r.subject_id) as Subject,
  }));
}

export async function assignSubjectTeacher(params: {
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
  subject_id: string;
}): Promise<ClassAssignment | null> {
  // Remove existing entry for same section+subject
  const existing = mockDb.query<ClassAssignment>('class_assignments', {
    section_id: params.section_id,
    subject_id: params.subject_id,
  });
  existing.forEach(r => mockDb.delete('class_assignments', r.id));

  return mockDb.insert<ClassAssignment>('class_assignments', { ...params, is_class_teacher: false });
}

export async function removeSubjectTeacher(sectionId: string, subjectId: string): Promise<void> {
  const existing = mockDb.query<ClassAssignment>('class_assignments', {
    section_id: sectionId,
    subject_id: subjectId,
  });
  existing.forEach(r => mockDb.delete('class_assignments', r.id));
}

// ─── Teacher Schedules ──────────────────────────────────────────────────────

export async function fetchTeacherSchedules(schoolId: string): Promise<TeacherSchedule[]> {
  return mockDb.query<TeacherSchedule>('teacher_schedules', { school_id: schoolId })
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
    .map(r => ({
      ...r,
      teacher: getTeacher(r.teacher_id),
      class: getClass(r.class_id),
      section: getSection(r.section_id),
      subject: getSubject(r.subject_id ?? undefined),
    }));
}

export async function createTeacherSchedule(schedule: {
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
  subject_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room_number?: string;
}): Promise<TeacherSchedule | null> {
  return mockDb.insert<TeacherSchedule>('teacher_schedules', {
    ...schedule,
    subject_id: schedule.subject_id ?? null,
    room_number: schedule.room_number ?? null,
  });
}

export async function deleteTeacherSchedule(id: string): Promise<void> {
  mockDb.delete('teacher_schedules', id);
}

export async function fetchTeacherScheduleByTeacher(teacherId: string): Promise<TeacherSchedule[]> {
  return mockDb.query<TeacherSchedule>('teacher_schedules', { teacher_id: teacherId })
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
    .map(r => ({
      ...r,
      teacher: getTeacher(r.teacher_id),
      class: getClass(r.class_id),
      section: getSection(r.section_id),
      subject: getSubject(r.subject_id ?? undefined),
    }));
}

// ─── Attendance ─────────────────────────────────────────────────────────────

export async function fetchAttendance(filters: {
  sectionId?: string;
  studentId?: string;
  date?: string;
  schoolId?: string;
}): Promise<Attendance[]> {
  let rows = mockDb.getAll<Attendance>('attendance');
  if (filters.sectionId) rows = rows.filter(r => r.section_id === filters.sectionId);
  if (filters.studentId) rows = rows.filter(r => r.student_id === filters.studentId);
  if (filters.date) rows = rows.filter(r => r.attendance_date === filters.date);
  if (filters.schoolId) rows = rows.filter(r => r.school_id === filters.schoolId);
  return rows
    .sort((a, b) => b.attendance_date.localeCompare(a.attendance_date))
    .map(r => ({ ...r, student: getStudent(r.student_id) }));
}

export async function upsertAttendance(records: {
  school_id: string;
  student_id: string;
  section_id: string;
  teacher_id?: string;
  attendance_date: string;
  status: string;
  notes?: string;
}[]): Promise<unknown> {
  const results: Attendance[] = [];
  for (const rec of records) {
    const all = mockDb.getAll<Attendance>('attendance');
    const existing = all.find(
      r => r.student_id === rec.student_id &&
           r.attendance_date === rec.attendance_date &&
           r.section_id === rec.section_id
    );
    if (existing) {
      const updated = mockDb.update<Attendance>('attendance', existing.id, rec as Partial<Attendance>);
      if (updated) results.push(updated);
    } else {
      const inserted = mockDb.insert<Attendance>('attendance', rec as Omit<Attendance, 'id' | 'created_at' | 'updated_at'>);
      results.push(inserted);
    }
  }
  return results;
}

// ─── Student Records ────────────────────────────────────────────────────────

export async function fetchStudentRecords(filters: {
  studentId?: string;
  teacherId?: string;
  schoolId?: string;
}): Promise<StudentRecord[]> {
  let rows = mockDb.getAll<StudentRecord>('student_records');
  if (filters.studentId) rows = rows.filter(r => r.student_id === filters.studentId);
  if (filters.teacherId) rows = rows.filter(r => r.teacher_id === filters.teacherId);
  if (filters.schoolId) rows = rows.filter(r => r.school_id === filters.schoolId);
  return rows
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(r => ({
      ...r,
      student: getStudent(r.student_id),
      teacher: getTeacher(r.teacher_id ?? undefined),
      subject: getSubject(r.subject_id ?? undefined),
    }));
}

export async function createStudentRecord(record: {
  school_id: string;
  student_id: string;
  teacher_id?: string;
  subject_id?: string;
  subject_name: string;
  record_type: string;
  exam_name: string;
  marks: number;
  max_marks: number;
  grade?: string;
  date: string;
  teacher_comment?: string;
}): Promise<StudentRecord | null> {
  return mockDb.insert<StudentRecord>('student_records', {
    school_id: record.school_id,
    student_id: record.student_id,
    teacher_id: record.teacher_id ?? null,
    subject_id: record.subject_id ?? null,
    subject_name: record.subject_name,
    record_type: record.record_type as StudentRecord['record_type'],
    exam_name: record.exam_name,
    marks: record.marks,
    max_marks: record.max_marks,
    grade: record.grade ?? null,
    date: record.date,
    teacher_comment: record.teacher_comment ?? null,
  });
}

export async function deleteStudentRecord(id: string): Promise<void> {
  mockDb.delete('student_records', id);
}

// ─── Remarks ────────────────────────────────────────────────────────────────

export async function fetchRemarks(filters: {
  studentId?: string;
  teacherId?: string;
  schoolId?: string;
}): Promise<Remark[]> {
  let rows = mockDb.getAll<Remark>('remarks');
  if (filters.studentId) rows = rows.filter(r => r.student_id === filters.studentId);
  if (filters.teacherId) rows = rows.filter(r => r.teacher_id === filters.teacherId);
  if (filters.schoolId) rows = rows.filter(r => r.school_id === filters.schoolId);
  return rows
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(r => ({
      ...r,
      student: getStudent(r.student_id),
      teacher: getTeacher(r.teacher_id),
    }));
}

export async function createRemark(remark: {
  school_id: string;
  student_id: string;
  teacher_id: string;
  category: string;
  remark: string;
  visibility: string;
}): Promise<Remark | null> {
  return mockDb.insert<Remark>('remarks', {
    school_id: remark.school_id,
    student_id: remark.student_id,
    teacher_id: remark.teacher_id,
    category: remark.category as Remark['category'],
    remark: remark.remark,
    visibility: remark.visibility as Remark['visibility'],
  });
}

export async function deleteRemark(id: string): Promise<void> {
  mockDb.delete('remarks', id);
}

// ─── Fees ────────────────────────────────────────────────────────────────────

export async function fetchFeeTypes(schoolId: string): Promise<FeeType[]> {
  return mockDb.query<FeeType>('fee_types', { school_id: schoolId })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFeeType(
  schoolId: string,
  name: string,
  description: string,
  defaultAmount: number
): Promise<FeeType | null> {
  return mockDb.insert<FeeType>('fee_types', {
    school_id: schoolId,
    name,
    description,
    default_amount: defaultAmount,
  });
}

export async function fetchFees(filters: {
  schoolId?: string;
  studentId?: string;
  status?: string;
}): Promise<Fee[]> {
  let rows = mockDb.getAll<Fee>('fees');
  if (filters.schoolId) rows = rows.filter(r => r.school_id === filters.schoolId);
  if (filters.studentId) rows = rows.filter(r => r.student_id === filters.studentId);
  if (filters.status) rows = rows.filter(r => r.status === filters.status);
  return rows
    .sort((a, b) => b.due_date.localeCompare(a.due_date))
    .map(r => ({ ...r, student: getStudent(r.student_id) }));
}

export async function createFee(fee: {
  school_id: string;
  student_id: string;
  fee_type_id?: string;
  fee_type: string;
  amount: number;
  due_date: string;
  status?: string;
}): Promise<Fee | null> {
  return mockDb.insert<Fee>('fees', {
    school_id: fee.school_id,
    student_id: fee.student_id,
    fee_type_id: fee.fee_type_id ?? null,
    fee_type: fee.fee_type,
    amount: fee.amount,
    paid_amount: 0,
    remaining_amount: fee.amount,
    due_date: fee.due_date,
    payment_date: null,
    payment_method: null,
    receipt_number: null,
    status: (fee.status ?? 'pending') as Fee['status'],
  });
}

export async function recordFeePayment(
  feeId: string,
  payment: {
    school_id: string;
    student_id: string;
    amount: number;
    payment_date: string;
    payment_method?: string;
    receipt_number?: string;
    recorded_by?: string;
  }
): Promise<FeePayment | null> {
  const feePayment = mockDb.insert<FeePayment>('fee_payments', {
    school_id: payment.school_id,
    fee_id: feeId,
    student_id: payment.student_id,
    amount: payment.amount,
    payment_date: payment.payment_date,
    payment_method: payment.payment_method ?? null,
    receipt_number: payment.receipt_number ?? null,
    recorded_by: payment.recorded_by ?? null,
  });

  // Update the fee
  const fee = mockDb.getById<Fee>('fees', feeId);
  if (fee) {
    const newPaid = fee.paid_amount + payment.amount;
    const newStatus: Fee['status'] =
      newPaid >= fee.amount ? 'paid' : newPaid > 0 ? 'partially_paid' : 'pending';
    mockDb.update<Fee>('fees', feeId, {
      paid_amount: newPaid,
      remaining_amount: fee.amount - newPaid,
      status: newStatus,
      payment_date: payment.payment_date,
      payment_method: payment.payment_method ?? null,
      receipt_number: payment.receipt_number ?? null,
    });
  }
  return feePayment;
}

export async function deleteFee(id: string): Promise<void> {
  mockDb.delete('fees', id);
}

// ─── Notifications ──────────────────────────────────────────────────────────

export async function fetchNotifications(
  userId?: string,
  schoolId?: string
): Promise<AppNotification[]> {
  let rows = mockDb.getAll<AppNotification>('notifications');
  if (userId) rows = rows.filter(r => r.user_id === userId);
  if (schoolId) rows = rows.filter(r => r.school_id === schoolId);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function createNotification(notification: {
  school_id: string;
  user_id?: string;
  title: string;
  message: string;
  type?: string;
}): Promise<AppNotification | null> {
  return mockDb.insert<AppNotification>('notifications', {
    school_id: notification.school_id,
    user_id: notification.user_id ?? null,
    title: notification.title,
    message: notification.message,
    type: notification.type ?? 'info',
    entity_type: null,
    entity_id: null,
    is_read: false,
  });
}

export async function markNotificationRead(id: string): Promise<void> {
  // AppNotification has no updated_at, use a cast
  mockDb.update('notifications', id, { is_read: true } as Partial<AppNotification & { updated_at?: string }>);
}

export async function deleteNotification(id: string): Promise<void> {
  mockDb.delete('notifications', id);
}

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export async function fetchAuditLogs(schoolId: string): Promise<import('@/types').AuditLog[]> {
  return mockDb.query<import('@/types').AuditLog>('audit_logs', { school_id: schoolId })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100);
}

// ─── Parent ↔ Student ───────────────────────────────────────────────────────

export async function fetchParentStudents(
  parentId: string
): Promise<(ParentStudent & { student: Student })[]> {
  const links = mockDb.query<ParentStudent>('parent_students', { parent_id: parentId });
  return links.map(link => ({
    ...link,
    student: getStudent(link.student_id) as Student,
    parent: mockDb.getById<Parent>('parents', link.parent_id) as Parent,
  }));
}

export async function linkParentStudent(
  schoolId: string,
  parentId: string,
  studentId: string,
  relationship: string
): Promise<ParentStudent | null> {
  return mockDb.insert<ParentStudent>('parent_students', {
    school_id: schoolId,
    parent_id: parentId,
    student_id: studentId,
    relationship,
  });
}

export async function unlinkParentStudent(id: string): Promise<void> {
  mockDb.delete('parent_students', id);
}

// ─── Profiles ───────────────────────────────────────────────────────────────

export async function updateProfile(id: string, updates: Partial<Profile>): Promise<Profile | null> {
  return mockDb.update<Profile>('profiles', id, updates);
}

// ─── Holidays ───────────────────────────────────────────────────────────────

export async function fetchHolidays(schoolId: string): Promise<Holiday[]> {
  return mockDb.query<Holiday>('holidays', { school_id: schoolId })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function createHoliday(holiday: {
  school_id: string;
  date: string;
  type: 'working' | 'holiday' | 'festival';
  label?: string | null;
}): Promise<Holiday | null> {
  return mockDb.insert<Holiday>('holidays', {
    school_id: holiday.school_id,
    date: holiday.date,
    type: holiday.type,
    label: holiday.label ?? null,
  });
}

export async function updateHoliday(id: string, updates: Partial<Holiday>): Promise<Holiday | null> {
  return mockDb.update<Holiday>('holidays', id, updates);
}

export async function deleteHoliday(id: string): Promise<void> {
  mockDb.delete('holidays', id);
}

// ─── Exam Defs ───────────────────────────────────────────────────────────────

export async function fetchExamDefs(filters: {
  schoolId?: string;
  sectionId?: string;
}): Promise<ExamDef[]> {
  let rows = mockDb.getAll<ExamDef>('exam_defs');
  if (filters.schoolId) rows = rows.filter(r => r.school_id === filters.schoolId);
  if (filters.sectionId) rows = rows.filter(r => r.section_id === filters.sectionId);
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export async function createExamDef(examDef: {
  school_id: string;
  section_id: string;
  exam_name: string;
  record_type: string;
  max_marks?: number;
  date?: string;
  created_by_teacher_id?: string;
}): Promise<ExamDef | null> {
  return mockDb.insert<ExamDef>('exam_defs', {
    school_id: examDef.school_id,
    section_id: examDef.section_id,
    exam_name: examDef.exam_name,
    record_type: examDef.record_type,
    max_marks: examDef.max_marks ?? 100,
    date: examDef.date ?? new Date().toISOString().slice(0, 10),
    created_by_teacher_id: examDef.created_by_teacher_id ?? '',
  });
}

export async function deleteExamDef(id: string): Promise<void> {
  mockDb.delete('exam_defs', id);
}

// ─── Fee Structures ──────────────────────────────────────────────────────────

export async function fetchFeeStructures(schoolId: string): Promise<FeeStructure[]> {
  return mockDb.query<FeeStructure>('fee_structures', { school_id: schoolId })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFeeStructure(feeStructure: {
  school_id: string;
  name: string;
  fee_type: string;
  class_id?: string | null;
  amount: number;
  frequency: 'one_time' | 'monthly' | 'quarterly' | 'annual';
  due_day?: number | null;
  academic_year?: string;
  is_active?: boolean;
}): Promise<FeeStructure | null> {
  return mockDb.insert<FeeStructure>('fee_structures', {
    school_id: feeStructure.school_id,
    name: feeStructure.name,
    fee_type: feeStructure.fee_type,
    class_id: feeStructure.class_id ?? null,
    amount: feeStructure.amount,
    frequency: feeStructure.frequency,
    due_day: feeStructure.due_day ?? null,
    academic_year: feeStructure.academic_year ?? '2025-2026',
    is_active: feeStructure.is_active ?? true,
  });
}

export async function updateFeeStructure(
  id: string,
  updates: Partial<FeeStructure>
): Promise<FeeStructure | null> {
  return mockDb.update<FeeStructure>('fee_structures', id, updates);
}

export async function deleteFeeStructure(id: string): Promise<void> {
  mockDb.delete('fee_structures', id);
}

// ─── Payment Setup ───────────────────────────────────────────────────────────

export async function fetchPaymentSetup(schoolId: string): Promise<PaymentSetup | null> {
  return mockDb.query<PaymentSetup>('payment_setups', { school_id: schoolId })[0] ?? null;
}

export async function upsertPaymentSetup(setup: {
  school_id: string;
  razorpay_key_id?: string;
  account_holder_name?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  is_verified?: boolean;
}): Promise<PaymentSetup | null> {
  const existing = mockDb.query<PaymentSetup>('payment_setups', { school_id: setup.school_id })[0];
  if (existing) {
    return mockDb.update<PaymentSetup>('payment_setups', existing.id, setup as Partial<PaymentSetup>);
  }
  return mockDb.insert<PaymentSetup>('payment_setups', {
    school_id: setup.school_id,
    razorpay_key_id: setup.razorpay_key_id ?? '',
    account_holder_name: setup.account_holder_name ?? '',
    bank_name: setup.bank_name ?? '',
    account_number: setup.account_number ?? '',
    ifsc_code: setup.ifsc_code ?? '',
    is_verified: setup.is_verified ?? false,
  });
}
