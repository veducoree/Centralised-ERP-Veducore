import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Plus, Pencil, Trash2, CheckCircle2, Star, Info } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchAcademicSessions, saveAcademicSession, setCurrentAcademicSession,
  deleteAcademicSession, countSessionEnrollments, clearApiCache,
} from '@/services/api';
import type { AcademicSession } from '@/types';

const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Suggests the next April–March session after the latest one. */
function suggestNext(sessions: AcademicSession[]) {
  const latest = sessions[0];
  const startYear = latest
    ? new Date(latest.end_date + 'T00:00:00').getFullYear()
    : new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  return {
    name: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
    start_date: `${startYear}-04-01`,
    end_date: `${startYear + 1}-03-31`,
  };
}

const STATUS_STYLE: Record<AcademicSession['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700',
  upcoming: 'bg-sky-50 text-sky-700',
  closed: 'bg-slate-100 text-slate-500',
};

export default function AdminSessions() {
  const { profile } = useAuth();
  const toast = useToast();
  const schoolId = profile?.school_id;

  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [enrolled, setEnrolled] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ id?: string; name: string; start_date: string; end_date: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [switchTo, setSwitchTo] = useState<AcademicSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AcademicSession | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const list = await fetchAcademicSessions(schoolId);
      setSessions(list);
      const counts = await Promise.all(list.map((s) => countSessionEnrollments(s.id).catch(() => 0)));
      setEnrolled(Object.fromEntries(list.map((s, i) => [s.id, counts[i]])));
    } catch { toast('Failed to load sessions', 'error'); }
    finally { setLoading(false); }
  }, [schoolId, toast]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!schoolId || !modal) return;
    const e: Record<string, string> = {};
    if (!modal.name.trim()) e.name = 'Name is required';
    if (!modal.start_date) e.start_date = 'Start date is required';
    if (!modal.end_date) e.end_date = 'End date is required';
    if (modal.start_date && modal.end_date && modal.end_date <= modal.start_date) e.end_date = 'End date must be after start date';
    const overlap = sessions.find((s) => s.id !== modal.id && modal.start_date <= s.end_date && modal.end_date >= s.start_date);
    if (!e.end_date && overlap) e.end_date = `Overlaps with session ${overlap.name}`;
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      await saveAcademicSession({ id: modal.id, school_id: schoolId, name: modal.name.trim(), start_date: modal.start_date, end_date: modal.end_date });
      toast(modal.id ? 'Session updated' : 'Session created', 'success');
      setModal(null);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save session', 'error');
    } finally { setSaving(false); }
  }

  async function handleSwitch() {
    if (!schoolId || !switchTo) return;
    try {
      await setCurrentAcademicSession(switchTo.id, schoolId);
      clearApiCache();
      toast(`${switchTo.name} is now the current session`, 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to switch session', 'error');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteAcademicSession(deleteTarget.id);
      toast('Session deleted', 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete session', 'error');
    }
  }

  const current = sessions.find((s) => s.is_current);

  return (
    <DashboardLayout title="Academic Year">
      <div className="space-y-6">
        <PageHeader
          title="Academic Sessions"
          description="Fees, exams and class enrollments are recorded against the current session."
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setErrors({}); setModal(suggestNext(sessions)); }}>New session</Button>}
        />

        {current && (
          <Card className="flex flex-col gap-4 bg-gradient-to-br from-brand-50 to-white p-6 sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white"><CalendarRange className="h-6 w-6" /></span>
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-600">Current session</p>
              <p className="text-xl font-bold text-slate-900">{current.name}</p>
              <p className="text-sm text-slate-500">{fmt(current.start_date)} – {fmt(current.end_date)} · {enrolled[current.id] ?? 0} students enrolled</p>
            </div>
            {(() => {
              const total = new Date(current.end_date).getTime() - new Date(current.start_date).getTime();
              const done = Math.min(Math.max(Date.now() - new Date(current.start_date).getTime(), 0), total);
              const p = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div className="w-full sm:w-48">
                  <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Year progress</span><span className="tabular-nums">{p}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${p}%` }} /></div>
                </div>
              );
            })()}
          </Card>
        )}

        <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>Create next year's session in advance. Switching the current session closes the old one; its fees, marks and class history stay available. After switching, move students up from the Promotion page.</p>
        </div>

        {loading ? <LoadingSpinner variant="cards" /> : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex flex-1 items-center gap-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.is_current ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {s.is_current ? <Star className="h-4 w-4" /> : <CalendarRange className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="flex items-center gap-2 font-semibold text-slate-900">
                        {s.name}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[s.status]}`}>{s.is_current ? 'current' : s.status}</span>
                      </p>
                      <p className="text-xs text-slate-500">{fmt(s.start_date)} – {fmt(s.end_date)} · {enrolled[s.id] ?? 0} enrolled</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!s.is_current && (
                      <Button size="sm" variant="outline" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setSwitchTo(s)}>Make current</Button>
                    )}
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => { setErrors({}); setModal({ id: s.id, name: s.name, start_date: s.start_date, end_date: s.end_date }); }}>Edit</Button>
                    {!s.is_current && (enrolled[s.id] ?? 0) === 0 && (
                      <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteTarget(s)} aria-label={`Delete ${s.name}`}>Delete</Button>
                    )}
                  </div>
                </li>
              ))}
              {sessions.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-500">No sessions yet</li>}
            </ul>
          </Card>
        )}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit session' : 'New session'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} onClick={handleSave}>Save</Button></>}>
        {modal && (
          <div className="space-y-4">
            <Input label="Session name" required value={modal.name} error={errors.name} placeholder="2027-28"
              onChange={(e) => setModal({ ...modal, name: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Starts" type="date" required value={modal.start_date} error={errors.start_date}
                onChange={(e) => setModal({ ...modal, start_date: e.target.value })} />
              <Input label="Ends" type="date" required value={modal.end_date} error={errors.end_date}
                onChange={(e) => setModal({ ...modal, end_date: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!switchTo} onClose={() => setSwitchTo(null)} onConfirm={handleSwitch} variant="default"
        title={`Switch to ${switchTo?.name}?`} confirmText="Make current"
        message={`New fees and exams will be recorded under ${switchTo?.name}. ${current ? `${current.name} will be closed.` : ''} Students stay in their current classes until you promote them.`} />

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete session" message={`Delete ${deleteTarget?.name}? This cannot be undone.`} />
    </DashboardLayout>
  );
}
