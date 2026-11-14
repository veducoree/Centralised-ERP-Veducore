import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock, Megaphone, Bus, IndianRupee, ChevronRight, Wallet, BellOff, CheckCircle2, XCircle,
  Clock, CalendarOff, Stethoscope, Circle, FileText, Users,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchParentByUserId, fetchParentStudents, fetchAttendance, fetchFees, fetchStudentRecords, fetchRemarks,
  fetchMyNotifications,
} from '@/services/api';
import type { Parent, Student, Attendance, Fee, StudentRecord, Remark, Notification } from '@/types';
import { formatCurrency, getInitials } from '@/lib/utils';

const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const TODAY: Record<string, { label: string; cls: string; icon: ReactNode }> = {
  present: { label: 'Present today', cls: 'bg-white text-emerald-700', icon: <CheckCircle2 className="h-4 w-4" /> },
  medical: { label: 'Medical leave (ML)', cls: 'bg-white text-violet-700', icon: <Stethoscope className="h-4 w-4" /> },
  late: { label: 'Arrived late', cls: 'bg-white text-amber-700', icon: <Clock className="h-4 w-4" /> },
  leave: { label: 'On leave', cls: 'bg-white text-cyan-700', icon: <CalendarOff className="h-4 w-4" /> },
  absent: { label: 'Absent today', cls: 'bg-white text-red-600', icon: <XCircle className="h-4 w-4" /> },
};

function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
      {action}
    </div>
  );
}

function LinkBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className="flex items-center gap-0.5 text-xs font-medium text-[#5B6EE8] hover:underline">{children} <ChevronRight className="h-3.5 w-3.5" /></button>;
}

export default function ParentDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const today = localISO();

  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Student[]>([]);
  const [childId, setChildId] = useState('');
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [notices, setNotices] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBase = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [p, n] = await Promise.all([fetchParentByUserId(profile.id), fetchMyNotifications(10).catch(() => [] as Notification[])]);
      setNotices(n.slice(0, 4));
      if (p) {
        setParent(p);
        const kids = (await fetchParentStudents(p.id)).map((l) => l.student).filter(Boolean) as Student[];
        setChildren(kids);
        setChildId((cur) => cur || kids[0]?.id || '');
      }
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);
  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    if (!childId) return;
    Promise.all([
      fetchAttendance({ studentId: childId }).catch(() => []),
      fetchFees({ studentId: childId }).catch(() => []),
      fetchStudentRecords({ studentId: childId }).catch(() => []),
      fetchRemarks({ studentId: childId }).catch(() => []),
    ]).then(([a, f, r, rm]) => {
      setAttendance(a as Attendance[]); setFees(f as Fee[]); setRecords(r as StudentRecord[]);
      setRemarks((rm as Remark[]).filter((x) => x.visibility !== 'staff_only').sort((x, y) => y.created_at.localeCompare(x.created_at)));
    });
  }, [childId]);

  const child = children.find((c) => c.id === childId);

  const stats = useMemo(() => {
    const attended = attendance.filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'medical').length;
    const pending = fees.filter((f) => f.status !== 'paid' && Number(f.amount) > Number(f.paid_amount));
    const due = pending.reduce((s, f) => s + Number(f.amount) - Number(f.paid_amount), 0);
    const nextDue = pending.map((f) => f.due_date).sort()[0] ?? null;
    const exams = new Map<string, { marks: number; max: number; date: string; count: number }>();
    records.forEach((r) => {
      const e = exams.get(r.exam_name) ?? { marks: 0, max: 0, date: r.date, count: 0 };
      e.marks += Number(r.marks); e.max += Number(r.max_marks); e.count++; if (r.date > e.date) e.date = r.date;
      exams.set(r.exam_name, e);
    });
    const examList = [...exams.entries()].map(([name, e]) => ({ name, ...e, pct: e.max ? Math.round((e.marks / e.max) * 100) : 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
    return {
      pct: attendance.length ? Math.round((attended / attendance.length) * 100) : null,
      today: attendance.find((a) => a.attendance_date === today)?.status ?? null,
      due, nextDue, overdue: !!nextDue && nextDue < today,
      exams: examList.slice(0, 4),
    };
  }, [attendance, fees, records, today]);

  if (loading) return <DashboardLayout title="Dashboard"><DashboardSkeleton cards={4} /></DashboardLayout>;

  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const todayInfo = stats.today ? TODAY[stats.today] : null;

  const quick = [
    { label: 'Timetable', icon: <CalendarClock className="h-5 w-5" />, tint: 'bg-[#EEF0FD] text-[#5B6EE8]', path: '/parent/timetable' },
    { label: 'Fees', icon: <IndianRupee className="h-5 w-5" />, tint: 'bg-[#E6F8F1] text-[#22C08A]', path: '/parent/fees' },
    { label: 'Remarks', icon: <Megaphone className="h-5 w-5" />, tint: 'bg-[#FEF3E0] text-[#F5A623]', path: '/parent/remarks' },
    { label: 'Transport', icon: <Bus className="h-5 w-5" />, tint: 'bg-[#E0F7FB] text-[#06B6D4]', path: '/parent/transport' },
  ];

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {children.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <Users className="h-10 w-10 text-slate-300" />
            <p className="font-medium text-slate-700">{greet}, {parent?.full_name || profile?.full_name}</p>
            <p className="text-sm text-slate-500">No child is linked to your account yet. Please contact the school office.</p>
          </Card>
        ) : (
          <>
            {/* Child switcher */}
            {children.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {children.map((c) => (
                  <button key={c.id} onClick={() => setChildId(c.id)} aria-pressed={c.id === childId}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition ${c.id === childId ? 'bg-[#5B6EE8] text-white' : 'bg-white text-slate-600 hover:text-[#5B6EE8]'}`}>
                    {c.full_name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}

            {/* Child banner */}
            {child && (
              <div className="flex flex-col gap-4 rounded-[20px] bg-gradient-to-br from-[#5B6EE8] to-[#7B8CF7] p-6 text-white shadow-[0_8px_30px_rgba(91,110,232,0.25)] sm:flex-row sm:items-center">
                {child.avatar_url
                  ? <img src={child.avatar_url} alt="" className="h-16 w-16 rounded-2xl border-2 border-white/40 object-cover" />
                  : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-xl font-bold">{getInitials(child.full_name)}</span>}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/80">{greet}, {(parent?.full_name || profile?.full_name || '').split(' ')[0]}</p>
                  <h1 className="truncate text-2xl font-semibold">{child.full_name}</h1>
                  <p className="text-sm text-white/85">
                    {child.class?.name ?? 'Class'}{child.section?.name ? ` - ${child.section.name}` : ''}{child.roll_number ? ` · Roll ${child.roll_number}` : ''} · {child.admission_number}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-semibold sm:self-center ${todayInfo ? todayInfo.cls : 'bg-white/20 text-white'}`}>
                  {todayInfo ? todayInfo.icon : <Circle className="h-4 w-4" />} {todayInfo?.label ?? "Today's attendance not marked yet"}
                </span>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="cursor-pointer p-5" onClick={() => navigate('/parent/attendance')}>
                <p className="text-xs text-slate-500">Attendance</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${stats.pct !== null && stats.pct < 75 ? 'text-red-600' : 'text-[#0F172A]'}`}>{stats.pct !== null ? `${stats.pct}%` : '—'}</p>
                <p className="text-[11px] text-slate-400">{attendance.length} days marked · ML counts as present</p>
              </Card>
              <Card className="cursor-pointer p-5" onClick={() => navigate('/parent/fees')}>
                <p className="text-xs text-slate-500">Fees due</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${stats.due > 0 ? (stats.overdue ? 'text-red-600' : 'text-amber-600') : 'text-emerald-600'}`}>{stats.due > 0 ? formatCurrency(stats.due, '₹') : 'Nil'}</p>
                <p className="text-[11px] text-slate-400">{stats.nextDue ? `${stats.overdue ? 'Overdue since' : 'Next due'} ${fmt(stats.nextDue)}` : 'All fees cleared'}</p>
              </Card>
              <Card className="cursor-pointer p-5" onClick={() => navigate('/parent/records')}>
                <p className="text-xs text-slate-500">Last result</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-[#0F172A]">{stats.exams[0] ? `${stats.exams[0].pct}%` : '—'}</p>
                <p className="truncate text-[11px] text-slate-400">{stats.exams[0]?.name ?? 'No results published yet'}</p>
              </Card>
            </div>

            {stats.due > 0 && (
              <button onClick={() => navigate('/parent/fees')}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium ${stats.overdue ? 'bg-[#FEECEC] text-[#C53030]' : 'bg-[#FEF3E0] text-[#B26B00]'}`}>
                <Wallet className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{formatCurrency(stats.due, '₹')} {stats.overdue ? `overdue since ${fmt(stats.nextDue!)}` : `due by ${fmt(stats.nextDue!)}`} — view and pay</span>
                <ChevronRight className="h-4 w-4 opacity-60" />
              </button>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {quick.map((q) => (
                <button key={q.label} onClick={() => navigate(q.path)}
                  className="flex items-center gap-3 rounded-[20px] bg-white p-4 text-left shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition hover:-translate-y-0.5">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${q.tint}`}>{q.icon}</span>
                  <span className="text-sm font-semibold text-[#0F172A]">{q.label}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Results */}
              <Card className="p-5">
                <SectionHead title="Recent results" action={<LinkBtn onClick={() => navigate('/parent/records')}>All</LinkBtn>} />
                {stats.exams.length === 0 ? (
                  <div className="flex flex-col items-center py-6 text-center"><FileText className="mb-2 h-7 w-7 text-slate-300" /><p className="text-sm text-slate-400">No results yet</p></div>
                ) : (
                  <ul className="space-y-3">
                    {stats.exams.map((e) => (
                      <li key={e.name}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="truncate font-medium text-[#0F172A]">{e.name}</span>
                          <span className="tabular-nums font-semibold text-[#0F172A]">{e.pct}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF0FD]">
                          <div className={`h-full rounded-full ${e.pct < 33 ? 'bg-red-500' : 'bg-[#5B6EE8]'}`} style={{ width: `${e.pct}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Latest remark */}
              <Card className="p-5">
                <SectionHead title="Teacher's remarks" action={<LinkBtn onClick={() => navigate('/parent/remarks')}>All</LinkBtn>} />
                {remarks.length === 0 ? (
                  <div className="flex flex-col items-center py-6 text-center"><Megaphone className="mb-2 h-7 w-7 text-slate-300" /><p className="text-sm text-slate-400">No remarks yet</p></div>
                ) : (
                  <ul className="space-y-4">
                    {remarks.slice(0, 2).map((r) => (
                      <li key={r.id}>
                        <p className="line-clamp-3 text-sm italic text-slate-700">"{r.remark}"</p>
                        <p className="mt-1 text-[11px] text-slate-400">{(r as Remark & { teacher?: { full_name?: string } }).teacher?.full_name ?? 'Teacher'} · {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Notices */}
              <Card className="p-5">
                <SectionHead title="Notices" />
                {notices.length === 0 ? (
                  <div className="flex flex-col items-center py-6 text-center"><BellOff className="mb-2 h-7 w-7 text-slate-300" /><p className="text-sm text-slate-400">You're all caught up</p></div>
                ) : (
                  <ul className="divide-y divide-[#F1F2F8]">
                    {notices.map((n) => (
                      <li key={n.id} className="flex gap-3 py-2.5">
                        <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-[#5B6EE8]'}`} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#0F172A]">{n.title}</p>
                          <p className="line-clamp-2 text-xs text-slate-500">{n.message}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
