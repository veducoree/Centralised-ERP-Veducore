import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, BookOpen, UserCog, IndianRupee, TrendingUp, ClipboardCheck,
  UserPlus, Send, CalendarDays, AlertTriangle, ChevronRight, Bus, Cake, Bell, CheckCircle2, Wallet, CalendarRange,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard, Card } from '@/components/ui/Card';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/auth/AuthContext';
import { fetchAdminDashboardData, type AdminDashboardData } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { sortByClassOrder } from '@/lib/classOrder';
import type { AdminDashboardSummary } from '@/types';

type DashboardStats = AdminDashboardData['stats'];

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [attendanceTrend, setAttendanceTrend] = useState<{ date: string; present: number; absent: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [barsAnimated, setBarsAnimated] = useState(false);

  useEffect(() => {
    if (!profile?.school_id) return;
    loadDashboard();
  }, [profile?.school_id]);

  useEffect(() => {
    const t = setTimeout(() => setBarsAnimated(true), 100);
    return () => clearTimeout(t);
  }, [attendanceTrend]);

  async function loadDashboard() {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const data = await fetchAdminDashboardData(profile.school_id);
      setStats(data.stats);
      setAttendanceTrend(data.attendanceTrend);
      setSummary(data.summary);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Fee donut computed values
  const feePaid = stats?.collectedFees ?? 0;
  const feeOutstanding = stats?.outstandingFees ?? 0;
  const feeTotal = feePaid + feeOutstanding;
  const paidPct = feeTotal > 0 ? feePaid / feeTotal : 0;
  const outstandingPct = feeTotal > 0 ? feeOutstanding / feeTotal : 0;
  const C = 2 * Math.PI * 50; // ~314.16
  const paidDash = paidPct * C;
  const outstandingDash = outstandingPct * C;

  const currencySymbol = '₹';
  // Space between the two donut arcs so the rounded ends don't overlap.
  // 12px stroke with round caps → caps add 6px each end; 15 leaves a ~3px gap.
  const donutGap = paidDash > 0 && outstandingDash > 0 ? 15 : 0;
  const compactInr = (n: number) => {
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
    return `₹${Math.round(n)}`;
  };

  // ── Extra panels (same look as the cards above) ──
  const monthly = summary?.monthly_collection ?? [];
  const monthlyMax = Math.max(...monthly.map((m) => Number(m.amount)), 1);
  const strength = sortByClassOrder((summary?.class_strength ?? []).map((c) => ({ ...c, name: c.class })));
  const strengthMax = Math.max(...strength.map((c) => c.students), 1);

  const alerts: { text: ReactNode; icon: ReactNode; tone: string; path: string }[] = [];
  if (summary?.unmarked_sections.length) {
    const n = summary.unmarked_sections.length;
    alerts.push({ path: '/admin/attendance', icon: <ClipboardCheck className="h-4 w-4" />, tone: 'bg-[#FEF3E0] text-[#B26B00]',
      text: <><b>{n}</b> section{n === 1 ? '' : 's'} haven't marked attendance today</> });
  }
  if (summary?.fees.overdue_students) {
    const n = summary.fees.overdue_students;
    alerts.push({ path: '/admin/fees', icon: <Wallet className="h-4 w-4" />, tone: 'bg-[#FEECEC] text-[#C53030]',
      text: <><b>{formatCurrency(Number(summary.fees.overdue_amount), '₹')}</b> overdue from {n} student{n === 1 ? '' : 's'}</> });
  }
  if (summary?.pending_transport) {
    const n = summary.pending_transport;
    alerts.push({ path: '/admin/transport', icon: <Bus className="h-4 w-4" />, tone: 'bg-[#E0F7FB] text-[#0E7490]',
      text: <><b>{n}</b> transport application{n === 1 ? '' : 's'} waiting for approval</> });
  }

  const quickActions = [
    { label: 'New Admission', icon: <UserPlus className="h-5 w-5" />, path: '/admin/new-admission', tint: 'bg-[#EEF0FD] text-[#5B6EE8]' },
    { label: 'Collect Fee', icon: <IndianRupee className="h-5 w-5" />, path: '/admin/fees', tint: 'bg-[#E6F8F1] text-[#22C08A]' },
    { label: 'Send Notice', icon: <Send className="h-5 w-5" />, path: '/admin/notifications', tint: 'bg-[#FEF0E6] text-[#F97316]' },
    { label: 'Add Holiday', icon: <CalendarDays className="h-5 w-5" />, path: '/admin/holidays', tint: 'bg-[#FDE7F3] text-[#EC4899]' },
  ];

  const panelTitle = (title: string, link?: { label: string; path: string }) => (
    <div className="mb-5 flex items-center justify-between">
      <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
      {link && (
        <button onClick={() => navigate(link.path)} className="flex items-center gap-0.5 text-xs font-medium text-[#5B6EE8] hover:underline">
          {link.label} <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <DashboardLayout title="Dashboard">
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes barGrow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        .bar-animate {
          transform-box: fill-box;
          transform-origin: bottom;
          animation: barGrow 0.5s ease-out forwards;
        }
      `}</style>
      <div className="space-y-6">
        {loading ? (
          <DashboardSkeleton cards={8} />
        ) : (
          <>
            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              {quickActions.map((a, i) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.path)}
                  className="flex items-center gap-3 rounded-[20px] bg-white px-5 py-4 text-left shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition-transform duration-200 hover:-translate-y-0.5"
                  style={{ animation: 'fadeSlideUp 350ms ease both', animationDelay: `${i * 40}ms` }}
                >
                  <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${a.tint}`}>{a.icon}</span>
                  <span className="text-sm font-semibold text-[#0F172A]">{a.label}</span>
                </button>
              ))}
            </div>

            {/* Alerts */}
            {(alerts.length > 0 || summary?.session) && (
              <div className="flex flex-wrap gap-3">
                {summary?.session && (
                  <button onClick={() => navigate('/admin/sessions')} className="flex items-center gap-2 rounded-xl bg-[#EEF0FD] px-4 py-2.5 text-sm text-[#3B4DC8]">
                    <CalendarRange className="h-4 w-4" /> Session <b>{summary.session.name}</b>
                  </button>
                )}
                {alerts.map((a) => (
                  <button key={a.path} onClick={() => navigate(a.path)} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm ${a.tone}`}>
                    <AlertTriangle className="h-4 w-4" /> <span>{a.text}</span> <ChevronRight className="h-4 w-4 opacity-60" />
                  </button>
                ))}
              </div>
            )}

            {/* Row 1: 4 stat cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Total Students', value: stats?.totalStudents ?? 0, icon: <Users className="h-5 w-5" />, color: 'blue' as const },
                { label: 'Total Teachers', value: stats?.totalTeachers ?? 0, icon: <GraduationCap className="h-5 w-5" />, color: 'emerald' as const },
                { label: 'Total Classes', value: stats?.totalClasses ?? 0, icon: <BookOpen className="h-5 w-5" />, color: 'amber' as const },
                { label: 'Total Parents', value: stats?.totalParents ?? 0, icon: <UserCog className="h-5 w-5" />, color: 'cyan' as const },
              ].map((card, i) => (
                <div key={card.label} className="transition-transform duration-200 hover:-translate-y-0.5" style={{ animation: 'fadeSlideUp 350ms ease both', animationDelay: `${i * 60}ms` }}>
                  <StatCard label={card.label} value={card.value} icon={card.icon} color={card.color} />
                </div>
              ))}
            </div>

            {/* Row 2: 4 stat cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Present Today', value: stats?.todayPresent ?? 0, icon: <ClipboardCheck className="h-5 w-5" />, color: 'emerald' as const },
                { label: 'Absent Today', value: stats?.todayAbsent ?? 0, icon: <ClipboardCheck className="h-5 w-5" />, color: 'red' as const },
                { label: 'Collected Fees', value: formatCurrency(stats?.collectedFees, currencySymbol), icon: <IndianRupee className="h-5 w-5" />, color: 'emerald' as const },
                { label: 'Outstanding Fees', value: formatCurrency(stats?.outstandingFees, currencySymbol), icon: <TrendingUp className="h-5 w-5" />, color: 'red' as const },
              ].map((card, i) => (
                <div key={card.label} className="transition-transform duration-200 hover:-translate-y-0.5" style={{ animation: 'fadeSlideUp 350ms ease both', animationDelay: `${(i + 4) * 60}ms` }}>
                  <StatCard label={card.label} value={card.value} icon={card.icon} color={card.color} />
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Attendance SVG bar chart */}
              <Card className="p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-[#0F172A]">Attendance Trend (Last 5 Days)</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#22C08A]"></span>Present</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#F87171]"></span>Absent</span>
                  </div>
                </div>
                {attendanceTrend.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">No attendance data yet</p>
                ) : (
                  <svg viewBox="0 0 400 160" className="w-full" preserveAspectRatio="none">
                    {[0, 40, 80, 120].map((y) => (
                      <line key={y} x1="30" y1={y + 10} x2="395" y2={y + 10} stroke="#E8EAF3" strokeWidth="1" strokeDasharray="4 2" />
                    ))}
                    {attendanceTrend.map((d, i) => {
                      const maxVal = Math.max(...attendanceTrend.map((x) => x.present + x.absent), 1);
                      const slotW = 74;
                      const x = 30 + i * slotW;
                      const barW = 18;
                      const chartH = 120;
                      const presentH = Math.max((d.present / maxVal) * chartH, d.present > 0 ? 4 : 0);
                      const absentH = Math.max((d.absent / maxVal) * chartH, d.absent > 0 ? 4 : 0);
                      const dateLabel = new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
                      return (
                        <g key={d.date}>
                          <rect
                            x={x + 4}
                            y={130 - presentH}
                            width={barW}
                            height={presentH}
                            rx="5"
                            fill="#22C08A"
                            className={barsAnimated ? 'bar-animate' : ''}
                            style={{ animationDelay: `${i * 80}ms` }}
                          >
                            <title>{d.date}: {d.present} present</title>
                          </rect>
                          <rect
                            x={x + 4 + barW + 3}
                            y={130 - absentH}
                            width={barW}
                            height={absentH}
                            rx="5"
                            fill="#F87171"
                            className={barsAnimated ? 'bar-animate' : ''}
                            style={{ animationDelay: `${i * 80 + 40}ms` }}
                          >
                            <title>{d.date}: {d.absent} absent</title>
                          </rect>
                          <text x={x + 4 + barW + 1} y={148} textAnchor="middle" fontSize="9" fill="#94A3B8">{dateLabel}</text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </Card>

              {/* Fee donut chart */}
              <Card className="p-6">
                {panelTitle('Fee Collection', { label: 'Collect fee', path: '/admin/fees' })}
                {feeTotal === 0 ? (
                  <div className="py-10 text-center">
                    <IndianRupee className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-sm text-slate-400">No fees assigned yet</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
                      <div className="relative flex-shrink-0">
                        <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
                          <circle cx="60" cy="60" r="50" fill="none" stroke="#EEF0FD" strokeWidth="12" />
                          {paidDash > 0 && (
                            <circle
                              cx="60" cy="60" r="50" fill="none"
                              stroke="#22C08A" strokeWidth="12" strokeLinecap="round"
                              strokeDasharray={`${Math.max(paidDash - donutGap, 0.01)} ${C}`}
                              style={{ transition: 'stroke-dasharray 1s ease-out' }}
                            >
                              <title>Collected: {formatCurrency(feePaid, '₹')}</title>
                            </circle>
                          )}
                          {outstandingDash > 0 && (
                            <circle
                              cx="60" cy="60" r="50" fill="none"
                              stroke="#F87171" strokeWidth="12" strokeLinecap="round"
                              strokeDasharray={`${Math.max(outstandingDash - donutGap, 0.01)} ${C}`}
                              strokeDashoffset={-paidDash}
                              style={{ transition: 'stroke-dasharray 1s ease-out' }}
                            >
                              <title>Outstanding: {formatCurrency(feeOutstanding, '₹')}</title>
                            </circle>
                          )}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-[#0F172A]">{Math.round(paidPct * 100)}%</span>
                          <span className="text-[11px] text-slate-400">collected</span>
                        </div>
                      </div>

                      <div className="w-full flex-1 space-y-4">
                        <div>
                          <p className="text-xs text-slate-400">Total fees</p>
                          <p className="text-xl font-bold text-[#0F172A]">{compactInr(feeTotal)}</p>
                        </div>
                        {[
                          { label: 'Collected', value: feePaid, pct: paidPct, dot: 'bg-[#22C08A]' },
                          { label: 'Outstanding', value: feeOutstanding, pct: outstandingPct, dot: 'bg-[#F87171]' },
                        ].map((r) => (
                          <div key={r.label} className="flex items-center gap-2.5 text-sm">
                            <span className={`h-3 w-3 flex-shrink-0 rounded-full ${r.dot}`}></span>
                            <span className="text-slate-500">{r.label}</span>
                            <span className="text-xs text-slate-400">{Math.round(r.pct * 100)}%</span>
                            <span className="ml-auto font-bold text-[#0F172A]">{formatCurrency(r.value, currencySymbol)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {summary && (
                      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[#E8EAF3] pt-4">
                        <div className="rounded-xl bg-[#E6F8F1] px-3 py-2.5">
                          <p className="text-[11px] text-[#15803D]">Today</p>
                          <p className="text-sm font-bold text-[#0F172A]">{compactInr(Number(summary.fees.collected_today))}</p>
                        </div>
                        <div className="rounded-xl bg-[#EEF0FD] px-3 py-2.5">
                          <p className="text-[11px] text-[#3B4DC8]">This month</p>
                          <p className="text-sm font-bold text-[#0F172A]">{compactInr(Number(summary.fees.collected_month))}</p>
                        </div>
                        <button
                          onClick={() => navigate('/admin/fees')}
                          className="rounded-xl bg-[#FEECEC] px-3 py-2.5 text-left transition hover:brightness-95"
                        >
                          <p className="text-[11px] text-[#C53030]">Overdue</p>
                          <p className="text-sm font-bold text-[#0F172A]">{compactInr(Number(summary.fees.overdue_amount))}</p>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </div>

            {/* Monthly collection + defaulters */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card className="p-6">
                {panelTitle('Monthly Collection (Last 6 Months)')}
                {monthly.every((m) => Number(m.amount) === 0) ? (
                  <p className="py-10 text-center text-sm text-slate-400">No payments recorded yet</p>
                ) : (
                  <svg viewBox="0 0 400 160" className="w-full" preserveAspectRatio="none">
                    {[0, 40, 80, 120].map((y) => (
                      <line key={y} x1="10" y1={y + 10} x2="395" y2={y + 10} stroke="#E8EAF3" strokeWidth="1" strokeDasharray="4 2" />
                    ))}
                    {monthly.map((m, i) => {
                      const slotW = 64;
                      const barW = 30;
                      const x = 10 + i * slotW + (slotW - barW) / 2;
                      const h = Math.max((Number(m.amount) / monthlyMax) * 120, Number(m.amount) > 0 ? 4 : 0);
                      return (
                        <g key={m.month + i}>
                          <rect
                            x={x} y={130 - h} width={barW} height={h} rx="5"
                            fill={i === monthly.length - 1 ? '#5B6EE8' : '#A5B0F8'}
                            className={barsAnimated ? 'bar-animate' : ''}
                            style={{ animationDelay: `${i * 80}ms` }}
                          >
                            <title>{m.month}: {formatCurrency(Number(m.amount), '₹')}</title>
                          </rect>
                          <text x={x + barW / 2} y={148} textAnchor="middle" fontSize="9" fill="#94A3B8">{m.month}</text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </Card>

              <Card className="p-6">
                {panelTitle('Fee Defaulters', { label: 'View all', path: '/admin/fees' })}
                {!summary?.top_defaulters.length ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-[#22C08A]" />
                    <p className="text-sm text-slate-400">No overdue fees</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {summary.top_defaulters.map((d) => (
                      <li key={d.student_id}>
                        <button onClick={() => navigate(`/admin/students/${d.student_id}`)} className="flex w-full items-center gap-3 rounded-xl p-1 text-left hover:bg-slate-50">
                          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#FEECEC] text-xs font-bold text-[#EF4444]">
                            {d.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[#0F172A]">{d.name}</span>
                            <span className="block text-xs text-slate-400">{d.class || d.admission_number}</span>
                          </span>
                          <span className="text-sm font-bold text-[#EF4444]">{formatCurrency(Number(d.due), '₹')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Class strength / coming up / notifications */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card className="p-6">
                {panelTitle('Class Strength', { label: 'Classes', path: '/admin/classes' })}
                {strength.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No classes yet</p>
                ) : (
                  <ul className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
                    {strength.map((c) => (
                      <li key={c.class} className="flex items-center gap-3 text-sm" title={`${c.class}: ${c.students} students`}>
                        <span className="w-20 flex-shrink-0 truncate text-slate-500">{c.class}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF0FD]">
                          <span className="block h-full rounded-full bg-[#5B6EE8]" style={{ width: `${(c.students / strengthMax) * 100}%` }} />
                        </span>
                        <span className="w-8 text-right font-bold text-[#0F172A]">{c.students}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-6">
                {panelTitle('Coming Up', { label: 'Calendar', path: '/admin/holidays' })}
                {!!summary?.birthdays_today.length && (
                  <div className="mb-4 rounded-xl bg-[#FDE7F3] p-3">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[#BE185D]"><Cake className="h-3.5 w-3.5" /> Birthdays Today</p>
                    {summary.birthdays_today.slice(0, 4).map((b) => (
                      <p key={b.id} className="text-xs text-[#831843]">{b.name} · {b.class}</p>
                    ))}
                    {summary.birthdays_today.length > 4 && <p className="text-xs text-[#BE185D]">+{summary.birthdays_today.length - 4} more</p>}
                  </div>
                )}
                {!summary?.upcoming_holidays.length ? (
                  <p className="py-6 text-center text-sm text-slate-400">No holidays in the next 30 days</p>
                ) : (
                  <ul className="space-y-3">
                    {summary.upcoming_holidays.map((h) => {
                      const d = new Date(h.date + 'T00:00:00');
                      return (
                        <li key={h.date} className="flex items-center gap-3">
                          <span className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-[#FDE7F3] text-[#EC4899]">
                            <span className="text-[10px] font-medium uppercase leading-none">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                            <span className="text-base font-bold leading-tight">{d.getDate()}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-[#0F172A]">{h.label || 'Holiday'}</span>
                            <span className="block text-xs text-slate-400">{d.toLocaleDateString('en-IN', { weekday: 'long' })}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card className="p-6">
                {panelTitle('Recent Notifications', { label: 'Send', path: '/admin/notifications' })}
                {!summary?.recent_notifications.length ? (
                  <div className="py-8 text-center">
                    <Bell className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-sm text-slate-400">Nothing sent yet</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {summary.recent_notifications.map((n) => (
                      <li key={n.id} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#FEF0E6] text-[#F97316]"><Bell className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[#0F172A]">{n.title}</span>
                          <span className="block text-xs text-slate-400">
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}