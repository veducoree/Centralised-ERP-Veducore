import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, IndianRupee, ClipboardCheck, UserPlus, Send, CalendarDays,
  AlertTriangle, Bus, Cake, ChevronRight, CheckCircle2, XCircle, Clock, FileMinus,
  CalendarRange, RefreshCw, Wallet, Bell,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/auth/AuthContext';
import { fetchAdminDashboardSummary } from '@/services/api';
import type { AdminDashboardSummary } from '@/types';
import { sortByClassOrder } from '@/lib/classOrder';

// ─── Helpers ──────────────────────────────────────────────────────────────

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const inrShort = (n: number) => {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Small building blocks ────────────────────────────────────────────────

function Kpi({ label, value, sub, icon, tint, onClick }: {
  label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; tint: string; onClick?: () => void;
}) {
  return (
    <Card className={`p-5 ${onClick ? 'cursor-pointer transition hover:-translate-y-0.5' : ''}`} onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tint}`}>{icon}</span>
      </div>
    </Card>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="text-[15px] font-semibold text-slate-900">{children}</h3>
      {action}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700">
      {children} <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Single-series vertical bar chart. Bars grow from a shared baseline with a
 * 4px rounded top; hover shows an exact-value tooltip. Labels sit below.
 */
function Bars({ data, format, height = 160, highlightLast = false }: {
  data: { label: string; value: number; sub?: string }[];
  format: (v: number) => string;
  height?: number;
  highlightLast?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="relative flex items-end gap-[2px] border-b border-slate-200" style={{ height }}>
        {[0.25, 0.5, 0.75].map((g) => (
          <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-100" style={{ bottom: `${g * 100}%` }} />
        ))}
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max((d.value / max) * 100, 2) : 0;
          const active = hover === i;
          return (
            <div
              key={d.label + i}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${d.label}: ${format(d.value)}`}
            >
              <div
                className={`w-full max-w-[28px] rounded-t-[4px] transition-colors ${
                  active ? 'bg-brand-600' : highlightLast && i === data.length - 1 ? 'bg-brand-500' : 'bg-brand-400/80'
                }`}
                style={{ height: `${h}%` }}
              />
              {active && (
                <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-[11px] text-white shadow-lg">
                  <div className="font-semibold tabular-nums">{format(d.value)}</div>
                  <div className="text-slate-300">{d.sub ?? d.label}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {data.map((d, i) => (
          <span key={d.label + i} className="flex-1 truncate text-center text-[10px] text-slate-400">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true); else setLoading(true);
    try {
      setData(await fetchAdminDashboardSummary());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (profile?.school_id) load(); }, [profile?.school_id, load]);

  const trend = useMemo(() => (data?.attendance_trend ?? [])
    .filter((d) => d.total > 0)
    .map((d) => {
      const dt = new Date(d.date + 'T00:00:00');
      return {
        label: dt.toLocaleDateString('en-IN', { day: 'numeric' }),
        sub: `${dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.present}/${d.total}`,
        value: pct(d.present, d.total),
      };
    }), [data]);

  const strength = useMemo(
    () => sortByClassOrder((data?.class_strength ?? []).map((c) => ({ ...c, name: c.class }))),
    [data],
  );

  if (loading) {
    return <DashboardLayout title="Dashboard"><DashboardSkeleton cards={8} /></DashboardLayout>;
  }

  if (error || !data) {
    return (
      <DashboardLayout title="Dashboard">
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="font-medium text-slate-700">Dashboard couldn't load</p>
          <p className="max-w-md text-sm text-slate-500">{error}</p>
          <button onClick={() => load()} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Try again</button>
        </Card>
      </DashboardLayout>
    );
  }

  const { counts, attendance_today: at, fees } = data;
  const presentish = at.present + at.late;
  const attendancePct = pct(presentish, at.marked);
  const sectionsWithStudents = at.sections_marked + data.unmarked_sections.length;
  const collectionPct = pct(fees.collected, fees.billed);
  const maxStrength = Math.max(...strength.map((c) => c.students), 1);

  const alerts: { icon: ReactNode; text: ReactNode; tone: string; onClick: () => void }[] = [];
  if (data.unmarked_sections.length > 0) {
    alerts.push({
      icon: <ClipboardCheck className="h-4 w-4" />,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      text: <><b>{data.unmarked_sections.length}</b> section{data.unmarked_sections.length === 1 ? '' : 's'} haven't marked attendance today</>,
      onClick: () => navigate('/admin/attendance'),
    });
  }
  if (fees.overdue_students > 0) {
    alerts.push({
      icon: <Wallet className="h-4 w-4" />,
      tone: 'border-red-200 bg-red-50 text-red-800',
      text: <><b>{inr(fees.overdue_amount)}</b> overdue from {fees.overdue_students} student{fees.overdue_students === 1 ? '' : 's'}</>,
      onClick: () => navigate('/admin/fees'),
    });
  }
  if (data.pending_transport > 0) {
    alerts.push({
      icon: <Bus className="h-4 w-4" />,
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
      text: <><b>{data.pending_transport}</b> transport application{data.pending_transport === 1 ? '' : 's'} waiting for approval</>,
      onClick: () => navigate('/admin/transport'),
    });
  }

  const quickActions = [
    { label: 'New admission', icon: <UserPlus className="h-4 w-4" />, path: '/admin/new-admission' },
    { label: 'Collect fee', icon: <IndianRupee className="h-4 w-4" />, path: '/admin/fees' },
    { label: 'Send notice', icon: <Send className="h-4 w-4" />, path: '/admin/notifications' },
    { label: 'Add holiday', icon: <CalendarDays className="h-4 w-4" />, path: '/admin/holidays' },
  ];

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* ─── Welcome + quick actions ─── */}
        <div className="flex flex-col gap-4 rounded-[20px] bg-gradient-to-br from-[#5B6EE8] to-[#7B8CF7] p-6 text-white shadow-[0_8px_30px_rgba(91,110,232,0.25)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-white/80">
              {new Date(data.today + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">{greeting()}, {profile?.full_name?.split(' ')[0] || 'Admin'}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {data.session && (
                <button onClick={() => navigate('/admin/sessions')} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25">
                  <CalendarRange className="h-3.5 w-3.5" /> Session {data.session.name}
                </button>
              )}
              <button onClick={() => load(true)} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25" aria-label="Refresh dashboard">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quickActions.map((a) => (
              <button key={a.label} onClick={() => navigate(a.path)}
                className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-brand-700 shadow-sm transition hover:bg-brand-50">
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Alerts ─── */}
        {alerts.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {alerts.map((a, i) => (
              <button key={i} onClick={a.onClick} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition hover:shadow-sm ${a.tone}`}>
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{a.text}</span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 opacity-60" />
              </button>
            ))}
          </div>
        )}

        {/* ─── KPIs ─── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Active students" value={counts.students.toLocaleString('en-IN')}
            sub={<>{counts.boys} boys · {counts.girls} girls{counts.new_admissions_month ? <> · <span className="text-emerald-600">+{counts.new_admissions_month} this month</span></> : null}</>}
            icon={<Users className="h-5 w-5" />} tint="bg-brand-50 text-brand-600" onClick={() => navigate('/admin/students')} />
          <Kpi label="Attendance today" value={at.marked ? `${attendancePct}%` : '—'}
            sub={at.marked ? `${presentish} of ${at.marked} present · ${at.sections_marked}/${sectionsWithStudents} sections` : 'Not marked yet'}
            icon={<ClipboardCheck className="h-5 w-5" />} tint="bg-emerald-50 text-emerald-600" onClick={() => navigate('/admin/attendance')} />
          <Kpi label="Collected this month" value={inr(fees.collected_month)}
            sub={<>Today: <b className="text-slate-700">{inr(fees.collected_today)}</b></>}
            icon={<IndianRupee className="h-5 w-5" />} tint="bg-amber-50 text-amber-600" onClick={() => navigate('/admin/fees')} />
          <Kpi label="Outstanding fees" value={inr(fees.outstanding)}
            sub={fees.overdue_amount > 0 ? <span className="text-red-600">{inr(fees.overdue_amount)} overdue</span> : 'Nothing overdue'}
            icon={<Wallet className="h-5 w-5" />} tint="bg-red-50 text-red-500" onClick={() => navigate('/admin/fees')} />
        </div>

        {/* ─── Attendance ─── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <SectionTitle action={<span className="text-xs text-slate-400">% present, last 14 days</span>}>Attendance trend</SectionTitle>
            {trend.length === 0
              ? <p className="py-12 text-center text-sm text-slate-400">No attendance recorded in the last 14 days</p>
              : <Bars data={trend} format={(v) => `${v}%`} highlightLast />}
          </Card>

          <Card className="p-6">
            <SectionTitle action={<LinkButton onClick={() => navigate('/admin/attendance')}>Details</LinkButton>}>Today</SectionTitle>
            {at.marked === 0 ? (
              <div className="py-8 text-center">
                <ClipboardCheck className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">No attendance marked yet today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: 'Present', n: at.present, icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, bar: 'bg-emerald-500' },
                  { label: 'Absent', n: at.absent, icon: <XCircle className="h-4 w-4 text-red-500" />, bar: 'bg-red-500' },
                  { label: 'Late', n: at.late, icon: <Clock className="h-4 w-4 text-amber-500" />, bar: 'bg-amber-400' },
                  { label: 'Leave', n: at.leave, icon: <FileMinus className="h-4 w-4 text-slate-500" />, bar: 'bg-slate-400' },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-600">{r.icon}{r.label}</span>
                      <span className="tabular-nums font-semibold text-slate-900">{r.n}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${pct(r.n, at.marked)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data.unmarked_sections.length > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-medium text-slate-500">Not marked yet</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.unmarked_sections.slice(0, 12).map((s) => (
                    <span key={s.id} className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">{s.label}</span>
                  ))}
                  {data.unmarked_sections.length > 12 && <span className="text-[11px] text-slate-400">+{data.unmarked_sections.length - 12} more</span>}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ─── Fees ─── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <SectionTitle action={<span className="text-xs text-slate-400">Payments received, last 6 months</span>}>Fee collection</SectionTitle>
            <Bars
              data={data.monthly_collection.map((m) => ({ label: m.month, value: Number(m.amount) }))}
              format={inr}
              highlightLast
            />
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-center">
              <div><p className="text-[11px] text-slate-500">Billed (session)</p><p className="text-sm font-semibold tabular-nums text-slate-900">{inrShort(fees.billed)}</p></div>
              <div><p className="text-[11px] text-slate-500">Collected</p><p className="text-sm font-semibold tabular-nums text-emerald-600">{inrShort(fees.collected)}</p></div>
              <div><p className="text-[11px] text-slate-500">Collection rate</p><p className="text-sm font-semibold tabular-nums text-slate-900">{collectionPct}%</p></div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle action={<LinkButton onClick={() => navigate('/admin/fees')}>All fees</LinkButton>}>Top defaulters</SectionTitle>
            {data.top_defaulters.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
                <p className="text-sm text-slate-500">No overdue fees</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.top_defaulters.map((d) => (
                  <li key={d.student_id}>
                    <button onClick={() => navigate(`/admin/students/${d.student_id}`)} className="flex w-full items-center gap-3 rounded-lg text-left hover:bg-slate-50">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-semibold text-red-600">
                        {d.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{d.name}</span>
                        <span className="block text-[11px] text-slate-400">{d.class || d.admission_number} · since {new Date(d.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-red-600">{inr(Number(d.due))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ─── Classes / calendar / activity ─── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6">
            <SectionTitle action={<LinkButton onClick={() => navigate('/admin/classes')}>Classes</LinkButton>}>Class strength</SectionTitle>
            {strength.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No classes yet</p>
            ) : (
              <ul className="max-h-[300px] space-y-2.5 overflow-y-auto pr-1">
                {strength.map((c) => (
                  <li key={c.class} className="flex items-center gap-3 text-sm" title={`${c.class}: ${c.students} students`}>
                    <span className="w-20 flex-shrink-0 truncate text-slate-600">{c.class}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-brand-400" style={{ width: `${(c.students / maxStrength) * 100}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums font-medium text-slate-800">{c.students}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span>{counts.classes} classes · {counts.sections} sections</span>
              <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" /> {counts.teachers} teachers</span>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle action={<LinkButton onClick={() => navigate('/admin/holidays')}>Calendar</LinkButton>}>Coming up</SectionTitle>
            {data.birthdays_today.length > 0 && (
              <div className="mb-4 rounded-xl bg-pink-50 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-pink-700"><Cake className="h-3.5 w-3.5" /> Birthdays today</p>
                <ul className="space-y-0.5">
                  {data.birthdays_today.slice(0, 5).map((b) => (
                    <li key={b.id} className="text-xs text-pink-900">{b.name} <span className="text-pink-600/70">· {b.class}</span></li>
                  ))}
                  {data.birthdays_today.length > 5 && <li className="text-xs text-pink-600">+{data.birthdays_today.length - 5} more</li>}
                </ul>
              </div>
            )}
            {data.upcoming_holidays.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No holidays in the next 30 days</p>
            ) : (
              <ul className="space-y-3">
                {data.upcoming_holidays.map((h) => {
                  const d = new Date(h.date + 'T00:00:00');
                  return (
                    <li key={h.date} className="flex items-center gap-3">
                      <span className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                        <span className="text-[10px] font-medium uppercase leading-none">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                        <span className="text-base font-bold leading-tight">{d.getDate()}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">{h.label || 'Holiday'}</span>
                        <span className="block text-[11px] text-slate-400">{d.toLocaleDateString('en-IN', { weekday: 'long' })}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-6">
            <SectionTitle action={<LinkButton onClick={() => navigate('/admin/notifications')}>Send</LinkButton>}>Recent notifications</SectionTitle>
            {data.recent_notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">Nothing sent yet</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.recent_notifications.map((n) => (
                  <li key={n.id} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Bell className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{n.title}</span>
                      <span className="block text-[11px] text-slate-400">
                        {new Date(n.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                        {n.recipients ? ` · ${n.recipients} recipients` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
