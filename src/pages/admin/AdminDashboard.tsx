import { useEffect, useState } from 'react';
import { Users, GraduationCap, BookOpen, UserCog, IndianRupee, TrendingUp, ClipboardCheck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard, Card } from '@/components/ui/Card';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/auth/AuthContext';
import { fetchAdminDashboardData, type AdminDashboardData } from '@/services/api';
import { formatCurrency } from '@/lib/utils';

type DashboardStats = AdminDashboardData['stats'];

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
    setLoading(true);
    try {
      const data = await fetchAdminDashboardData(profile.school_id);
      setStats(data.stats);
      setAttendanceTrend(data.attendanceTrend);
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
            <div className="rounded-[20px] bg-white px-6 py-5 shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
              <h2 className="text-xl font-bold text-[#0F172A]">{greeting}, {profile?.full_name || 'Admin'} 👋</h2>
              <p className="mt-1 text-[15px] text-slate-500">Here's what's happening at your school today.</p>
            </div>

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
                  <h3 className="text-lg font-bold text-[#0F172A]">Attendance Trend (Last 5 Days)</h3>
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
                <h3 className="mb-5 text-lg font-bold text-[#0F172A]">Fee Collection</h3>
                <div className="flex items-center gap-8">
                  <div className="relative flex-shrink-0">
                    <svg viewBox="0 0 120 120" className="h-32 w-32">
                      <circle cx="60" cy="60" r="50" fill="none" stroke="#EEF0FD" strokeWidth="14" />
                      <circle
                        cx="60" cy="60" r="50" fill="none"
                        stroke="#22C08A" strokeWidth="14"
                        strokeDasharray={`${paidDash} ${C - paidDash}`}
                        strokeDashoffset={C * 0.25}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 1s ease-out' }}
                      />
                      <circle
                        cx="60" cy="60" r="50" fill="none"
                        stroke="#F87171" strokeWidth="14"
                        strokeDasharray={`${outstandingDash} ${C - outstandingDash}`}
                        strokeDashoffset={C * 0.25 - paidDash}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 1s ease-out' }}
                      />
                      <text x="60" y="56" textAnchor="middle" fontSize="9" fill="#94A3B8">Total</text>
                      <text x="60" y="70" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0F172A">₹{(feeTotal / 1000).toFixed(0)}K</text>
                    </svg>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2.5 text-[15px]">
                      <span className="h-3 w-3 flex-shrink-0 rounded-full bg-[#22C08A]"></span>
                      <span className="text-slate-500">Collected</span>
                      <span className="ml-auto font-bold text-[#0F172A]">{formatCurrency(feePaid, '₹')}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-[15px]">
                      <span className="h-3 w-3 flex-shrink-0 rounded-full bg-[#F87171]"></span>
                      <span className="text-slate-500">Outstanding</span>
                      <span className="ml-auto font-bold text-[#0F172A]">{formatCurrency(feeOutstanding, '₹')}</span>
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