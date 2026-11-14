import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck, Grid3x3, AlertTriangle, UserCog, Download, Send, CheckCheck, ChevronLeft, ChevronRight, Save, Eye, Check, X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner, SearchInput } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/auth/AuthContext';
import { usePermissions } from '@/auth/PermissionsContext';
import {
  fetchClasses, fetchAttendance, fetchStudentsBySection, fetchHolidays, fetchTeachers,
  fetchAttendanceOverview, fetchAttendanceRegister, fetchAttendanceDefaulters, notifyLowAttendance,
  fetchStaffAttendanceForDate, saveStaffAttendance, fetchStaffAttendanceRegister, fetchAcademicSessions,
  fetchLeaveRequests, reviewLeave,
} from '@/services/api';
import type {
  Class, Section, Student, AttendanceStatus, Holiday, Teacher, SectionDayOverview, RegisterRow,
  AttendanceDefaulter, StaffAttendanceStatus, StaffRegisterRow, StaffLeave,
} from '@/types';
import { sortByClassOrder, sortSections } from '@/lib/classOrder';

type ClassWithSections = Class & { sections: Section[] };
type Tab = 'today' | 'register' | 'low' | 'staff';

// ─── helpers ────────────────────────────────────────────────────────────────
const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const monthOf = (iso: string) => iso.slice(0, 7);
function monthDays(month: string) {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

const STATUS: Record<AttendanceStatus, { short: string; label: string; on: string; cell: string }> = {
  present: { short: 'P', label: 'Present', on: 'bg-emerald-500 text-white', cell: 'text-emerald-700' },
  absent: { short: 'A', label: 'Absent', on: 'bg-red-500 text-white', cell: 'bg-red-50 text-red-600 font-semibold' },
  late: { short: 'L', label: 'Late', on: 'bg-amber-500 text-white', cell: 'bg-amber-50 text-amber-700' },
  medical: { short: 'ML', label: 'Medical (counts as present)', on: 'bg-violet-500 text-white', cell: 'bg-violet-50 text-violet-700' },
};
const STAFF_STATUS: Record<StaffAttendanceStatus, { short: string; label: string; on: string }> = {
  present: { short: 'P', label: 'Present', on: 'bg-emerald-500 text-white' },
  late: { short: 'L', label: 'Late', on: 'bg-amber-500 text-white' },
  half_day: { short: 'HD', label: 'Half day', on: 'bg-violet-500 text-white' },
  leave: { short: 'LV', label: 'Leave', on: 'bg-sky-500 text-white' },
  absent: { short: 'A', label: 'Absent', on: 'bg-red-500 text-white' },
};

function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function SectionSelect({ classes, value, onChange }: { classes: ClassWithSections[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select label="Section" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select section…</option>
      {classes.map((c) => (
        <optgroup key={c.id} label={c.name}>
          {c.sections.map((s) => <option key={s.id} value={s.id}>{c.name} - {s.name}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────
export default function AdminAttendance() {
  const { profile } = useAuth();
  const { can } = usePermissions();
  const toast = useToast();
  const schoolId = profile?.school_id;
  const [tab, setTab] = useState<Tab>('today');
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [sessionStart, setSessionStart] = useState<string>(localISO(new Date(new Date().getFullYear(), 3, 1)));

  useEffect(() => {
    if (!schoolId) return;
    Promise.all([fetchClasses(schoolId), fetchHolidays(schoolId).catch(() => []), fetchAcademicSessions(schoolId).catch(() => [])])
      .then(([c, h, s]) => {
        setClasses(sortByClassOrder(c as ClassWithSections[]).map((x) => ({ ...x, sections: sortSections(x.sections) })));
        setHolidays(h as Holiday[]);
        const cur = s.find((x) => x.is_current);
        if (cur) setSessionStart(cur.start_date);
      })
      .catch(() => toast('Failed to load classes', 'error'));
  }, [schoolId, toast]);

  const tabs: { key: Tab; label: string; icon: typeof CalendarCheck; show: boolean }[] = [
    { key: 'today', label: 'Daily', icon: CalendarCheck, show: true },
    { key: 'register', label: 'Monthly register', icon: Grid3x3, show: true },
    { key: 'low', label: 'Low attendance', icon: AlertTriangle, show: true },
    { key: 'staff', label: 'Staff', icon: UserCog, show: can('teachers', 'view') || can('attendance', 'view') },
  ];

  return (
    <DashboardLayout title="Attendance">
      <div className="space-y-6">
        <PageHeader title="Attendance" description="Student attendance is marked by class teachers. Here you can follow it, export registers, chase low attendance and manage staff attendance and leave." />
        <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
          {tabs.filter((t) => t.show).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${tab === key ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {tab === 'today' && <DailyTab />}
        {tab === 'register' && <RegisterTab classes={classes} holidays={holidays} />}
        {tab === 'low' && <LowTab classes={classes} defaultFrom={sessionStart} canNotify={can('notifications', 'edit')} />}
        {schoolId && tab === 'staff' && <StaffTab schoolId={schoolId} holidays={holidays} canEdit={can('teachers', 'edit') || can('attendance', 'edit')} />}
      </div>
    </DashboardLayout>
  );
}

// ─── Daily ──────────────────────────────────────────────────────────────────
function DailyTab() {
  const toast = useToast();
  const [date, setDate] = useState(localISO());
  const [rows, setRows] = useState<SectionDayOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<SectionDayOverview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await fetchAttendanceOverview(date)); }
    catch { toast('Failed to load attendance', 'error'); }
    finally { setLoading(false); }
  }, [date, toast]);
  useEffect(() => { load(); }, [load]);

  const withStudents = rows.filter((r) => r.students > 0);
  const marked = withStudents.filter((r) => r.marked > 0);
  const t = rows.reduce((a, r) => ({ p: a.p + r.present + r.late + r.medical, m: a.m + r.marked, ab: a.ab + r.absent }), { p: 0, m: 0, ab: 0 });
  const shift = (d: number) => { const x = new Date(date + 'T00:00:00'); x.setDate(x.getDate() + d); setDate(localISO(x)); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-1">
          <button onClick={() => shift(-1)} aria-label="Previous day" className="mb-0.5 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
          <div className="w-44"><Input label="Date" type="date" value={date} max={localISO()} onChange={(e) => setDate(e.target.value)} /></div>
          <button onClick={() => shift(1)} disabled={date >= localISO()} aria-label="Next day" className="mb-0.5 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="ml-auto grid grid-cols-3 gap-3 text-center">
          <Card className="px-4 py-2"><p className="text-[11px] text-slate-500">Sections marked</p><p className="font-bold tabular-nums">{marked.length}/{withStudents.length}</p></Card>
          <Card className="px-4 py-2"><p className="text-[11px] text-slate-500">Present</p><p className="font-bold tabular-nums text-emerald-600">{t.m ? `${pct(t.p, t.m)}%` : '—'}</p></Card>
          <Card className="px-4 py-2"><p className="text-[11px] text-slate-500">Absent</p><p className="font-bold tabular-nums text-red-600">{t.ab}</p></Card>
        </div>
      </div>

      {loading ? <LoadingSpinner variant="cards" /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {withStudents.map((r) => {
            const done = r.marked > 0;
            return (
              <button key={r.section_id} onClick={() => setOpen(r)}
                className="rounded-[16px] bg-white p-4 text-left shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition hover:-translate-y-0.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{r.label}</p>
                  {done
                    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{pct(r.present + r.late + r.medical, r.marked)}%</span>
                    : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Not marked</span>}
                </div>
                {done ? (
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span><b className="text-emerald-600">{r.present}</b> P</span>
                    <span><b className="text-red-600">{r.absent}</b> A</span>
                    <span><b className="text-amber-600">{r.late}</b> L</span>
                    {r.medical > 0 && <span><b className="text-violet-600">{r.medical}</b> ML</span>}
                    {r.marked < r.students && <span className="text-amber-600">{r.students - r.marked} left</span>}
                  </div>
                ) : <p className="text-xs text-slate-400">{r.students} students · waiting for class teacher</p>}
              </button>
            );
          })}
          {withStudents.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-500">No sections with students yet.</p>}
        </div>
      )}

      {open && <ViewModal section={open} date={date} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ViewModal({ section, date, onClose }: { section: SectionDayOverview; date: string; onClose: () => void }) {
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [status, setStatus] = useState<Record<string, AttendanceStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [st, att] = await Promise.all([fetchStudentsBySection(section.section_id), fetchAttendance({ sectionId: section.section_id, date })]);
        setStudents(st);
        setStatus(Object.fromEntries(att.map((a) => [a.student_id, a.status as AttendanceStatus])));
        setNotes(Object.fromEntries(att.filter((a) => a.notes).map((a) => [a.student_id, a.notes as string])));
      } catch { toast('Failed to load students', 'error'); }
      finally { setLoading(false); }
    })();
  }, [section.section_id, date, toast]);

  const shown = students.filter((s) => !search || s.full_name.toLowerCase().includes(search.toLowerCase()));
  const unmarked = students.filter((s) => !status[s.id]).length;

  return (
    <Modal open onClose={onClose} size="lg"
      title={`${section.label} · ${new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`}
      description="View only — attendance is marked by the class teacher."
      footer={<><span className="mr-auto flex items-center gap-1.5 text-xs text-slate-500"><Eye className="h-3.5 w-3.5" /> {unmarked ? `${unmarked} not marked` : 'All marked'}</span><Button onClick={onClose}>Close</Button></>}>
      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search student…" />
          <div className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto">
            {shown.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2">
                <span className="w-8 text-xs tabular-nums text-slate-400">{s.roll_number ?? '—'}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-slate-800">{s.full_name}</span>
                  {notes[s.id] && <span className="block truncate text-[11px] text-slate-400">{notes[s.id]}</span>}
                </span>
                {status[s.id] ? <StatusBadge status={status[s.id]} /> : <span className="text-xs text-slate-400">Not marked</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Monthly register ───────────────────────────────────────────────────────
function useOffDays(holidays: Holiday[]) {
  return useMemo(() => {
    const holiday = new Map<string, string>();
    const working = new Set<string>();
    holidays.forEach((h) => { if (h.type === 'working') working.add(h.date); else holiday.set(h.date, h.label ?? 'Holiday'); });
    return (d: string) => {
      if (holiday.has(d)) return holiday.get(d)!;
      if (working.has(d)) return null;
      return new Date(d + 'T00:00:00').getDay() === 0 ? 'Sunday' : null;
    };
  }, [holidays]);
}

function RegisterTab({ classes, holidays }: { classes: ClassWithSections[]; holidays: Holiday[] }) {
  const toast = useToast();
  const [sectionId, setSectionId] = useState('');
  const [month, setMonth] = useState(monthOf(localISO()));
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const offDay = useOffDays(holidays);
  const days = useMemo(() => monthDays(month), [month]);

  useEffect(() => { if (!sectionId && classes[0]?.sections[0]) setSectionId(classes[0].sections[0].id); }, [classes, sectionId]);
  useEffect(() => {
    if (!sectionId) return;
    setLoading(true);
    fetchAttendanceRegister(sectionId, days[0], days[days.length - 1])
      .then(setRows).catch(() => toast('Failed to load register', 'error')).finally(() => setLoading(false));
  }, [sectionId, days, toast]);

  const label = classes.flatMap((c) => c.sections.map((s) => ({ id: s.id, l: `${c.name}-${s.name}` }))).find((x) => x.id === sectionId)?.l ?? '';
  const workingDays = days.filter((d) => !offDay(d) && d <= localISO()).length;

  function exportCsv() {
    downloadCsv(`Attendance ${label} ${month}`, [
      ['Roll', 'Name', 'Admission No', ...days.map((d) => d.slice(8)), 'Present', 'Absent', 'Late', 'Medical', 'Marked', '%'],
      ...rows.map((r) => [r.roll_number, r.full_name, r.admission_number,
        ...days.map((d) => r.days[d] ? STATUS[r.days[d]].short : offDay(d) ? 'H' : ''),
        r.present, r.absent, r.late, r.medical, r.total, pct(r.present + r.late + r.medical, r.total)]),
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64"><SectionSelect classes={classes} value={sectionId} onChange={setSectionId} /></div>
        <div className="w-44"><Input label="Month" type="month" value={month} max={monthOf(localISO())} onChange={(e) => setMonth(e.target.value)} /></div>
        <p className="text-xs text-slate-500">{workingDays} working days so far</p>
        <Button className="ml-auto" variant="outline" icon={<Download className="h-4 w-4" />} disabled={!rows.length} onClick={exportCsv}>Export CSV</Button>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
        {(Object.keys(STATUS) as AttendanceStatus[]).map((k) => <span key={k} className="flex items-center gap-1"><span className={`rounded px-1 font-semibold ${STATUS[k].cell}`}>{STATUS[k].short}</span>{STATUS[k].label}</span>)}
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-200" /> Sunday / holiday</span>
      </div>
      <Card className="overflow-hidden">
        {loading ? <div className="p-6"><LoadingSpinner /></div> : rows.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">{sectionId ? 'No students in this section.' : 'Choose a section.'}</p> : (
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[180px] bg-slate-50 px-3 py-2 text-left font-medium">Student</th>
                  {days.map((d) => {
                    const off = offDay(d);
                    const dt = new Date(d + 'T00:00:00');
                    return (
                      <th key={d} title={off ?? undefined} className={`w-7 px-0.5 py-1 text-center font-medium ${off ? 'bg-slate-200/70' : ''}`}>
                        <div className="text-[9px] uppercase text-slate-400">{dt.toLocaleDateString('en-IN', { weekday: 'narrow' })}</div>
                        {dt.getDate()}
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 text-center font-medium">P</th>
                  <th className="px-2 py-2 text-center font-medium">A</th>
                  <th className="px-2 py-2 text-center font-medium">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const p = pct(r.present + r.late + r.medical, r.total);
                  return (
                    <tr key={r.student_id} className="hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                        <span className="mr-2 tabular-nums text-slate-400">{r.roll_number ?? '—'}</span>
                        <span className="font-medium text-slate-800">{r.full_name}</span>
                      </td>
                      {days.map((d) => {
                        const st = r.days[d];
                        const off = offDay(d);
                        return (
                          <td key={d} title={st ? STATUS[st].label : off ?? undefined}
                            className={`px-0.5 py-1.5 text-center ${st ? STATUS[st].cell : off ? 'bg-slate-200/70' : ''}`}>
                            {st ? STATUS[st].short : ''}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center tabular-nums">{r.present + r.late + r.medical}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-red-600">{r.absent}</td>
                      <td className={`px-2 py-1.5 text-center font-semibold tabular-nums ${r.total && p < 75 ? 'text-red-600' : 'text-slate-800'}`}>{r.total ? `${p}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Low attendance ─────────────────────────────────────────────────────────
function LowTab({ classes, defaultFrom, canNotify }: { classes: ClassWithSections[]; defaultFrom: string; canNotify: boolean }) {
  const toast = useToast();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(localISO());
  const [threshold, setThreshold] = useState(75);
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<AttendanceDefaulter[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { setFrom(defaultFrom); }, [defaultFrom]);
  useEffect(() => {
    if (!from || !to || from > to) return;
    setLoading(true);
    fetchAttendanceDefaulters(from, to, threshold, classId || null)
      .then((r) => { setRows(r); setSelected(new Set(r.map((x) => x.student_id))); })
      .catch(() => toast('Failed to load', 'error'))
      .finally(() => setLoading(false));
  }, [from, to, threshold, classId, toast]);

  async function notify() {
    setSending(true);
    try {
      const n = await notifyLowAttendance([...selected], from, to);
      toast(`Alert sent to parents of ${n} student${n === 1 ? '' : 's'}`, 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed to notify', 'error'); }
    finally { setSending(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40"><Input label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="w-40"><Input label="To" type="date" value={to} max={localISO()} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="w-32"><Input label="Below %" type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 75)} /></div>
        <div className="w-44">
          <Select label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" icon={<Download className="h-4 w-4" />} disabled={!rows.length}
            onClick={() => downloadCsv(`Low attendance ${from} to ${to}`, [
              ['Name', 'Admission No', 'Class', 'Roll', 'Present', 'Absent', 'Marked days', '%', 'Parent phone'],
              ...rows.map((r) => [r.full_name, r.admission_number, `${r.class_name ?? ''}-${r.section_name ?? ''}`, r.roll_number, r.present, r.absent, r.total, r.percent, r.parent_phone]),
            ])}>Export</Button>
          {canNotify && <Button icon={<Send className="h-4 w-4" />} loading={sending} disabled={!selected.size} onClick={notify}>Notify parents ({selected.size})</Button>}
        </div>
      </div>
      <Card className="overflow-hidden">
        {loading ? <div className="p-6"><LoadingSpinner /></div> : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">No student is below {threshold}% in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5"><input type="checkbox" aria-label="Select all" checked={selected.size === rows.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.student_id)) : new Set())} /></th>
                  <th className="px-3 py-2.5 font-medium">Student</th>
                  <th className="px-3 py-2.5 font-medium">Class</th>
                  <th className="px-3 py-2.5 text-right font-medium">Present / Marked</th>
                  <th className="px-3 py-2.5 font-medium">Attendance</th>
                  <th className="px-3 py-2.5 font-medium">Parent phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.student_id}>
                    <td className="px-4 py-2"><input type="checkbox" aria-label={`Select ${r.full_name}`} checked={selected.has(r.student_id)}
                      onChange={(e) => { const n = new Set(selected); if (e.target.checked) n.add(r.student_id); else n.delete(r.student_id); setSelected(n); }} /></td>
                    <td className="px-3 py-2"><p className="font-medium text-slate-900">{r.full_name}</p><p className="text-[11px] text-slate-400">{r.admission_number}</p></td>
                    <td className="px-3 py-2 text-slate-600">{r.class_name}-{r.section_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.present} / {r.total}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${r.percent < 60 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${r.percent}%` }} /></div>
                        <span className={`text-xs font-semibold tabular-nums ${r.percent < 60 ? 'text-red-600' : 'text-amber-700'}`}>{r.percent}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.parent_phone ? <a href={`tel:${r.parent_phone}`} className="hover:text-brand-600">{r.parent_phone}</a> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Staff ──────────────────────────────────────────────────────────────────
function StaffTab({ schoolId, holidays, canEdit }: { schoolId: string; holidays: Holiday[]; canEdit: boolean }) {
  const toast = useToast();
  const [date, setDate] = useState(localISO());
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rows, setRows] = useState<Record<string, { status?: StaffAttendanceStatus; check_in: string; note: string }>>({});
  const [original, setOriginal] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(monthOf(localISO()));
  const [register, setRegister] = useState<StaffRegisterRow[]>([]);
  const offDay = useOffDays(holidays);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, att] = await Promise.all([fetchTeachers(schoolId), fetchStaffAttendanceForDate(schoolId, date)]);
      const active = (t as Teacher[]).filter((x) => x.status === 'active');
      setTeachers(active);
      const m = Object.fromEntries(active.map((x) => {
        const a = att.find((r) => r.teacher_id === x.id);
        return [x.id, { status: a?.status, check_in: a?.check_in?.slice(0, 5) ?? '', note: a?.note ?? '' }];
      }));
      setRows(m);
      setOriginal(JSON.stringify(m));
    } catch { toast('Failed to load staff', 'error'); }
    finally { setLoading(false); }
  }, [schoolId, date, toast]);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => monthDays(month), [month]);
  const loadRegister = useCallback(() => {
    fetchStaffAttendanceRegister(days[0], days[days.length - 1]).then(setRegister).catch(() => {});
  }, [days]);
  useEffect(() => { loadRegister(); }, [loadRegister]);

  const dirty = JSON.stringify(rows) !== original;
  const off = offDay(date);

  async function save() {
    setSaving(true);
    try {
      await saveStaffAttendance(schoolId, date, Object.entries(rows).filter(([, r]) => r.status)
        .map(([teacher_id, r]) => ({ teacher_id, status: r.status!, check_in: r.check_in || null, note: r.note || null })));
      toast('Staff attendance saved', 'success');
      setOriginal(JSON.stringify(rows));
      loadRegister();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed to save', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <LeaveRequests schoolId={schoolId} canEdit={canEdit} onChanged={() => { load(); loadRegister(); }} />
      <Card className="p-5">
        <p className="mb-3 text-xs text-slate-500">Teachers mark themselves present from their portal or app. Approved leave fills in automatically. You can correct entries here.</p>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-44"><Input label="Date" type="date" value={date} max={localISO()} onChange={(e) => setDate(e.target.value)} /></div>
          {off && <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">{off}</span>}
          {canEdit && (
            <div className="ml-auto flex gap-2">
              <Button variant="outline" icon={<CheckCheck className="h-4 w-4" />}
                onClick={() => setRows(Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, { ...r, status: r.status ?? 'present' }])))}>Unmarked → present</Button>
              <Button icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty} onClick={save}>Save</Button>
            </div>
          )}
        </div>
        {loading ? <LoadingSpinner /> : teachers.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No active teachers.</p> : (
          <div className="divide-y divide-slate-100">
            {teachers.map((t) => {
              const r = rows[t.id];
              return (
                <div key={t.id} className="flex flex-col gap-2 py-2.5 md:flex-row md:items-center">
                  <div className="flex-1"><p className="text-sm font-medium text-slate-900">{t.full_name}</p><p className="text-[11px] text-slate-400">{t.employee_id}{t.subject ? ` · ${t.subject}` : ''}</p></div>
                  <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Attendance for ${t.full_name}`}>
                    {(Object.keys(STAFF_STATUS) as StaffAttendanceStatus[]).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={r?.status === k} disabled={!canEdit} title={STAFF_STATUS[k].label}
                        onClick={() => setRows({ ...rows, [t.id]: { ...r, status: k } })}
                        className={`h-8 min-w-[38px] rounded-lg px-2 text-xs font-semibold transition ${r?.status === k ? STAFF_STATUS[k].on : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {STAFF_STATUS[k].short}
                      </button>
                    ))}
                  </div>
                  <input type="time" value={r?.check_in ?? ''} disabled={!canEdit} aria-label={`Check-in for ${t.full_name}`}
                    onChange={(e) => setRows({ ...rows, [t.id]: { ...r, check_in: e.target.value } })}
                    className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                  <input value={r?.note ?? ''} disabled={!canEdit} placeholder="Note" aria-label={`Note for ${t.full_name}`}
                    onChange={(e) => setRows({ ...rows, [t.id]: { ...r, note: e.target.value } })}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm md:w-48" />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
          <p className="flex-1 font-semibold text-slate-900">Monthly summary</p>
          <div className="w-44"><Input label="Month" type="month" value={month} max={monthOf(localISO())} onChange={(e) => setMonth(e.target.value)} /></div>
          <Button variant="outline" icon={<Download className="h-4 w-4" />} disabled={!register.length}
            onClick={() => downloadCsv(`Staff attendance ${month}`, [
              ['Name', 'Employee ID', ...days.map((d) => d.slice(8)), 'Present', 'Late', 'Half day', 'Leave', 'Absent'],
              ...register.map((r) => [r.full_name, r.employee_id, ...days.map((d) => r.days[d] ? STAFF_STATUS[r.days[d]].short : offDay(d) ? 'H' : ''),
                r.present, r.late, r.half_day, r.on_leave, r.absent]),
            ])}>Export</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>{['Teacher', 'Present', 'Late', 'Half day', 'Leave', 'Absent', 'Marked'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {register.map((r) => (
                <tr key={r.teacher_id}>
                  <td className="px-4 py-2 font-medium text-slate-900">{r.full_name}</td>
                  <td className="px-4 py-2 tabular-nums text-emerald-700">{r.present}</td>
                  <td className="px-4 py-2 tabular-nums text-amber-700">{r.late}</td>
                  <td className="px-4 py-2 tabular-nums text-violet-700">{r.half_day}</td>
                  <td className="px-4 py-2 tabular-nums text-sky-700">{r.on_leave}</td>
                  <td className="px-4 py-2 tabular-nums text-red-600">{r.absent}</td>
                  <td className="px-4 py-2 tabular-nums text-slate-500">{r.total}</td>
                </tr>
              ))}
              {register.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No staff attendance this month.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Leave requests ─────────────────────────────────────────────────────────
function LeaveRequests({ schoolId, canEdit, onChanged }: { schoolId: string; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [rows, setRows] = useState<StaffLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<{ leave: StaffLeave; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await fetchLeaveRequests(schoolId, filter === 'pending' ? 'pending' : undefined)); }
    catch { toast('Failed to load leave requests', 'error'); }
    finally { setLoading(false); }
  }, [schoolId, filter, toast]);
  useEffect(() => { load(); }, [load]);

  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  async function submit() {
    if (!review) return;
    setBusy(true);
    try {
      await reviewLeave(review.leave.id, review.approve, note);
      toast(review.approve ? 'Leave approved — attendance updated' : 'Leave rejected', 'success');
      setReview(null); setNote('');
      load(); onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
        <p className="flex-1 font-semibold text-slate-900">Leave requests{filter === 'pending' && rows.length ? ` (${rows.length})` : ''}</p>
        <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
          {(['pending', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1 ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{f === 'pending' ? 'Pending' : 'All'}</button>
          ))}
        </div>
      </div>
      {loading ? <div className="p-5"><LoadingSpinner /></div> : rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">{filter === 'pending' ? 'No pending leave requests.' : 'No leave requests yet.'}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((l) => (
            <li key={l.id} className="flex flex-col gap-2 px-5 py-3 md:flex-row md:items-center">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{l.teacher?.full_name ?? 'Teacher'}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {l.leave_type === 'half_day' ? `Half day · ${fmt(l.from_date)}` : `${l.days} day${Number(l.days) === 1 ? '' : 's'} · ${fmt(l.from_date)}${l.to_date !== l.from_date ? ` – ${fmt(l.to_date)}` : ''}`}
                  </span>
                </p>
                <p className="truncate text-xs text-slate-500">{l.reason}{l.review_note ? ` · Note: ${l.review_note}` : ''}</p>
              </div>
              {l.status === 'pending' && canEdit ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => { setReview({ leave: l, approve: false }); setNote(''); }}>Reject</Button>
                  <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => { setReview({ leave: l, approve: true }); setNote(''); }}>Approve</Button>
                </div>
              ) : <StatusBadge status={l.status} />}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!review} onClose={() => setReview(null)} title={review?.approve ? 'Approve leave?' : 'Reject leave?'}
        description={review ? `${review.leave.teacher?.full_name} · ${review.leave.reason}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setReview(null)}>Cancel</Button><Button variant={review?.approve ? 'primary' : 'danger'} loading={busy} onClick={submit}>{review?.approve ? 'Approve' : 'Reject'}</Button></>}>
        <Textarea label="Note to teacher (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        {review?.approve && <p className="mt-2 text-xs text-slate-500">Working days in the range are marked as {review.leave.leave_type === 'half_day' ? 'half day' : 'leave'} in staff attendance.</p>}
      </Modal>
    </Card>
  );
}
