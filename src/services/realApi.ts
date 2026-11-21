import { supabase } from '@/lib/supabase';
import { parseTemplate as parseReportCardTemplate } from '@/lib/reportCard/template';
export { generateSubjectCode } from '@/lib/subjectUtils';
import { generateSubjectCode } from '@/lib/subjectUtils';
import {
  generateParentCredentials, normalizeMobile, parentFromStudent, parentLoginId, schoolShortName,
} from '@/lib/parentUtils';
import type {
  Teacher, Parent, Student, Class, Section, Subject,
  ClassAssignment, TeacherSchedule, Attendance, StudentRecord,
  TimetablePeriod, TimetableSubstitution,
  Remark, FeeType, Fee, FeePayment, Notification, AuditLog,
  NotificationAudience, NotificationCategory, NotificationPriority,
  ParentStudent, School, Profile,
  Holiday, ExamDef, FeeStructure, PaymentSetup,
  TransportStop, TransportBus, StudentTransportAssignment,
  AdmissionFeeLineItem, AdmissionDiscount, AdmissionPaymentOption,
  AdmissionPaymentMode, AdmissionReceipt,
  SidebarPreference,
  AcademicSession, AdminDashboardSummary,
  StaffRole, StaffMember, MyPermissions, PermissionLevel,
  Exam, ExamScheduleRow, GradingScale, GradeBand, ExamResultRow, ExamProgressRow, RecordType,
  Certificate, CertificateType, PromotionAction,
  SectionDayOverview, RegisterRow, AttendanceDefaulter, StaffRegisterRow, StaffAttendanceStatus,
  StaffLeave, StaffAttendanceRow,
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
  /** Full server summary (alerts, defaulters, class strength, calendar…). */
  summary: AdminDashboardSummary;
}

export async function fetchAdminDashboardData(schoolId: string): Promise<AdminDashboardData> {
  // Numbers come from the admin_dashboard() RPC: computed on the server in the
  // school's timezone, so totals aren't capped by the 1000-row REST limit.
  return cachedFetch(`adminDashboard:${schoolId}`, async () => {
    const d = await fetchAdminDashboardSummary();
    // Previous 5 days (oldest last, same as before), excluding today.
    const attendanceTrend = d.attendance_trend
      .filter((t) => t.date < d.today)
      .slice(-5)
      .reverse()
      .map((t) => ({ date: t.date, present: Number(t.present), absent: Number(t.absent) }));

    return {
      stats: {
        totalStudents: d.counts.students,
        totalTeachers: d.counts.teachers,
        totalClasses: d.counts.classes,
        totalParents: d.counts.parents,
        todayPresent: d.attendance_today.present,
        todayAbsent: d.attendance_today.absent,
        todayTotal: d.attendance_today.marked,
        pendingFees: d.fees.overdue_students,
        collectedFees: Number(d.fees.collected),
        outstandingFees: Number(d.fees.outstanding),
      },
      attendanceTrend,
      summary: d,
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

/**
 * Saves Settings-page changes. The settings patch is merged on the server
 * (settings || patch) so keys other pages keep in settings aren't lost.
 */
export async function saveSchoolSettings(
  schoolId: string,
  patch: Record<string, unknown>,
  fields: Partial<Pick<School, 'motto' | 'affiliation_board' | 'affiliation_code' | 'logo_url'>> = {},
) {
  const { data, error } = await supabase.rpc('update_school_settings', { p_patch: patch, p_fields: fields });
  if (error) throw new Error(error.message);
  invalidateCache(`school:${schoolId}`);
  const school = data as School | null;
  setCachedSchoolSync(schoolId, school);
  window.dispatchEvent(new CustomEvent('veducore:school-updated', { detail: school }));
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
  /** Link the new (or existing, for siblings) parent login to this student. */
  student_id?: string;
  relationship?: string;
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
          student_id: params.student_id,
          relationship: params.relationship,
        },
      }),
    }
  );

  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Failed to create parent account');
  // A sibling's existing login keeps its own password — don't overwrite the stored copy.
  if (params.password && !result.existing) {
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

/** Admin resets a teacher/parent login: changes the real Auth password and the
 *  stored copy shown on the credentials card, together (via create-user). */
export async function resetUserPassword(params: {
  user_id: string;
  role: 'teacher' | 'parent';
  school_id: string;
  password: string;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action: 'set_password', ...params }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Failed to update password');
  invalidateCache(params.role === 'teacher' ? 'teachers:' : 'parents:');
  return result;
}

// Teacher + their login, in one DB transaction (migration 057).
// Deletes one row and confirms the database really removed it. Under RLS a
// blocked DELETE (no permission, past session, other school) affects 0 rows
// without an error — without this check the UI would say "deleted".
async function deleteRowById(table: string, id: string) {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error) {
    const msg = error.code === '23503'
      ? 'This is still in use elsewhere (linked records) and cannot be deleted yet.'
      : error.message;
    throw Object.assign(new Error(msg), { code: error.code });
  }
  if (!data || data.length === 0) {
    throw new Error('Not deleted — you may not have permission, or you are viewing a past session.');
  }
}

export async function deleteTeacher(id: string) {
  const { error } = await supabase.rpc('admin_delete_teacher', { p_teacher_id: id });
  if (error) throw new Error(error.message);
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

// Parent + their login; the children stay (migration 057).
export async function deleteParent(id: string) {
  const { error } = await supabase.rpc('admin_delete_parent', { p_parent_id: id });
  if (error) throw new Error(error.message);
  invalidateCache('students:');
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

/**
 * Makes sure the student has a parent login. The login is the parent's mobile
 * number (students.emergency_contact); siblings with the same number share one
 * login. Default password: parentfirstname@schoolshortname.
 * Throws with a readable message when it can't (no / bad mobile, number
 * already used by a parent in another school, …).
 */
export async function ensureParentForStudent(
  student: Student,
): Promise<{ parent: Parent | null; credentials: { username: string; password: string }; created: boolean }> {
  // 1. Already linked to a parent that has a login → just return it.
  const { data: existingLinks } = await supabase
    .from('parent_students')
    .select('*, parent:parents(*)')
    .eq('student_id', student.id);
  const linked = (existingLinks || []).map((l) => l.parent as Parent | null).find((p) => p?.user_id);
  if (linked) {
    return {
      parent: linked,
      credentials: { username: parentLoginId(linked.email), password: (linked as Parent & { password?: string }).password || '******' },
      created: false,
    };
  }

  // 2. Work out the login.
  const mobile = normalizeMobile((student as Student & { emergency_contact?: string | null }).emergency_contact);
  if (!mobile) throw new Error("Add the parent's 10-digit mobile number to create their login");

  const { data: sch } = await supabase.from('schools').select('name, short_name').eq('id', student.school_id).maybeSingle();
  const { name: parentName, relationship } = parentFromStudent(student);
  const creds = generateParentCredentials({ mobile, parentName, shortName: schoolShortName(sch) });

  // 3. Create it (or link to the sibling's existing login) on the server.
  let result: { existing?: boolean };
  try {
    result = await createParentAccount({
      email: creds.email,
      password: creds.password,
      full_name: parentName,
      school_id: student.school_id,
      phone: mobile,
      address: student.address || undefined,
      student_id: student.id,
      relationship,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already (been )?registered|already exists/i.test(msg)) {
      throw new Error(`Mobile ${mobile} is already a parent login in another school`);
    }
    throw err;
  }

  const { data: parent } = await supabase
    .from('parents').select('*').eq('school_id', student.school_id).ilike('email', creds.email).maybeSingle();
  const password = result?.existing ? ((parent as (Parent & { password?: string }) | null)?.password || creds.password) : creds.password;
  return {
    parent: (parent as Parent) || null,
    credentials: { username: mobile, password },
    created: !result?.existing,
  };
}

/**
 * The school's employee ID prefix (set by Veducore, e.g. "EMP") and the ID
 * the next teacher should get — highest existing prefix+digits ID plus one.
 * `next` is null when the school has no such teacher yet.
 */
export async function fetchNextEmployeeId(): Promise<{ prefix: string; next: string | null }> {
  const { data, error } = await supabase.rpc('next_employee_id');
  if (error) throw error;
  const r = (data || {}) as { prefix?: string | null; next?: string | null };
  return { prefix: r.prefix || '', next: r.next || null };
}

export async function createStudent(
  student: Partial<Student> & { school_id: string; admission_number: string; full_name: string },
  opts: { withParent?: boolean } = {},
) {
  const { data, error } = await supabase.from('students').insert(student).select().maybeSingle();
  if (error) {
    if (error.code === '23505' && /admission_number/.test(`${error.message} ${error.details ?? ''}`)) {
      throw new Error(`Admission number ${student.admission_number} is already used by another student`);
    }
    throw error;
  }
  invalidateCache('students:');
  invalidateCache('studentsBySection:');
  invalidateCache('parents:');
  invalidateCache('adminDashboard:');
  let parentResult: { parent: Parent | null; credentials: { username: string; password: string }; created: boolean } | null = null;
  let parentError: string | null = null;
  if (data && opts.withParent !== false) {
    // Parent login (mobile number). The student is saved even if this fails;
    // the caller shows _parentError so the admin can fix it.
    try {
      parentResult = await ensureParentForStudent(data as Student);
    } catch (parentErr) {
      parentError = parentErr instanceof Error ? parentErr.message : 'Could not create the parent login';
      console.warn('Auto-parent creation warning:', parentErr);
    }
  }
  if (!data) return null;
  return { ...(data as Student), _parentResult: parentResult, _parentError: parentError } as Student & {
    _parentResult?: typeof parentResult; _parentError?: string | null;
  };
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

// Student + all their data + any parent left with no other child, with
// that parent's login — one DB transaction (migration 057).
export async function deleteStudent(id: string) {
  const { data, error } = await supabase.rpc('admin_delete_student', { p_student_id: id });
  if (error) throw new Error(error.message);
  invalidateCache('parents:');
  invalidateCache('parentByUser:');
  invalidateCache('students:');
  invalidateCache('studentsBySection:');
  invalidateCache('parentStudents:');
  invalidateCache('adminDashboard:');
  return (data ?? {}) as { parents_deleted?: number; logins_deleted?: number };
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
  await deleteRowById('classes', id);
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

/** Link existing class subjects to a (new) section. */
export async function linkSubjectsToSection(schoolId: string, sectionId: string, subjectIds: string[]) {
  if (!subjectIds.length) return;
  const { error } = await supabase
    .from('section_subjects')
    .upsert(
      subjectIds.map((subject_id) => ({ school_id: schoolId, section_id: sectionId, subject_id })),
      { onConflict: 'section_id,subject_id', ignoreDuplicates: true },
    );
  if (error) throw error;
  invalidateCache(`subjects:${schoolId}`);
}

export async function deleteSection(id: string) {
  await deleteRowById('sections', id);
  invalidateCache('classes:');
}

// ── Subjects (class-wise) ─────────────────────────────────────────────────────
// Every subject belongs to one class; section_subjects says which sections of
// that class study it.

/** All subjects of the school, each with the section ids it is taught in. */
export async function fetchSubjects(schoolId: string) {
  return cachedFetch(`subjects:${schoolId}`, async () => {
    const { data, error } = await supabase
      .from('subjects')
      .select('*, section_subjects(section_id)')
      .eq('school_id', schoolId)
      .order('name');
    if (error) throw error;
    type Row = Omit<Subject, 'section_ids'> & { section_subjects: { section_id: string }[] | null };
    return ((data || []) as Row[]).map(({ section_subjects, ...s }) => ({
      ...s,
      section_ids: (section_subjects || []).map((x) => x.section_id),
    })) as Subject[];
  });
}

/** Subjects taught in a given section, from an already-fetched list. */
export function subjectsForSection(subjects: Subject[], sectionId: string): Subject[] {
  return subjects.filter((s) => s.section_ids.includes(sectionId));
}

/**
 * Create subjects for a class and link them to the chosen sections.
 * A name that already exists in the class is not duplicated; its sections are
 * extended instead.
 */
export async function createClassSubjects(params: {
  schoolId: string;
  classId: string;
  sectionIds: string[];
  subjects: { name: string; code?: string }[];
}) {
  const { schoolId, classId, sectionIds } = params;
  if (!sectionIds.length) throw new Error('Select at least one section');

  invalidateCache(`subjects:${schoolId}`);
  const existing = await fetchSubjects(schoolId);
  const usedCodes = existing.map((s) => s.code);
  const inClass = existing.filter((s) => s.class_id === classId);

  const toInsert: { school_id: string; class_id: string; name: string; code: string }[] = [];
  const reusedIds: string[] = [];
  const seen = new Set<string>();

  for (const row of params.subjects) {
    const name = row.name.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);

    const match = inClass.find((s) => s.name.trim().toLowerCase() === key);
    if (match) { reusedIds.push(match.id); continue; }

    let code = (row.code || '').trim().toUpperCase();
    if (!code || usedCodes.some((c) => (c || '').toUpperCase() === code)) {
      code = generateSubjectCode(name, usedCodes);
    }
    usedCodes.push(code);
    toInsert.push({ school_id: schoolId, class_id: classId, name, code });
  }

  let created: Subject[] = [];
  if (toInsert.length) {
    const { data, error } = await supabase.from('subjects').insert(toInsert).select();
    if (error) throw error;
    created = (data || []) as Subject[];
  }

  const links = [...created.map((s) => s.id), ...reusedIds].flatMap((subject_id) =>
    sectionIds.map((section_id) => ({ school_id: schoolId, section_id, subject_id }))
  );
  if (links.length) {
    const { error } = await supabase
      .from('section_subjects')
      .upsert(links, { onConflict: 'section_id,subject_id', ignoreDuplicates: true });
    if (error) throw error;
  }

  invalidateCache(`subjects:${schoolId}`);
  return { created: created.length, reused: reusedIds.length };
}

export async function updateSubject(id: string, updates: { name?: string; code?: string | null }) {
  const { error } = await supabase.from('subjects').update(updates).eq('id', id);
  if (error) throw error;
  invalidateCache('subjects:');
}

/** Replace the set of sections a subject is taught in. */
export async function setSubjectSections(schoolId: string, subjectId: string, sectionIds: string[]) {
  if (!sectionIds.length) throw new Error('Select at least one section');
  const { error: delErr } = await supabase
    .from('section_subjects')
    .delete()
    .eq('subject_id', subjectId)
    .not('section_id', 'in', `(${sectionIds.join(',')})`);
  if (delErr) throw delErr;

  const { error } = await supabase
    .from('section_subjects')
    .upsert(
      sectionIds.map((section_id) => ({ school_id: schoolId, section_id, subject_id: subjectId })),
      { onConflict: 'section_id,subject_id', ignoreDuplicates: true },
    );
  if (error) throw error;

  // Teacher allotments for sections that no longer have this subject are stale.
  const { error: caErr } = await supabase
    .from('class_assignments')
    .delete()
    .eq('subject_id', subjectId)
    .not('section_id', 'in', `(${sectionIds.join(',')})`);
  if (caErr) throw caErr;

  invalidateCache(`subjects:${schoolId}`);
  invalidateCache('teacherAssignments:');
}

export async function deleteSubject(id: string) {
  await deleteRowById('subjects', id);
  invalidateCache('subjects:');
  invalidateCache('teacherAssignments:');
}

/** Subject-teacher allotments of one teacher (class-teacher rows excluded). */
export async function fetchTeacherSubjectAllotments(teacherId: string) {
  const { data, error } = await supabase
    .from('class_assignments')
    .select('*, teacher:teachers(*), class:classes(*), section:sections(*), subject:subjects(*)')
    .eq('teacher_id', teacherId)
    .not('subject_id', 'is', null);
  if (error) throw error;
  return data as ClassAssignment[];
}

/** All subject-teacher allotments in the school (to show who already teaches what). */
export async function fetchSubjectAllotments(schoolId: string) {
  const { data, error } = await supabase
    .from('class_assignments')
    .select('id, teacher_id, class_id, section_id, subject_id, teacher:teachers(id, full_name)')
    .eq('school_id', schoolId)
    .not('subject_id', 'is', null);
  if (error) throw error;
  return (data || []) as unknown as {
    id: string; teacher_id: string; class_id: string; section_id: string; subject_id: string;
    teacher: { id: string; full_name: string } | null;
  }[];
}

/**
 * Make a teacher's subject allotments exactly match `rows`.
 * Each (section, subject) has one teacher, so allotting a pair that another
 * teacher holds moves it to this teacher. Also refreshes teachers.subject
 * (comma-separated names) for places that still show that text.
 */
export async function setTeacherSubjectAllotments(params: {
  schoolId: string;
  teacherId: string;
  rows: { class_id: string; section_id: string; subject_id: string }[];
  subjectNames: string[];
}) {
  const { schoolId, teacherId, rows } = params;
  const key = (r: { section_id: string; subject_id: string }) => `${r.section_id}:${r.subject_id}`;
  const wanted = new Map(rows.map((r) => [key(r), r]));

  const current = await fetchTeacherSubjectAllotments(teacherId);
  const toRemove = current.filter((c) => !wanted.has(key({ section_id: c.section_id, subject_id: c.subject_id! })));
  const currentKeys = new Set(current.map((c) => key({ section_id: c.section_id, subject_id: c.subject_id! })));
  const toAdd = rows.filter((r) => !currentKeys.has(key(r)));

  if (toRemove.length) {
    const { error } = await supabase.from('class_assignments').delete().in('id', toRemove.map((c) => c.id));
    if (error) throw error;
  }
  // Free each (section, subject) pair from any other teacher first.
  const freed = await Promise.all(toAdd.map((r) => supabase
    .from('class_assignments')
    .delete()
    .eq('section_id', r.section_id)
    .eq('subject_id', r.subject_id)));
  const delErr = freed.find((r) => r.error)?.error;
  if (delErr) throw delErr;
  if (toAdd.length) {
    const { error } = await supabase
      .from('class_assignments')
      .insert(toAdd.map((r) => ({ ...r, school_id: schoolId, teacher_id: teacherId })));
    if (error) throw error;
  }

  const names = Array.from(new Set(params.subjectNames.map((n) => n.trim()).filter(Boolean)));
  const { error: tErr } = await supabase
    .from('teachers')
    .update({ subject: names.length ? names.join(', ') : null })
    .eq('id', teacherId);
  if (tErr) throw tErr;

  invalidateCache('teacherAssignments:');
  invalidateCache(`teachers:${schoolId}`);
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
  await deleteRowById('class_assignments', id);
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

function invalidateTimetableCache() {
  invalidateCache('teacherSchedulesByTeacher:');
  invalidateCache('sectionTimetable:');
}

export async function createTeacherSchedule(schedule: {
  school_id: string;
  teacher_id: string;
  class_id: string;
  section_id: string;
  subject_id?: string | null;
  period_id?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room_number?: string | null;
}) {
  const { data, error } = await supabase
    .from('teacher_schedules')
    .insert(schedule)
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateTimetableCache();
  return data as TeacherSchedule | null;
}

export async function updateTeacherSchedule(id: string, updates: {
  teacher_id?: string;
  subject_id?: string | null;
  room_number?: string | null;
}) {
  const { data, error } = await supabase
    .from('teacher_schedules')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  invalidateTimetableCache();
  return data as TeacherSchedule | null;
}

export async function deleteTeacherSchedule(id: string) {
  await deleteRowById('teacher_schedules', id);
  invalidateTimetableCache();
}

/** Timetable of one section (used by parents; teacher names follow RLS). */
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

// ── Timetable periods (bell schedule) ───────────────────────────────────────

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

export async function createTimetablePeriod(period: {
  school_id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
}) {
  const { data, error } = await supabase.from('timetable_periods').insert(period).select().maybeSingle();
  if (error) throw error;
  invalidateCache(`timetablePeriods:${period.school_id}`);
  return data as TimetablePeriod | null;
}

export async function updateTimetablePeriod(
  schoolId: string,
  id: string,
  updates: Partial<Pick<TimetablePeriod, 'name' | 'start_time' | 'end_time' | 'is_break'>>,
) {
  const { data, error } = await supabase.from('timetable_periods').update(updates).eq('id', id).select().maybeSingle();
  if (error) throw error;
  invalidateCache(`timetablePeriods:${schoolId}`);
  invalidateTimetableCache();
  return data as TimetablePeriod | null;
}

export async function deleteTimetablePeriod(schoolId: string, id: string) {
  await deleteRowById('timetable_periods', id);
  invalidateCache(`timetablePeriods:${schoolId}`);
  invalidateTimetableCache();
}

/** Save working days in schools.settings.timetable_days without touching other settings. */
export async function saveTimetableDays(schoolId: string, days: number[]) {
  const { data, error } = await supabase.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  if (error) throw error;
  const settings = { ...((data?.settings as Record<string, unknown>) || {}), timetable_days: [...days].sort((a, b) => a - b) };
  return updateSchool(schoolId, { settings });
}

// ── Substitutions ───────────────────────────────────────────────────────────

const SUBSTITUTION_SELECT = `*,
  original_teacher:teachers!timetable_substitutions_original_teacher_id_fkey(id, full_name),
  substitute_teacher:teachers!timetable_substitutions_substitute_teacher_id_fkey(id, full_name),
  class:classes(id, name), section:sections(id, name), subject:subjects(id, name),
  period:timetable_periods(id, name)`;

export async function fetchSubstitutions(filters: {
  schoolId?: string;
  sectionId?: string;
  substituteTeacherId?: string;
  from: string;
  to: string;
}) {
  let q = supabase
    .from('timetable_substitutions')
    .select(SUBSTITUTION_SELECT)
    .gte('date', filters.from)
    .lte('date', filters.to)
    .order('date')
    .order('start_time');
  if (filters.schoolId) q = q.eq('school_id', filters.schoolId);
  if (filters.sectionId) q = q.eq('section_id', filters.sectionId);
  if (filters.substituteTeacherId) q = q.eq('substitute_teacher_id', filters.substituteTeacherId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as TimetableSubstitution[];
}

export async function createSubstitution(sub: {
  school_id: string;
  date: string;
  schedule_id: string;
  substitute_teacher_id: string;
  note?: string | null;
}) {
  const { data, error } = await supabase
    .from('timetable_substitutions')
    .upsert(sub, { onConflict: 'schedule_id,date' })
    .select(SUBSTITUTION_SELECT)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as TimetableSubstitution | null;
}

export async function deleteSubstitution(id: string) {
  await deleteRowById('timetable_substitutions', id);
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
  await deleteRowById('student_records', id);
}

/**
 * Replace a set of student_records in two requests instead of one per row.
 * If the insert fails, the deleted rows are put back so marks are never lost.
 */
export async function replaceStudentRecords(
  previous: StudentRecord[],
  rows: Parameters<typeof createStudentRecord>[0][],
) {
  if (previous.length) {
    const { error } = await supabase.from('student_records').delete().in('id', previous.map((r) => r.id));
    if (error) throw error;
  }
  if (!rows.length) return;
  const { error } = await supabase.from('student_records').insert(rows);
  if (error) {
    if (previous.length) {
      const restore = previous.map((r) => {
        const copy: Record<string, unknown> = { ...r };
        for (const k of Object.keys(copy)) if (copy[k] !== null && typeof copy[k] === 'object') delete copy[k];
        return copy;
      });
      await supabase.from('student_records').insert(restore);
    }
    throw error;
  }
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
  await deleteRowById('remarks', id);
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

const LOCAL_FEE_OVERRIDES_KEY = 'veducore_local_fee_overrides'; // legacy key, cleared on load

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
  // Always the database's values — never a locally cached "paid" state.
  try { localStorage.removeItem(LOCAL_FEE_OVERRIDES_KEY); } catch { /* ignore */ }
  return (data || []) as Fee[];
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

/**
 * Records an office (cash / cheque / bank) payment. Staff only — parents pay
 * online through the payments edge function. Errors are thrown, never hidden.
 */
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
  const receipt = payment.receipt_number?.trim()
    || `RCP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`;
  const method = payment.payment_method?.trim() || 'Cash';
  const { next_due_date, ...row } = { ...payment, receipt_number: receipt, payment_method: method };

  const { data: fee, error: feeErr } = await supabase.from('fees').select('*').eq('id', feeId).maybeSingle();
  if (feeErr) throw feeErr;
  if (!fee) throw new Error('Fee not found');
  const f = fee as Fee;
  const remaining = Number(f.amount) - Number(f.paid_amount);
  if (Number(payment.amount) <= 0) throw new Error('Amount must be more than zero');
  if (Number(payment.amount) > remaining + 0.001) throw new Error('Amount is more than the balance due');

  const { data: inserted, error: insErr } = await supabase
    .from('fee_payments').insert({ ...row, fee_id: feeId }).select().maybeSingle();
  if (insErr) throw insErr;

  const newPaid = Math.min(Number(f.amount), Number(f.paid_amount) + Number(payment.amount));
  const newStatus = newPaid >= Number(f.amount) ? 'paid' : newPaid > 0 ? 'partially_paid' : 'pending';
  const dueDate = next_due_date && newStatus !== 'paid' ? next_due_date : f.due_date;
  const { error: updErr } = await supabase.from('fees').update({
    paid_amount: newPaid,
    status: newStatus,
    payment_date: payment.payment_date,
    payment_method: method,
    receipt_number: receipt,
    due_date: dueDate,
  }).eq('id', feeId);
  if (updErr) {
    // Keep the ledger consistent: undo the payment row if the fee couldn't be updated.
    if (inserted?.id) await supabase.from('fee_payments').delete().eq('id', (inserted as FeePayment).id);
    throw updErr;
  }
  invalidateCache(`fees:`);
  return inserted as FeePayment | null;
}

export async function deleteFee(id: string) {
  await deleteRowById('fees', id);
}

export async function fetchNotifications(userId?: string, schoolId?: string, limit = 200) {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) query = query.eq('user_id', userId);
  if (schoolId) query = query.eq('school_id', schoolId);

  const { data, error } = await query;
  if (error) throw error;
  return data as Notification[];
}

export interface NotificationInput {
  school_id: string;
  title: string;
  message: string;
  type?: string;
  audience?: NotificationAudience;
  user_id?: string | null;
  class_id?: string | null;
  section_id?: string | null;
  student_id?: string | null;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  link?: string | null;
}

/** Inserts a notification and asks the edge function to push it to devices. */
export async function createNotification(notification: NotificationInput) {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('notifications')
    .insert({ ...notification, sent_by: auth.user?.id ?? null })
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data?.id && data.push_status === 'pending') {
    // Fire-and-forget: the DB trigger may already have dispatched it.
    supabase.functions.invoke('push-dispatch', { body: { notification_id: data.id } }).catch(() => {});
  }
  return data as Notification | null;
}

/** Returns how many people will receive a notification for the given audience. */
export async function countNotificationRecipients(n: Pick<NotificationInput, 'audience' | 'user_id' | 'class_id' | 'section_id' | 'student_id'>) {
  const { data, error } = await supabase.rpc('count_notification_recipients', {
    p_audience: n.audience ?? 'all',
    p_user: n.user_id ?? null,
    p_class: n.class_id ?? null,
    p_section: n.section_id ?? null,
    p_student: n.student_id ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function fetchNotificationReadCounts(ids: string[]) {
  if (!ids.length) return {} as Record<string, number>;
  const { data, error } = await supabase.rpc('notification_read_counts', { p_ids: ids });
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { notification_id: string; reads: number }[]) out[r.notification_id] = Number(r.reads);
  return out;
}

export async function sendFeeReminders(schoolId: string) {
  const { data, error } = await supabase.rpc('send_fee_reminders', { p_school: schoolId });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** The signed-in user's own feed (RLS-filtered) with per-user read state. */
export async function fetchMyNotifications(limit = 50) {
  const { data, error } = await supabase.rpc('fetch_my_notifications', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: [id] });
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  await deleteRowById('notifications', id);
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
  await deleteRowById('parent_students', id);
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
    // Class teacher = row with no subject (there is no is_class_teacher column in the DB).
    .insert({ ...params, subject_id: null })
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

/** Sets the type of several dates at once (one row per school + date). */
export async function upsertHolidays(rows: { school_id: string; date: string; type: 'working' | 'holiday' | 'festival'; label: string | null }[]) {
  if (!rows.length) return [] as Holiday[];
  const { data, error } = await supabase
    .from('holidays')
    .upsert(rows, { onConflict: 'school_id,date' })
    .select();
  if (error) throw new Error(error.message);
  return (data || []) as Holiday[];
}

/** Removes the entries for these dates, so they fall back to the weekly pattern. */
export async function clearHolidayDates(schoolId: string, dates: string[]) {
  if (!dates.length) return;
  const { error } = await supabase.from('holidays').delete().eq('school_id', schoolId).in('date', dates);
  if (error) throw new Error(error.message);
}

export async function deleteHoliday(id: string) {
  await deleteRowById('holidays', id);
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
  await deleteRowById('exam_defs', id);
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
  await deleteRowById('fee_structures', id);
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

/**
 * Parent-side transport data, read from the transport tables
 * (migration 019/041) — the same rows the admin manages.
 * Only active vehicles are offered to parents. Assignments are keyed by
 * student id: a pending application wins, then the approved one, then the
 * most recent record (so a rejection reason stays visible).
 */
export async function fetchSchoolTransportData(schoolId: string): Promise<{
  buses: TransportBus[];
  stops: TransportStop[];
  assignments: Record<string, StudentTransportAssignment>;
}> {
  const [busRes, assignRes] = await Promise.all([
    supabase
      .from('transport_buses')
      .select('*, stops:transport_stops(*)')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .order('created_at'),
    supabase
      .from('student_transport_assignments')
      .select('*, bus:transport_buses(bus_number,route_name,vehicle_type,driver_name,driver_phone), stop:transport_stops(stop_name,area_landmark,pickup_time,drop_time,amount,fare_period)')
      .eq('school_id', schoolId)
      .order('assigned_at', { ascending: false }),
  ]);

  const rawBuses = (busRes.data || []) as TransportBus[];
  const buses = rawBuses.map((b) => {
    const sorted = [...(b.stops || [])].sort((x, y) => (x.stop_order ?? 0) - (y.stop_order ?? 0));
    return { ...b, vehicle_type: b.vehicle_type || 'bus', stops: sorted, total_stops: sorted.length };
  });
  const stops = buses.flatMap((b) => b.stops.map((s) => ({
    ...s,
    amount: Number(s.amount),
    bus_id: b.id,
    bus_number: b.bus_number,
    route_name: b.route_name,
    vehicle_type: b.vehicle_type,
    driver_name: b.driver_name,
    driver_phone: b.driver_phone,
  }))) as TransportStop[];

  type Joined = StudentTransportAssignment & {
    bus?: { bus_number: string; route_name: string; vehicle_type?: 'bus' | 'van'; driver_name?: string; driver_phone?: string };
    stop?: { stop_name: string; area_landmark?: string; pickup_time?: string; drop_time?: string; amount: number; fare_period?: StudentTransportAssignment['fare_period'] };
  };
  const rank = (s?: string) => (s === 'pending' ? 0 : s === 'approved' || s === 'active' ? 1 : 2);
  const assignments: Record<string, StudentTransportAssignment> = {};
  for (const a of (assignRes.data || []) as Joined[]) {
    const flat: StudentTransportAssignment = {
      ...a,
      bus_number: a.bus?.bus_number ?? a.fare_snapshot?.bus_number,
      route_name: a.bus?.route_name ?? a.fare_snapshot?.route_name,
      vehicle_type: a.bus?.vehicle_type ?? a.fare_snapshot?.vehicle_type ?? 'bus',
      driver_name: a.bus?.driver_name,
      driver_phone: a.bus?.driver_phone,
      stop_name: a.stop?.stop_name ?? a.fare_snapshot?.stop_name ?? '',
      area_landmark: a.stop?.area_landmark,
      pickup_time: a.stop?.pickup_time,
      drop_time: a.stop?.drop_time,
      amount: Number(a.fare_snapshot?.amount ?? a.stop?.amount ?? 0),
      fare_period: a.fare_snapshot?.fare_period ?? a.stop?.fare_period,
    };
    const prev = assignments[a.student_id];
    if (!prev || rank(flat.status) < rank(prev.status)) assignments[a.student_id] = flat;
  }

  return { buses, stops, assignments };
}

/** Parent applies for a stop. The DB function validates, replaces any earlier
 *  pending application for the child, and notifies the school's admins. */
export async function applyForTransport(
  _schoolId: string,
  assignment: StudentTransportAssignment
): Promise<StudentTransportAssignment> {
  const { data, error } = await supabase.rpc('apply_for_transport', {
    p_student: assignment.student_id,
    p_stop: assignment.stop_id,
  });
  if (error) throw new Error(error.message);
  return {
    ...assignment,
    id: data as string,
    status: 'pending',
    applied_by_parent: true,
    assigned_at: new Date().toISOString(),
  };
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
      // Only this class / school-wide for this year — never another class's fees.
      return forClass;
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
  parent_phone?: string | null;
  whatsapp_number?: string | null;
  previous_school?: string | null;
  previous_board?: string | null;
  tc_number?: string | null;
  tc_date?: string | null;
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
  /** Why the parent login couldn't be made (the admission itself is saved). */
  parentError: string | null;
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
    // Saved with the student so the parent's number and history aren't lost.
    ...(params.parent_phone ? { parent_phone: params.parent_phone, emergency_contact: params.parent_phone } : {}),
    ...(params.whatsapp_number ? { whatsapp_number: params.whatsapp_number } : {}),
    ...(params.previous_school ? { previous_school: params.previous_school } : {}),
    ...(params.previous_board ? { previous_board: params.previous_board } : {}),
    ...(params.tc_number ? { tc_number: params.tc_number } : {}),
    ...(params.tc_date ? { tc_date: params.tc_date } : {}),
    admission_date: params.admission_date,
    status: 'active',
    avatar_url: null,
  }, { withParent: false });

  if (!createdRaw) throw new Error('Student creation returned no data');
  const student = createdRaw as Student;
  const studentId = student.id;

  // ── Step 2: Fees, payment and receipt — one transaction on the server ──
  // (discount is applied to the fee rows; receipt number is atomic; if this
  // fails the new student is removed so nothing half-done is left)
  const { data: rpc, error: rpcErr } = await supabase.rpc('admission_fees_and_receipt', {
    p_student: studentId,
    p: {
      academic_year: params.academic_year,
      admission_number: params.admission_number,
      due_date: params.admission_date,
      fee_lines: params.fee_lines,
      discount: params.discount,
      payment_option: params.payment_option,
      amount_paying: params.payment_option === 'later' ? 0 : params.amount_paying,
      payment_mode: params.payment_mode,
      transaction_ref: params.transaction_ref,
      payment_date: params.payment_date,
      remarks: params.remarks,
      collected_by_name: params.collected_by_name,
      idempotency_key: params.idempotency_key,
    },
  });
  if (rpcErr) {
    console.error('Admission fees failed, rolling back student:', rpcErr);
    try {
      await supabase.from('students').delete().eq('id', studentId);
      invalidateCacheForAdmission(params.school_id);
    } catch {
      // ignore rollback errors
    }
    throw new Error(`Admission not saved: ${rpcErr.message}`);
  }
  invalidateCache('fees:');
  invalidateCache(`adminDashboard:${params.school_id}`);
  const r = (rpc || {}) as { receipt_id?: string; receipt_number?: string };
  const receiptNumber = r.receipt_number ?? '';
  const receiptId = r.receipt_id ?? null;

  // ── Step 3: Parent login — only once the admission is really saved, so a
  // failed fee step never leaves a stray login behind. A failure here keeps
  // the admission; the admin sees why and can retry from the student page.
  let parentCredentials: { username: string; password: string } | null = null;
  let parentError: string | null = null;
  try {
    parentCredentials = (await ensureParentForStudent(student)).credentials;
  } catch (parentErr) {
    parentError = parentErr instanceof Error ? parentErr.message : 'Could not create the parent login';
  }
  invalidateCache('parents:');

  return { student, receiptNumber, receiptId, parentCredentials, parentError };
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

// ============================================================
// SIDEBAR PREFERENCES
// ============================================================

/**
 * Fetch this user's saved sidebar preference.
 * Returns null if the user has never customised their sidebar.
 */
export async function fetchSidebarPreference(
  profileId: string,
  schoolId: string | null
): Promise<SidebarPreference | null> {
  if (!supabase) return null;
  try {
    let query = supabase
      .from('sidebar_preferences')
      .select('*')
      .eq('profile_id', profileId);
    if (schoolId) {
      query = query.eq('school_id', schoolId);
    } else {
      query = query.is('school_id', null);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data as SidebarPreference | null;
  } catch (err) {
    // Let the caller keep its cached copy instead of treating a failed read as "no preference".
    throw err instanceof Error ? err : new Error('Could not load sidebar preferences');
  }
}

/**
 * Upsert the user's sidebar preference.
 * ordered_paths: ordered array of route path strings to pin.
 * Pass null to reset to role default.
 */
export async function saveSidebarPreference(
  profileId: string,
  schoolId: string | null,
  role: string,
  orderedPaths: string[] | null
): Promise<SidebarPreference | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('sidebar_preferences')
      .upsert(
        {
          profile_id: profileId,
          school_id: schoolId,
          role,
          ordered_paths: orderedPaths,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,school_id' }
      )
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as SidebarPreference | null;
  } catch (err) {
    // Surface failures so the UI can revert and tell the user.
    throw err instanceof Error ? err : new Error('Could not save sidebar preferences');
  }
}

/**
 * Reset the user's sidebar to role default by setting ordered_paths to null.
 */
export async function resetSidebarPreference(
  profileId: string,
  schoolId: string | null
): Promise<void> {
  if (!supabase) return;
  let q = supabase
    .from('sidebar_preferences')
    .update({ ordered_paths: null, updated_at: new Date().toISOString() })
    .eq('profile_id', profileId);
  q = schoolId ? q.eq('school_id', schoolId) : q.is('school_id', null);
  const { error } = await q;
  if (error) throw error;
}

// ============================================================
// TRANSPORT — DB-backed functions (migration 019)
// These read from / write to the new transport_buses,
// transport_stops, student_transport_assignments tables.
// The older JSONB/localStorage functions above still work for
// backward-compat; the UI will prefer DB when available.
// ============================================================

import type {
  TransportFareSnapshot,
  TransportAssignmentStatus,
} from '@/types';

// ── Buses ─────────────────────────────────────────────────────

export async function fetchTransportBuses(schoolId: string) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('transport_buses')
      .select('*, stops:transport_stops(*)')
      .eq('school_id', schoolId)
      .order('created_at');
    if (error) {
      // Table may not exist yet (migration pending)
      if ((error as any).code === '42P01' || (error as any).status === 404) return [];
      throw error;
    }
    return (data || []) as import('@/types').TransportBus[];
  } catch {
    return [];
  }
}

export async function upsertTransportBus(bus: {
  id?: string;
  school_id: string;
  bus_number: string;
  route_name: string;
  capacity?: number;
  driver_name?: string;
  driver_phone?: string;
  conductor_name?: string;
  conductor_phone?: string;
  status?: string;
}) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('transport_buses')
    .upsert(bus, { onConflict: 'id' })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as import('@/types').TransportBus | null;
}

export async function deleteTransportBus(id: string) {
  if (!supabase) return;
  await deleteRowById('transport_buses', id);
}

// ── Stops ─────────────────────────────────────────────────────

export async function upsertTransportStop(stop: {
  id?: string;
  school_id: string;
  bus_id: string;
  stop_name: string;
  area_landmark?: string;
  pickup_time?: string;
  drop_time?: string;
  distance_km?: number;
  amount: number;
  fare_period?: string;
  stop_order?: number;
}) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('transport_stops')
    .upsert(stop, { onConflict: 'id' })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as import('@/types').TransportStop | null;
}

export async function deleteTransportStop(id: string) {
  if (!supabase) return;
  await deleteRowById('transport_stops', id);
}

// ── Assignments ───────────────────────────────────────────────

export async function fetchTransportAssignments(schoolId: string) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('student_transport_assignments')
      .select('*')
      .eq('school_id', schoolId)
      .order('assigned_at', { ascending: false });
    if (error) {
      if ((error as any).code === '42P01' || (error as any).status === 404) return [];
      throw error;
    }
    return (data || []) as import('@/types').StudentTransportAssignment[];
  } catch {
    return [];
  }
}

export async function fetchStudentTransportAssignment(schoolId: string, studentId: string) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('student_transport_assignments')
      .select('*')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .in('status', ['pending', 'approved'])
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if ((error as any).code === '42P01' || (error as any).status === 404) return null;
      throw error;
    }
    return data as import('@/types').StudentTransportAssignment | null;
  } catch {
    return null;
  }
}

export async function fetchStudentTransportHistory(schoolId: string, studentId: string) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('student_transport_assignments')
      .select('*')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .order('assigned_at', { ascending: false });
    if (error) {
      if ((error as any).code === '42P01' || (error as any).status === 404) return [];
      throw error;
    }
    return (data || []) as import('@/types').StudentTransportAssignment[];
  } catch {
    return [];
  }
}

/**
 * Create a new transport assignment (admin or parent).
 * - Admin creates with status='pending' (or 'approved' for direct assign).
 * - Parent creates with status='pending', applied_by_parent=true.
 * Returns the created row.
 */
export async function createTransportAssignment(assignment: {
  school_id: string;
  student_id: string;
  bus_id: string;
  stop_id: string;
  start_date?: string;
  status?: TransportAssignmentStatus;
  applied_by_parent?: boolean;
}) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('student_transport_assignments')
    .insert(assignment)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as import('@/types').StudentTransportAssignment | null;
}

/**
 * Approve a pending transport assignment.
 * - Copies fare_snapshot from the stop at this moment.
 * - Sets status='approved', approved_by, approved_at.
 * - Caller should check seat capacity BEFORE calling this.
 * - If a fee record ID is provided, links it.
 * Returns the updated row.
 */
export async function approveTransportAssignment(
  assignmentId: string,
  approvedBy: string,
  fareSnapshot: TransportFareSnapshot,
  feeId?: string
) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('student_transport_assignments')
    .update({
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      fare_snapshot: fareSnapshot,
      ...(feeId ? { fee_id: feeId } : {}),
    })
    .eq('id', assignmentId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as import('@/types').StudentTransportAssignment | null;
}

/**
 * Reject a pending transport assignment.
 * Sets status='rejected' and stores the reason.
 */
export async function rejectTransportAssignment(
  assignmentId: string,
  rejectReason: string
) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('student_transport_assignments')
    .update({ status: 'rejected', reject_reason: rejectReason })
    .eq('id', assignmentId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as import('@/types').StudentTransportAssignment | null;
}

/**
 * Stop an approved assignment (soft-stop).
 * Sets status='stopped', end_date=today.
 * Does NOT delete any fee records.
 */
export async function stopTransportAssignment(
  assignmentId: string,
  endDate?: string
) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('student_transport_assignments')
    .update({
      status: 'stopped',
      end_date: endDate || new Date().toISOString().split('T')[0],
    })
    .eq('id', assignmentId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as import('@/types').StudentTransportAssignment | null;
}

/**
 * Count approved students on a specific bus (for capacity check).
 */
export async function countApprovedStudentsOnBus(
  schoolId: string,
  busId: string
): Promise<number> {
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase
      .from('student_transport_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('bus_id', busId)
      .eq('status', 'approved');
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ============================================================
// fetchTransportAll — single call for AdminTransport.tsx
// Returns buses (with nested stops), stops flat list, and
// assignments array from DB tables (migration 019).
// Falls back to empty arrays gracefully if tables don't exist.
// ============================================================
export async function fetchTransportAll(schoolId: string): Promise<{
  buses: import('@/types').TransportBus[];
  stops: import('@/types').TransportStop[];
  assignments: import('@/types').StudentTransportAssignment[];
}> {
  if (!supabase) return { buses: [], stops: [], assignments: [] };
  try {
    const [busRes, assignRes] = await Promise.all([
      supabase
        .from('transport_buses')
        .select('*, stops:transport_stops(*)')
        .eq('school_id', schoolId)
        .order('created_at'),
      supabase
        .from('student_transport_assignments')
        .select('*, bus:transport_buses(bus_number,route_name,vehicle_type,driver_name,driver_phone), stop:transport_stops(stop_name,area_landmark,pickup_time,drop_time,amount,fare_period,distance_km)')
        .eq('school_id', schoolId)
        .order('assigned_at', { ascending: false }),
    ]);

    if (busRes.error) {
      // Table doesn't exist yet — return empty
      if ((busRes.error as any).code === '42P01') return { buses: [], stops: [], assignments: [] };
      throw busRes.error;
    }

    const buses = ((busRes.data || []) as import('@/types').TransportBus[]).map((b) => {
      const sorted = [...(b.stops || [])]
        .map((st) => ({ ...st, amount: Number(st.amount) }))
        .sort((x, y) => (x.stop_order ?? 0) - (y.stop_order ?? 0));
      return { ...b, vehicle_type: b.vehicle_type || 'bus', stops: sorted, total_stops: sorted.length };
    });
    const stops = buses.flatMap((b) => (b.stops || []).map((s) => ({
      ...s,
      bus_number: b.bus_number,
      route_name: b.route_name,
      vehicle_type: b.vehicle_type,
      driver_name: b.driver_name,
      driver_phone: b.driver_phone,
    }))) as import('@/types').TransportStop[];

    // Flatten joined assignment data into the flat shape the UI expects
    const rawAssignments = (assignRes.data || []) as Array<
      import('@/types').StudentTransportAssignment & {
        bus?: { bus_number: string; route_name: string; vehicle_type?: import('@/types').VehicleType; driver_name?: string; driver_phone?: string };
        stop?: { stop_name: string; area_landmark?: string; pickup_time?: string; drop_time?: string; amount: number; fare_period?: string; distance_km?: number };
      }
    >;

    const assignments = rawAssignments.map((a) => ({
      ...a,
      bus_number: a.bus?.bus_number ?? a.bus_number,
      route_name: a.bus?.route_name ?? a.route_name,
      vehicle_type: a.bus?.vehicle_type ?? a.fare_snapshot?.vehicle_type ?? 'bus',
      driver_name: a.bus?.driver_name ?? a.driver_name,
      driver_phone: a.bus?.driver_phone ?? a.driver_phone,
      stop_name: a.stop?.stop_name ?? a.stop_name,
      area_landmark: a.stop?.area_landmark ?? a.area_landmark,
      pickup_time: a.stop?.pickup_time ?? a.pickup_time,
      drop_time: a.stop?.drop_time ?? a.drop_time,
      amount: Number(a.stop?.amount ?? a.amount ?? 0),
      fare_period: (a.stop?.fare_period ?? a.fare_period) as import('@/types').StudentTransportAssignment['fare_period'],
    } as import('@/types').StudentTransportAssignment));

    return { buses, stops, assignments };
  } catch {
    return { buses: [], stops: [], assignments: [] };
  }
}

// ============================================================
// saveTransportBus — upsert bus + replace all its stops atomically
// ============================================================
export async function saveTransportBus(
  schoolId: string,
  bus: {
    id?: string;
    bus_number: string;
    route_name: string;
    capacity?: number;
    driver_name?: string;
    driver_phone?: string;
    conductor_name?: string;
    conductor_phone?: string;
    status?: string;
    vehicle_type?: import('@/types').VehicleType;
    insurance_expiry?: string | null;
    fitness_expiry?: string | null;
    permit_expiry?: string | null;
  },
  stops: Array<{
    id?: string;
    stop_name: string;
    area_landmark?: string;
    pickup_time?: string;
    drop_time?: string;
    distance_km?: number;
    amount: number;
    fare_period?: string;
    stop_order: number;
  }>
): Promise<import('@/types').TransportBus> {
  if (!supabase) throw new Error('Supabase not initialised');

  // 1. Upsert the bus
  const { data: busRow, error: busErr } = await supabase
    .from('transport_buses')
    .upsert({ ...bus, school_id: schoolId }, { onConflict: 'id' })
    .select()
    .maybeSingle();
  if (busErr) throw busErr;
  if (!busRow) throw new Error('Bus save returned no data');

  const busId = (busRow as { id: string }).id;

  // 2. Delete stops that were removed (stops not in new list)
  const keepIds = stops.filter((s) => s.id).map((s) => s.id as string);
  if (keepIds.length > 0) {
    await supabase
      .from('transport_stops')
      .delete()
      .eq('bus_id', busId)
      .not('id', 'in', `(${keepIds.join(',')})`);
  } else {
    // All stops are new — delete all existing ones
    await supabase.from('transport_stops').delete().eq('bus_id', busId);
  }

  // 3. Upsert all stops
  const stopRows = stops.map((s, idx) => ({
    ...(s.id ? { id: s.id } : {}),
    school_id: schoolId,
    bus_id: busId,
    stop_name: s.stop_name,
    area_landmark: s.area_landmark || null,
    pickup_time: s.pickup_time || null,
    drop_time: s.drop_time || null,
    distance_km: s.distance_km ?? null,
    amount: s.amount,
    fare_period: s.fare_period || 'Monthly',
    stop_order: s.stop_order ?? idx + 1,
  }));

  const { data: savedStops, error: stopsErr } = await supabase
    .from('transport_stops')
    .upsert(stopRows, { onConflict: 'id' })
    .select();
  if (stopsErr) throw stopsErr;

  return {
    ...(busRow as import('@/types').TransportBus),
    stops: (savedStops || []) as import('@/types').TransportStop[],
    total_stops: (savedStops || []).length,
  };
}

// ============================================================
// deleteTransportBusWithStops — cascade-deletes bus and all stops
// (assignments are protected by RESTRICT on stop_id FK — must
//  be stopped/removed first by the caller)
// ============================================================
export async function deleteTransportBusWithStops(busId: string): Promise<void> {
  if (!supabase) return;
  // Stops are ON DELETE CASCADE from bus, so just delete the bus
  await deleteRowById('transport_buses', busId);
}

// ============================================================
// createOrUpdateAssignment — admin-side direct assignment
// ============================================================
export async function createOrUpdateAssignment(assignment: {
  id?: string;
  school_id: string;
  student_id: string;
  bus_id: string;
  stop_id: string;
  start_date?: string;
  status?: string;
  applied_by_parent?: boolean;
  fare_snapshot?: import('@/types').TransportFareSnapshot;
  approved_by?: string;
  approved_at?: string;
}): Promise<import('@/types').StudentTransportAssignment> {
  if (!supabase) throw new Error('Supabase not initialised');
  const { data, error } = await supabase
    .from('student_transport_assignments')
    .upsert({ ...assignment, assigned_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Assignment save returned no data');
  return data as import('@/types').StudentTransportAssignment;
}

// ============================================================
// updateAssignmentStatus — approve / reject / stop
// ============================================================
export async function updateAssignmentStatus(
  assignmentId: string,
  updates: {
    status: string;
    approved_by?: string;
    approved_at?: string;
    fare_snapshot?: import('@/types').TransportFareSnapshot;
    reject_reason?: string;
    end_date?: string;
    fee_id?: string;
  }
): Promise<import('@/types').StudentTransportAssignment> {
  if (!supabase) throw new Error('Supabase not initialised');
  const { data, error } = await supabase
    .from('student_transport_assignments')
    .update(updates)
    .eq('id', assignmentId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Assignment update returned no data');
  return data as import('@/types').StudentTransportAssignment;
}

// ============================================================
// deleteAssignment — hard delete (only if no payments)
// ============================================================
export async function deleteAssignment(assignmentId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('student_transport_assignments')
    .delete()
    .eq('id', assignmentId);
  if (error) throw error;
}

// ==========================================
// Admin dashboard (server-side summary)
// ==========================================
export async function fetchAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  const { data, error } = await supabase.rpc('admin_dashboard');
  if (error) throw error;
  return data as AdminDashboardSummary;
}

// ==========================================
// Academic sessions
// ==========================================
export async function fetchAcademicSessions(schoolId: string) {
  const { data, error } = await supabase
    .from('academic_sessions')
    .select('*')
    .eq('school_id', schoolId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AcademicSession[];
}

export async function saveAcademicSession(session: {
  id?: string; school_id: string; name: string; start_date: string; end_date: string; is_current?: boolean;
}) {
  const { id, ...rest } = session;
  const query = id
    ? supabase.from('academic_sessions').update(rest).eq('id', id)
    : supabase.from('academic_sessions').insert(rest);
  const { data, error } = await query.select().maybeSingle();
  if (error) {
    if (error.code === '23505') throw new Error(`A session named "${session.name}" already exists`);
    if (error.code === '23514') throw new Error('End date must be after the start date');
    throw error;
  }
  apiCache.delete(`school:${session.school_id}`);
  return data as AcademicSession;
}

export async function setCurrentAcademicSession(id: string, schoolId: string) {
  const { error } = await supabase.from('academic_sessions').update({ is_current: true }).eq('id', id);
  if (error) throw error;
  apiCache.delete(`school:${schoolId}`);
  try { sessionStorage.removeItem(`veducore_cached_school:${schoolId}`); } catch { /* ignore */ }
}

export async function deleteAcademicSession(id: string) {
  await deleteRowById('academic_sessions', id);
}

export async function countSessionEnrollments(sessionId: string) {
  const { count, error } = await supabase
    .from('student_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  if (error) throw error;
  return count ?? 0;
}

// ==========================================
// Staff roles & permissions
// ==========================================
export async function fetchMyPermissions(): Promise<MyPermissions> {
  const { data, error } = await supabase.rpc('my_permissions');
  if (error) throw error;
  return (data as MyPermissions) ?? {};
}

export async function fetchStaffRoles(schoolId: string) {
  const { data, error } = await supabase
    .from('staff_roles').select('*').eq('school_id', schoolId).order('is_system', { ascending: false }).order('name');
  if (error) throw error;
  return (data ?? []) as StaffRole[];
}

export async function saveStaffRole(role: {
  id?: string; school_id: string; name: string; description?: string | null; permissions: Record<string, PermissionLevel>;
}) {
  const { id, ...rest } = role;
  const payload = { ...rest, updated_at: new Date().toISOString() };
  const q = id ? supabase.from('staff_roles').update(payload).eq('id', id) : supabase.from('staff_roles').insert(payload);
  const { data, error } = await q.select().maybeSingle();
  if (error) {
    if (error.code === '23505') throw new Error(`A role named "${role.name}" already exists`);
    throw error;
  }
  return data as StaffRole;
}

export async function deleteStaffRole(id: string) {
  const { error } = await supabase.rpc('delete_staff_role', { p_role: id });
  if (error) throw error;
}

export async function listSchoolStaff() {
  const { data, error } = await supabase.rpc('list_school_staff');
  if (error) throw error;
  return (data ?? []) as StaffMember[];
}

export async function assignStaffRole(userId: string, roleId: string | null) {
  const { error } = await supabase.rpc('assign_staff_role', { p_user: userId, p_role: roleId });
  if (error) throw error;
}

export async function setStaffStatus(userId: string, status: 'active' | 'inactive') {
  const { error } = await supabase.rpc('set_staff_status', { p_user: userId, p_status: status });
  if (error) throw error;
}

/**
 * Creates an admin-panel login with a staff role. The role is assigned
 * again through the owner-only RPC right after creation so the account can
 * never end up as an unrestricted owner (e.g. if an older create-user
 * function is deployed). If that fails the account is deactivated.
 */
export async function createStaffAccount(params: {
  email: string; password: string; full_name: string; school_id: string; phone?: string; staff_role_id: string;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      full_name: params.full_name,
      role: 'admin',
      school_id: params.school_id,
      phone: params.phone,
      extra: { staff_role_id: params.staff_role_id },
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Failed to create staff account');

  try {
    await assignStaffRole(result.id, params.staff_role_id);
  } catch (err) {
    await setStaffStatus(result.id, 'inactive').catch(() => {});
    throw new Error('Account created but the role could not be assigned, so it was deactivated. ' +
      (err instanceof Error ? err.message : ''));
  }
  return result as { id: string; email: string; password: string };
}

// ==========================================
// Exams & results
// ==========================================
type ExamRow = Omit<Exam, 'class_ids'> & { exam_classes: { class_id: string }[] | null };

export async function fetchExams(schoolId: string, sessionId?: string | null) {
  let q = supabase.from('exams').select('*, exam_classes(class_id)').eq('school_id', schoolId)
    .order('start_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false });
  if (sessionId) q = q.eq('session_id', sessionId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as ExamRow[]).map(({ exam_classes, ...e }) => ({
    ...e, class_ids: (exam_classes ?? []).map((c) => c.class_id),
  })) as Exam[];
}

export async function fetchExam(id: string) {
  const { data, error } = await supabase.from('exams').select('*, exam_classes(class_id)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { exam_classes, ...e } = data as ExamRow;
  return { ...e, class_ids: (exam_classes ?? []).map((c) => c.class_id) } as Exam;
}

export async function saveExam(exam: {
  id?: string; school_id: string; name: string; record_type: RecordType;
  start_date: string | null; end_date: string | null; grading_scale_id: string | null;
  instructions: string | null; class_ids: string[];
}) {
  const { id, class_ids, ...rest } = exam;
  const q = id ? supabase.from('exams').update(rest).eq('id', id) : supabase.from('exams').insert(rest);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw error;
  const examId = (data as { id: string }).id;

  const { data: existing } = await supabase.from('exam_classes').select('class_id').eq('exam_id', examId);
  const have = new Set((existing ?? []).map((r: { class_id: string }) => r.class_id));
  const want = new Set(class_ids);
  const add = class_ids.filter((c) => !have.has(c)).map((class_id) => ({ exam_id: examId, class_id }));
  const remove = [...have].filter((c) => !want.has(c));
  if (add.length) {
    const { error: e1 } = await supabase.from('exam_classes').insert(add);
    if (e1) throw e1;
  }
  if (remove.length) {
    const { error: e2 } = await supabase.from('exam_classes').delete().eq('exam_id', examId).in('class_id', remove);
    if (e2) throw e2;
    await supabase.from('exam_schedule').delete().eq('exam_id', examId).in('class_id', remove);
  }
  // Keep teacher-facing exam_defs in step once a datesheet exists.
  if (id) await supabase.rpc('sync_exam_defs', { p_exam: examId });
  return examId;
}

export async function deleteExam(id: string) {
  await deleteRowById('exams', id);
}

export async function fetchExamSchedule(examId: string) {
  const { data, error } = await supabase.from('exam_schedule').select('*').eq('exam_id', examId);
  if (error) throw error;
  return (data ?? []) as ExamScheduleRow[];
}

/** Replaces the datesheet for one class, then syncs teacher exam_defs. */
export async function saveExamScheduleForClass(examId: string, classId: string, rows: ExamScheduleRow[]) {
  const keep = rows.map((r) => r.subject_id);
  let del = supabase.from('exam_schedule').delete().eq('exam_id', examId).eq('class_id', classId);
  if (keep.length) del = del.not('subject_id', 'in', `(${keep.join(',')})`);
  const { error: delErr } = await del;
  if (delErr) throw delErr;
  if (rows.length) {
    const payload = rows.map(({ id: _id, ...r }) => ({ ...r, exam_id: examId, class_id: classId }));
    const { error } = await supabase.from('exam_schedule').upsert(payload, { onConflict: 'exam_id,class_id,subject_id' });
    if (error) throw error;
  }
  const { error: syncErr } = await supabase.rpc('sync_exam_defs', { p_exam: examId });
  if (syncErr) throw syncErr;
}

export async function fetchExamProgress(examId: string) {
  const { data, error } = await supabase.rpc('exam_progress', { p_exam: examId });
  if (error) throw error;
  return (data ?? []) as ExamProgressRow[];
}

export async function fetchExamResults(examId: string, sectionId?: string | null) {
  const { data, error } = await supabase.rpc('exam_results', { p_exam: examId, p_section: sectionId ?? null });
  if (error) throw error;
  return ((data ?? []) as ExamResultRow[]).map((r) => ({
    ...r,
    total: r.total === null ? null : Number(r.total),
    max_total: r.max_total === null ? null : Number(r.max_total),
    percent: r.percent === null ? null : Number(r.percent),
  }));
}

export async function publishExam(examId: string, publish = true) {
  const { data, error } = await supabase.rpc('publish_exam', { p_exam: examId, p_publish: publish });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Marks for one exam + subject in a section, keyed by student. */
export async function fetchExamMarks(examId: string, subjectId: string, studentIds: string[]) {
  if (!studentIds.length) return {} as Record<string, { id: string; marks: number; teacher_comment: string | null }>;
  const { data, error } = await supabase.from('student_records')
    .select('id, student_id, marks, teacher_comment')
    .eq('exam_id', examId).eq('subject_id', subjectId).in('student_id', studentIds);
  if (error) throw error;
  const out: Record<string, { id: string; marks: number; teacher_comment: string | null }> = {};
  for (const r of (data ?? []) as { id: string; student_id: string; marks: number; teacher_comment: string | null }[]) {
    out[r.student_id] = { id: r.id, marks: Number(r.marks), teacher_comment: r.teacher_comment };
  }
  return out;
}

export async function saveExamMarks(params: {
  school_id: string; exam: Exam; subject: { id: string; name: string }; max_marks: number;
  entries: { student_id: string; record_id?: string; marks: number | null }[];
}) {
  const { school_id, exam, subject, max_marks, entries } = params;
  const toDelete = entries.filter((e) => e.marks === null && e.record_id).map((e) => e.record_id as string);
  const toUpdate = entries.filter((e) => e.marks !== null && e.record_id);
  const toInsert = entries.filter((e) => e.marks !== null && !e.record_id);

  if (toDelete.length) {
    const { error } = await supabase.from('student_records').delete().in('id', toDelete);
    if (error) throw error;
  }
  // Each row has its own value, so updates can't be one statement; send
  // them in parallel batches instead of one round trip per student.
  for (let i = 0; i < toUpdate.length; i += 10) {
    const results = await Promise.all(toUpdate.slice(i, i + 10).map((e) =>
      supabase.from('student_records').update({ marks: e.marks, max_marks }).eq('id', e.record_id as string)));
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }
  if (toInsert.length) {
    const { error } = await supabase.from('student_records').insert(toInsert.map((e) => ({
      school_id, student_id: e.student_id, subject_id: subject.id, subject_name: subject.name,
      record_type: exam.record_type, exam_name: exam.name, exam_id: exam.id,
      marks: e.marks, max_marks, date: exam.start_date ?? new Date().toISOString().slice(0, 10),
    })));
    if (error) throw error;
  }
}

export async function fetchGradingScales(schoolId: string) {
  const { data, error } = await supabase.from('grading_scales')
    .select('*, bands:grade_bands(*)').eq('school_id', schoolId).order('is_default', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as GradingScale[]).map((g) => ({
    ...g,
    pass_percent: Number(g.pass_percent),
    bands: [...(g.bands ?? [])].map((b) => ({ ...b, min_percent: Number(b.min_percent), grade_point: b.grade_point === null ? null : Number(b.grade_point) }))
      .sort((a, b) => b.min_percent - a.min_percent),
  }));
}

export async function saveGradingScale(scaleId: string, passPercent: number, bands: GradeBand[]) {
  const { error: e1 } = await supabase.from('grading_scales').update({ pass_percent: passPercent, updated_at: new Date().toISOString() }).eq('id', scaleId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('grade_bands').delete().eq('scale_id', scaleId);
  if (e2) throw e2;
  const { error: e3 } = await supabase.from('grade_bands').insert(bands.map((b) => ({
    scale_id: scaleId, grade: b.grade.trim(), min_percent: b.min_percent, grade_point: b.grade_point, remark: b.remark || null,
  })));
  if (e3) throw e3;
}

export async function fetchAttendanceSummary(sectionId: string, from: string, to: string) {
  const { data, error } = await supabase.rpc('attendance_summary', { p_section: sectionId, p_from: from, p_to: to });
  if (error) throw error;
  const out: Record<string, { present: number; absent: number; late: number; on_leave: number; medical: number; total: number }> = {};
  for (const r of (data ?? []) as { student_id: string; present: number; absent: number; late: number; on_leave: number; medical: number; total: number }[]) {
    out[r.student_id] = r;
  }
  return out;
}

/** Existing marks for one exam name + subject among the given students. */
export async function fetchRecordsForExamSubject(examName: string, subjectId: string, studentIds: string[]) {
  if (!studentIds.length) return [] as StudentRecord[];
  const { data, error } = await supabase.from('student_records').select('*')
    .eq('subject_id', subjectId).ilike('exam_name', examName).in('student_id', studentIds);
  if (error) throw error;
  return (data ?? []) as StudentRecord[];
}

export async function fetchExamStatuses(examIds: string[]) {
  if (!examIds.length) return {} as Record<string, string>;
  const { data, error } = await supabase.from('exams').select('id, status').in('id', examIds);
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { id: string; status: string }[]).map((e) => [e.id, e.status]));
}

/** Marks of students in the given sections (light columns for counting). */
export async function fetchRecordsForSections(sectionIds: string[]) {
  if (!sectionIds.length) return [] as StudentRecord[];
  const { data, error } = await supabase.from('student_records')
    .select('id, student_id, subject_id, exam_name, exam_id, marks, student:students!inner(id, section_id)')
    .in('student.section_id', sectionIds);
  if (error) throw error;
  return (data ?? []) as unknown as StudentRecord[];
}

// ==========================================
// Certificates & promotion
// ==========================================
export class DuesPendingError extends Error {
  constructor(public amount: number) { super(`Fees of ₹${amount.toLocaleString('en-IN')} are outstanding`); }
}

export async function fetchStudentOutstanding(studentId: string) {
  const { data, error } = await supabase.rpc('student_outstanding', { p_student: studentId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function issueCertificate(studentId: string, type: CertificateType, data: Record<string, unknown>, force = false) {
  const { data: row, error } = await supabase.rpc('issue_certificate', { p_student: studentId, p_type: type, p_data: data, p_force: force });
  if (error) {
    const m = /DUES_PENDING:([\d.]+)/.exec(error.message);
    if (m) throw new DuesPendingError(Number(m[1]));
    throw new Error(error.message);
  }
  clearApiCache();
  return row as Certificate;
}

export async function cancelCertificate(id: string, reason: string, reactivate: boolean) {
  const { error } = await supabase.rpc('cancel_certificate', { p_id: id, p_reason: reason, p_reactivate: reactivate });
  if (error) throw error;
  clearApiCache();
}

export async function fetchCertificates(schoolId: string, studentId?: string) {
  let q = supabase.from('certificates').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(500);
  if (studentId) q = q.eq('student_id', studentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Certificate[];
}

export async function fetchPromotionStatus(classId: string) {
  const { data, error } = await supabase.rpc('promotion_status', { p_class: classId });
  if (error) throw error;
  return (data ?? []) as { student_id: string; from_status: string | null; from_class: string | null; current_class: string | null; current_section: string | null; active: boolean }[];
}

export async function promoteStudents(
  moves: { student_id: string; action: PromotionAction; class_id?: string | null; section_id?: string | null }[],
  renumber: boolean,
) {
  const { data, error } = await supabase.rpc('promote_students', { p_moves: moves, p_renumber: renumber });
  if (error) throw error;
  clearApiCache();
  return data as Record<PromotionAction, number>;
}

// ==========================================
// Attendance reports & staff attendance
// ==========================================
export async function fetchAttendanceOverview(date: string) {
  const { data, error } = await supabase.rpc('attendance_daily_overview', { p_date: date });
  if (error) throw error;
  return (data ?? []) as SectionDayOverview[];
}

export async function fetchAttendanceRegister(sectionId: string, from: string, to: string) {
  const { data, error } = await supabase.rpc('attendance_register', { p_section: sectionId, p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as RegisterRow[];
}

export async function fetchAttendanceDefaulters(from: string, to: string, threshold: number, classId?: string | null) {
  const { data, error } = await supabase.rpc('attendance_defaulters', { p_from: from, p_to: to, p_threshold: threshold, p_class: classId ?? null });
  if (error) throw error;
  return ((data ?? []) as AttendanceDefaulter[]).map((d) => ({ ...d, percent: Number(d.percent) }));
}

export async function notifyLowAttendance(studentIds: string[], from: string, to: string) {
  const { data, error } = await supabase.rpc('notify_low_attendance', { p_students: studentIds, p_from: from, p_to: to });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function fetchStaffAttendanceForDate(schoolId: string, date: string) {
  const { data, error } = await supabase.from('staff_attendance').select('*').eq('school_id', schoolId).eq('attendance_date', date);
  if (error) throw error;
  return (data ?? []) as { id: string; teacher_id: string; status: StaffAttendanceStatus; check_in: string | null; check_out: string | null; note: string | null }[];
}

export async function saveStaffAttendance(schoolId: string, date: string, rows: { teacher_id: string; status: StaffAttendanceStatus; check_in?: string | null; check_out?: string | null; note?: string | null }[]) {
  if (!rows.length) return;
  const { error } = await supabase.from('staff_attendance').upsert(
    rows.map((r) => ({ school_id: schoolId, attendance_date: date, teacher_id: r.teacher_id, status: r.status,
      check_in: r.check_in || null, check_out: r.check_out || null, note: r.note || null })),
    { onConflict: 'teacher_id,attendance_date' });
  if (error) throw error;
}

export async function fetchStaffAttendanceRegister(from: string, to: string) {
  const { data, error } = await supabase.rpc('staff_attendance_register', { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as StaffRegisterRow[];
}

// ==========================================
// Teacher: markable sections, self attendance, leave
// ==========================================
export async function fetchMyAttendanceSections() {
  const { data, error } = await supabase.rpc('my_attendance_sections');
  if (error) throw error;
  return (data ?? []) as { section_id: string; class_id: string; label: string; is_class_teacher: boolean }[];
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
  return (data ?? []) as StaffAttendanceRow[];
}

export async function applyLeave(type: 'full_day' | 'half_day', from: string, to: string, reason: string) {
  const { data, error } = await supabase.rpc('apply_leave', { p_type: type, p_from: from, p_to: to, p_reason: reason });
  if (error) throw new Error(error.message);
  return data as StaffLeave;
}

export async function cancelMyLeave(id: string) {
  const { error } = await supabase.rpc('cancel_my_leave', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function fetchMyLeaves(teacherId: string) {
  const { data, error } = await supabase.from('staff_leaves').select('*').eq('teacher_id', teacherId)
    .order('from_date', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as StaffLeave[];
}

export async function fetchLeaveRequests(schoolId: string, status?: StaffLeave['status']) {
  let q = supabase.from('staff_leaves').select('*, teacher:teachers(full_name, employee_id)').eq('school_id', schoolId)
    .order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as StaffLeave[];
}

export async function reviewLeave(id: string, approve: boolean, note?: string) {
  const { error } = await supabase.rpc('review_leave', { p_id: id, p_approve: approve, p_note: note ?? null });
  if (error) throw new Error(error.message);
}

/** Datesheet rows for several exams (teachers use this for subjects + max marks). */
export async function fetchExamScheduleFor(examIds: string[]) {
  if (!examIds.length) return [] as ExamScheduleRow[];
  const { data, error } = await supabase.from('exam_schedule').select('*').in('exam_id', examIds);
  if (error) throw error;
  return (data ?? []) as ExamScheduleRow[];
}

// ==========================================
// Online payments (Razorpay via the `payments` edge function)
// ==========================================
export interface GatewayStatus { active: boolean; key_id?: string; mode?: 'live' | 'test'; verified_at?: string; key_hint?: string }

export interface CreatedPayment {
  online_payment_id: string;
  key_id: string;
  order_id: string | null;
  link_url: string | null;
  amount: number; // paise
  breakdown: { fee: number; convenience: number; gst: number; total: number }; // paise
  description: string;
}

/** Same formula as the server (display only; the server decides the real amount). */
export function onlineCharges(feeRupees: number) {
  const fee = Math.round(feeRupees * 100);
  const convenience = Math.round(fee * 0.02);   // 2% convenience fee
  const gst = Math.round(convenience * 0.18);   // 18% GST on the convenience fee
  return { fee: fee / 100, convenience: convenience / 100, gst: gst / 100, total: (fee + convenience + gst) / 100 };
}

async function paymentsCall<T>(payload: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Payment service is unavailable. Please try again.');
  return body as T;
}

export async function fetchGatewayStatus(): Promise<GatewayStatus> {
  const { data, error } = await supabase.rpc('payment_gateway_status');
  if (error) return { active: false };
  return (data as GatewayStatus) ?? { active: false };
}

export const saveGateway = (keyId: string, keySecret: string) =>
  paymentsCall<GatewayStatus>({ action: 'gateway_save', key_id: keyId, key_secret: keySecret });
export const disableGateway = () => paymentsCall<GatewayStatus>({ action: 'gateway_disable' });

export const createOnlinePayment = (params: {
  channel: 'checkout' | 'link';
  allocations: { fee_id: string; amount: number }[];
  next_due_dates?: Record<string, string>;
  admission_receipt_id?: string | null;
}) => paymentsCall<CreatedPayment>({ action: 'create', ...params });

export const verifyOnlinePayment = (p: { online_payment_id: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
  paymentsCall<{ status: 'paid'; receipt_number: string }>({ action: 'verify', ...p });

export const checkOnlinePayment = (onlinePaymentId: string) =>
  paymentsCall<{ status: 'paid' | 'pending' | 'expired'; receipt_number?: string }>({ action: 'check', online_payment_id: onlinePaymentId });

let rzpScript: Promise<void> | null = null;
/** Loads Razorpay Checkout once. */
export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window !== 'undefined' && (window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve();
  rzpScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => { rzpScript = null; reject(new Error('Could not load Razorpay. Check your internet connection.')); };
    document.body.appendChild(s);
  });
  return rzpScript;
}

/**
 * Opens Razorpay Checkout for a created payment and resolves once the
 * payment is verified and recorded on the server. Rejects with
 * "cancelled" when the payer closes the window.
 */
export async function payWithCheckout(p: CreatedPayment, opts: { name: string; prefill?: { name?: string; email?: string; contact?: string } }) {
  await loadRazorpayCheckout();
  return new Promise<{ receipt_number: string }>((resolve, reject) => {
    const Rzp = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void } }).Razorpay;
    const rzp = new Rzp({
      key: p.key_id,
      order_id: p.order_id,
      amount: p.amount,
      currency: 'INR',
      name: opts.name,
      description: p.description,
      prefill: opts.prefill,
      theme: { color: '#5B6EE8' },
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          const v = await verifyOnlinePayment({ online_payment_id: p.online_payment_id, ...r });
          resolve({ receipt_number: v.receipt_number });
        } catch (e) {
          // Signature path failed (e.g. network) — ask Razorpay directly.
          try {
            const c = await checkOnlinePayment(p.online_payment_id);
            if (c.status === 'paid') resolve({ receipt_number: c.receipt_number ?? '' });
            else reject(e);
          } catch { reject(e); }
        }
      },
      modal: { ondismiss: () => reject(new Error('cancelled')) },
    });
    rzp.on('payment.failed', () => { /* Razorpay shows the error; the payer can retry in the same window */ });
    rzp.open();
  });
}

export interface OnlinePaymentRow {
  id: string;
  student_id: string;
  channel: 'checkout' | 'link';
  fee_amount: number; convenience_fee: number; gst_amount: number; total_amount: number; // paise
  status: 'created' | 'processing' | 'paid' | 'failed' | 'expired';
  receipt_number: string | null;
  razorpay_payment_id: string | null;
  unapplied_amount: number;
  refund_status: 'none' | 'needed' | 'refunded';
  error: string | null;
  created_at: string;
  paid_at: string | null;
  student?: { full_name: string; admission_number: string } | null;
}

/** Applies any finished-but-unrecorded payments the caller can see. */
export const reconcilePayments = () => paymentsCall<{ applied: number; pending: number }>({ action: 'reconcile' });

export async function fetchOnlinePayments(schoolId: string, limit = 200) {
  const { data, error } = await supabase.from('online_payments')
    .select('id, student_id, channel, fee_amount, convenience_fee, gst_amount, total_amount, status, receipt_number, razorpay_payment_id, unapplied_amount, refund_status, error, created_at, paid_at, student:students(full_name, admission_number)')
    .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as OnlinePaymentRow[];
}

/** Convenience fee + GST (₹) a parent paid on top of the fee, for receipts. */
export async function fetchConvenienceForReceipt(receiptNumber: string) {
  if (!receiptNumber?.startsWith('ONL-')) return null;
  const { data } = await supabase.from('online_payments')
    .select('fee_amount, convenience_fee, gst_amount, total_amount').eq('receipt_number', receiptNumber).maybeSingle();
  if (!data) return null;
  return {
    fee: Number(data.fee_amount) / 100,
    convenience: Number(data.convenience_fee) / 100,
    gst: Number(data.gst_amount) / 100,
    total: Number(data.total_amount) / 100,
  };
}

export async function markPaymentRefunded(id: string) {
  const { error } = await supabase.rpc('mark_payment_refunded', { p_id: id });
  if (error) throw error;
}

// ── Annual report cards (template designed by the Veducore team) ─────────────

export async function fetchReportCardTemplate(schoolId: string) {
  const { data, error } = await supabase.from('report_card_templates').select('*').eq('school_id', schoolId).maybeSingle();
  if (error) throw error;
  return data ? parseReportCardTemplate(data as Record<string, unknown>) : null;
}

/** slot key → exam id, for one session. */
export async function fetchReportCardExamMap(schoolId: string, sessionId: string) {
  const { data, error } = await supabase.from('report_card_exam_map').select('slot_key, exam_id')
    .eq('school_id', schoolId).eq('session_id', sessionId);
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { slot_key: string; exam_id: string }[]).map((r) => [r.slot_key, r.exam_id])) as Record<string, string>;
}

export async function setReportCardExamSlot(schoolId: string, sessionId: string, slotKey: string, examId: string | null) {
  if (!examId) {
    const { error } = await supabase.from('report_card_exam_map').delete()
      .eq('school_id', schoolId).eq('session_id', sessionId).eq('slot_key', slotKey);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('report_card_exam_map').upsert(
    { school_id: schoolId, session_id: sessionId, slot_key: slotKey, exam_id: examId, updated_at: new Date().toISOString() },
    { onConflict: 'school_id,session_id,slot_key' },
  );
  if (error) throw error;
}

export async function setReportCardPrintOffset(x: number, y: number) {
  const { error } = await supabase.rpc('set_report_card_print_offset', { p_x: x, p_y: y });
  if (error) throw error;
}
