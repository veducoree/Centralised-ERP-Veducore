// Loads everything one section's annual report cards need and fills them.
import {
  fetchAcademicSessions, fetchAttendanceSummary, fetchClasses, fetchExamResults, fetchExamSchedule, fetchExams,
  fetchGradingScales, fetchReportCardExamMap, fetchReportCardTemplate, fetchStudentsBySection, fetchSubjects,
} from '@/services/api';
import type { AcademicSession, Exam, GradingScale } from '@/types';
import { attendanceEndDates, buildCards, matchRowSubject, type EngineInput, type SlotData } from './engine';
import type { CardValues, ReportCardTemplate } from './types';

export interface SlotStatus {
  key: string;
  label: string;
  exam: Exam | null;
  /** Why this column isn't final yet, or null when it is. */
  problem: string | null;
}

export interface AnnualCards {
  template: ReportCardTemplate;
  session: AcademicSession;
  className: string;
  sectionName: string;
  cards: CardValues[];
  slots: SlotStatus[];
  /** All exams linked and published: final cards can be printed. */
  ready: boolean;
  warnings: string[];
}

const today = () => new Date().toISOString().slice(0, 10);

export function slotStatuses(template: ReportCardTemplate, exams: Exam[], map: Record<string, string>, classId?: string): SlotStatus[] {
  return template.slots.map((s) => {
    const exam = exams.find((e) => e.id === map[s.key]) ?? null;
    let problem: string | null = null;
    if (!exam) problem = 'Not linked to an exam';
    else if (classId && !exam.class_ids.includes(classId)) problem = 'This class is not in the exam';
    else if (exam.status !== 'published') problem = 'Results not published yet';
    return { key: s.key, label: s.label || 'Untitled', exam, problem };
  });
}

function pickScale(scales: GradingScale[], exams: (Exam | null)[]): GradingScale | null {
  for (let i = exams.length - 1; i >= 0; i--) {
    const id = exams[i]?.grading_scale_id;
    const hit = id ? scales.find((g) => g.id === id) : undefined;
    if (hit) return hit;
  }
  return scales.find((g) => g.is_default) ?? scales[0] ?? null;
}

export async function loadAnnualCards(params: { schoolId: string; sessionId: string; sectionId: string }): Promise<AnnualCards> {
  const { schoolId, sessionId, sectionId } = params;
  const [template, sessions, exams, map, classes, allSubjects, students, scales] = await Promise.all([
    fetchReportCardTemplate(schoolId),
    fetchAcademicSessions(schoolId),
    fetchExams(schoolId, sessionId),
    fetchReportCardExamMap(schoolId, sessionId),
    fetchClasses(schoolId),
    fetchSubjects(schoolId),
    fetchStudentsBySection(sectionId),
    fetchGradingScales(schoolId),
  ]);
  if (!template) throw new Error('No report card template has been set up for your school yet.');
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error('Academic session not found');
  const cls = classes.find((c) => c.sections.some((s) => s.id === sectionId));
  if (!cls) throw new Error('Section not found');
  const section = cls.sections.find((s) => s.id === sectionId)!;
  const subjects = allSubjects.filter((s) => s.class_id === cls.id).map((s) => ({ id: s.id, name: s.name }));

  const slots = slotStatuses(template, exams, map, cls.id);

  // Marks and max marks per column.
  const slotData: Record<string, SlotData> = {};
  await Promise.all(slots.map(async (st) => {
    if (!st.exam || !st.exam.class_ids.includes(cls.id)) {
      slotData[st.key] = { exam: null, maxBySubject: {}, marks: {} };
      return;
    }
    const [results, schedule] = await Promise.all([fetchExamResults(st.exam.id, sectionId), fetchExamSchedule(st.exam.id)]);
    const maxBySubject: Record<string, number> = {};
    for (const row of schedule) if (row.class_id === cls.id) maxBySubject[row.subject_id] = Number(row.max_marks);
    const marks: Record<string, Record<string, number>> = {};
    for (const r of results) {
      marks[r.student_id] = {};
      for (const sub of r.subjects) if (sub.subject_id) marks[r.student_id][sub.subject_id] = Number(sub.marks);
    }
    slotData[st.key] = { exam: st.exam, maxBySubject, marks };
  }));

  const base = {
    template, slots: slotData, today: today(),
    session: { name: session.name, start_date: session.start_date, end_date: session.end_date },
  };
  const attendance: EngineInput['attendance'] = {};
  await Promise.all(attendanceEndDates(base).map(async (end) => {
    const to = end < session.start_date ? session.start_date : end;
    const summary = await fetchAttendanceSummary(sectionId, session.start_date, to).catch(() => ({}));
    attendance[end] = Object.fromEntries(Object.entries(summary).map(([sid, a]) => [
      sid, { attended: a.present + a.late + (a.medical ?? 0), total: a.total },
    ]));
  }));

  const input: EngineInput = {
    ...base,
    scale: pickScale(scales, slots.map((s) => s.exam)),
    subjects,
    attendance,
    students: students.map((s) => ({
      id: s.id, full_name: s.full_name, admission_number: s.admission_number, roll_number: s.roll_number,
      father_name: s.father_name, mother_name: s.mother_name ?? null, address: s.address, date_of_birth: s.date_of_birth,
      gender: s.gender, phone: s.parent_phone || s.emergency_contact || null, avatar_url: s.avatar_url,
      class_name: cls.name, section_name: section.name,
    })),
  };

  // ── Checks the school can act on ──
  const warnings: string[] = [];
  const tables = template.elements.filter((e) => e.kind === 'table');
  const matched = new Set<string>();
  const unmatched: string[] = [];
  for (const t of tables) {
    if (t.kind !== 'table') continue;
    for (const row of t.rows) {
      if (row.type !== 'subject') continue;
      const id = matchRowSubject(row, subjects);
      if (id) matched.add(id); else unmatched.push(row.name);
    }
  }
  if (unmatched.length) {
    warnings.push(`Card subjects with no matching subject in ${cls.name} (left blank): ${unmatched.join(', ')}.`);
  }
  const examined = new Set(Object.values(slotData).flatMap((d) => Object.keys(d.maxBySubject)));
  const missing = subjects.filter((s) => examined.has(s.id) && !matched.has(s.id)).map((s) => s.name);
  if (missing.length && tables.length) {
    warnings.push(`Examined subjects that have no row on the card: ${missing.join(', ')}.`);
  }
  for (const s of template.slots) {
    const d = slotData[s.key];
    if (!s.max_marks || !d?.exam) continue;
    const off = Object.entries(d.maxBySubject)
      .filter(([sid, mx]) => matched.has(sid) && mx !== s.max_marks)
      .map(([sid, mx]) => `${subjects.find((x) => x.id === sid)?.name ?? 'a subject'} is out of ${mx}`);
    if (off.length) warnings.push(`${s.label}: the card prints max ${s.max_marks}, but ${off.join(', ')}.`);
  }
  if (!students.length) warnings.push('This section has no active students.');

  return {
    template, session, className: cls.name, sectionName: section.name,
    cards: buildCards(input), slots,
    ready: slots.length > 0 && slots.every((s) => !s.problem),
    warnings,
  };
}
