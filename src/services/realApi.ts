import { supabase } from '@/lib/supabase';
export { generateSubjectCode } from '@/lib/subjectUtils';
import { generateSubjectCode } from '@/lib/subjectUtils';
import { generateParentCredentials } from '@/lib/parentUtils';
import type {
  Teacher, Parent, Student, Class, Section, Subject,
  ClassAssignment, TeacherSchedule, Attendance, StudentRecord,
  Remark, FeeType, Fee, FeePayment, Notification, AuditLog,
  ParentStudent, School, Profile,
  Holiday, ExamDef, FeeStructure, PaymentSetup,
  TransportStop, TransportBus, StudentTransportAssignment,
  AdmissionFeeLineItem, AdmissionDiscount, AdmissionPaymentOption,
  AdmissionPaymentMode, AdmissionReceipt,
} from '@/types';

// Lightweight in-memory cache with TTL and in-flight request deduplication
const apiCache = new Map<string, { data: unknown; expiresAt: number }>();
const inFlight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL_MS = 60_000; // 60 seconds

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

export interface AdminDashboardData {
  stats: {
    totalStudents: number;
    totalTeachers: number;
    totalClasses: number;
    totalParents: number;
    todayPresent: number;
    todayAbsent: number;
    todayTotal: number;
    pendingFees: number;
    collectedFees: number;
    outstandingFees: number;
  };
  attendanceTrend: { date: string; present: number; absent: number }[];
}

export async function fetchAdminDashboardData(schoolId: string): Promise<AdminDashboardData> {
  return cachedFetch(`adminDashboard:${schoolId}`, async () => {
    const dates: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const todayStr = new Date().toISOString().split('T')[0];

    const [students, teachers, classes, parents, todayAttendance, fees, trendRes] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
      supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
      supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      supabase.from('parents').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
      supabase.from('attendance').select('status').eq('school_id', schoolId).eq('attendance_date', todayStr),
      supabase.from('fees').select('amount, paid_amount, status').eq('school_id', schoolId),
      supabase.from('attendance').select('attendance_date, status').eq('school_id', schoolId).in('attendance_date', dates),
    ]);

    const todayPresent = todayAttendance.data?.filter((a: { status: string }) => a.status === 'present').length || 0;
    const todayAbsent = todayAttendance.data?.filter((a: { status: string }) => a.status === 'absent').length || 0;
    const collected = fees.data?.reduce((sum: number, f: { paid_amount: number }) => sum + Number(f.paid_amount), 0) || 0;
    const outstanding = fees.data?.reduce((sum: number, f: { amount: number; paid_amount: number }) => sum + (Number(f.amount) - Number(f.paid_amount)), 0) || 0;
    const pendingCount = fees.data?.filter((f: { status: string }) => f.status === 'pending').length || 0;

    const trendRows = trendRes.data;
    const attendanceTrend = dates.map((date) => {
      const dayRows = trendRows?.filter((r) => r.attendance_date === date) || [];
      const present = dayRows.filter((r) => r.status === 'present').length;
      const absent = dayRows.filter((r) => r.status === 'absent').length;
      return { date, present, absent };
    });

    return {
      stats: {
        totalStudents: students.count || 0,
        totalTeachers: teachers.count || 0,
        totalClasses: classes.count || 0,
        totalParents: parents.count || 0,
        todayPresent,
        todayAbsent,
        todayTotal: todayAttendance.data?.length || 0,
        pendingFees: pendingCount,
        collectedFees: collected,
        outstandingFees: outstanding,
      },
      attendanceTrend,
    };
  }, 45_000);
}

const SCHOOL_STORAGE_PREFIX = 'veducore_cached_school:';

export function getCachedSchoolSync(schoolId?: string | null): School | null {
  if (!schoolId) return null;
  const mem = apiCache.get(`school:${schoolId}`);
  if (mem && mem.expiresAt > Date.now() && mem.data) {
    return mem.data as School;
  }
  try {
    const raw = sessionStorage.getItem(`${SCHOOL_STORAGE_PREFIX}${schoolId}`);
    return raw ? (JSON.parse(raw) as School) : null;
  } catch {
    return null;
  }
}

function setCachedSchoolSync(schoolId: string, school: School | null) {
  try {
    if (school) {
      sessionStorage.setItem(`${SCHOOL_STORAGE_PREFIX}${schoolId}`, JSON.stringify(school));
    } else {
      sessionStorage.removeItem(`${SCHOOL_STORAGE_PREFIX}${schoolId}`);
    }
  } catch {
    // ignore storage quota errors
  }
}

export async function fetchSchool(schoolId: string) {
  return cachedFetch(`school:${schoolId}`, async () => {
    const { data, error } = await supabase.from('schools').select('*').eq('id', schoolId).maybeSingle();
    if (error) throw error;
    const school = data as School | null;
    setCachedSchoolSync(schoolId, school);
    return school;
  }, 5 * 60_000);
}

export async function updateSchool(schoolId: string, updates: Partial<School>) {
  const { data, error } = await supabase.from('schools').update(updates).eq('id', schoolId).select().maybeSingle();
  if (error) throw error;
  invalidateCache(`school:${schoolId}`);
  const school = data as School | null;
  setCachedSchoolSync(schoolId, school);
  return school;
}

export async function fetchTeachers(schoolId: string) {
  return cachedFetch(`teachers:${schoolId}`, async () => {
    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('school_id', schoolId)
      .order('full_name');
    if (error) throw error;
    return data as Teacher[];
  });
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
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email: params.email,
        password: params.password,
        full_name: params.full_name,
        role: 'teacher',
        school_id: params.school_id,
        phone: params.phone,
        extra: {
          employee_id: params.employee_id,
          qualification: params.qualification,
          subject: params.subject,
          date_of_joining: params.date_of_joining,
        },
      }),
    }
  );

    const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Failed to create teacher account');
  if (params.password) {
    try {
      await supabase
        .from('teachers')
        .update({ password: params.password })
        .eq('school_id', params.school_id)
        .eq('email', params.email);
    } catch {
      // fallback
    }
  }
  invalidateCache(`teachers:${params.school_id}`);
  invalidateCache(`adminDashboard:${params.school_id}`);
  return result;
}

export async function createParentAccount(params: {
  email: string;
  password: string;
  full_name: string;
  school_id: string;
  phone?: string;
  occupation?: string;
  address?: string;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email: params.email,
        password: params.password,
        full_name: params.full_name,
        role: 'parent',
        school_id: params.school_id,
        phone: params.phone,
        extra: {
          occupation: params.occupation,
          address: params.address,
        },
      }),
    }
  );

  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Failed to create parent account');
  if (params.password) {
    try {
      await supabase
        .from('parents')
        .update({ password: params.password })
        .eq('school_id', params.school_id)
        .eq('email', params.email);
    } catch {
      // fallback
    }
  }
  invalidateCache(`parents:${params.school_id}`);
  invalidateCache(`adminDashboard:${params.school_id}`);
  return result;
}

export async function updateTeacher(id: string, updates: Partial<Teacher>) {
  const { data, error } = await supabase.from('teachers').update(updates).eq('id', id).select().maybeSingle();
  if (error) throw error;
  invalidateCache('teachers:');
  invalidateCache('teacherByUser:');
  invalidateCache('adminDashboard:');
  return data as Teacher | null;
}

export async function deleteTeacher(id: string) {
  const { error } = await supabase.from('teachers').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('teachers:');
  invalidateCache('teacherByUser:');
  invalidateCache('adminDashboard:');
}

export async function fetchParents(schoolId: string) {
  return cachedFetch(`parents:${schoolId}`, async () => {
    try {
      const { data, error } = await supabase
        .from('parents')
        .select('*, parent_students(*, student:students(*, class:classes(*), section:sections(*)))')
        .eq('school_id', schoolId)
        .order('full_name');
      if (!error && data) return data as Parent[];
    } catch {
      // fallback if relationship join is restricted
    }

    const { data, error } = await supabase
      .from('parents')
      .select('*')
      .eq('school_id', schoolId)
      .order('full_name');
    if (error) throw error;
    return data as Parent[];
  });
}

export async function updateParent(id: string, updates: Partial<Parent>) {
  const { data, error } = await supabase.from('parents').update(updates).eq('id', id).select().maybeSingle();
  if (error) throw error;

  // Sync phone and address to linked students in database
  if (updates.phone !== undefined || updates.address !== undefined) {
    try {
      const { data: links } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', id);

      if (links && links.length > 0) {
        const studentIds = links.map((l) => l.student_id);
        const studentUpdates: Record<string, any> = {};
        if (updates.phone !== undefined) studentUpdates.emergency_contact = updates.phone;
        if (updates.address !== undefined) studentUpdates.address = updates.address;

        await supabase
          .from('students')
          .update(studentUpdates)
          .in('id', studentIds);
      }
    } catch (syncErr) {
      console.warn('Syncing parent update to student warning:', syncErr);
    }
  }

  invalidateCache('parents:');
  invalidateCache('parentByUser:');
  invalidateCache('students:');
  return data as Parent | null;
}

export async function deleteParent(id: string) {
  const { error } = await supabase.from('parents').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('parents:');
  invalidateCache('parentByUser:');
  invalidateCache('adminDashboard:');
}

export async function fetchStudents(schoolId: string, filters?: {
  classId?: string;
  sectionId?: string;
  search?: string;
}) {
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
    return data as Student[];
  });
}

export async function fetchStudentById(id: string) {
  const { data, error } = await supabase
    .from('students')
    .select('*, class:classes(*), section:sections(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Student | null;
}

export async function ensureParentForStudent(
  student: Student,
  schoolName = 'school'
): Promise<{ parent: Parent | null; credentials: { username: string; password: string }; created: boolean }> {
  try {
    // 1. Check if this student is already linked to a parent
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

    // 2. Generate credentials & determine fields
    let activeSchoolName = schoolName;
    if ((!activeSchoolName || activeSchoolName === 'school') && student.school_id) {
      try {
        const { data: sch } = await supabase.from('schools').select('name').eq('id', student.school_id).maybeSingle();
        if (sch?.name) activeSchoolName = sch.name;
      } catch {
        // fallback
      }
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

    const phone = (student as any).emergency_contact || null;
    const address = student.address || null;

    // 3. Check if parent already exists with this email in the school
    const { data: existingParent } = await supabase
      .from('parents')
      .select('*')
      .eq('school_id', student.school_id)
      .eq('email', parentEmail)
      .maybeSingle();

    let parentId = existingParent?.id;
    let created = false;

    if (!parentId) {
      // Attempt edge function to create auth user + profile + parent
      try {
        await createParentAccount({
          email: parentEmail,
          password: creds.password,
          full_name: parentFullName,
          school_id: student.school_id,
          phone: phone || undefined,
          address: address || undefined,
        });
        created = true;
      } catch (authErr) {
        // Fallback: direct insert into parents table
        console.warn('createParentAccount auth fallback, creating direct parent record:', authErr);
      }

      // Check or fetch parent record
      const { data: createdParent } = await supabase
        .from('parents')
        .select('*')
        .eq('school_id', student.school_id)
        .eq('email', parentEmail)
        .maybeSingle();

      if (createdParent) {
        parentId = createdParent.id;
        created = true;
      } else {
        // Direct insert into parents table if edge function couldn't create it
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

        if (directErr) {
          console.error('Direct parent insert error:', directErr);
        } else if (directParent) {
          parentId = directParent.id;
          created = true;
        }
      }
    }

    // 4. Link parent to student in parent_students table
    if (parentId) {
      const { error: linkErr } = await supabase
        .from('parent_students')
        .insert({
          school_id: student.school_id,
          parent_id: parentId,
          student_id: student.id,
          relationship,
        });

      if (linkErr && linkErr.code !== '23505') {
        console.error('Failed to link parent to student:', linkErr);
      }
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
    console.error('ensureParentForStudent error:', err);
    return {
      parent: null,
      credentials: generateParentCredentials(student.full_name, student.admission_number || 'ADM', schoolName, student.date_of_birth),
      created: false,
    };
  }
}

export async function createStudent(student: Partial<Student> & { school_id: string; admission_number: string; full_name: string }) {
  const { data, error } = await supabase.from('students').insert(student).select().maybeSingle();
  if (error) throw error;
  invalidateCache('students:');
  invalidateCache('studentsBySection:');
  invalidateCache('parents:');
  invalidateCache('adminDashboard:');
  let parentResult: { parent: Parent | null; credentials: { username: string; password: string }; created: boolean } | null = null;
  if (data) {
    // Automatically ensure parent account exists and is linked
    try {
      parentResult = await ensureParentForStudent(data as Student);
    } catch (parentErr) {
      console.warn('Auto-parent creation warning:', parentErr);
    }
  }
  if (data && parentResult) {
    return { ...(data as Student), _parentResult: parentResult } as Student & { _parentResult?: typeof parentResult };
  }
  return data as Student | null;
}

export async function updateStudent(id: string, updates: Partial<Student>) {
  const { data, error } = await supabase.from('students').update(updates).eq('id', id).select().maybeSingle();
  if (error) throw error;
  invalidateCache('students:');
  invalidateCache('studentsBySection:');
  invalidateCache('parentStudents:');
  invalidateCache('adminDashboard:');
  return data as Student | null;
}

export async function deleteStudent(id: string) {
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('students:');
  invalidateCache('studentsBySection:');
  invalidateCache('parentStudents:');
  invalidateCache('adminDashboard:');
}

export async function fetchClasses(schoolId: string) {
  return cachedFetch(`classes:${schoolId}`, async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('*, sections(*)')
      .eq('school_id', schoolId)
      .order('grade_level');
    if (error) throw error;
    return data as (Class & { sections: Section[] })[];
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

export async function updateClass(id: string, updates: Partial<Class>) {
  const { data, error } = await supabase.from('classes').update(updates).eq('id', id).select().maybeSingle();
  if (error) throw error;
  invalidateCache('classes:');
  return data as Class | null;
}

export async function deleteClass(id: string) {
  const { error } = await supabase.from('classes').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('classes:');
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

export async function deleteSection(id: string) {
  const { error } = await supabase.from('sections').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('classes:');
}

export async function fetchSubjects(schoolId: string) {
  return cachedFetch(`subjects:${schoolId}`, async () => {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('school_id', schoolId)
      .order('name');
    if (error) throw error;
    return data as Subject[];
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

export async function deleteSubject(id: string) {
  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('subjects:');
}

export async function fetchClassAssignments(schoolId: string) {
  const { data, error } = await supabase
    .from('class_assignments')
    .select('*, teacher:teachers(*), class:classes(*), section:sections(*), subject:subjects(*)')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ClassAssignment[];
}

export async function createClassAssignment(assignment: {
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
  subject_id: string;
}) {
  const { data, error } = await supabase
    .from('class_assignments')
    .insert(assignment)
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateCache('teacherAssignments:');
  return data as ClassAssignment | null;
}

export async function deleteClassAssignment(id: string) {
  const { error } = await supabase.from('class_assignments').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('teacherAssignments:');
}

export async function fetchTeacherSchedules(schoolId: string) {
  const { data, error } = await supabase
    .from('teacher_schedules')
    .select('*, teacher:teachers(*), class:classes(*), section:sections(*), subject:subjects(*)')
    .eq('school_id', schoolId)
    .order('day_of_week')
    .order('start_time');
  if (error) throw error;
  return data as TeacherSchedule[];
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
  invalidateCache('teacherSchedulesByTeacher:');
  return data as TeacherSchedule | null;
}

export async function deleteTeacherSchedule(id: string) {
  const { error } = await supabase.from('teacher_schedules').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('teacherSchedulesByTeacher:');
}

// Teacher-specific: get their assigned sections
export async function fetchTeacherAssignments(teacherId: string) {
  return cachedFetch(`teacherAssignments:${teacherId}`, async () => {
    const { data, error } = await supabase
      .from('class_assignments')
      .select('*, class:classes(*), section:sections(*), subject:subjects(*)')
      .eq('teacher_id', teacherId);
    if (error) throw error;
    return data as ClassAssignment[];
  });
}

export async function fetchTeacherScheduleByTeacher(teacherId: string) {
  return cachedFetch(`teacherSchedulesByTeacher:${teacherId}`, async () => {
    const { data, error } = await supabase
      .from('teacher_schedules')
      .select('*, class:classes(*), section:sections(*), subject:subjects(*)')
      .eq('teacher_id', teacherId)
      .order('day_of_week')
      .order('start_time');
    if (error) throw error;
    return data as TeacherSchedule[];
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
    return data as Student[];
  });
}

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
  return data as Attendance[];
}

export async function upsertAttendance(records: {
  school_id: string;
  student_id: string;
  section_id: string;
  teacher_id?: string;
  attendance_date: string;
  status: string;
  notes?: string;
}[]) {
  const { data, error } = await supabase
    .from('attendance')
    .upsert(records, { onConflict: 'student_id,attendance_date,section_id' })
    .select();
  if (error) throw error;
  return data;
}

export async function fetchStudentRecords(filters: {
  studentId?: string;
  teacherId?: string;
  schoolId?: string;
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
  return data as StudentRecord[];
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
  return data as Remark[];
}

export async function createRemark(remark: {
  school_id: string;
  student_id: string;
  teacher_id: string;
  category: string;
  remark: string;
  visibility: string;
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

export async function fetchFeeTypes(schoolId: string) {
  const { data, error } = await supabase
    .from('fee_types')
    .select('*')
    .eq('school_id', schoolId)
    .order('name');
  if (error) throw error;
  return data as FeeType[];
}

export async function createFeeType(schoolId: string, name: string, description: string, defaultAmount: number) {
  const { data, error } = await supabase
    .from('fee_types')
    .insert({ school_id: schoolId, name, description, default_amount: defaultAmount })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as FeeType | null;
}

const LOCAL_FEE_OVERRIDES_KEY = 'veducore_local_fee_overrides';

function getLocalFeeOverrides(): Record<string, Partial<Fee>> {
  try {
    const raw = localStorage.getItem(LOCAL_FEE_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalFeeOverride(feeId: string, override: Partial<Fee>) {
  try {
    const all = getLocalFeeOverrides();
    all[feeId] = { ...(all[feeId] || {}), ...override };
    localStorage.setItem(LOCAL_FEE_OVERRIDES_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

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
  const overrides = getLocalFeeOverrides();
  return ((data || []) as Fee[]).map((f) => {
    const ov = overrides[f.id];
    if (ov && Number(ov.paid_amount ?? 0) > Number(f.paid_amount ?? 0)) {
      const mergedPaid = Math.min(Number(f.amount), Number(ov.paid_amount));
      const mergedRem = Math.max(0, Number(f.amount) - mergedPaid);
      return {
        ...f,
        ...ov,
        paid_amount: mergedPaid,
        remaining_amount: mergedRem,
        status: (mergedRem <= 0 ? 'paid' : 'partially_paid') as Fee['status'],
      };
    }
    return f;
  });
}

export async function createFee(fee: {
  school_id: string;
  student_id: string;
  fee_type_id?: string;
  fee_type: string;
  amount: number;
  due_date: string;
  status?: string;
}) {
  const { data, error } = await supabase
    .from('fees')
    .insert(fee)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Fee | null;
}

export async function recordFeePayment(feeId: string, payment: {
  school_id: string;
  student_id: string;
  amount: number;
  payment_date: string;
  payment_method?: string;
  receipt_number?: string;
  recorded_by?: string;
  next_due_date?: string;
}) {
  const effectiveReceipt =
    payment.receipt_number?.trim() ||
    `RCP-${Math.floor(100000 + Math.random() * 900000)}`;
  const effectiveMethod = payment.payment_method?.trim() || 'Cash';
  const { next_due_date, ...paymentRow } = {
    ...payment,
    receipt_number: effectiveReceipt,
    payment_method: effectiveMethod,
  };
  let insertedPayment: FeePayment | null = null;
  try {
    const { data } = await supabase
      .from('fee_payments')
      .insert({ ...paymentRow, fee_id: feeId })
      .select()
      .maybeSingle();
    insertedPayment = data as FeePayment | null;
  } catch {
    // fallback if parent RLS on fee_payments is not yet applied
  }

  // Update fee record
  const { data: fee } = await supabase.from('fees').select('*').eq('id', feeId).maybeSingle();
  const overrides = getLocalFeeOverrides();
  const basePaid = Math.max(
    Number((fee as Fee | null)?.paid_amount ?? 0),
    Number(overrides[feeId]?.paid_amount ?? 0)
  );
  const totalAmt = Number((fee as Fee | null)?.amount ?? payment.amount);
  const newPaid = Math.min(totalAmt, basePaid + Number(payment.amount));
  const newRemaining = Math.max(0, totalAmt - newPaid);
  const newStatus = newPaid >= totalAmt ? 'paid' : newPaid > 0 ? 'partially_paid' : 'pending';
  const updatedDueDate = next_due_date && newStatus !== 'paid'
    ? next_due_date
    : (fee as Fee | null)?.due_date;

  setLocalFeeOverride(feeId, {
    paid_amount: newPaid,
    remaining_amount: newRemaining,
    status: newStatus,
    payment_date: payment.payment_date,
    payment_method: effectiveMethod,
    receipt_number: effectiveReceipt,
    ...(updatedDueDate ? { due_date: updatedDueDate } : {}),
  });

  try {
    await supabase.from('fees').update({
      paid_amount: newPaid,
      status: newStatus,
      payment_date: payment.payment_date,
      payment_method: effectiveMethod,
      receipt_number: effectiveReceipt,
      ...(updatedDueDate ? { due_date: updatedDueDate } : {}),
    }).eq('id', feeId);
  } catch {
    // local override already saved
  }

  return insertedPayment;
}

export async function deleteFee(id: string) {
  const { error } = await supabase.from('fees').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchNotifications(userId?: string, schoolId?: string) {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });

  if (userId) query = query.eq('user_id', userId);
  if (schoolId) query = query.eq('school_id', schoolId);

  const { data, error } = await query;
  if (error) throw error;
  return data as Notification[];
}

export async function createNotification(notification: {
  school_id: string;
  user_id?: string;
  title: string;
  message: string;
  type?: string;
}) {
  const { data, error } = await supabase
    .from('notifications')
    .insert(notification)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Notification | null;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchAuditLogs(schoolId: string) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as AuditLog[];
}

export async function fetchParentStudents(parentId: string) {
  return cachedFetch(`parentStudents:${parentId}`, async () => {
    const { data, error } = await supabase
      .from('parent_students')
      .select('*, student:students(*, class:classes(*), section:sections(*)), parent:parents(*)')
      .eq('parent_id', parentId);
    if (error) throw error;
    return data as (ParentStudent & { student: Student })[];
  });
}

export async function linkParentStudent(schoolId: string, parentId: string, studentId: string, relationship: string) {
  const { data, error } = await supabase
    .from('parent_students')
    .insert({ school_id: schoolId, parent_id: parentId, student_id: studentId, relationship })
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateCache(`parentStudents:${parentId}`);
  return data as ParentStudent | null;
}

export async function unlinkParentStudent(id: string) {
  const { error } = await supabase.from('parent_students').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('parentStudents:');
}

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

// Helper to get current user's teacher record
export async function fetchTeacherByUserId(userId: string) {
  return cachedFetch(`teacherByUser:${userId}`, async () => {
    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data as Teacher | null;
  }, 5 * 60_000);
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

export async function fetchTeacherProfileForDisplay(teacherId: string) {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', teacherId)
    .maybeSingle();
  if (error) throw error;
  return data as Teacher | null;
}

// Fetch class teacher for a section (assignment with no subject = class teacher)
export async function fetchClassTeacherForSection(sectionId: string) {
  const { data, error } = await supabase
    .from('class_assignments')
    .select('*, teacher:teachers(*)')
    .eq('section_id', sectionId)
    .is('subject_id', null)
    .maybeSingle();
  if (error) throw error;
  return data as (ClassAssignment & { teacher: Teacher }) | null;
}

// Assign a class teacher to a section (upsert: delete old null-subject entry first)
export async function assignClassTeacher(params: {
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
}) {
  // Remove existing class-teacher entry for this section
  await supabase
    .from('class_assignments')
    .delete()
    .eq('section_id', params.section_id)
    .is('subject_id', null);

  const { data, error } = await supabase
    .from('class_assignments')
    .insert({ ...params, subject_id: null, is_class_teacher: true })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ClassAssignment | null;
}

export async function removeClassTeacher(sectionId: string) {
  const { error } = await supabase
    .from('class_assignments')
    .delete()
    .eq('section_id', sectionId)
    .is('subject_id', null);
  if (error) throw error;
}

// Fetch all subject-teacher assignments for a section (subject_id NOT null)
export async function fetchSubjectAssignmentsForSection(sectionId: string) {
  const { data, error } = await supabase
    .from('class_assignments')
    .select('*, teacher:teachers(*), subject:subjects(*)')
    .eq('section_id', sectionId)
    .not('subject_id', 'is', null);
  if (error) throw error;
  return data as (ClassAssignment & { teacher: Teacher; subject: Subject })[];
}

// Assign a subject teacher to a section (upsert by section+subject)
export async function assignSubjectTeacher(params: {
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
  subject_id: string;
}) {
  // Remove existing entry for same section+subject first
  await supabase
    .from('class_assignments')
    .delete()
    .eq('section_id', params.section_id)
    .eq('subject_id', params.subject_id);

  const { data, error } = await supabase
    .from('class_assignments')
    .insert(params)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ClassAssignment | null;
}

export async function removeSubjectTeacher(sectionId: string, subjectId: string) {
  const { error } = await supabase
    .from('class_assignments')
    .delete()
    .eq('section_id', sectionId)
    .eq('subject_id', subjectId);
  if (error) throw error;
}

// ============================================================
// HOLIDAYS
// ============================================================
export async function fetchHolidays(schoolId: string) {
  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .eq('school_id', schoolId)
    .order('date');
  if (error) throw error;
  return data as Holiday[];
}

export async function createHoliday(holiday: {
  school_id: string;
  date: string;
  type: 'working' | 'holiday' | 'festival';
  label?: string | null;
}) {
  const { data, error } = await supabase
    .from('holidays')
    .insert(holiday)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Holiday | null;
}

export async function updateHoliday(id: string, updates: Partial<Holiday>) {
  const { data, error } = await supabase
    .from('holidays')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Holiday | null;
}

export async function deleteHoliday(id: string) {
  const { error } = await supabase.from('holidays').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// EXAM DEFS
// ============================================================
export async function fetchExamDefs(filters: { schoolId?: string; sectionId?: string }) {
  let query = supabase
    .from('exam_defs')
    .select('*')
    .order('date', { ascending: false });

  if (filters.schoolId) query = query.eq('school_id', filters.schoolId);
  if (filters.sectionId) query = query.eq('section_id', filters.sectionId);

  const { data, error } = await query;
  if (error) throw error;
  return data as ExamDef[];
}

export async function createExamDef(examDef: {
  school_id: string;
  section_id: string;
  exam_name: string;
  record_type: string;
  max_marks?: number;
  date?: string;
  created_by_teacher_id?: string;
}) {
  const { data, error } = await supabase
    .from('exam_defs')
    .insert(examDef)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ExamDef | null;
}

export async function deleteExamDef(id: string) {
  const { error } = await supabase.from('exam_defs').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// FEE STRUCTURES
// ============================================================
export async function fetchFeeStructures(schoolId: string) {
  const { data, error } = await supabase
    .from('fee_structures')
    .select('*')
    .eq('school_id', schoolId)
    .order('name');
  if (error) throw error;
  return data as FeeStructure[];
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
}) {
  const { data, error } = await supabase
    .from('fee_structures')
    .insert(feeStructure)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as FeeStructure | null;
}

export async function updateFeeStructure(id: string, updates: Partial<FeeStructure>) {
  const { data, error } = await supabase
    .from('fee_structures')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as FeeStructure | null;
}

export async function deleteFeeStructure(id: string) {
  const { error } = await supabase.from('fee_structures').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// PAYMENT SETUP
// ============================================================
export async function fetchPaymentSetup(schoolId: string) {
  const { data, error } = await supabase
    .from('payment_setups')
    .select('*')
    .eq('school_id', schoolId)
    .maybeSingle();
  if (error) throw error;
  return data as PaymentSetup | null;
}

export async function upsertPaymentSetup(setup: {
  school_id: string;
  razorpay_key_id?: string;
  account_holder_name?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  is_verified?: boolean;
}) {
  const { data, error } = await supabase
    .from('payment_setups')
    .upsert(setup, { onConflict: 'school_id' })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as PaymentSetup | null;
}

// ============================================================
// TRANSPORT (BUSES, ROUTES, STOPS & STUDENT ASSIGNMENTS)
// ============================================================
const TRANSPORT_BUSES_KEY = (schoolId: string) => `veducore_transport_buses_${schoolId}`;
const TRANSPORT_STOPS_KEY = (schoolId: string) => `veducore_transport_stops_${schoolId}`;
const STUDENT_TRANSPORT_KEY = (schoolId: string) => `veducore_student_transport_${schoolId}`;

function normalizeBusesAndStops(
  rawBuses: TransportBus[],
  rawStops: TransportStop[]
): { buses: TransportBus[]; stops: TransportStop[] } {
  let buses = [...rawBuses];
  if (buses.length === 0 && rawStops.length > 0) {
    // Group legacy stops by bus_number or into a default Bus 01
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

  return { buses, stops: allStops.length > 0 ? allStops : rawStops };
}

export async function fetchSchoolTransportData(schoolId: string): Promise<{
  buses: TransportBus[];
  stops: TransportStop[];
  assignments: Record<string, StudentTransportAssignment>;
}> {
  let localBuses: TransportBus[] = [];
  let localStops: TransportStop[] = [];
  let localAssignments: Record<string, StudentTransportAssignment> = {};
  try {
    const rawBuses = localStorage.getItem(TRANSPORT_BUSES_KEY(schoolId));
    if (rawBuses) localBuses = JSON.parse(rawBuses);
    const rawStops = localStorage.getItem(TRANSPORT_STOPS_KEY(schoolId));
    if (rawStops) localStops = JSON.parse(rawStops);
    const rawAssign = localStorage.getItem(STUDENT_TRANSPORT_KEY(schoolId));
    if (rawAssign) localAssignments = JSON.parse(rawAssign);
  } catch {
    // ignore localStorage parse errors
  }

  try {
    const { data } = await supabase
      .from('schools')
      .select('settings')
      .eq('id', schoolId)
      .maybeSingle();
    const settings = (data?.settings || {}) as Record<string, unknown>;
    const dbBuses = Array.isArray(settings.transport_buses)
      ? (settings.transport_buses as TransportBus[])
      : null;
    const dbStops = Array.isArray(settings.transport_stops)
      ? (settings.transport_stops as TransportStop[])
      : null;
    const dbAssignments =
      settings.student_transport && typeof settings.student_transport === 'object'
        ? (settings.student_transport as Record<string, StudentTransportAssignment>)
        : null;

    const chosenBuses = dbBuses && dbBuses.length > 0 ? dbBuses : localBuses;
    const chosenStops = dbStops && dbStops.length > 0 ? dbStops : localStops;
    const normalized = normalizeBusesAndStops(chosenBuses, chosenStops);

    const finalAssignments: Record<string, StudentTransportAssignment> =
      dbAssignments && Object.keys(dbAssignments).length > 0
        ? { ...localAssignments, ...dbAssignments }
        : { ...localAssignments };

    // Also merge any parent transport applications stored in audit_logs
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
      // ignore if audit_logs query is restricted
    }

    try {
      localStorage.setItem(TRANSPORT_BUSES_KEY(schoolId), JSON.stringify(normalized.buses));
      localStorage.setItem(TRANSPORT_STOPS_KEY(schoolId), JSON.stringify(normalized.stops));
      localStorage.setItem(STUDENT_TRANSPORT_KEY(schoolId), JSON.stringify(finalAssignments));
    } catch {
      // ignore
    }

    return {
      buses: normalized.buses,
      stops: normalized.stops,
      assignments: finalAssignments,
    };
  } catch {
    const normalized = normalizeBusesAndStops(localBuses, localStops);
    return {
      buses: normalized.buses,
      stops: normalized.stops,
      assignments: localAssignments,
    };
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

  // 1. Update localStorage immediately
  try {
    const rawAssign = localStorage.getItem(STUDENT_TRANSPORT_KEY(schoolId));
    const currentAssign: Record<string, StudentTransportAssignment> = rawAssign
      ? JSON.parse(rawAssign)
      : {};
    currentAssign[payload.student_id] = payload;
    localStorage.setItem(STUDENT_TRANSPORT_KEY(schoolId), JSON.stringify(currentAssign));
  } catch {
    // ignore
  }

  // 2. Insert into audit_logs (works for all authenticated parents via audit_logs_insert policy and readable by Admin)
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

  // 3. Also attempt to update schools.settings.student_transport directly
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
    // ignore if RLS blocks direct school update by parent; audit_logs + localStorage already saved it
  }

  return payload;
}

export async function saveSchoolTransportData(
  schoolId: string,
  payload: {
    buses?: TransportBus[];
    stops: TransportStop[];
    assignments: Record<string, StudentTransportAssignment>;
  }
) {
  const normalized = normalizeBusesAndStops(payload.buses || [], payload.stops);
  try {
    localStorage.setItem(TRANSPORT_BUSES_KEY(schoolId), JSON.stringify(normalized.buses));
    localStorage.setItem(TRANSPORT_STOPS_KEY(schoolId), JSON.stringify(normalized.stops));
    localStorage.setItem(STUDENT_TRANSPORT_KEY(schoolId), JSON.stringify(payload.assignments));
  } catch {
    // ignore storage quota errors
  }

  const { data: currentSchool } = await supabase
    .from('schools')
    .select('settings')
    .eq('id', schoolId)
    .maybeSingle();

  const existingSettings =
    currentSchool?.settings && typeof currentSchool.settings === 'object'
      ? (currentSchool.settings as Record<string, unknown>)
      : {};

  const updatedSettings = {
    ...existingSettings,
    transport_buses: normalized.buses,
    transport_stops: normalized.stops,
    student_transport: payload.assignments,
  };

  await updateSchool(schoolId, { settings: updatedSettings });
  return {
    buses: normalized.buses,
    stops: normalized.stops,
    assignments: payload.assignments,
  };
}

// ============================================================
// ADMISSION FEES — helper types (re-exported for convenience)
// ============================================================
export type {
  AdmissionFeeLineItem,
  AdmissionDiscount,
  AdmissionPaymentOption,
  AdmissionPaymentMode,
  AdmissionReceipt,
} from '@/types';

// ============================================================
// fetchFeeStructuresForClass
// Returns fee structures for a given class + academic year.
// Falls back to school-wide structures (class_id IS NULL) if
// no class-specific rows are found.
// Also reads the localStorage mirror that AdminFees.tsx writes
// (schools.settings.fee_structures) so structures defined there
// are visible here too.
// ============================================================
export async function fetchFeeStructuresForClass(
  schoolId: string,
  classId: string,
  academicYear: string
): Promise<FeeStructure[]> {
  // 1. Try DB fee_structures table (class-specific first, then school-wide)
  try {
    const { data: classRows, error: classErr } = await supabase
      .from('fee_structures')
      .select('*')
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .eq('academic_year', academicYear)
      .eq('is_active', true)
      .order('name');

    if (!classErr && classRows && classRows.length > 0) {
      return classRows as FeeStructure[];
    }

    // Fallback: school-wide (class_id IS NULL)
    const { data: schoolRows, error: schoolErr } = await supabase
      .from('fee_structures')
      .select('*')
      .eq('school_id', schoolId)
      .is('class_id', null)
      .eq('academic_year', academicYear)
      .eq('is_active', true)
      .order('name');

    if (!schoolErr && schoolRows && schoolRows.length > 0) {
      return schoolRows as FeeStructure[];
    }
  } catch {
    // fall through to localStorage mirror
  }

  // 2. Fallback: AdminFees.tsx mirrors structures into localStorage
  try {
    const raw = localStorage.getItem(`veducore_fee_structures_${schoolId}`);
    if (raw) {
      const all = JSON.parse(raw) as FeeStructure[];
      // Filter by class (or school-wide), active, and academic year
      const forClass = all.filter(
        (s) =>
          s.is_active &&
          s.academic_year === academicYear &&
          (s.class_id === classId || s.class_id === null || s.class_id === '')
      );
      if (forClass.length > 0) return forClass;

      // Last resort: return all active structures regardless of AY
      const active = all.filter((s) => s.is_active);
      return active;
    }
  } catch {
    // ignore
  }

  return [];
}

// ============================================================
// generateAdmissionReceiptNumber
// Increments receipt_sequences for the school+AY and returns
// a formatted receipt number like RCPT/2026-27/0001.
// Falls back to a timestamp-based number if the DB table does
// not exist yet (migration not yet run).
// ============================================================
export async function generateAdmissionReceiptNumber(
  schoolId: string,
  academicYear: string
): Promise<string> {
  const pad = (n: number) => String(n).padStart(4, '0');
  const ayShort = academicYear.replace(/^20/, ''); // "2026-27" → "26-27"

  try {
    // Try upsert increment pattern: insert with last_seq=1, or update last_seq+1
    const { data: existing } = await supabase
      .from('receipt_sequences')
      .select('id, last_seq')
      .eq('school_id', schoolId)
      .eq('academic_year', academicYear)
      .maybeSingle();

    if (existing) {
      const nextSeq = (existing.last_seq as number) + 1;
      await supabase
        .from('receipt_sequences')
        .update({ last_seq: nextSeq })
        .eq('id', existing.id);
      return `RCPT/${ayShort}/${pad(nextSeq)}`;
    } else {
      const { data: inserted } = await supabase
        .from('receipt_sequences')
        .insert({ school_id: schoolId, academic_year: academicYear, last_seq: 1 })
        .select('last_seq')
        .maybeSingle();
      const seq = inserted ? (inserted.last_seq as number) : 1;
      return `RCPT/${ayShort}/${pad(seq)}`;
    }
  } catch {
    // Migration not yet run — fallback to timestamp-based number
    const ts = Date.now().toString().slice(-6);
    return `RCPT/${ayShort}/${ts}`;
  }
}

// ============================================================
// createAdmissionWithFees
// Orchestrates the full admission + fee creation flow:
//   1. createStudent  (rolls back on later failure)
//   2. createFee rows for each included line item
//   3. recordFeePayment if paying now/partial
//   4. Insert admission_receipt row with idempotency check
//
// Returns { student, receiptNumber, receiptId }
// ============================================================
export async function createAdmissionWithFees(params: {
  // Student fields
  school_id: string;
  admission_number: string;
  full_name: string;
  father_name: string;
  mother_name: string | null;
  parent_email: string | null;
  date_of_birth: string | null;
  gender: string;
  class_id: string;
  section_id: string;
  address: string;
  admission_date: string;
  // Fees fields
  academic_year: string;
  fee_lines: AdmissionFeeLineItem[];
  discount: AdmissionDiscount;
  payment_option: AdmissionPaymentOption;
  amount_paying: number;          // 0 when Pay Later
  payment_mode: string;
  transaction_ref: string;
  payment_date: string;
  remarks: string;
  collected_by: string;           // profile.id of the admin
  collected_by_name: string;
  idempotency_key: string;
}): Promise<{
  student: Student;
  receiptNumber: string;
  receiptId: string | null;
  parentCredentials: { username: string; password: string } | null;
}> {
  // ── Step 1: Create student ──────────────────────────────────
  const createdRaw = await createStudent({
    school_id: params.school_id,
    admission_number: params.admission_number,
    full_name: params.full_name,
    father_name: params.father_name,
    mother_name: params.mother_name,
    parent_email: params.parent_email,
    date_of_birth: params.date_of_birth,
    gender: params.gender,
    class_id: params.class_id,
    section_id: params.section_id,
    address: params.address,
    admission_date: params.admission_date,
    status: 'active',
    avatar_url: null,
  });

  if (!createdRaw) throw new Error('Student creation returned no data');
  const student = createdRaw as Student & { _parentResult?: { credentials: { username: string; password: string } } };
  const studentId = student.id;
  const parentCredentials = student._parentResult?.credentials ?? null;

  // ── Step 2: Generate receipt number ────────────────────────
  const receiptNumber = await generateAdmissionReceiptNumber(
    params.school_id,
    params.academic_year
  );

  // ── Step 3: Create fee rows ─────────────────────────────────
  const includedLines = params.fee_lines.filter((l) => l.include && l.amount > 0);
  const today = params.admission_date;

  let createdFeeIds: string[] = [];
  try {
    const feeResults = await Promise.all(
      includedLines.map((line) =>
        createFee({
          school_id: params.school_id,
          student_id: studentId,
          fee_type: line.fee_type,
          amount: line.amount,
          due_date: today,
          status: 'pending',
        })
      )
    );
    createdFeeIds = feeResults.filter(Boolean).map((f) => (f as Fee).id);
  } catch (feeErr) {
    // Fee creation failed — roll back student
    console.error('Fee creation failed, rolling back student:', feeErr);
    try {
      await supabase.from('students').delete().eq('id', studentId);
      invalidateCacheForAdmission(params.school_id);
    } catch {
      // ignore rollback errors
    }
    throw new Error(
      `Admission rolled back: failed to create fee records. ${feeErr instanceof Error ? feeErr.message : ''}`
    );
  }

  // ── Step 4: Record payment if paying now ────────────────────
  if (
    params.payment_option !== 'later' &&
    params.amount_paying > 0 &&
    createdFeeIds.length > 0
  ) {
    // Distribute payment proportionally across fee rows
    const totalIncluded = includedLines.reduce((s, l) => s + l.amount, 0);
    let remaining = params.amount_paying;

    for (let i = 0; i < createdFeeIds.length && remaining > 0; i++) {
      const line = includedLines[i];
      const share =
        totalIncluded > 0
          ? Math.min(remaining, Math.round((line.amount / totalIncluded) * params.amount_paying * 100) / 100)
          : Math.min(remaining, line.amount);
      remaining -= share;
      if (share <= 0) continue;

      try {
        await recordFeePayment(createdFeeIds[i], {
          school_id: params.school_id,
          student_id: studentId,
          amount: share,
          payment_date: params.payment_date || today,
          payment_method: params.payment_mode,
          receipt_number: receiptNumber,
          recorded_by: params.collected_by,
        });
      } catch (payErr) {
        console.warn('Payment recording warning (non-fatal):', payErr);
      }
    }
  }

  // ── Step 5: Calculate totals ────────────────────────────────
  const totalFees = includedLines.reduce((s, l) => s + l.amount, 0);
  const discountAmount =
    params.discount.type === 'percent'
      ? Math.round((totalFees * params.discount.value) / 100 * 100) / 100
      : params.discount.value;
  const netPayable = Math.max(0, totalFees - discountAmount);
  const paidNow = params.payment_option === 'later' ? 0 : params.amount_paying;
  const balanceDue = Math.max(0, netPayable - paidNow);

  // ── Step 6: Insert admission receipt ───────────────────────
  let receiptId: string | null = null;
  try {
    const { data: receiptRow } = await supabase
      .from('admission_receipts')
      .insert({
        school_id: params.school_id,
        student_id: studentId,
        admission_number: params.admission_number,
        receipt_number: receiptNumber,
        academic_year: params.academic_year,
        fee_lines: params.fee_lines,
        discount_amount: discountAmount,
        discount_type: params.discount.value > 0 ? params.discount.type : null,
        discount_reason: params.discount.value > 0 ? params.discount.reason : null,
        discount_note: params.discount.reason_note || null,
        total_fees: totalFees,
        net_payable: netPayable,
        paid_now: paidNow,
        balance_due: balanceDue,
        payment_option: params.payment_option,
        payment_mode: params.payment_option !== 'later' ? params.payment_mode : null,
        transaction_ref: params.transaction_ref || null,
        payment_date: params.payment_option !== 'later' ? params.payment_date : null,
        remarks: params.remarks || null,
        collected_by: params.collected_by || null,
        collected_by_name: params.collected_by_name || null,
        idempotency_key: params.idempotency_key,
      })
      .select('id')
      .maybeSingle();
    receiptId = receiptRow?.id ?? null;
  } catch (receiptErr) {
    // Receipt table may not exist yet (migration pending) — non-fatal
    console.warn('Receipt insert warning (non-fatal):', receiptErr);
  }

  return { student, receiptNumber, receiptId, parentCredentials };
}

// Internal helper — invalidates all caches touched by admission
function invalidateCacheForAdmission(schoolId: string) {
  const apiCacheRef = (globalThis as unknown as { __veducore_cache?: Map<string, unknown> }).__veducore_cache;
  if (!apiCacheRef) return;
  for (const key of apiCacheRef.keys()) {
    if (
      key.startsWith('students:') ||
      key.startsWith('parents:') ||
      key.startsWith(`adminDashboard:${schoolId}`)
    ) {
      apiCacheRef.delete(key);
    }
  }
}

// ============================================================
// fetchAdmissionReceiptById
// Used by the success screen to re-fetch or print a receipt.
// ============================================================
export async function fetchAdmissionReceiptById(id: string): Promise<AdmissionReceipt | null> {
  const { data, error } = await supabase
    .from('admission_receipts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as AdmissionReceipt | null;
}
