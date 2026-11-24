/**
 * Parent logins use the parent's mobile number.
 * Behind the scenes the auth email is <10-digit mobile>@parent.veducore, so
 * one mobile number = one parent login (siblings share it).
 * Teacher logins work the same way: <10-digit mobile>@teacher.veducore.
 * Default password for both comes from a name (the student's name for the
 * parent login, the teacher's own name for a teacher) — see namePassword().
 */
export const PARENT_LOGIN_DOMAIN = 'parent.veducore';
export const TEACHER_LOGIN_DOMAIN = 'teacher.veducore';

export interface NameParts {
  first_name: string;
  middle_name: string;
  last_name: string;
}

const cleanPart = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ');

/** "Rahul Kumar Sharma" → first/middle/last. Two words = first + last; 4+ words keep the extras in middle. */
export function splitFullName(full: string | null | undefined): NameParts {
  const w = cleanPart(full).split(' ').filter(Boolean);
  if (w.length === 0) return { first_name: '', middle_name: '', last_name: '' };
  if (w.length === 1) return { first_name: w[0], middle_name: '', last_name: '' };
  if (w.length === 2) return { first_name: w[0], middle_name: '', last_name: w[1] };
  return { first_name: w[0], middle_name: w.slice(1, -1).join(' '), last_name: w[w.length - 1] };
}

/** First + middle + last → "Rahul Kumar Sharma" (empty parts skipped). */
export function joinName(p: Partial<NameParts>): string {
  return [p.first_name, p.middle_name, p.last_name].map(cleanPart).filter(Boolean).join(' ');
}

/** The stored name parts of a row, falling back to splitting full_name for older rows. */
export function namePartsOf(row: { first_name?: string | null; middle_name?: string | null; last_name?: string | null; full_name?: string | null }): NameParts {
  if (cleanPart(row.first_name)) {
    return { first_name: cleanPart(row.first_name), middle_name: cleanPart(row.middle_name), last_name: cleanPart(row.last_name) };
  }
  return splitFullName(row.full_name);
}

/** Trimmed parts, with a middle name but no last name treated as the last name. */
export function tidyNameParts(p: Partial<NameParts>): NameParts {
  const first = cleanPart(p.first_name), middle = cleanPart(p.middle_name), last = cleanPart(p.last_name);
  return last || !middle ? { first_name: first, middle_name: middle, last_name: last } : { first_name: first, middle_name: '', last_name: middle };
}

/**
 * Default password from a name, lowercase, letters only:
 *  • first + middle + last → 2 letters of each   Rahul Kumar Sharma → rakush@gvps
 *  • first + last          → 4 + 2               Rahul Sharma       → rahush@gvps
 *  • first only            → 4                   Rahul              → rahu@gvps
 */
export function namePassword(parts: Partial<NameParts>, shortName: string): string {
  const t = tidyNameParts(parts);
  const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const f = letters(t.first_name), m = letters(t.middle_name), l = letters(t.last_name);
  let base = m && l ? f.slice(0, 2) + m.slice(0, 2) + l.slice(0, 2)
    : l ? f.slice(0, 4) + l.slice(0, 2)
    : f.slice(0, 4);
  if (base.length < 2) base = 'user';
  return `${base}@${shortName || 'school'}`;
}

/** "+91 98765-43210" / "098765 43210" → "9876543210"; null if it isn't a valid Indian mobile. */
export function normalizeMobile(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function parentLoginEmail(mobile: string): string {
  return `${mobile}@${PARENT_LOGIN_DOMAIN}`;
}

export function teacherLoginEmail(mobile: string): string {
  return `${mobile}@${TEACHER_LOGIN_DOMAIN}`;
}

/** What to show as a login: the mobile number for mobile logins (parent or teacher), else the stored email. */
export function parentLoginId(email: string | null | undefined): string {
  const e = (email ?? '').trim();
  for (const domain of [PARENT_LOGIN_DOMAIN, TEACHER_LOGIN_DOMAIN]) {
    const suffix = `@${domain}`;
    if (e.toLowerCase().endsWith(suffix)) return e.slice(0, -suffix.length);
  }
  return e;
}
export const loginIdFromEmail = parentLoginId;

/** School short name for passwords: the one Veducore set, else the first word of the name. */
export function schoolShortName(school: { short_name?: string | null; name?: string | null } | null | undefined): string {
  const set = (school?.short_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return set || getSchoolSlug(school?.name ?? '');
}

/** Parent's name and relationship from the student's father / mother names. */
export function parentFromStudent(s: { father_name?: string | null; mother_name?: string | null; full_name: string }) {
  if (s.father_name?.trim()) return { name: s.father_name.trim(), relationship: 'Father' };
  if (s.mother_name?.trim()) return { name: s.mother_name.trim(), relationship: 'Mother' };
  return { name: `${s.full_name.trim()}'s Parent`, relationship: 'Guardian' };
}

/** Returns the first word of a school name, lowercased and letters-only.
 *  e.g. "Green Valley Convent School" → "green"
 *       "greenvalleyconventschool" → "green"
 *       "Greenwood International School" → "greenwood" */
export function getSchoolSlug(schoolName: string): string {
  if (!schoolName) return 'school';
  let name = schoolName.trim();
  // Handle camelCase e.g. "GreenValley" -> "Green Valley"
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');

  // If no spaces, check if words like valley/convent/school/academy/public/international/high are concatenated
  if (!/\s/.test(name)) {
    const compoundMatch = name.match(/^([a-zA-Z]+?)(valley|convent|school|academy|public|international|grammar|high|college|vidyalaya|vidhyalaya|gurukul|foundation)/i);
    if (compoundMatch && compoundMatch[1]) {
      name = compoundMatch[1];
    }
  }

  // Get first word, stripping non-alphanumeric
  const firstWord = (name.split(/[\s_\-.]+/)[0] ?? 'school')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return firstWord || 'school';
}

/** Generates teacher username: firstname@schoolslug.veducore */
export function generateTeacherUsername(fullName: string, schoolName: string): string {
  const first = (fullName.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const slug = getSchoolSlug(schoolName);
  return first && slug ? `${first}@${slug}.veducore` : '';
}

/** Parent login for a student: parent's mobile number + password from the student's name. */
export function generateParentCredentials(params: {
  mobile: string;
  studentName: Partial<NameParts>;
  shortName: string;
}): { username: string; email: string; password: string } {
  return {
    username: params.mobile,
    email: parentLoginEmail(params.mobile),
    password: namePassword(params.studentName, params.shortName),
  };
}

/** Teacher login: teacher's mobile number + password from the teacher's own name. */
export function generateTeacherCredentials(params: {
  mobile: string;
  name: Partial<NameParts>;
  shortName: string;
}): { username: string; email: string; password: string } {
  return {
    username: params.mobile,
    email: teacherLoginEmail(params.mobile),
    password: namePassword(params.name, params.shortName),
  };
}
