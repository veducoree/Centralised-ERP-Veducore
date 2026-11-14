import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, CalendarDays, Pencil, Trash2, Award, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { usePermissions } from '@/auth/PermissionsContext';
import {
  fetchExams, saveExam, deleteExam, fetchClasses, fetchGradingScales, saveGradingScale, fetchAcademicSessions,
} from '@/services/api';
import type { Exam, Class, Section, GradingScale, GradeBand, RecordType, AcademicSession } from '@/types';
import { sortByClassOrder } from '@/lib/classOrder';

export const EXAM_TYPES: { value: RecordType; label: string }[] = [
  { value: 'unit_test', label: 'Unit Test' },
  { value: 'mid_term', label: 'Half Yearly / Mid Term' },
  { value: 'final_exam', label: 'Annual / Final' },
  { value: 'practical', label: 'Practical' },
  { value: 'assignment', label: 'Assignment' },
];

export const EXAM_STATUS_STYLE: Record<Exam['status'], { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'Scheduled', cls: 'bg-sky-50 text-sky-700' },
  published: { label: 'Results published', cls: 'bg-emerald-50 text-emerald-700' },
};

const fmt = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

type ClassWithSections = Class & { sections: Section[] };
const emptyForm = { name: '', record_type: 'mid_term' as RecordType, start_date: '', end_date: '', grading_scale_id: '', instructions: '', class_ids: [] as string[] };

export default function AdminExams() {
  const { profile } = useAuth();
  const { can } = usePermissions();
  const canEdit = can('exams', 'edit');
  const toast = useToast();
  const navigate = useNavigate();
  const schoolId = profile?.school_id;

  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [scales, setScales] = useState<GradingScale[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<(typeof emptyForm & { id?: string }) | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [gradingOpen, setGradingOpen] = useState(false);
  const [bands, setBands] = useState<GradeBand[]>([]);
  const [passPercent, setPassPercent] = useState(33);
  const [savingBands, setSavingBands] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    Promise.all([fetchClasses(schoolId), fetchGradingScales(schoolId), fetchAcademicSessions(schoolId)])
      .then(([c, g, s]) => {
        setClasses(sortByClassOrder(c as ClassWithSections[]));
        setScales(g);
        setSessions(s);
        setSessionId((cur) => cur || s.find((x) => x.is_current)?.id || '');
      })
      .catch(() => toast('Failed to load classes', 'error'));
  }, [schoolId, toast]);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try { setExams(await fetchExams(schoolId, sessionId || null)); }
    catch { toast('Failed to load exams', 'error'); }
    finally { setLoading(false); }
  }, [schoolId, sessionId, toast]);

  useEffect(() => { load(); }, [load]);

  const classNames = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c.name])), [classes]);
  const defaultScale = scales.find((s) => s.is_default) ?? scales[0];

  function openNew() {
    setErrors({});
    setModal({ ...emptyForm, grading_scale_id: defaultScale?.id ?? '' });
  }

  function openEdit(e: Exam) {
    setErrors({});
    setModal({
      id: e.id, name: e.name, record_type: e.record_type, start_date: e.start_date ?? '', end_date: e.end_date ?? '',
      grading_scale_id: e.grading_scale_id ?? '', instructions: e.instructions ?? '', class_ids: e.class_ids,
    });
  }

  async function handleSave() {
    if (!schoolId || !modal) return;
    const e: Record<string, string> = {};
    if (!modal.name.trim()) e.name = 'Name is required';
    if (!modal.class_ids.length) e.class_ids = 'Pick at least one class';
    if (modal.start_date && modal.end_date && modal.end_date < modal.start_date) e.end_date = 'Ends before it starts';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const id = await saveExam({
        id: modal.id, school_id: schoolId, name: modal.name.trim(), record_type: modal.record_type,
        start_date: modal.start_date || null, end_date: modal.end_date || null,
        grading_scale_id: modal.grading_scale_id || null, instructions: modal.instructions.trim() || null,
        class_ids: modal.class_ids,
      });
      toast(modal.id ? 'Exam updated' : 'Exam created — now add the datesheet', 'success');
      setModal(null);
      if (!modal.id) navigate(`/admin/exams/${id}`); else load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save exam', 'error');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try { await deleteExam(deleteTarget.id); toast('Exam deleted', 'success'); load(); }
    catch (err) { toast(err instanceof Error ? err.message : 'Failed to delete', 'error'); }
  }

  function openGrading() {
    if (!defaultScale) return;
    setBands(defaultScale.bands.map((b) => ({ ...b })));
    setPassPercent(defaultScale.pass_percent);
    setGradingOpen(true);
  }

  async function handleSaveBands() {
    if (!defaultScale) return;
    const clean = bands.filter((b) => b.grade.trim());
    const grades = new Set(clean.map((b) => b.grade.trim().toUpperCase()));
    if (grades.size !== clean.length) { toast('Each grade must be unique', 'error'); return; }
    if (!clean.some((b) => b.min_percent === 0)) { toast('One grade must start at 0%', 'error'); return; }
    setSavingBands(true);
    try {
      await saveGradingScale(defaultScale.id, passPercent, clean);
      setScales(await fetchGradingScales(schoolId!));
      toast('Grading scale saved', 'success');
      setGradingOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save grading', 'error');
    } finally { setSavingBands(false); }
  }

  const toggleClass = (id: string) => modal && setModal({
    ...modal, class_ids: modal.class_ids.includes(id) ? modal.class_ids.filter((c) => c !== id) : [...modal.class_ids, id],
  });

  return (
    <DashboardLayout title="Exams">
      <div className="space-y-6">
        <PageHeader
          title="Exams & Results"
          description="Schedule exams, track marks entry, publish results and print report cards."
          action={<>
            <div className="w-40">
              <Select fieldSize="sm" value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label="Session">
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (current)' : ''}</option>)}
              </Select>
            </div>
            <Button variant="outline" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={openGrading} disabled={!defaultScale}>Grading</Button>
            {canEdit && <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>New exam</Button>}
          </>}
        />

        {loading ? <LoadingSpinner variant="cards" /> : exams.length === 0 ? (
          <Card className="flex flex-col items-center py-16 text-center">
            <FileText className="mb-3 h-12 w-12 text-slate-300" />
            <p className="font-medium text-slate-700">No exams in this session yet</p>
            <p className="mb-4 text-sm text-slate-500">Create one, add the datesheet, and teachers can start entering marks.</p>
            {canEdit && <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Create first exam</Button>}
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {exams.map((e) => {
              const st = EXAM_STATUS_STYLE[e.status];
              return (
                <Card key={e.id} className="flex cursor-pointer flex-col p-5 transition hover:-translate-y-0.5" onClick={() => navigate(`/admin/exams/${e.id}`)}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                      {e.status === 'published' ? <Award className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="font-semibold text-slate-900">{e.name}</p>
                  <p className="text-xs text-slate-500">{EXAM_TYPES.find((t) => t.value === e.record_type)?.label}</p>
                  {(e.start_date || e.end_date) && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" /> {fmt(e.start_date)}{e.end_date && e.end_date !== e.start_date ? ` – ${fmt(e.end_date)}` : ''}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {e.class_ids.slice(0, 8).map((c) => (
                      <span key={c} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{classNames[c] ?? '—'}</span>
                    ))}
                    {e.class_ids.length > 8 && <span className="text-[10px] text-slate-400">+{e.class_ids.length - 8}</span>}
                  </div>
                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3" onClick={(ev) => ev.stopPropagation()}>
                    {canEdit && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => openEdit(e)}>Edit</Button>}
                    {canEdit && e.status !== 'published' && (
                      <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteTarget(e)}>Delete</Button>
                    )}
                    <button onClick={() => navigate(`/admin/exams/${e.id}`)} className="ml-auto flex items-center gap-0.5 text-xs font-medium text-brand-600">
                      Open <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / edit */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg" title={modal?.id ? 'Edit exam' : 'New exam'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} onClick={handleSave}>{modal?.id ? 'Save' : 'Create & add datesheet'}</Button></>}>
        {modal && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Exam name" required value={modal.name} error={errors.name} placeholder="Half Yearly Examination"
                onChange={(e) => setModal({ ...modal, name: e.target.value })} />
              <Select label="Type" value={modal.record_type} onChange={(e) => setModal({ ...modal, record_type: e.target.value as RecordType })}>
                {EXAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Starts" type="date" value={modal.start_date} onChange={(e) => setModal({ ...modal, start_date: e.target.value })} />
              <Input label="Ends" type="date" value={modal.end_date} error={errors.end_date} onChange={(e) => setModal({ ...modal, end_date: e.target.value })} />
              <Select label="Grading" value={modal.grading_scale_id} onChange={(e) => setModal({ ...modal, grading_scale_id: e.target.value })}>
                {scales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[13px] font-medium text-slate-700">Classes <span className="text-red-500">*</span></p>
                <button type="button" className="text-xs font-medium text-brand-600"
                  onClick={() => setModal({ ...modal, class_ids: modal.class_ids.length === classes.length ? [] : classes.map((c) => c.id) })}>
                  {modal.class_ids.length === classes.length ? 'Clear' : 'Select all'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => {
                  const on = modal.class_ids.includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => toggleClass(c.id)} aria-pressed={on}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {errors.class_ids && <p className="mt-1 text-xs text-red-500">{errors.class_ids}</p>}
            </div>
            <Textarea label="Instructions for students (optional)" rows={2} value={modal.instructions}
              onChange={(e) => setModal({ ...modal, instructions: e.target.value })} />
          </div>
        )}
      </Modal>

      {/* Grading scale */}
      <Modal open={gradingOpen} onClose={() => setGradingOpen(false)} title="Grading scale" size="lg"
        description="A student's grade is the highest band whose minimum % they reach."
        footer={canEdit ? <><Button variant="ghost" onClick={() => setGradingOpen(false)}>Cancel</Button><Button loading={savingBands} onClick={handleSaveBands}>Save</Button></> : <Button onClick={() => setGradingOpen(false)}>Close</Button>}>
        <div className="space-y-4">
          <div className="max-w-xs">
            <Input label="Pass mark (% overall and per subject)" type="number" min={0} max={100} value={passPercent} disabled={!canEdit}
              onChange={(e) => setPassPercent(Number(e.target.value))} />
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="px-3 py-2 text-left font-medium">Grade</th><th className="px-3 py-2 text-left font-medium">From %</th><th className="px-3 py-2 text-left font-medium">Grade point</th><th className="px-3 py-2 text-left font-medium">Remark</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bands.map((b, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5"><input className="w-16 rounded-md border border-slate-200 px-2 py-1" value={b.grade} disabled={!canEdit} aria-label="Grade"
                      onChange={(e) => setBands(bands.map((x, j) => j === i ? { ...x, grade: e.target.value } : x))} /></td>
                    <td className="px-2 py-1.5"><input type="number" min={0} max={100} className="w-20 rounded-md border border-slate-200 px-2 py-1" value={b.min_percent} disabled={!canEdit} aria-label="Minimum percent"
                      onChange={(e) => setBands(bands.map((x, j) => j === i ? { ...x, min_percent: Number(e.target.value) } : x))} /></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.5" className="w-20 rounded-md border border-slate-200 px-2 py-1" value={b.grade_point ?? ''} disabled={!canEdit} aria-label="Grade point"
                      onChange={(e) => setBands(bands.map((x, j) => j === i ? { ...x, grade_point: e.target.value === '' ? null : Number(e.target.value) } : x))} /></td>
                    <td className="px-2 py-1.5"><input className="w-full rounded-md border border-slate-200 px-2 py-1" value={b.remark ?? ''} disabled={!canEdit} aria-label="Remark"
                      onChange={(e) => setBands(bands.map((x, j) => j === i ? { ...x, remark: e.target.value } : x))} /></td>
                    <td className="px-2 py-1.5">{canEdit && <button onClick={() => setBands(bands.filter((_, j) => j !== i))} aria-label="Remove band" className="rounded p-1 text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setBands([...bands, { grade: '', min_percent: 0, grade_point: null, remark: '' }])}>Add band</Button>}
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete exam" message={`Delete ${deleteTarget?.name}? Its datesheet and all marks entered for it will be removed.`} />
    </DashboardLayout>
  );
}
