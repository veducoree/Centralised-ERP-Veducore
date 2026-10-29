import { useEffect, useState } from 'react';
import { Users, GraduationCap, BookOpen, UserCog, IndianRupee, TrendingUp, ClipboardCheck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard, Card } from '@/components/ui/Card';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';

interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  totalParents: number;
  todayPresent: number;
  todayAbsent: number;
  todayTotal: number;
  pendingFees: number;
  collectedFees: number;
  outstandingFees: number;
}

export default function AdminDashboard() {
  const { profile } = useAuth();
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
    const sid = profile.school_id;
    setLoading(true);

    try {
      const dates: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }

      const [students, teachers, classes, parents, todayAttendance, fees, trendRes] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('status', 'active'),
        supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('status', 'active'),
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', sid),
        supabase.from('parents').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('status', 'active'),
        supabase.from('attendance').select('status').eq('school_id', sid).eq('attendance_date', new Date().toISOString().split('T')[0]),
        supabase.from('fees').select('amount, paid_amount, status').eq('school_id', sid),
        supabase.from('attendance').select('attendance_date, status').eq('school_id', sid).in('attendance_date', dates),
      ]);

      const todayPresent = todayAttendance.data?.filter((a: { status: string }) => a.status === 'present').length || 0;
      const todayAbsent = todayAttendance.data?.filter((a: { status: string }) => a.status === 'absent').length || 0;
      const collected = fees.data?.reduce((sum: number, f: { paid_amount: number }) => sum + Number(f.paid_amount), 0) || 0;
      const outstanding = fees.data?.reduce((sum: number, f: { amount: number; paid_amount: number }) => sum + (Number(f.amount) - Number(f.paid_amount)), 0) || 0;
      const pendingCount = fees.data?.filter((f: { status: string }) => f.status === 'pending').length || 0;

      setStats({
        totalStudents: students.count || 0,
        totalTeachers: teachers.count || 0,
        totalClasses: classes.count || 0,
        totalParents: parents.count || 0,
        todayPresent,
        todayAbsent,
        todayTotal: todayAttendance.data?.length || 0,
        pendingFees: pendingCount,
        collectedFees: collected,
        outstandingFees: outstanding,
      });

      const trendRows = trendRes.data;
      const attData = dates.map((date) => {
        const dayRows = trendRows?.filter((r) => r.attendance_date === date) || [];
        const present = dayRows.filter((r) => r.status === 'present').length;
        const absent = dayRows.filter((r) => r.status === 'absent').length;
        return { date, present, absent };
      });
      setAttendanceTrend(attData);
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

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const currencySymbol = '₹';

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
            {/* Greeting */}
            <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">{greeting}, {profile?.full_name || 'Admin'} 👋</h2>
              <p className="mt-0.5 text-sm text-gray-500">Here's what's happening at your school today.</p>
            </div>

            {/* Row 1: 4 stat cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Total Students', value: stats?.totalStudents ?? 0, icon: <Users className="h-5 w-5" />, color: 'blue' as const },
                { label: 'Total Teachers', value: stats?.totalTeachers ?? 0, icon: <GraduationCap className="h-5 w-5" />, color: 'emerald' as const },
                { label: 'Total Classes', value: stats?.totalClasses ?? 0, icon: <BookOpen className="h-5 w-5" />, color: 'amber' as const },
                { label: 'Total Parents', value: stats?.totalParents ?? 0, icon: <UserCog className="h-5 w-5" />, color: 'cyan' as const },
              ].map((card, i) => (
                <div key={card.label} className="hover:shadow-md transition-shadow duration-200" style={{ animation: 'fadeSlideUp 350ms ease both', animationDelay: `${i * 60}ms` }}>
                  <StatCard label={card.label} value={card.value} icon={card.icon} color={card.color} />
                </div>
              ))}
            </div>

            {/* Row 2: 4 stat cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Present Today', value: stats?.todayPresent ?? 0, icon: <ClipboardCheck className="h-5 w-5" />, color: 'emerald' as const },
                { label: 'Absent Today', value: stats?.todayAbsent ?? 0, icon: <ClipboardCheck className="h-5 w-5" />, color: 'red' as const },
                { label: 'Collected Fees', value: formatCurrency(stats?.collectedFees, currencySymbol), icon: <IndianRupee className="h-5 w-5" />, color: 'emerald' as const },
                { label: 'Outstanding Fees', value: formatCurrency(stats?.outstandingFees, currencySymbol), icon: <TrendingUp className="h-5 w-5" />, color: 'red' as const },
              ].map((card, i) => (
                <div key={card.label} className="hover:shadow-md transition-shadow duration-200" style={{ animation: 'fadeSlideUp 350ms ease both', animationDelay: `${(i + 4) * 60}ms` }}>
                  <StatCard label={card.label} value={card.value} icon={card.icon} color={card.color} />
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Attendance SVG bar chart */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">Attendance Trend (Last 5 Days)</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>Present</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400"></span>Absent</span>
                  </div>
                </div>
                {attendanceTrend.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">No attendance data yet</p>
                ) : (
                  <svg viewBox="0 0 400 160" className="w-full" preserveAspectRatio="none">
                    {[0, 40, 80, 120].map((y) => (
                      <line key={y} x1="30" y1={y + 10} x2="395" y2={y + 10} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4 2" />
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
                            rx="3"
                            fill="#10b981"
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
                            rx="3"
                            fill="#f87171"
                            className={barsAnimated ? 'bar-animate' : ''}
                            style={{ animationDelay: `${i * 80 + 40}ms` }}
                          >
                            <title>{d.date}: {d.absent} absent</title>
                          </rect>
                          <text x={x + 4 + barW + 1} y={148} textAnchor="middle" fontSize="9" fill="#9ca3af">{dateLabel}</text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </Card>

              {/* Fee donut chart */}
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-semibold text-gray-900">Fee Collection</h3>
                <div className="flex items-center gap-6">
                  <div className="relative flex-shrink-0">
                    <svg viewBox="0 0 120 120" className="h-28 w-28">
                      <circle cx="60" cy="60" r="50" fill="none" stroke="#f3f4f6" strokeWidth="14" />
                      <circle
                        cx="60" cy="60" r="50" fill="none"
                        stroke="#10b981" strokeWidth="14"
                        strokeDasharray={`${paidDash} ${C - paidDash}`}
                        strokeDashoffset={C * 0.25}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 1s ease-out' }}
                      />
                      <circle
                        cx="60" cy="60" r="50" fill="none"
                        stroke="#f87171" strokeWidth="14"
                        strokeDasharray={`${outstandingDash} ${C - outstandingDash}`}
                        strokeDashoffset={C * 0.25 - paidDash}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 1s ease-out' }}
                      />
                      <text x="60" y="56" textAnchor="middle" fontSize="9" fill="#6b7280">Total</text>
                      <text x="60" y="70" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#111827">₹{(feeTotal / 1000).toFixed(0)}K</text>
                    </svg>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 rounded-full bg-emerald-500 flex-shrink-0"></span>
                      <span className="text-gray-600">Collected</span>
                      <span className="ml-auto font-semibold text-gray-900">{formatCurrency(feePaid, '₹')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 rounded-full bg-red-400 flex-shrink-0"></span>
                      <span className="text-gray-600">Outstanding</span>
                      <span className="ml-auto font-semibold text-gray-900">{formatCurrency(feeOutstanding, '₹')}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
