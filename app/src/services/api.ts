import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { generateSubjectCode } from '@/lib/subjectUtils';
import { generateParentCredentials } from '@/lib/parentUtils';
import type {
  Teacher,
  Parent,
  Student,
  Class,
  Section,
  Subject,
  ClassAssignment,
  TeacherSchedule,
  TimetablePeriod,
  TimetableSubstitution,
  Attendance,
  StudentRecord,
  Remark,
  FeeType,
  Fee,
  Notification,
  NotificationPreferences,
  ParentStudent,
  School,
  Profile,
  ExamDef,
  TransportStop,
  TransportBus,
  StudentTransportAssignment,
} from '@/types';

// ==========================================
// Lightweight In-Memory Cache & Deduplication
// ==========================================
const apiCache = new Map<string, { data: unknown; expiresAt: number }>();
const inFlight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL_MS = 60_000;

async function cachedFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const now = Date.now();
  const cached = apiCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = fetcher()
    .then((res) => {
      apiCache.set(key, { data: res, expiresAt: Date.now() + ttlMs });
      inFlight.delete(key);
      return res;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });
  inFlight.set(key, promise);
  return promise;
}

function invalidateCache(prefix: string) {
  for (const key of apiCache.keys()) {
    if (key.startsWith(prefix)) {
      apiCache.delete(key);
    }
  }
}

export function clearApiCache() {
  apiCache.clear();
  inFlight.clear();
}

// ==========================================
// School API
// ==========================================
export async function fetchSchool(schoolId: string, forceRefresh = false) {
  if (forceRefresh) {
    invalidateCache(`school:${schoolId}`);
  }
  return cachedFetch(`school:${schoolId}`, async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .eq('id', schoolId)
      .maybeSingle();
    if (error) throw error;
    return data as School | null;
  }, 5 * 60_000);
}

export async function updateSchool(schoolId: string, updates: Partial<School>) {
  const { data, error } = await supabase
    .from('schools')
    .update(updates)
    .eq('id', schoolId)
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateCache(`school:${schoolId}`);
  return data as School | null;
}

// ==========================================
// Teachers API
// ==========================================
export async function fetchTeachers(schoolId: string) {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('school_id', schoolId)
    .order('full_name');
  if (error) throw error;
  return data as Teacher[];
}

export async function fetchTeacherByUserId(userId: string, email?: string) {
  return cachedFetch(`teacherByUser:${userId}:${email || ''}`, async () => {
    let { data, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data && email) {
      const cleanEmail = email.trim();
      const { data: byEmail } = await supabase
        .from('teachers')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (byEmail) {
        data = byEmail;
        if (!byEmail.user_id || byEmail.user_id !== userId) {
          try {
            await supabase.from('teachers').update({ user_id: userId }).eq('id', byEmail.id);
          } catch {}
        }
      }
    }

    if (error && !data) throw error;
    return data as Teacher | null;
  }, 5 * 60_000);
}

export async function updateTeacher(id: string, updates: Partial<Teacher>) {
  const { data, error } = await supabase
    .from('teachers')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateCache('teacherByUser:');
  return data as Teacher | null;
}

// ==========================================
// Parents API
// ==========================================
export async function fetchParents(schoolId: string) {
  const { data, error } = await supabase
    .from('parents')
    .select('*')
    .eq('school_id', schoolId)
    .order('full_name');
  if (error) throw error;
  return data as Parent[];
}

export async function fetchParentByUserId(userId: string) {
  return cachedFetch(`parentByUser:${userId}`, async () => {
    const { data, error } = await supabase
      .from('parents')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data as Parent | null;
  }, 5 * 60_000);
}

export async function updateParent(id: string, updates: Partial<Parent>) {
  const { data, error } = await supabase
    .from('parents')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateCache('parentByUser:');
  return data as Parent | null;
}

export async function fetchParentStudents(parentId: string) {
  return cachedFetch(`parentStudents:${parentId}`, async () => {
    const { data, error } = await supabase
      .from('parent_students')
      .select('*, student:students(*, class:classes(*), section:sections(*)), parent:parents(*)')
      .eq('parent_id', parentId);
    if (error) throw error;
    return (data || []) as (ParentStudent & { student: Student })[];
  });
}

// ==========================================
// Classes & Sections API
// ==========================================
export async function fetchClasses(schoolId: string) {
  return cachedFetch(`classes:${schoolId}`, async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('*, sections(*)')
      .eq('school_id', schoolId)
      .order('grade_level');
    if (error) throw error;
    return (data || []) as (Class & { sections: Section[] })[];
  });
}

export async function createClass(schoolId: string, name: string, gradeLevel?: number) {
  const { data, error } = await supabase
    .from('classes')
    .insert({ school_id: schoolId, name, grade_level: gradeLevel })
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateCache(`classes:${schoolId}`);
  return data as Class | null;
}

export async function createSection(schoolId: string, classId: string, name: string, capacity?: number) {
  const { data, error } = await supabase
    .from('sections')
    .insert({ school_id: schoolId, class_id: classId, name, capacity: capacity || 40 })
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateCache(`classes:${schoolId}`);
  return data as Section | null;
}

// ==========================================
// Subjects API
// ==========================================
export async function fetchSubjects(schoolId: string) {
  return cachedFetch(`subjects:${schoolId}`, async () => {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('school_id', schoolId)
      .order('name');
    if (error) throw error;
    return (data || []) as Subject[];
  });
}

export async function createSubject(schoolId: string, name: string, code?: string) {
  let finalCode = (code || '').trim().toUpperCase();
  if (!finalCode) {
    const existing = await fetchSubjects(schoolId);
    finalCode = generateSubjectCode(name, existing.map(s => s.code));
  }

  const { data, error } = await supabase
    .from('subjects')
    .insert({ school_id: schoolId, name: name.trim(), code: finalCode })
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateCache(`subjects:${schoolId}`);
  return data as Subject | null;
}

// ==========================================
// Class Assignments & Schedules
// ==========================================
export async function fetchTeacherAssignments(teacherId: string) {
  return cachedFetch(`teacherAssignments:${teacherId}`, async () => {
    const { data, error } = await supabase
      .from('class_assignments')
      .select('*, class:classes(*), section:sections(*), subject:subjects(*)')
      .eq('teacher_id', teacherId);
    if (error) throw error;
    return (data || []) as ClassAssignment[];
  });
}

export async function createClassAssignment(assignment: {
  teacher_id: string;
  section_id: string;
  subject_id: string;
  is_class_teacher?: boolean;
}) {
  const { data, error } = await supabase
    .from('class_assignments')
    .insert(assignment)
    .select('*, class:classes(*), section:sections(*), subject:subjects(*)')
    .maybeSingle();
  if (error) throw error;
  invalidateCache('teacherAssignments:');
  return data as ClassAssignment | null;
}

export async function fetchTeacherScheduleByTeacher(teacherId: string) {
  return cachedFetch(`teacherSchedules:${teacherId}`, async () => {
    const { data, error } = await supabase
      .from('teacher_schedules')
      .select('*, class:classes(*), section:sections(*), subject:subjects(*)')
      .eq('teacher_id', teacherId)
      .order('day_of_week')
      .order('start_time');
    if (error) throw error;
    return (data || []) as TeacherSchedule[];
  });
}

// ==========================================
// Timetable
// ==========================================
export async function fetchTimetablePeriods(schoolId: string) {
  return cachedFetch(`timetablePeriods:${schoolId}`, async () => {
    const { data, error } = await supabase
      .from('timetable_periods')
      .select('*')
      .eq('school_id', schoolId)
      .order('start_time');
    if (error) throw error;
    return (data || []) as TimetablePeriod[];
  });
}

/** Timetable of one section (parents; teacher names follow RLS). */
export async function fetchSectionTimetable(sectionId: string) {
  return cachedFetch(`sectionTimetable:${sectionId}`, async () => {
    const { data, error } = await supabase
      .from('teacher_schedules')
      .select('*, teacher:teachers(id, full_name), subject:subjects(id, name)')
      .eq('section_id', sectionId)
      .order('day_of_week')
      .order('start_time');
    if (error) throw error;
    return (data || []) as TeacherSchedule[];
  });
}

export async function fetchSubstitutions(filters: {
  sectionId?: string;
  substituteTeacherId?: string;
  from: string;
  to: string;
}) {
  let q = supabase
    .from('timetable_substitutions')
    .select(`*,
      substitute_teacher:teachers!timetable_substitutions_substitute_teacher_id_fkey(id, full_name),
      class:classes(id, name), section:sections(id, name), subject:subjects(id, name),
      period:timetable_periods(id, name)`)
    .gte('date', filters.from)
    .lte('date', filters.to)
    .order('date')
    .order('start_time');
  if (filters.sectionId) q = q.eq('section_id', filters.sectionId);
  if (filters.substituteTeacherId) q = q.eq('substitute_teacher_id', filters.substituteTeacherId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as TimetableSubstitution[];
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
}) {
  const { data, error } = await supabase
    .from('teacher_schedules')
    .insert(schedule)
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateCache('teacherSchedules:');
  return data as TeacherSchedule | null;
}

// ==========================================
// Students API
// ==========================================
export async function fetchStudents(
  schoolId: string,
  filters?: {
    classId?: string;
    sectionId?: string;
    search?: string;
  }
) {
  const key = `students:${schoolId}:${filters?.classId || ''}:${filters?.sectionId || ''}:${filters?.search || ''}`;
  return cachedFetch(key, async () => {
    let query = supabase
      .from('students')
      .select('*, class:classes(*), section:sections(*)')
      .eq('school_id', schoolId)
      .order('full_name');

    if (filters?.classId) query = query.eq('class_id', filters.classId);
    if (filters?.sectionId) query = query.eq('section_id', filters.sectionId);
    if (filters?.search) {
      query = query.or(`full_name.ilike.%${filters.search}%,admission_number.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Student[];
  });
}

export async function fetchStudentsBySection(sectionId: string) {
  return cachedFetch(`studentsBySection:${sectionId}`, async () => {
    const { data, error } = await supabase
      .from('students')
      .select('*, class:classes(*), section:sections(*)')
      .eq('section_id', sectionId)
      .eq('status', 'active')
      .order('roll_number');
    if (error) throw error;
    return (data || []) as Student[];
  });
}

export async function ensureParentForStudent(
  student: Student,
  schoolName = 'school'
): Promise<{ parent: Parent | null; credentials: { username: string; password: string }; created: boolean }> {
  try {
    const { data: existingLinks } = await supabase
      .from('parent_students')
      .select('*, parent:parents(*)')
      .eq('student_id', student.id);

    if (existingLinks && existingLinks.length > 0 && existingLinks[0].parent) {
      const p = existingLinks[0].parent as Parent;
      return {
        parent: p,
        credentials: { username: p.email, password: (p as any).password || '******' },
        created: false,
      };
    }

    let activeSchoolName = schoolName;
    if ((!activeSchoolName || activeSchoolName === 'school') && student.school_id) {
      try {
        const { data: sch } = await supabase.from('schools').select('name').eq('id', student.school_id).maybeSingle();
        if (sch?.name) activeSchoolName = sch.name;
      } catch {}
    }

    const creds = generateParentCredentials(student.full_name, student.admission_number || 'ADM', activeSchoolName, student.date_of_birth);
    const parentEmail = creds.username.toLowerCase();

    const parentFullName = (student.father_name && student.father_name.trim())
      ? student.father_name.trim()
      : (student.mother_name && student.mother_name.trim())
      ? student.mother_name.trim()
      : `${student.full_name}'s Parent`;

    const relationship = (student.father_name && student.father_name.trim())
      ? 'Father'
      : (student.mother_name && student.mother_name.trim())
      ? 'Mother'
      : 'Guardian';

    const phone = (student as any).emergency_contact || (student as any).parent_phone || null;
    const address = student.address || null;

    const { data: existingParent } = await supabase
      .from('parents')
      .select('*')
      .eq('school_id', student.school_id)
      .eq('email', parentEmail)
      .maybeSingle();

    let parentId = existingParent?.id;
    let created = false;

    if (!parentId) {
      const { data: directParent, error: directErr } = await supabase
        .from('parents')
        .insert({
          school_id: student.school_id,
          full_name: parentFullName,
          email: parentEmail,
          password: creds.password,
          phone,
          address,
          status: 'active',
        })
        .select()
        .maybeSingle();

      if (!directErr && directParent) {
        parentId = directParent.id;
        created = true;
      }
    }

    if (parentId) {
      await supabase.from('parent_students').insert({
        school_id: student.school_id,
        parent_id: parentId,
        student_id: student.id,
        relationship,
      });
    }

    const { data: finalParent } = parentId
      ? await supabase.from('parents').select('*').eq('id', parentId).maybeSingle()
      : { data: null };

    return {
      parent: (finalParent as Parent) || null,
      credentials: { username: parentEmail, password: creds.password },
      created,
    };
  } catch (err) {
    console.error('ensureParentForStudent error in mobile:', err);
    return {
      parent: null,
      credentials: generateParentCredentials(student.full_name, student.admission_number || 'ADM', schoolName, student.date_of_birth),
      created: false,
    };
  }
}

export async function createStudent(student: {
  school_id: string;
  admission_number: string;
  full_name: string;
  father_name?: string;
  mother_name?: string;
  parent_email?: string;
  parent_phone?: string;
  date_of_birth?: string;
  gender?: string;
  class_id: string;
  section_id: string;
  roll_number?: number;
  address?: string;
  admission_date?: string;
}) {
  const { data, error } = await supabase.from('students').insert(student).select().maybeSingle();
  if (error) throw error;
  invalidateCache('students:');
  invalidateCache('studentsBySection:');
  if (data) {
    try {
      await ensureParentForStudent(data as Student);
    } catch (parentErr) {
      console.warn('Auto-parent creation warning in mobile:', parentErr);
    }
  }
  return data as Student | null;
}

export async function updateStudent(id: string, updates: Partial<Student>) {
  const { data, error } = await supabase.from('students').update(updates).eq('id', id).select().maybeSingle();
  if (error) throw error;
  invalidateCache('students:');
  invalidateCache('studentsBySection:');
  return data as Student | null;
}

export async function deleteStudent(id: string) {
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('students:');
  invalidateCache('studentsBySection:');
}

// ==========================================
// Attendance API
// ==========================================
export async function fetchAttendance(filters: {
  sectionId?: string;
  studentId?: string;
  date?: string;
  schoolId?: string;
}) {
  let query = supabase
    .from('attendance')
    .select('*, student:students(*), section:sections(*)')
    .order('attendance_date', { ascending: false });

  if (filters.sectionId) query = query.eq('section_id', filters.sectionId);
  if (filters.studentId) query = query.eq('student_id', filters.studentId);
  if (filters.date) query = query.eq('attendance_date', filters.date);
  if (filters.schoolId) query = query.eq('school_id', filters.schoolId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Attendance[];
}

export async function upsertAttendance(
  records: {
    school_id: string;
    student_id: string;
    section_id: string;
    teacher_id?: string;
    attendance_date: string;
    status: string;
    notes?: string | null;
  }[]
) {
  const { data, error } = await supabase
    .from('attendance')
    .upsert(records, { onConflict: 'student_id,attendance_date,section_id' })
    .select();
  if (error) throw error;
  return data;
}

// ==========================================
// Student Records / Marks API
// ==========================================
export async function fetchStudentRecords(filters: {
  studentId?: string;
  teacherId?: string;
  schoolId?: string;
  sectionId?: string;
}) {
  let query = supabase
    .from('student_records')
    .select('*, student:students(*), teacher:teachers(*), subject:subjects(*)')
    .order('date', { ascending: false });

  if (filters.studentId) query = query.eq('student_id', filters.studentId);
  if (filters.teacherId) query = query.eq('teacher_id', filters.teacherId);
  if (filters.schoolId) query = query.eq('school_id', filters.schoolId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as StudentRecord[];
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
  teacher_comment?: string | null;
}) {
  const { data, error } = await supabase
    .from('student_records')
    .insert(record)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as StudentRecord | null;
}

export async function deleteStudentRecord(id: string) {
  const { error } = await supabase.from('student_records').delete().eq('id', id);
  if (error) throw error;
}

/** Existing marks for one exam name + subject among the given students. */
export async function fetchRecordsForExamSubject(examName: string, subjectId: string, studentIds: string[]) {
  if (!studentIds.length) return [] as StudentRecord[];
  const { data, error } = await supabase.from('student_records').select('*')
    .eq('subject_id', subjectId).ilike('exam_name', examName).in('student_id', studentIds);
  if (error) throw error;
  return (data || []) as StudentRecord[];
}

/** Sections the signed-in teacher may mark attendance for (class teacher). */
export async function fetchMyAttendanceSections() {
  const { data, error } = await supabase.rpc('my_attendance_sections');
  if (error) throw error;
  return (data || []) as { section_id: string; class_id: string; label: string; is_class_teacher: boolean }[];
}

/** School holidays / declared working days (for calendars). */
export async function fetchHolidays(schoolId: string) {
  const { data, error } = await supabase.from('holidays').select('date, type, label').eq('school_id', schoolId);
  if (error) throw error;
  return (data || []) as { date: string; type: 'holiday' | 'festival' | 'working'; label: string | null }[];
}

// ==========================================
// Teacher self attendance & leave
// ==========================================
export interface StaffAttendanceRow {
  id: string; teacher_id: string; attendance_date: string;
  status: 'present' | 'absent' | 'half_day' | 'leave' | 'late';
  check_in: string | null; check_out: string | null; note: string | null;
}
export interface StaffLeave {
  id: string; teacher_id: string; leave_type: 'full_day' | 'half_day';
  from_date: string; to_date: string; days: number; reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'; review_note: string | null; created_at: string;
}

export async function markMyAttendance(checkOut = false) {
  const { data, error } = await supabase.rpc('mark_my_attendance', { p_check_out: checkOut });
  if (error) throw new Error(error.message);
  return data as StaffAttendanceRow;
}

export async function fetchMyStaffAttendance(teacherId: string, from: string, to: string) {
  const { data, error } = await supabase.from('staff_attendance').select('*')
    .eq('teacher_id', teacherId).gte('attendance_date', from).lte('attendance_date', to).order('attendance_date');
  if (error) throw error;
  return (data || []) as StaffAttendanceRow[];
}

export async function applyLeave(type: 'full_day' | 'half_day', from: string, to: string, reason: string) {
  const { data, error } = await supabase.rpc('apply_leave', { p_type: type, p_from: from, p_to: to, p_reason: reason });
  if (error) throw new Error(error.message);
  return data as StaffLeave;
}

export async function fetchMyLeaves(teacherId: string) {
  const { data, error } = await supabase.from('staff_leaves').select('*').eq('teacher_id', teacherId)
    .order('from_date', { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []) as StaffLeave[];
}

export async function cancelMyLeave(id: string) {
  const { error } = await supabase.rpc('cancel_my_leave', { p_id: id });
  if (error) throw new Error(error.message);
}

/** Datesheet rows for exams (subjects + max marks per class). */
export async function fetchExamScheduleFor(examIds: string[]) {
  if (!examIds.length) return [] as { exam_id: string; class_id: string; subject_id: string; max_marks: number }[];
  const { data, error } = await supabase.from('exam_schedule').select('exam_id, class_id, subject_id, max_marks').in('exam_id', examIds);
  if (error) throw error;
  return (data || []) as { exam_id: string; class_id: string; subject_id: string; max_marks: number }[];
}

// ==========================================
// Online payments (Razorpay payment links via the `payments` edge function)
// ==========================================
export function onlineCharges(feeRupees: number) {
  const fee = Math.round(feeRupees * 100);
  const convenience = Math.round(fee * 0.02);
  const gst = Math.round(convenience * 0.18);
  const extra = convenience + gst + 500;
  return { fee: fee / 100, extra: extra / 100, total: (fee + extra) / 100 };
}

async function paymentsCall<T>(payload: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Payment service is unavailable. Please try again.');
  return body as T;
}

export async function fetchGatewayActive() {
  const { data } = await supabase.rpc('payment_gateway_status');
  return !!(data as { active?: boolean } | null)?.active;
}

export const createPaymentLink = (params: { allocations: { fee_id: string; amount: number }[]; next_due_dates?: Record<string, string> }) =>
  paymentsCall<{ online_payment_id: string; link_url: string; amount: number }>({ action: 'create', channel: 'link', ...params });

export const reconcilePayments = () => paymentsCall<{ applied: number; pending: number }>({ action: 'reconcile' });

/** Convenience charge (₹) paid on top of the fee for an online receipt. */
export async function fetchConvenienceForReceipt(receiptNumber: string | null | undefined) {
  if (!receiptNumber?.startsWith('ONL-')) return null;
  const { data } = await supabase.from('online_payments').select('fee_amount, total_amount').eq('receipt_number', receiptNumber).maybeSingle();
  if (!data) return null;
  return { extra: (Number(data.total_amount) - Number(data.fee_amount)) / 100, total: Number(data.total_amount) / 100 };
}

export const checkOnlinePayment = (onlinePaymentId: string) =>
  paymentsCall<{ status: 'paid' | 'pending' | 'expired'; receipt_number?: string }>({ action: 'check', online_payment_id: onlinePaymentId });

// ==========================================
// Exam Definitions API
// ==========================================
export async function fetchExamDefs(filters?: { sectionId?: string; schoolId?: string }) {
  let query = supabase.from('exam_defs').select('*').order('date', { ascending: false });
  if (filters?.sectionId) query = query.eq('section_id', filters.sectionId);
  if (filters?.schoolId) query = query.eq('school_id', filters.schoolId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ExamDef[];
}

export async function createExamDef(def: {
  exam_name: string;
  record_type: string;
  max_marks: number;
  section_id: string;
  date: string;
  school_id: string;
  created_by_teacher_id: string;
}) {
  const { data, error } = await supabase.from('exam_defs').insert(def).select().maybeSingle();
  if (error) throw error;
  return data as ExamDef | null;
}

export async function deleteExamDef(id: string) {
  const { error } = await supabase.from('exam_defs').delete().eq('id', id);
  if (error) throw error;
}

// ==========================================
// Remarks API
// ==========================================
export async function fetchRemarks(filters: {
  studentId?: string;
  teacherId?: string;
  schoolId?: string;
}) {
  let query = supabase
    .from('remarks')
    .select('*, student:students(*), teacher:teachers(*)')
    .order('created_at', { ascending: false });

  if (filters.studentId) query = query.eq('student_id', filters.studentId);
  if (filters.teacherId) query = query.eq('teacher_id', filters.teacherId);
  if (filters.schoolId) query = query.eq('school_id', filters.schoolId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Remark[];
}

export async function createRemark(remark: {
  school_id: string;
  student_id: string;
  teacher_id: string;
  category: string;
  visibility: string;
  remark: string;
}) {
  const { data, error } = await supabase
    .from('remarks')
    .insert(remark)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Remark | null;
}

export async function deleteRemark(id: string) {
  const { error } = await supabase.from('remarks').delete().eq('id', id);
  if (error) throw error;
}

// ==========================================
// Fees API
// ==========================================

export async function fetchFees(filters: {
  schoolId?: string;
  studentId?: string;
  status?: string;
}) {
  let query = supabase
    .from('fees')
    .select('*, student:students(*, class:classes(*), section:sections(*))')
    .order('due_date', { ascending: false });

  if (filters.schoolId) query = query.eq('school_id', filters.schoolId);
  if (filters.studentId) query = query.eq('student_id', filters.studentId);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw error;
  // Always the database's values.
  return (data || []) as Fee[];
}

export async function fetchFeeTypes(schoolId: string) {
  const { data, error } = await supabase
    .from('fee_types')
    .select('*')
    .eq('school_id', schoolId)
    .order('name');
  if (error) throw error;
  return (data || []) as FeeType[];
}

export async function updateFee(id: string, updates: Partial<Fee>) {
  // Never pass remaining_amount to Postgres UPDATE because remaining_amount is GENERATED ALWAYS AS (amount - paid_amount)
  const { remaining_amount, student, ...dbUpdates } = updates as Partial<Fee> & { student?: unknown };
  try {
    const { data, error } = await supabase
      .from('fees')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data as Fee | null;
  } catch {
    return { id, ...updates } as Fee;
  }
}

// ==========================================
// Notifications API
// ==========================================
/**
 * Notifications visible to the signed-in user (RLS decides which), with
 * per-user read state. Covers school-wide, class/section and child-specific
 * notices as well as ones addressed to the user directly.
 */
export async function fetchMyNotifications(limit = 100) {
  const { data, error } = await supabase.rpc('fetch_my_notifications', { p_limit: limit });
  if (error) throw error;
  return (data || []) as Notification[];
}

/** @deprecated use fetchMyNotifications — kept for older call sites. */
export async function fetchNotifications(_userId?: string, _schoolId?: string) {
  return fetchMyNotifications();
}

export async function fetchUnreadNotificationCount() {
  const list = await fetchMyNotifications(200);
  return list.filter((n) => !n.is_read).length;
}

export async function createNotification(notification: {
  school_id: string;
  title: string;
  message: string;
  type?: string;
  audience?: 'class' | 'section' | 'student';
  class_id?: string | null;
  section_id?: string | null;
  student_id?: string | null;
  category?: string;
  priority?: 'normal' | 'high' | 'urgent';
  entity_type?: string | null;
  entity_id?: string | null;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('notifications')
    .insert({ ...notification, sent_by: auth.user?.id ?? null })
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data?.id) {
    supabase.functions.invoke('push-dispatch', { body: { notification_id: data.id } }).catch(() => {});
  }
  return data as Notification | null;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: [id] });
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
}

export async function fetchNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as NotificationPreferences | null) ?? { user_id: userId, muted_categories: [], push_enabled: true };
}

export async function saveNotificationPreferences(prefs: NotificationPreferences) {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

// ==========================================
// Profile API
// ==========================================
export async function updateProfile(id: string, updates: Partial<Profile>) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

// ==========================================
// Transport API
// ==========================================
const mobileTransportApplications = new Map<string, Record<string, StudentTransportAssignment>>();

export async function fetchSchoolTransportData(schoolId: string): Promise<{
  buses: TransportBus[];
  stops: TransportStop[];
  assignments: Record<string, StudentTransportAssignment>;
}> {
  const localApps = mobileTransportApplications.get(schoolId) || {};
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('settings')
      .eq('id', schoolId)
      .maybeSingle();
    if (error) throw error;
    const settings = (data?.settings || {}) as Record<string, unknown>;
    const rawBuses = Array.isArray(settings.transport_buses)
      ? (settings.transport_buses as TransportBus[])
      : [];
    const rawStops = Array.isArray(settings.transport_stops)
      ? (settings.transport_stops as TransportStop[])
      : [];

    let buses = [...rawBuses];
    if (buses.length === 0 && rawStops.length > 0) {
      const grouped = new Map<string, TransportStop[]>();
      rawStops.forEach((st) => {
        const key = st.bus_number || 'Bus 01';
        const list = grouped.get(key) || [];
        list.push(st);
        grouped.set(key, list);
      });
      buses = Array.from(grouped.entries()).map(([busNo, stList], idx) => ({
        id: `bus-legacy-${idx + 1}`,
        bus_number: busNo,
        route_name: stList[0]?.route_name || `Route ${idx + 1}`,
        driver_name: stList[0]?.driver_name,
        driver_phone: stList[0]?.driver_phone,
        total_stops: stList.length,
        stops: stList.map((s, sIdx) => ({
          ...s,
          bus_id: `bus-legacy-${idx + 1}`,
          bus_number: busNo,
          stop_order: sIdx + 1,
        })),
        created_at: stList[0]?.created_at || new Date().toISOString(),
      }));
    }

    const allStops: TransportStop[] = [];
    buses.forEach((b) => {
      (b.stops || []).forEach((s, idx) => {
        allStops.push({
          ...s,
          bus_id: b.id,
          bus_number: b.bus_number,
          route_name: b.route_name,
          driver_name: s.driver_name || b.driver_name,
          driver_phone: s.driver_phone || b.driver_phone,
          stop_order: s.stop_order ?? idx + 1,
        });
      });
    });

    const dbAssignments =
      settings.student_transport && typeof settings.student_transport === 'object'
        ? (settings.student_transport as Record<string, StudentTransportAssignment>)
        : {};

    const finalAssignments: Record<string, StudentTransportAssignment> = {
      ...localApps,
      ...dbAssignments,
    };

    try {
      const { data: appLogs } = await supabase
        .from('audit_logs')
        .select('entity_id, metadata, created_at')
        .eq('school_id', schoolId)
        .eq('action', 'transport_application')
        .order('created_at', { ascending: true });

      if (appLogs && appLogs.length > 0) {
        for (const row of appLogs) {
          const meta = row.metadata as unknown as StudentTransportAssignment | null;
          const stuId = meta?.student_id || row.entity_id;
          if (stuId && meta && meta.stop_id) {
            const existing = finalAssignments[stuId];
            if (
              !existing ||
              new Date(meta.assigned_at || row.created_at).getTime() >
                new Date(existing.assigned_at || 0).getTime()
            ) {
              finalAssignments[stuId] = meta;
            }
          }
        }
      }
    } catch {
      // ignore
    }

    return {
      buses,
      stops: allStops.length > 0 ? allStops : rawStops,
      assignments: finalAssignments,
    };
  } catch {
    return { buses: [], stops: [], assignments: localApps };
  }
}

export async function applyForTransport(
  schoolId: string,
  assignment: StudentTransportAssignment
): Promise<StudentTransportAssignment> {
  const payload: StudentTransportAssignment = {
    ...assignment,
    status: assignment.status || 'pending',
    applied_by_parent: true,
    assigned_at: new Date().toISOString(),
  };

  const currentMap = mobileTransportApplications.get(schoolId) || {};
  currentMap[payload.student_id] = payload;
  mobileTransportApplications.set(schoolId, currentMap);

  try {
    await supabase.from('audit_logs').insert({
      school_id: schoolId,
      action: 'transport_application',
      entity_type: 'student_transport',
      entity_id: payload.student_id,
      metadata: payload as unknown as Record<string, unknown>,
    });
  } catch {
    // ignore
  }

  try {
    const { data: currentSchool } = await supabase
      .from('schools')
      .select('settings')
      .eq('id', schoolId)
      .maybeSingle();

    const existingSettings =
      currentSchool?.settings && typeof currentSchool.settings === 'object'
        ? (currentSchool.settings as Record<string, unknown>)
        : {};
    const existingStudentTransport =
      existingSettings.student_transport && typeof existingSettings.student_transport === 'object'
        ? (existingSettings.student_transport as Record<string, StudentTransportAssignment>)
        : {};

    await updateSchool(schoolId, {
      settings: {
        ...existingSettings,
        student_transport: {
          ...existingStudentTransport,
          [payload.student_id]: payload,
        },
      },
    });
  } catch {
    // ignore if RLS blocks direct school update by parent
  }

  return payload;
}
