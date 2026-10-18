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
 *  e.g. "Greenwood International School" → "greenwood" */
export function getSchoolSlug(schoolName: string): string {
  return (schoolName.trim().split(/\s+/)[0] ?? 'school')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Generates teacher username: firstname@schoolslug.veducore */
export function generateTeacherUsername(fullName: string, schoolName: string): string {
  const first = (fullName.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const slug = getSchoolSlug(schoolName);
  return first && slug ? `${first}@${slug}.veducore` : '';
}

/** Generates parent credentials: admissionnumber@schoolslug.veducore */
export function generateParentCredentials(
  studentName: string,
  admissionNumber: string,
  schoolName = 'school',
): { username: string; password: string } {
  const slug = getSchoolSlug(schoolName);
  const adm = admissionNumber.replace(/\s+/g, '');
  const username = `${adm}@${slug}.veducore`;
  const yearMatch = admissionNumber.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
  const namePart = studentName.replace(/\s+/g, '').toLowerCase().slice(0, 4);
  return { username, password: `${namePart}${year}` };
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
