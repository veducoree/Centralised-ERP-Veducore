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
  return data as Fee[];
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
}) {
  const { data, error } = await supabase
    .from('fee_payments')
    .insert(payment)
    .select()
    .maybeSingle();
  if (error) throw error;

  // Update fee record
  const { data: fee } = await supabase.from('fees').select('*').eq('id', feeId).maybeSingle();
  if (fee) {
    const newPaid = (fee as Fee).paid_amount + payment.amount;
    const newStatus = newPaid >= (fee as Fee).amount ? 'paid' : newPaid > 0 ? 'partially_paid' : 'pending';
    await supabase.from('fees').update({
      paid_amount: newPaid,
      status: newStatus,
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      receipt_number: payment.receipt_number,
    }).eq('id', feeId);
  }

  return data as FeePayment | null;
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
