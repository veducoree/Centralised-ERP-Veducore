/**
 * Parent logins use the parent's mobile number.
 * Behind the scenes the auth email is <10-digit mobile>@parent.veducore, so
 * one mobile number = one parent login (siblings share it).
 * Default password: <parent first name>@<school short name>, e.g. ramesh@gvps
 */
export const PARENT_LOGIN_DOMAIN = 'parent.veducore';

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

/** What to show as the parent's login: the mobile number for new-style logins, else the stored email. */
export function parentLoginId(email: string | null | undefined): string {
  const e = (email ?? '').trim();
  const suffix = `@${PARENT_LOGIN_DOMAIN}`;
  return e.toLowerCase().endsWith(suffix) ? e.slice(0, -suffix.length) : e;
}

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

/** Default parent password: first name (letters only, lowercase) @ school short name. */
export function parentPassword(parentName: string, shortName: string): string {
  const first = (parentName.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const name = first.length >= 2 ? first : 'parent';
  return `${name}@${shortName || 'school'}`;
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

/** Parent login for a student: mobile number + default password. */
export function generateParentCredentials(params: {
  mobile: string;
  parentName: string;
  shortName: string;
}): { username: string; email: string; password: string } {
  return {
    username: params.mobile,
    email: parentLoginEmail(params.mobile),
    password: parentPassword(params.parentName, params.shortName),
  };
}
