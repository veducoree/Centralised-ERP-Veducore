import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, GraduationCap, Info, CheckCircle2, CalendarRange, Users, RotateCcw, LogOut, TrendingUp } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { usePermissions } from '@/auth/PermissionsContext';
import {
  fetchAcademicSessions, fetchClasses, fetchStudents, fetchPromotionStatus, promoteStudents,
  fetchExams, fetchExamResults,
} from '@/services/api';
import type { AcademicSession, Class, Section, Student, PromotionAction } from '@/types';
import { sortByClassOrder, sortSections } from '@/lib/classOrder';

type ClassWithSections = Class & { sections: Section[] };
interface Row {
  student: Student;
  selected: boolean;
  action: PromotionAction;
  class_id: string;
  section_id: string;
  result: { percent: number | null; passed: boolean | null } | null;
}

const ACTIONS: { value: PromotionAction; label: string; icon: typeof TrendingUp; cls: string }[] = [
  { value: 'promote', label: 'Promote', icon: TrendingUp, cls: 'text-emerald-700' },
  { value: 'retain', label: 'Retain (same class)', icon: RotateCcw, cls: 'text-amber-700' },
  { value: 'graduate', label: 'Passed out', icon: GraduationCap, cls: 'text-violet-700' },
  { value: 'leave', label: 'Left school', icon: LogOut, cls: 'text-red-700' },
];

export default function AdminPromotion() {
  const { profile } = useAuth();
  const { can } = usePermissions();
  const canEdit = can('students', 'edit');
  const toast = useToast();
  const navigate = useNavigate();
  const schoolId = profile?.school_id;

  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [results, setResults] = useState<Record<string, { percent: number | null; passed: boolean | null }>>({});
  const [resultExam, setResultExam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [renumber, setRenumber] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const current = sessions.find((s) => s.is_current) ?? null;
  const previous = useMemo(() => {
    if (!current) return null;
    return [...sessions].filter((s) => s.start_date < current.start_date).sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null;
  }, [sessions, current]);

  useEffect(() => {
    if (!schoolId) return;
    Promise.all([fetchAcademicSessions(schoolId), fetchClasses(schoolId)])
      .then(([s, c]) => {
        setSessions(s);
        const sorted = sortByClassOrder(c as ClassWithSections[]).map((x) => ({ ...x, sections: sortSections(x.sections) }));
        setClasses(sorted);
        setClassId(sorted[0]?.id ?? '');
      })
      .catch(() => toast('Failed to load', 'error'))
      .finally(() => setLoading(false));
  }, [schoolId, toast]);

  // Final-exam results of last session, used to suggest promote / retain.
  useEffect(() => {
    if (!schoolId || !previous) return;
    (async () => {
      try {
        const exams = (await fetchExams(schoolId, previous.id)).filter((e) => e.record_type === 'final_exam');
        const finalExam = exams.sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))[0];
        if (!finalExam) return;
        const res = await fetchExamResults(finalExam.id, null);
        setResults(Object.fromEntries(res.map((r) => [r.student_id, { percent: r.percent, passed: r.passed }])));
        setResultExam(finalExam.name);
      } catch { /* suggestions are optional */ }
    })();
  }, [schoolId, previous]);

  const nextClass = useCallback((id: string) => {
    const i = classes.findIndex((c) => c.id === id);
    return i >= 0 && i < classes.length - 1 ? classes[i + 1] : null;
  }, [classes]);

  const loadRows = useCallback(async () => {
    if (!schoolId || !classId || !previous) return;
    setLoadingRows(true);
    try {
      const [status, studs] = await Promise.all([fetchPromotionStatus(classId), fetchStudents(schoolId, { classId })]);
      const byId = Object.fromEntries((studs as Student[]).map((s) => [s.id, s]));
      // Only students enrolled last session; new admissions this session have
      // no previous enrollment and must not be promoted again.
      const pending = status.filter((r) => r.active && r.from_status === 'studying' && r.current_class === classId);
      setDoneCount(status.filter((r) => r.from_status && r.from_status !== 'studying').length);
      const next = nextClass(classId);
      setRows(pending.filter((p) => byId[p.student_id]).map((p) => {
        const st = byId[p.student_id];
        const res = results[st.id] ?? null;
        const failed = res?.passed === false;
        const action: PromotionAction = failed ? 'retain' : next ? 'promote' : 'graduate';
        const targetClass = action === 'promote' && next ? next : classes.find((c) => c.id === classId)!;
        const sameName = targetClass.sections.find((s) => s.name === st.section?.name);
        return {
          student: st, selected: true, action,
          class_id: targetClass.id,
          section_id: (sameName ?? targetClass.sections[0])?.id ?? '',
          result: res,
        };
      }).sort((a, b) => (a.student.roll_number ?? 9999) - (b.student.roll_number ?? 9999) || a.student.full_name.localeCompare(b.student.full_name)));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load students', 'error');
    } finally { setLoadingRows(false); }
  }, [schoolId, classId, previous, results, classes, nextClass, toast]);

  useEffect(() => { loadRows(); }, [loadRows]);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => {
      if (j !== i) return r;
      const next = { ...r, ...patch };
      if (patch.action) {
        const target = patch.action === 'promote' ? nextClass(classId) : classes.find((c) => c.id === classId);
        if (target && (patch.action === 'promote' || patch.action === 'retain')) {
          next.class_id = target.id;
          const same = target.sections.find((s) => s.name === r.student.section?.name);
          next.section_id = (same ?? target.sections[0])?.id ?? '';
        }
      }
      if (patch.class_id) {
        const c = classes.find((x) => x.id === patch.class_id);
        const same = c?.sections.find((s) => s.name === r.student.section?.name);
        next.section_id = (same ?? c?.sections[0])?.id ?? '';
      }
      return next;
    }));
  }

  function bulk(action: PromotionAction) {
    rows.forEach((r, i) => { if (r.selected) update(i, { action }); });
  }

  const selected = rows.filter((r) => r.selected);
  const counts = selected.reduce((m, r) => ({ ...m, [r.action]: (m[r.action] ?? 0) + 1 }), {} as Record<string, number>);
  const missingTarget = selected.filter((r) => (r.action === 'promote' || r.action === 'retain') && !r.section_id);

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await promoteStudents(selected.map((r) => ({
        student_id: r.student.id, action: r.action,
        class_id: r.action === 'promote' || r.action === 'retain' ? r.class_id : null,
        section_id: r.action === 'promote' || r.action === 'retain' ? r.section_id : null,
      })), renumber);
      const parts = ACTIONS.filter((a) => res[a.value]).map((a) => `${res[a.value]} ${a.label.toLowerCase()}`);
      toast(`Done: ${parts.join(', ')}`, 'success');
      loadRows();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Promotion failed', 'error');
    } finally { setSaving(false); }
  }

  if (loading) return <DashboardLayout title="Promotion"><LoadingSpinner variant="cards" /></DashboardLayout>;

  if (!current || !previous) {
    return (
      <DashboardLayout title="Promotion">
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <CalendarRange className="h-10 w-10 text-brand-400" />
          <p className="font-semibold text-slate-900">Start the new academic year first</p>
          <p className="max-w-md text-sm text-slate-500">
            Promotion moves students from last session into the current one. Create next year's session in Academic Year and make it current, then come back here.
          </p>
          <Button onClick={() => navigate('/admin/sessions')}>Go to Academic Year</Button>
        </Card>
      </DashboardLayout>
    );
  }

  const cls = classes.find((c) => c.id === classId);
  const input = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:bg-slate-50';

  return (
    <DashboardLayout title="Promotion">
      <div className="space-y-6">
        <PageHeader title="Student Promotion"
          description={`Move students from ${previous.name} into ${current.name}, class by class.`} />

        <div className="flex flex-wrap items-center gap-3 rounded-[20px] bg-white px-5 py-4 shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">{previous.name}</span>
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <span className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">{current.name}</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
            <Info className="h-3.5 w-3.5" />
            {resultExam ? `Suggestions use "${resultExam}" results: pass → promote, fail → retain.` : 'No final exam found for last session — all students default to promote.'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {classes.map((c) => (
            <button key={c.id} onClick={() => setClassId(c.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${classId === c.id ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {c.name}
            </button>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center">
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{cls?.name}: {rows.length} to process</p>
              <p className="text-xs text-slate-500">{doneCount > 0 ? `${doneCount} already processed. ` : ''}Next class: {nextClass(classId)?.name ?? 'none (final class — students pass out)'}</p>
            </div>
            {canEdit && rows.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">Set selected:</span>
                {ACTIONS.map((a) => (
                  <button key={a.value} onClick={() => bulk(a.value)} className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50">{a.label}</button>
                ))}
              </div>
            )}
          </div>

          {loadingRows ? <div className="p-6"><LoadingSpinner /></div> : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm text-slate-600">{doneCount > 0 ? 'Every student in this class has been processed.' : 'No active students in this class.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">
                      <input type="checkbox" aria-label="Select all" checked={rows.every((r) => r.selected)}
                        onChange={(e) => setRows(rows.map((r) => ({ ...r, selected: e.target.checked })))} />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Student</th>
                    <th className="px-3 py-2.5 font-medium">Last result</th>
                    <th className="px-3 py-2.5 font-medium">Action</th>
                    <th className="px-3 py-2.5 font-medium">New class</th>
                    <th className="px-3 py-2.5 font-medium">Section</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => {
                    const moving = r.action === 'promote' || r.action === 'retain';
                    const target = classes.find((c) => c.id === r.class_id);
                    return (
                      <tr key={r.student.id} className={r.selected ? '' : 'opacity-50'}>
                        <td className="px-4 py-2"><input type="checkbox" checked={r.selected} aria-label={`Select ${r.student.full_name}`} onChange={(e) => update(i, { selected: e.target.checked })} /></td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{r.student.full_name}</p>
                          <p className="text-[11px] text-slate-400">{r.student.section?.name ? `Sec ${r.student.section.name} · ` : ''}Roll {r.student.roll_number ?? '—'} · {r.student.admission_number}</p>
                        </td>
                        <td className="px-3 py-2">
                          {!r.result || r.result.percent === null ? <span className="text-xs text-slate-400">—</span>
                            : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.result.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                {r.result.percent.toFixed(1)}% · {r.result.passed ? 'Pass' : 'Fail'}
                              </span>}
                        </td>
                        <td className="px-3 py-2 w-48">
                          <select className={input} value={r.action} disabled={!canEdit} aria-label="Action" onChange={(e) => update(i, { action: e.target.value as PromotionAction })}>
                            {ACTIONS.map((a) => <option key={a.value} value={a.value} disabled={a.value === 'promote' && !nextClass(classId)}>{a.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 w-40">
                          <select className={input} value={moving ? r.class_id : ''} disabled={!canEdit || !moving} aria-label="New class" onChange={(e) => update(i, { class_id: e.target.value })}>
                            {!moving && <option value="">—</option>}
                            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 w-32">
                          <select className={input} value={moving ? r.section_id : ''} disabled={!canEdit || !moving} aria-label="Section" onChange={(e) => update(i, { section_id: e.target.value })}>
                            {!moving && <option value="">—</option>}
                            {target?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {canEdit && rows.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={renumber} onChange={(e) => setRenumber(e.target.checked)} />
                Renumber rolls alphabetically in the new sections
              </label>
              <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
                <span className="flex items-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> {selected.length} selected</span>
                <Button disabled={!selected.length || missingTarget.length > 0} loading={saving} onClick={() => setConfirmOpen(true)}>Apply to {selected.length} student{selected.length === 1 ? '' : 's'}</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirm} variant="default" confirmText="Apply"
        title="Apply promotion?"
        message={`${ACTIONS.filter((a) => counts[a.value]).map((a) => `${counts[a.value]} ${a.label.toLowerCase()}`).join(', ')}. Students who pass out or leave are marked inactive. Their ${previous.name} record is kept.`} />
    </DashboardLayout>
  );
}
