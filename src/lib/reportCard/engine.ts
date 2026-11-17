// Fills a report card template from exam results. Pure functions: the same
// code renders the superadmin's sample preview and the school's real cards.
import type { GradingScale } from '@/types';
import type {
  CardValues, ColDef, ColRole, ReportCardTemplate, RowRole, SummaryKind, TableElement, TextElement,
} from './types';

export interface EngineStudent {
  id: string;
  full_name: string;
  admission_number: string;
  roll_number: number | null;
  father_name: string | null;
  mother_name: string | null;
  address: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  avatar_url: string | null;
  class_name: string;
  section_name: string;
}

export interface SlotExam {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

export interface SlotData {
  exam: SlotExam | null;
  /** subject id → max marks for this class (from the datesheet). */
  maxBySubject: Record<string, number>;
  /** student id → subject id → marks. */
  marks: Record<string, Record<string, number>>;
}

export interface EngineInput {
  template: ReportCardTemplate;
  session: { name: string; start_date: string; end_date: string } | null;
  scale: GradingScale | null;
  /** Subjects of the student's class. */
  subjects: { id: string; name: string }[];
  students: EngineStudent[];
  slots: Record<string, SlotData>;
  /** attendance period end date → student id → days. See attendanceEndDates(). */
  attendance: Record<string, Record<string, { attended: number; total: number }>>;
  today: string;
}

// ── Subject matching ─────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

/** Names schools commonly use for the same subject. */
const SYNONYMS: string[][] = [
  ['maths', 'math', 'mathematics'],
  ['evs', 'environmentalstudies', 'environmentalscience', 'environment'],
  ['sst', 'socialscience', 'socialstudies', 'socialstudy', 'sscience'],
  ['gk', 'generalknowledge', 'gka'],
  ['moralscience', 'moral', 'msc', 'moraleducation', 'valueeducation'],
  ['computer', 'computers', 'computerscience', 'computerapplication', 'computerapplications', 'computereducation', 'it', 'informationtechnology'],
  ['art', 'arts', 'artandcraft', 'artcraft', 'artsandcraft', 'drawing', 'drawingandpainting'],
  ['pe', 'physicaleducation', 'sports', 'games', 'healthandphysicaleducation'],
  ['english', 'eng', 'englishlanguage'],
  ['hindi', 'hin'],
  ['sanskrit', 'sans'],
  ['science', 'sci', 'generalscience'],
  ['music', 'vocal'],
];

function candidates(name: string, aliases: string): string[] {
  const parts = [name, ...name.split(/[,/|]+/), ...aliases.split(/[,/|]+/)];
  const out = new Set<string>();
  for (const p of parts) {
    const n = norm(p);
    if (!n) continue;
    out.add(n);
    for (const group of SYNONYMS) if (group.includes(n)) group.forEach((g) => out.add(g));
  }
  return [...out];
}

/** The class subject a card row stands for, or null. Exact name wins over synonyms. */
export function matchRowSubject(row: RowRole, subjects: { id: string; name: string }[]): string | null {
  if (row.type !== 'subject') return null;
  const exact = norm(row.name);
  const hit = subjects.find((s) => norm(s.name) === exact);
  if (hit) return hit.id;
  const cands = candidates(row.name, row.aliases);
  return subjects.find((s) => cands.includes(norm(s.name)))?.id ?? null;
}

// ── Number helpers ───────────────────────────────────────────────────────────

const fmtNum = (v: number) => String(Math.round(v * 100) / 100);
const fmtPct = (v: number) => `${fmtNum(v)}%`;

export function gradeFor(scale: GradingScale | null, pct: number | null): string {
  if (!scale || pct === null) return '';
  const band = [...scale.bands].sort((a, b) => b.min_percent - a.min_percent).find((b) => pct >= b.min_percent);
  return band?.grade ?? '';
}

function colSlots(role: ColRole): string[] {
  if (role.type === 'slot') return [role.slot];
  if (role.type === 'sum' || role.type === 'grade') return role.slots;
  return [];
}

/** Attendance for a column runs from session start to its last exam. */
function periodEnd(slots: string[], input: Pick<EngineInput, 'slots' | 'session' | 'today'>): string {
  let end: string | null = null;
  for (const k of slots) {
    const e = input.slots[k]?.exam;
    const d = e?.end_date ?? e?.start_date ?? null;
    if (d && (!end || d > end)) end = d;
  }
  if (end) return end;
  const sessEnd = input.session?.end_date ?? input.today;
  return input.today < sessEnd ? input.today : sessEnd;
}

/** Every attendance period the template needs; the caller fetches each. */
export function attendanceEndDates(input: Pick<EngineInput, 'template' | 'slots' | 'session' | 'today'>): string[] {
  const out = new Set<string>();
  const all = input.template.slots.map((s) => s.key);
  out.add(periodEnd(all, input));
  for (const el of input.template.elements) {
    if (el.kind !== 'table') continue;
    el.cols.forEach((c) => {
      if (c.fill.attendance && c.role.type !== 'none') out.add(periodEnd(colSlots(c.role), input));
    });
  }
  return [...out];
}

// ── Card building ────────────────────────────────────────────────────────────

interface ColStat { total: number; max: number; any: boolean }

export function buildCards(input: EngineInput): CardValues[] {
  const { template, students, scale } = input;
  const tables = template.elements.filter((e): e is TableElement => e.kind === 'table');
  const texts = template.elements.filter((e): e is TextElement => e.kind === 'text');
  const allSlots = template.slots.map((s) => s.key);

  const rowSubject: Record<string, (string | null)[]> = {};
  for (const t of tables) rowSubject[t.id] = t.rows.map((r) => matchRowSubject(r, input.subjects));

  const marksOf = (slot: string, sid: string, subj: string) => input.slots[slot]?.marks[sid]?.[subj];
  const maxOf = (slot: string, subj: string) => input.slots[slot]?.maxBySubject[subj];

  function cellMarks(slots: string[], sid: string, subj: string): { marks: number; max: number; any: boolean } {
    let marks = 0; let max = 0; let any = false;
    for (const k of slots) {
      const m = marksOf(k, sid, subj);
      const mx = maxOf(k, subj);
      if (m !== undefined) { marks += m; any = true; }
      if (mx !== undefined) max += mx;
    }
    return { marks, max, any };
  }

  function colStat(t: TableElement, col: ColDef, sid: string): ColStat {
    const slots = colSlots(col.role);
    const st: ColStat = { total: 0, max: 0, any: false };
    for (const subj of rowSubject[t.id]) {
      if (!subj) continue;
      const c = cellMarks(slots, sid, subj);
      st.total += c.marks; st.max += c.max; st.any ||= c.any;
    }
    return st;
  }

  function overallStat(sid: string): ColStat {
    const st: ColStat = { total: 0, max: 0, any: false };
    for (const k of allSlots) {
      const d = input.slots[k];
      if (!d) continue;
      for (const [subj, mx] of Object.entries(d.maxBySubject)) {
        st.max += mx;
        const m = d.marks[sid]?.[subj];
        if (m !== undefined) { st.total += m; st.any = true; }
      }
    }
    return st;
  }

  const pctOf = (s: ColStat) => (s.any && s.max > 0 ? (s.total / s.max) * 100 : null);

  // Stats for everyone first, so ranks can be worked out.
  const stats: Record<string, Record<string, ColStat[]>> = {};
  const overall: Record<string, ColStat> = {};
  for (const s of students) {
    stats[s.id] = {};
    for (const t of tables) stats[s.id][t.id] = t.cols.map((c) => colStat(t, c, s.id));
    overall[s.id] = overallStat(s.id);
  }

  /** Standard competition ranking (1, 2, 2, 4) among students with marks. */
  function rankIn(values: { id: string; v: number | null }[], id: string): string {
    const mine = values.find((x) => x.id === id)?.v;
    if (mine === null || mine === undefined) return '';
    return String(values.filter((x) => x.v !== null && x.v > mine).length + 1);
  }

  const rankCache = new Map<string, { id: string; v: number | null }[]>();
  function colRank(t: TableElement, ci: number, sid: string): string {
    const key = `${t.id}:${ci}`;
    let vals = rankCache.get(key);
    if (!vals) {
      const isGrade = t.cols[ci].role.type === 'grade';
      vals = students.map((s) => {
        const st = stats[s.id][t.id][ci];
        return { id: s.id, v: st.any ? (isGrade ? pctOf(st) : st.total) : null };
      });
      rankCache.set(key, vals);
    }
    return rankIn(vals, sid);
  }
  const overallRanks = students.map((s) => ({ id: s.id, v: overall[s.id].any ? overall[s.id].total : null }));

  function attendance(slots: string[], sid: string): string {
    const a = input.attendance[periodEnd(slots, input)]?.[sid];
    return a && a.total > 0 ? `${a.attended}/${a.total}` : '';
  }

  const fmtDob = (d: string | null) => {
    if (!d) return '';
    const [y, m, dd] = d.slice(0, 10).split('-');
    return y && m && dd ? `${dd}/${m}/${y}` : d;
  };
  const sess = input.session;
  const sy = sess ? sess.start_date.slice(0, 4) : '';
  const ey = sess ? sess.end_date.slice(0, 4) : '';

  return students.map((s) => {
    const ov = overall[s.id];
    const ovPct = pctOf(ov);
    const fieldValue = (el: TextElement): string => {
      switch (el.field) {
        case 'student_name': return s.full_name;
        case 'father_name': return s.father_name ?? '';
        case 'mother_name': return s.mother_name ?? '';
        case 'guardian_name': return s.father_name || s.mother_name || '';
        case 'address': return s.address ?? '';
        case 'admission_number': return s.admission_number ?? '';
        case 'roll_number': return s.roll_number != null ? String(s.roll_number) : '';
        case 'dob': return fmtDob(s.date_of_birth);
        case 'gender': return s.gender ? s.gender[0].toUpperCase() + s.gender.slice(1) : '';
        case 'phone': return s.phone ?? '';
        case 'class_section': return [s.class_name, s.section_name].filter(Boolean).join(' - ');
        case 'class_name': return s.class_name;
        case 'section_name': return s.section_name;
        case 'session_name': return sess?.name ?? '';
        case 'session_start_year': return sy;
        case 'session_end_year': return ey;
        case 'session_start_yy': return sy.slice(2);
        case 'session_end_yy': return ey.slice(2);
        case 'attendance': return attendance(allSlots, s.id);
        case 'overall_total': return ov.any ? `${fmtNum(ov.total)}/${fmtNum(ov.max)}` : '';
        case 'overall_percentage': return ovPct !== null ? fmtPct(ovPct) : '';
        case 'overall_grade': return gradeFor(scale, ovPct);
        case 'rank': return rankIn(overallRanks, s.id);
        case 'result':
          if (ovPct === null) return '';
          return ovPct >= (scale?.pass_percent ?? 33) ? 'PASS' : 'NEEDS IMPROVEMENT';
        case 'custom': return el.text ?? '';
      }
    };

    const text: Record<string, string> = {};
    for (const el of texts) text[el.id] = fieldValue(el);

    const cells: Record<string, string[][]> = {};
    for (const t of tables) {
      cells[t.id] = t.rows.map((row, ri) => t.cols.map((col, ci) => {
        const role = col.role;
        if (role.type === 'none' || row.type === 'none') return '';
        const slots = colSlots(role);
        if (row.type === 'subject') {
          const subj = rowSubject[t.id][ri];
          if (!subj) return '';
          const c = cellMarks(slots, s.id, subj);
          if (!c.any) return '';
          if (role.type === 'grade') return gradeFor(scale, c.max > 0 ? (c.marks / c.max) * 100 : null);
          return fmtNum(c.marks);
        }
        const kind = row.type as SummaryKind;
        if (!col.fill[kind]) return '';
        const st = stats[s.id][t.id][ci];
        switch (kind) {
          case 'total': return role.type !== 'grade' && st.any ? fmtNum(st.total) : '';
          case 'percentage': { const p = pctOf(st); return p !== null ? fmtPct(p) : ''; }
          case 'grade': return gradeFor(scale, pctOf(st));
          case 'rank': return colRank(t, ci, s.id);
          case 'attendance': return attendance(slots, s.id);
        }
      }));
    }

    const initials = s.full_name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    return { studentId: s.id, text, photo: s.avatar_url, initials, cells };
  });
}

// ── Sample data for the designer preview ─────────────────────────────────────

const SAMPLE_NAMES = ['Aarav Sharma', 'Diya Verma', 'Kabir Singh'];

/** A believable class built from the template itself, so the preview shows every cell. */
export function sampleInput(template: ReportCardTemplate, scale: GradingScale | null): EngineInput {
  const subjects: { id: string; name: string }[] = [];
  for (const el of template.elements) {
    if (el.kind !== 'table') continue;
    for (const r of el.rows) {
      if (r.type === 'subject' && r.name.trim() && !subjects.some((s) => norm(s.name) === norm(r.name))) {
        subjects.push({ id: `sub-${subjects.length}`, name: r.name.trim() });
      }
    }
  }
  const students: EngineStudent[] = SAMPLE_NAMES.map((name, i) => ({
    id: `stu-${i}`, full_name: name, admission_number: `202400${i + 1}`, roll_number: i + 1,
    father_name: i === 0 ? 'Rajesh Sharma' : 'Parent Name', mother_name: i === 0 ? 'Sunita Sharma' : 'Parent Name',
    address: '12, Park Road, Lucknow', date_of_birth: '2014-04-12', gender: 'male', phone: '98765 43210',
    avatar_url: null, class_name: 'Class 5', section_name: 'A',
  }));
  const slots: Record<string, SlotData> = {};
  template.slots.forEach((slot, si) => {
    const max = slot.max_marks && slot.max_marks > 0 ? slot.max_marks : 100;
    const maxBySubject: Record<string, number> = {};
    const marks: Record<string, Record<string, number>> = {};
    subjects.forEach((sub) => { maxBySubject[sub.id] = max; });
    students.forEach((st, i) => {
      marks[st.id] = {};
      subjects.forEach((sub, j) => {
        const f = 0.62 + (((i * 7 + j * 5 + si * 3) % 11) / 11) * 0.36;
        marks[st.id][sub.id] = Math.round(max * f);
      });
    });
    slots[slot.key] = { exam: { id: slot.key, name: slot.label, status: 'published', start_date: null, end_date: null }, maxBySubject, marks };
  });
  const today = new Date().toISOString().slice(0, 10);
  const base = { template, slots, session: { name: '2026-27', start_date: '2026-04-01', end_date: '2027-03-31' }, today };
  const attendance: EngineInput['attendance'] = {};
  attendanceEndDates(base).forEach((d) => {
    attendance[d] = Object.fromEntries(students.map((s, i) => [s.id, { attended: 182 - i * 4, total: 196 }]));
  });
  return { ...base, scale, subjects, students, attendance };
}

/** Default grading (CBSE-style) for previews when the school's scale isn't loaded. */
export const SAMPLE_SCALE: GradingScale = {
  id: 'sample', school_id: '', name: 'Default', is_default: true, pass_percent: 33,
  bands: [
    { grade: 'A1', min_percent: 91, grade_point: 10, remark: null },
    { grade: 'A2', min_percent: 81, grade_point: 9, remark: null },
    { grade: 'B1', min_percent: 71, grade_point: 8, remark: null },
    { grade: 'B2', min_percent: 61, grade_point: 7, remark: null },
    { grade: 'C1', min_percent: 51, grade_point: 6, remark: null },
    { grade: 'C2', min_percent: 41, grade_point: 5, remark: null },
    { grade: 'D', min_percent: 33, grade_point: 4, remark: null },
    { grade: 'E', min_percent: 0, grade_point: null, remark: null },
  ],
};
