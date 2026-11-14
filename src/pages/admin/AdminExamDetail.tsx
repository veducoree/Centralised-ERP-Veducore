import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, ClipboardList, Trophy, Printer, Send, Undo2, Save, Copy, Download,
  CheckCircle2, AlertTriangle, Lock, Medal,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { usePermissions } from '@/auth/PermissionsContext';
import {
  fetchExam, fetchClasses, fetchSubjects, fetchExamSchedule, saveExamScheduleForClass,
  fetchExamProgress, fetchExamResults, publishExam, fetchStudentsBySection, fetchExamMarks, saveExamMarks,
} from '@/services/api';
import type { Exam, Class, Section, Subject, ExamScheduleRow, ExamProgressRow, ExamResultRow, Student } from '@/types';
import { sortByClassOrder, sortSections } from '@/lib/classOrder';
import { EXAM_STATUS_STYLE, EXAM_TYPES } from './AdminExams';

type ClassWithSections = Class & { sections: Section[] };
type Tab = 'datesheet' | 'marks' | 'results' | 'reports';

interface DraftRow { include: boolean; exam_date: string; start_time: string; end_time: string; max_marks: string; pass_marks: string; room: string }

const pctCls = (p: number) => p >= 100 ? 'bg-emerald-500 text-white' : p > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500';

export default function AdminExamDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { can } = usePermissions();
  const canEdit = can('exams', 'edit');
  const toast = useToast();
  const schoolId = profile?.school_id;

  const [exam, setExam] = useState<Exam | null>(null);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schedule, setSchedule] = useState<ExamScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('datesheet');
  const [publishOpen, setPublishOpen] = useState<'publish' | 'unpublish' | null>(null);

  const loadExam = useCallback(async () => {
    const [e, sch] = await Promise.all([fetchExam(id), fetchExamSchedule(id)]);
    setExam(e);
    setSchedule(sch);
  }, [id]);

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    Promise.all([loadExam(), fetchClasses(schoolId), fetchSubjects(schoolId)])
      .then(([, c, s]) => { setClasses(sortByClassOrder(c as ClassWithSections[])); setSubjects(s); })
      .catch(() => toast('Failed to load exam', 'error'))
      .finally(() => setLoading(false));
  }, [schoolId, loadExam, toast]);

  const examClasses = useMemo(
    () => classes.filter((c) => exam?.class_ids.includes(c.id)).map((c) => ({ ...c, sections: sortSections(c.sections) })),
    [classes, exam],
  );
  const published = exam?.status === 'published';

  async function handlePublish() {
    if (!exam || !publishOpen) return;
    try {
      const n = await publishExam(exam.id, publishOpen === 'publish');
      toast(publishOpen === 'publish' ? `Results published — ${n} parent notification${n === 1 ? '' : 's'} sent` : 'Results hidden from parents again', 'success');
      await loadExam();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  if (loading) return <DashboardLayout title="Exam"><LoadingSpinner variant="cards" /></DashboardLayout>;
  if (!exam) {
    return (
      <DashboardLayout title="Exam">
        <Card className="p-10 text-center">
          <p className="mb-3 text-slate-600">Exam not found.</p>
          <Button variant="outline" onClick={() => navigate('/admin/exams')}>Back to exams</Button>
        </Card>
      </DashboardLayout>
    );
  }

  const st = EXAM_STATUS_STYLE[exam.status];
  const tabs: { key: Tab; label: string; icon: typeof CalendarDays }[] = [
    { key: 'datesheet', label: 'Datesheet', icon: CalendarDays },
    { key: 'marks', label: 'Marks entry', icon: ClipboardList },
    { key: 'results', label: 'Results', icon: Trophy },
    { key: 'reports', label: 'Report cards', icon: Printer },
  ];

  return (
    <DashboardLayout title={exam.name}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-[20px] bg-white px-6 py-5 shadow-[0_4px_20px_rgba(91,110,232,0.08)] lg:flex-row lg:items-center">
          <button onClick={() => navigate('/admin/exams')} aria-label="Back to exams" className="self-start rounded-lg p-2 text-slate-500 hover:bg-slate-50"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-[#0F172A]">{exam.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {EXAM_TYPES.find((t) => t.value === exam.record_type)?.label} · {examClasses.length} class{examClasses.length === 1 ? '' : 'es'}
              {exam.start_date && ` · from ${new Date(exam.start_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </p>
          </div>
          {canEdit && (published
            ? <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={() => setPublishOpen('unpublish')}>Unpublish</Button>
            : <Button icon={<Send className="h-4 w-4" />} onClick={() => setPublishOpen('publish')}>Publish results</Button>)}
        </div>

        {published && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <Lock className="h-4 w-4" /> Results are visible to parents. Marks are locked for teachers — unpublish to make corrections.
          </div>
        )}

        <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${tab === key ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {tab === 'datesheet' && (
          <DatesheetTab exam={exam} classes={examClasses} subjects={subjects} schedule={schedule} canEdit={canEdit}
            onSaved={async () => setSchedule(await fetchExamSchedule(exam.id))} />
        )}
        {tab === 'marks' && <MarksTab exam={exam} classes={examClasses} schedule={schedule} canEdit={canEdit && !published} />}
        {tab === 'results' && <ResultsTab exam={exam} classes={examClasses} />}
        {tab === 'reports' && <ReportsTab exam={exam} classes={examClasses} />}
      </div>

      <ConfirmDialog open={!!publishOpen} onClose={() => setPublishOpen(null)} onConfirm={handlePublish}
        variant={publishOpen === 'publish' ? 'default' : 'danger'}
        confirmText={publishOpen === 'publish' ? 'Publish' : 'Unpublish'}
        title={publishOpen === 'publish' ? 'Publish results?' : 'Unpublish results?'}
        message={publishOpen === 'publish'
          ? 'Parents will see the marks in the app and get a result notification. Teachers can no longer change marks.'
          : 'Parents will stop seeing these results and teachers can edit marks again. Notifications already sent are not recalled.'} />
    </DashboardLayout>
  );
}

// ─── Datesheet ──────────────────────────────────────────────────────────────

function DatesheetTab({ exam, classes, subjects, schedule, canEdit, onSaved }: {
  exam: Exam; classes: ClassWithSections[]; subjects: Subject[]; schedule: ExamScheduleRow[]; canEdit: boolean; onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [draft, setDraft] = useState<Record<string, DraftRow>>({});
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);

  const classSubjects = useMemo(() => subjects.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)), [subjects, classId]);

  useEffect(() => {
    const rows: Record<string, DraftRow> = {};
    const hasAny = schedule.some((r) => r.class_id === classId);
    for (const s of classSubjects) {
      const r = schedule.find((x) => x.class_id === classId && x.subject_id === s.id);
      rows[s.id] = {
        include: r ? true : !hasAny,
        exam_date: r?.exam_date ?? '',
        start_time: r?.start_time?.slice(0, 5) ?? '',
        end_time: r?.end_time?.slice(0, 5) ?? '',
        max_marks: String(r?.max_marks ?? 100),
        pass_marks: r?.pass_marks != null ? String(r.pass_marks) : '',
        room: r?.room ?? '',
      };
    }
    setDraft(rows);
  }, [classId, classSubjects, schedule]);

  const set = (sid: string, patch: Partial<DraftRow>) => setDraft((d) => ({ ...d, [sid]: { ...d[sid], ...patch } }));

  function toRows(forClass: string, source: Record<string, DraftRow>, subjectMap: (sid: string) => string | null): ExamScheduleRow[] {
    return Object.entries(source).flatMap(([sid, r]) => {
      const target = subjectMap(sid);
      if (!r.include || !target) return [];
      return [{
        exam_id: exam.id, class_id: forClass, subject_id: target,
        exam_date: r.exam_date || null, start_time: r.start_time || null, end_time: r.end_time || null,
        max_marks: Number(r.max_marks) || 100, pass_marks: r.pass_marks === '' ? null : Number(r.pass_marks), room: r.room || null,
      }];
    });
  }

  function validate(): string | null {
    for (const [sid, r] of Object.entries(draft)) {
      if (!r.include) continue;
      const name = classSubjects.find((s) => s.id === sid)?.name;
      if (!(Number(r.max_marks) > 0)) return `${name}: max marks must be more than 0`;
      if (r.pass_marks !== '' && Number(r.pass_marks) > Number(r.max_marks)) return `${name}: pass marks are above max marks`;
      if (r.start_time && r.end_time && r.end_time <= r.start_time) return `${name}: end time is before start time`;
      if (r.exam_date && exam.start_date && r.exam_date < exam.start_date) return `${name}: date is before the exam starts`;
      if (r.exam_date && exam.end_date && r.exam_date > exam.end_date) return `${name}: date is after the exam ends`;
    }
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) { toast(err, 'error'); return; }
    setSaving(true);
    try {
      await saveExamScheduleForClass(exam.id, classId, toRows(classId, draft, (s) => s));
      await onSaved();
      toast('Datesheet saved — teachers can now enter marks', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save datesheet', 'error');
    } finally { setSaving(false); }
  }

  /** Copies this class's datesheet to the other exam classes, matching subjects by name. */
  async function handleCopy() {
    const err = validate();
    if (err) { toast(err, 'error'); return; }
    setCopying(true);
    try {
      const byName = Object.fromEntries(classSubjects.map((s) => [s.id, s.name.toLowerCase()]));
      let copied = 0;
      for (const c of classes) {
        if (c.id === classId) continue;
        const theirs = subjects.filter((s) => s.class_id === c.id);
        const map = (sid: string) => theirs.find((t) => t.name.toLowerCase() === byName[sid])?.id ?? null;
        const rows = toRows(c.id, draft, map);
        if (!rows.length) continue;
        await saveExamScheduleForClass(exam.id, c.id, rows);
        copied++;
      }
      await saveExamScheduleForClass(exam.id, classId, toRows(classId, draft, (s) => s));
      await onSaved();
      toast(`Copied to ${copied} class${copied === 1 ? '' : 'es'} (matching subject names)`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to copy', 'error');
    } finally { setCopying(false); }
  }

  const configured = new Set(schedule.map((r) => r.class_id));
  const input = 'w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50';

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {classes.map((c) => (
          <button key={c.id} onClick={() => setClassId(c.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${classId === c.id ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {configured.has(c.id) && <CheckCircle2 className={`h-3.5 w-3.5 ${classId === c.id ? 'text-white' : 'text-emerald-500'}`} />}
            {c.name}
          </button>
        ))}
      </div>

      {classSubjects.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" /> This class has no subjects yet. Add them in Subjects first.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 pr-2 font-medium">Subject</th>
                  <th className="pb-2 pr-2 font-medium">Date</th>
                  <th className="pb-2 pr-2 font-medium">Start</th>
                  <th className="pb-2 pr-2 font-medium">End</th>
                  <th className="pb-2 pr-2 font-medium">Max</th>
                  <th className="pb-2 pr-2 font-medium">Pass</th>
                  <th className="pb-2 font-medium">Room</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classSubjects.map((s) => {
                  const r = draft[s.id];
                  if (!r) return null;
                  const off = !r.include || !canEdit;
                  return (
                    <tr key={s.id} className={r.include ? '' : 'opacity-50'}>
                      <td className="py-2 pr-2">
                        <label className="flex items-center gap-2 font-medium text-slate-800">
                          <input type="checkbox" checked={r.include} disabled={!canEdit} onChange={(e) => set(s.id, { include: e.target.checked })} />
                          {s.name}
                        </label>
                      </td>
                      <td className="py-2 pr-2"><input type="date" className={input} disabled={off} value={r.exam_date} min={exam.start_date ?? undefined} max={exam.end_date ?? undefined} onChange={(e) => set(s.id, { exam_date: e.target.value })} aria-label={`${s.name} date`} /></td>
                      <td className="py-2 pr-2"><input type="time" className={input} disabled={off} value={r.start_time} onChange={(e) => set(s.id, { start_time: e.target.value })} aria-label={`${s.name} start`} /></td>
                      <td className="py-2 pr-2"><input type="time" className={input} disabled={off} value={r.end_time} onChange={(e) => set(s.id, { end_time: e.target.value })} aria-label={`${s.name} end`} /></td>
                      <td className="py-2 pr-2"><input type="number" min={1} className={`${input} w-20`} disabled={off} value={r.max_marks} onChange={(e) => set(s.id, { max_marks: e.target.value })} aria-label={`${s.name} max marks`} /></td>
                      <td className="py-2 pr-2"><input type="number" min={0} className={`${input} w-20`} disabled={off} value={r.pass_marks} placeholder="auto" onChange={(e) => set(s.id, { pass_marks: e.target.value })} aria-label={`${s.name} pass marks`} /></td>
                      <td className="py-2"><input className={`${input} w-24`} disabled={off} value={r.room} onChange={(e) => set(s.id, { room: e.target.value })} aria-label={`${s.name} room`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">Pass marks left as "auto" use the grading scale's pass %. Untick a subject that isn't examined.</p>
          {canEdit && (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {classes.length > 1 && <Button variant="outline" icon={<Copy className="h-4 w-4" />} loading={copying} onClick={handleCopy}>Save & copy to other classes</Button>}
              <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={handleSave}>Save datesheet</Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Marks ──────────────────────────────────────────────────────────────────

function MarksTab({ exam, classes, schedule, canEdit }: { exam: Exam; classes: ClassWithSections[]; schedule: ExamScheduleRow[]; canEdit: boolean }) {
  const toast = useToast();
  const { profile } = useAuth();
  const [progress, setProgress] = useState<ExamProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<{ section: Section; classId: string; subjectId: string; subject: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProgress(await fetchExamProgress(exam.id)); }
    catch { toast('Failed to load progress', 'error'); }
    finally { setLoading(false); }
  }, [exam.id, toast]);

  useEffect(() => { load(); }, [load]);

  const bySection = useMemo(() => {
    const m = new Map<string, { label: string; cells: ExamProgressRow[] }>();
    for (const r of progress) {
      if (!m.has(r.section_id)) m.set(r.section_id, { label: r.label, cells: [] });
      m.get(r.section_id)!.cells.push(r);
    }
    return [...m.entries()];
  }, [progress]);

  const totals = progress.reduce((a, r) => ({ s: a.s + r.students, e: a.e + Math.min(r.entered, r.students) }), { s: 0, e: 0 });
  const overall = totals.s ? Math.round((totals.e / totals.s) * 100) : 0;

  if (loading) return <LoadingSpinner variant="cards" />;
  if (!progress.length) {
    return <Card className="p-10 text-center text-sm text-slate-500">Save the datesheet first — marks entry opens for each scheduled subject.</Card>;
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Marks entered: {overall}%</p>
          <p className="text-xs text-slate-500">Teachers enter marks from their app or portal. Click a cell to view or enter marks yourself.</p>
        </div>
        <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${overall}%` }} /></div>
      </div>
      <div className="space-y-4">
        {bySection.map(([sectionId, { label, cells }]) => {
          const cls = classes.find((c) => c.sections.some((s) => s.id === sectionId));
          const section = cls?.sections.find((s) => s.id === sectionId);
          return (
            <div key={sectionId}>
              <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
              <div className="flex flex-wrap gap-2">
                {cells.map((c) => {
                  const p = c.students ? Math.round((Math.min(c.entered, c.students) / c.students) * 100) : 0;
                  return (
                    <button key={c.subject_id}
                      onClick={() => section && cls && setEntry({ section, classId: cls.id, subjectId: c.subject_id, subject: c.subject })}
                      className={`rounded-lg px-3 py-2 text-left text-xs transition hover:ring-2 hover:ring-brand-300 ${pctCls(p)}`}>
                      <span className="block font-medium">{c.subject}</span>
                      <span className="block tabular-nums opacity-80">{Math.min(c.entered, c.students)}/{c.students}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {entry && profile?.school_id && (
        <MarksEntryModal exam={exam} schoolId={profile.school_id} entry={entry} canEdit={canEdit}
          max={schedule.find((r) => r.class_id === entry.classId && r.subject_id === entry.subjectId)?.max_marks ?? 100}
          onClose={() => setEntry(null)} onSaved={() => { setEntry(null); load(); }} />
      )}
    </Card>
  );
}

function MarksEntryModal({ exam, schoolId, entry, max, canEdit, onClose, onSaved }: {
  exam: Exam; schoolId: string; entry: { section: Section; classId: string; subjectId: string; subject: string };
  max: number; canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [existing, setExisting] = useState<Record<string, { id: string; marks: number }>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const st = await fetchStudentsBySection(entry.section.id);
        setStudents(st);
        const ex = await fetchExamMarks(exam.id, entry.subjectId, st.map((s) => s.id));
        setExisting(ex);
        setValues(Object.fromEntries(st.map((s) => [s.id, ex[s.id] ? String(ex[s.id].marks) : ''])));
      } catch { toast('Failed to load students', 'error'); }
      finally { setLoading(false); }
    })();
  }, [exam.id, entry, toast]);

  const invalid = students.filter((s) => {
    const v = values[s.id];
    return v !== '' && v !== undefined && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > max);
  });

  async function handleSave() {
    if (invalid.length) { toast(`Marks must be between 0 and ${max}`, 'error'); return; }
    setSaving(true);
    try {
      await saveExamMarks({
        school_id: schoolId, exam, subject: { id: entry.subjectId, name: entry.subject }, max_marks: max,
        entries: students
          .map((s) => ({ student_id: s.id, record_id: existing[s.id]?.id, marks: values[s.id] === '' ? null : Number(values[s.id]) }))
          .filter((e) => e.marks !== null || e.record_id),
      });
      toast('Marks saved', 'success');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save marks', 'error');
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={`${entry.subject} · ${entry.section.name}`} description={`Out of ${max}. Leave blank for absent / not entered.`}
      footer={canEdit ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={handleSave}>Save marks</Button></> : <Button onClick={onClose}>Close</Button>}>
      {loading ? <LoadingSpinner /> : students.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No students in this section.</p> : (
        <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">
          {students.map((s) => {
            const bad = invalid.includes(s);
            return (
              <div key={s.id} className="flex items-center gap-3 py-2">
                <span className="w-10 text-xs tabular-nums text-slate-400">{s.roll_number ?? '—'}</span>
                <span className="flex-1 truncate text-sm text-slate-800">{s.full_name}</span>
                <input type="number" inputMode="decimal" min={0} max={max} step="0.5" disabled={!canEdit}
                  value={values[s.id] ?? ''} aria-label={`Marks for ${s.full_name}`} aria-invalid={bad}
                  onChange={(e) => setValues({ ...values, [s.id]: e.target.value })}
                  className={`w-24 rounded-lg border px-2 py-1.5 text-right text-sm tabular-nums ${bad ? 'border-red-400 bg-red-50' : 'border-slate-200'} disabled:bg-slate-50`} />
                <span className="w-10 text-xs text-slate-400">/ {max}</span>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

function SectionPicker({ classes, value, onChange, allowAll }: { classes: ClassWithSections[]; value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  return (
    <div className="w-full sm:w-64">
      <Select fieldSize="sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Section">
        {allowAll && <option value="">All classes</option>}
        {classes.map((c) => (
          <optgroup key={c.id} label={c.name}>
            {c.sections.map((s) => <option key={s.id} value={s.id}>{c.name} - {s.name}</option>)}
          </optgroup>
        ))}
      </Select>
    </div>
  );
}

function ResultsTab({ exam, classes }: { exam: Exam; classes: ClassWithSections[] }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [sectionId, setSectionId] = useState(classes[0]?.sections[0]?.id ?? '');
  const [rows, setRows] = useState<ExamResultRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchExamResults(exam.id, sectionId || null)
      .then(setRows)
      .catch((e) => toast(e instanceof Error ? e.message : 'Failed to load results', 'error'))
      .finally(() => setLoading(false));
  }, [exam.id, sectionId, toast]);

  const subjectNames = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.subjects.forEach((s) => set.add(s.subject)));
    return [...set].sort();
  }, [rows]);

  const appeared = rows.filter((r) => r.percent !== null);
  const passed = appeared.filter((r) => r.passed).length;
  const avg = appeared.length ? appeared.reduce((a, r) => a + (r.percent ?? 0), 0) / appeared.length : 0;
  const top = appeared.filter((r) => r.rank !== null && r.rank <= 3).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

  function exportCsv() {
    const header = ['Rank', 'Roll', 'Admission No', 'Name', 'Class', ...subjectNames, 'Total', 'Max', '%', 'Grade', 'Result'];
    const lines = rows.map((r) => {
      const sm = Object.fromEntries(r.subjects.map((s) => [s.subject, s.marks]));
      return [r.rank ?? '', r.roll_number ?? '', r.admission_number, r.full_name, `${r.class_name ?? ''} ${r.section_name ?? ''}`.trim(),
        ...subjectNames.map((n) => sm[n] ?? ''), r.total ?? '', r.max_total ?? '', r.percent ?? '', r.grade ?? '',
        r.percent === null ? 'Absent' : r.passed ? 'Pass' : 'Fail'];
    });
    const csv = [header, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${exam.name} results.csv`.replace(/[\\/:*?"<>|]/g, '');
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionPicker classes={classes} value={sectionId} onChange={setSectionId} allowAll />
        <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Appeared', value: `${appeared.length}/${rows.length}` },
          { label: 'Passed', value: appeared.length ? `${passed} (${Math.round((passed / appeared.length) * 100)}%)` : '—' },
          { label: 'Class average', value: appeared.length ? `${avg.toFixed(1)}%` : '—' },
          { label: 'Highest', value: appeared.length ? `${Math.max(...appeared.map((r) => r.percent ?? 0)).toFixed(1)}%` : '—' },
        ].map((k) => (
          <Card key={k.label} className="p-4"><p className="text-xs text-slate-500">{k.label}</p><p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{k.value}</p></Card>
        ))}
      </div>

      {sectionId && top.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {top.map((r) => (
            <Card key={r.student_id} className="flex items-center gap-3 p-4">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full ${r.rank === 1 ? 'bg-amber-100 text-amber-600' : r.rank === 2 ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-600'}`}>
                <Medal className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{r.full_name}</p>
                <p className="text-xs text-slate-500">Rank {r.rank} · {r.percent?.toFixed(1)}% · {r.grade}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {loading ? <div className="p-6"><LoadingSpinner /></div> : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">No students found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Rank</th>
                  <th className="px-3 py-2.5 font-medium">Student</th>
                  {subjectNames.map((n) => <th key={n} className="px-3 py-2.5 text-right font-medium">{n}</th>)}
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 text-right font-medium">%</th>
                  <th className="px-3 py-2.5 font-medium">Grade</th>
                  <th className="px-3 py-2.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const sm = Object.fromEntries(r.subjects.map((s) => [s.subject, s]));
                  return (
                    <tr key={r.student_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 tabular-nums font-semibold text-slate-700">{r.rank ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => navigate(`/admin/students/${r.student_id}`)} className="text-left font-medium text-slate-900 hover:text-brand-600">{r.full_name}</button>
                        <p className="text-[11px] text-slate-400">{!sectionId && `${r.class_name}-${r.section_name} · `}Roll {r.roll_number ?? '—'}</p>
                      </td>
                      {subjectNames.map((n) => {
                        const s = sm[n];
                        return (
                          <td key={n} className={`px-3 py-2.5 text-right tabular-nums ${s && s.marks < s.pass_marks ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                            {s ? s.marks : '—'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">{r.total ?? '—'}{r.max_total ? <span className="font-normal text-slate-400">/{r.max_total}</span> : null}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.percent !== null ? r.percent.toFixed(1) : '—'}</td>
                      <td className="px-3 py-2.5 font-medium">{r.grade ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        {r.percent === null ? <span className="text-xs text-slate-400">Absent</span>
                          : r.passed ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Pass</span>
                          : <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Fail{r.subjects_failed ? ` (${r.subjects_failed})` : ''}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-500">Marks in red are below the subject's pass mark. A student passes with every subject at or above its pass mark and the overall % at or above the scale's pass %.</p>
    </div>
  );
}

// ─── Report cards ───────────────────────────────────────────────────────────

function ReportsTab({ exam, classes }: { exam: Exam; classes: ClassWithSections[] }) {
  const [sectionId, setSectionId] = useState(classes[0]?.sections[0]?.id ?? '');
  const open = () => window.open(`/admin/exams/${exam.id}/report-cards?section=${sectionId}`, '_blank', 'noopener');
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <p className="mb-1 text-sm font-semibold text-slate-900">Print report cards</p>
          <p className="mb-3 text-sm text-slate-500">One A4 page per student with marks, grades, rank and attendance. Opens in a new tab — use Print → Save as PDF.</p>
          <SectionPicker classes={classes} value={sectionId} onChange={setSectionId} />
        </div>
        <Button icon={<Printer className="h-4 w-4" />} onClick={open} disabled={!sectionId}>Open report cards</Button>
      </div>
    </Card>
  );
}
