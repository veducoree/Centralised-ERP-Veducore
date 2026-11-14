import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LogOut, CalendarPlus, ChevronLeft, ChevronRight, Clock, Plane } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchTeacherByUserId, markMyAttendance, fetchMyStaffAttendance, applyLeave, cancelMyLeave, fetchMyLeaves, fetchHolidays,
} from '@/services/api';
import type { Teacher, StaffAttendanceRow, StaffLeave, StaffAttendanceStatus, Holiday } from '@/types';

const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return localISO(d); };
const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const time12 = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const DAY_STYLE: Record<StaffAttendanceStatus, { cls: string; label: string }> = {
  present: { cls: 'bg-emerald-500 text-white', label: 'Present' },
  late: { cls: 'bg-amber-500 text-white', label: 'Late' },
  half_day: { cls: 'bg-violet-500 text-white', label: 'Half day' },
  leave: { cls: 'bg-sky-500 text-white', label: 'Leave' },
  absent: { cls: 'bg-red-500 text-white', label: 'Absent' },
};

export default function TeacherMyAttendance() {
  const { profile } = useAuth();
  const toast = useToast();
  const today = localISO();
  const tomorrow = addDays(today, 1);

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [rows, setRows] = useState<StaffAttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [form, setForm] = useState({ type: 'full_day' as 'full_day' | 'half_day', from: tomorrow, to: tomorrow, reason: '' });
  const [applying, setApplying] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const n = new Date(y, m, 0).getDate();
    return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  }, [month]);

  // Teacher + holidays once.
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const t = await fetchTeacherByUserId(profile.id);
        setTeacher(t);
        if (t) setHolidays(await fetchHolidays(t.school_id).catch(() => [] as Holiday[]));
        else setLoading(false);
      } catch { setLoading(false); }
    })();
  }, [profile?.id]);

  const load = useCallback(async () => {
    if (!teacher) return;
    try {
      const [r, l] = await Promise.all([
        fetchMyStaffAttendance(teacher.id, days[0], days[days.length - 1]),
        fetchMyLeaves(teacher.id),
      ]);
      setRows(r); setLeaves(l);
    } catch { toast('Failed to load your attendance', 'error'); }
    finally { setLoading(false); }
  }, [teacher, days, toast]);

  useEffect(() => { load(); }, [load]);

  const byDate = useMemo(() => Object.fromEntries(rows.map((r) => [r.attendance_date, r])), [rows]);
  const todayRow = month === today.slice(0, 7) ? byDate[today] : undefined;
  const [todayFetched, setTodayFetched] = useState<StaffAttendanceRow | null | undefined>(undefined);
  useEffect(() => {
    if (!teacher || month === today.slice(0, 7)) { setTodayFetched(undefined); return; }
    fetchMyStaffAttendance(teacher.id, today, today).then((r) => setTodayFetched(r[0] ?? null)).catch(() => {});
  }, [teacher, month, today]);
  const mine = todayRow ?? todayFetched ?? null;

  const holidayOn = useMemo(() => {
    const m = new Map(holidays.map((h) => [h.date, h]));
    return (d: string) => {
      const h = m.get(d);
      if (h?.type === 'working') return null;
      if (h) return h.label ?? 'Holiday';
      return new Date(d + 'T00:00:00').getDay() === 0 ? 'Sunday' : null;
    };
  }, [holidays]);
  const todayOff = holidayOn(today);

  async function mark(checkOut: boolean) {
    setMarking(true);
    try {
      const r = await markMyAttendance(checkOut);
      toast(checkOut ? `Checked out at ${time12(r.check_out)}` : `Marked present at ${time12(r.check_in)}`, 'success');
      load();
      if (month !== today.slice(0, 7)) setTodayFetched(r);
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setMarking(false); }
  }

  async function submitLeave() {
    if (!form.reason.trim()) { toast('Please give a reason', 'error'); return; }
    if (form.from < tomorrow) { toast('Leave must be applied at least one day in advance', 'error'); return; }
    if (form.type === 'full_day' && form.to < form.from) { toast('End date is before start date', 'error'); return; }
    setApplying(true);
    try {
      await applyLeave(form.type, form.from, form.type === 'half_day' ? form.from : form.to, form.reason.trim());
      toast('Leave request sent to the office', 'success');
      setForm({ type: 'full_day', from: tomorrow, to: tomorrow, reason: '' });
      load();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed to apply', 'error'); }
    finally { setApplying(false); }
  }

  async function doCancel() {
    if (!cancelId) return;
    try { await cancelMyLeave(cancelId); toast('Leave request cancelled', 'success'); load(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed to cancel', 'error'); }
  }

  const counts = rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<string, number>);
  const firstDow = new Date(days[0] + 'T00:00:00').getDay();
  const shiftMonth = (n: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); setMonth(localISO(d).slice(0, 7)); };

  if (loading) return <DashboardLayout title="My Attendance"><LoadingSpinner variant="cards" /></DashboardLayout>;
  if (!teacher) return <DashboardLayout title="My Attendance"><Card className="p-10 text-center text-slate-500">Teacher profile not found.</Card></DashboardLayout>;

  return (
    <DashboardLayout title="My Attendance">
      <div className="space-y-6">
        <PageHeader title="My Attendance" description="Mark yourself present each day and apply for leave in advance." />

        {/* Today */}
        <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm text-slate-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            {mine ? (
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {DAY_STYLE[mine.status].label}
                {mine.check_in && <span className="ml-2 text-sm font-normal text-slate-500">in at {time12(mine.check_in)}</span>}
                {mine.check_out && <span className="ml-2 text-sm font-normal text-slate-500">· out at {time12(mine.check_out)}</span>}
              </p>
            ) : todayOff ? (
              <p className="mt-1 text-lg font-semibold text-slate-900">{todayOff} — no school</p>
            ) : (
              <p className="mt-1 text-lg font-semibold text-slate-900">Not marked yet</p>
            )}
          </div>
          {!mine && !todayOff && (
            <Button icon={<CheckCircle2 className="h-4 w-4" />} loading={marking} onClick={() => mark(false)}>Mark present</Button>
          )}
          {mine && mine.status !== 'leave' && !mine.check_out && mine.check_in && (
            <Button variant="outline" icon={<LogOut className="h-4 w-4" />} loading={marking} onClick={() => mark(true)}>Check out</Button>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Month */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
              <p className="font-semibold text-slate-900">{new Date(days[0] + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
              <button onClick={() => shiftMonth(1)} disabled={month >= today.slice(0, 7)} aria-label="Next month" className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="py-1 font-medium text-slate-400">{d}</span>)}
              {Array.from({ length: firstDow }).map((_, i) => <span key={`e${i}`} />)}
              {days.map((d) => {
                const r = byDate[d];
                const off = holidayOn(d);
                const isToday = d === today;
                return (
                  <span key={d} title={r ? DAY_STYLE[r.status].label : off ?? undefined}
                    className={`flex aspect-square items-center justify-center rounded-lg text-[13px] ${
                      r ? DAY_STYLE[r.status].cls : off ? 'bg-slate-100 text-slate-400' : d > today ? 'text-slate-300' : 'text-slate-700'
                    } ${isToday ? 'ring-2 ring-brand-400 ring-offset-1' : ''}`}>
                    {Number(d.slice(8))}
                  </span>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
              {(Object.keys(DAY_STYLE) as StaffAttendanceStatus[]).map((k) => (
                <span key={k} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${DAY_STYLE[k].cls}`} />{DAY_STYLE[k].label} <b>{counts[k] ?? 0}</b></span>
              ))}
            </div>
          </Card>

          {/* Apply leave */}
          <Card className="p-6">
            <p className="mb-1 flex items-center gap-2 font-semibold text-slate-900"><CalendarPlus className="h-4 w-4 text-brand-500" /> Apply for leave</p>
            <p className="mb-4 text-xs text-slate-500">At least one day in advance. The office approves it and your attendance is filled in.</p>
            <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium" role="radiogroup" aria-label="Leave type">
              {([['full_day', 'Full day(s)'], ['half_day', 'Half day']] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={form.type === v} onClick={() => setForm({ ...form, type: v, to: form.from })}
                  className={`rounded-md px-3 py-1.5 ${form.type === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
            <div className={`grid gap-3 ${form.type === 'full_day' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <Input label={form.type === 'full_day' ? 'From' : 'Date'} type="date" min={tomorrow} value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} />
              {form.type === 'full_day' && (
                <Input label="To" type="date" min={form.from} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
              )}
            </div>
            <div className="mt-3">
              <Textarea label="Reason" rows={2} value={form.reason} placeholder="e.g. Family function" onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
            <Button className="mt-4 w-full" icon={<Plane className="h-4 w-4" />} loading={applying} onClick={submitLeave}>Send request</Button>
          </Card>
        </div>

        {/* My requests */}
        <Card className="overflow-hidden">
          <p className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">My leave requests</p>
          {leaves.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">No leave requests yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {leaves.map((l) => (
                <li key={l.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {l.leave_type === 'half_day' ? `Half day · ${fmt(l.from_date)}` : `${fmt(l.from_date)}${l.to_date !== l.from_date ? ` – ${fmt(l.to_date)}` : ''} · ${l.days} day${Number(l.days) === 1 ? '' : 's'}`}
                    </p>
                    <p className="truncate text-xs text-slate-500">{l.reason}{l.review_note ? ` · Office: ${l.review_note}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={l.status} />
                    {(l.status === 'pending' || l.status === 'approved') && l.from_date > today && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelId(l.id)}>Cancel</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <p className="flex items-center gap-1.5 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" /> Times use the school's timezone.</p>
      </div>

      <ConfirmDialog open={!!cancelId} onClose={() => setCancelId(null)} onConfirm={doCancel}
        title="Cancel leave request?" message="If it was already approved, those days go back to unmarked." />
    </DashboardLayout>
  );
}
