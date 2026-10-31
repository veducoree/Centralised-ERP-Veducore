import type { Student } from '@/types';

export interface ParentChildEntry {
  studentId: string;
  studentName: string;
  className: string;
  sectionName: string;
  admissionNumber: string;
  username: string;
  password: string;
}

export interface ParentGroup {
  id: string;
  fatherName: string;
  motherName: string;
  parentEmail: string;
  parentPhone: string;
  children: ParentChildEntry[];
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

/** Generates parent credentials:
 *  username: admissionnumber@schoolslug.veducore (e.g. 23@green.veducore)
 *  password: studentfirstname4letters + dobYear (e.g. arya2005)
 */
export function generateParentCredentials(
  studentName: string,
  admissionNumber: string,
  schoolName = 'school',
  dateOfBirth?: string | null,
): { username: string; password: string } {
  const slug = getSchoolSlug(schoolName);
  const adm = admissionNumber.replace(/\s+/g, '');
  const username = `${adm}@${slug}.veducore`;

  // Student name first 4 letters (letters only, lowercase)
  const lettersOnly = studentName.replace(/[^a-zA-Z]/g, '').toLowerCase();
  const namePart = (lettersOnly.slice(0, 4) || 'user').padEnd(4, '0');

  // DOB year (e.g. "2005-08-15" or "15/08/2005" → "2005")
  let year = '';
  if (dateOfBirth) {
    const match = dateOfBirth.match(/(\d{4})/);
    if (match) year = match[1];
  }
  if (!year) {
    const admMatch = admissionNumber.match(/(\d{4})/);
    year = admMatch ? admMatch[1] : '2005';
  }

  const password = `${namePart}${year}`;

  return { username, password };
}

export function getParentGroups(students: Student[], schoolName = 'school'): ParentGroup[] {
  const map = new Map<string, ParentGroup>();

  for (const student of students) {
    const email = (student.parent_email ?? '').trim().toLowerCase();
    const mother = (student.mother_name ?? '').trim().toLowerCase();
    if (!email && !mother) continue;

    const key = `${email}||${mother}`;
    const creds = generateParentCredentials(
      student.full_name,
      student.admission_number ?? '',
      schoolName,
      student.date_of_birth,
    );

    const child: ParentChildEntry = {
      studentId: student.id,
      studentName: student.full_name,
      className: student.class?.name ?? '',
      sectionName: student.section?.name ?? '',
      admissionNumber: student.admission_number ?? '',
      username: creds.username,
      password: creds.password,
    };

    if (map.has(key)) {
      map.get(key)!.children.push(child);
    } else {
      map.set(key, {
        id: `pg-${key.replace(/[^a-z0-9]/g, '-')}`,
        fatherName: student.father_name ?? '',
        motherName: student.mother_name ?? '',
        parentEmail: student.parent_email ?? '',
        parentPhone: '',
        children: [child],
      });
    }
  }

  return Array.from(map.values());
}
