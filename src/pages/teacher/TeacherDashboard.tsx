import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, Megaphone } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard, Card } from '@/components/ui/Card';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeacherByUserId, fetchTeacherScheduleByTeacher, fetchRemarks } from '@/services/api';
import type { Teacher, TeacherSchedule, Remark } from '@/types';
import { formatTime, getDayName, formatDate } from '@/lib/utils';

export default function TeacherDashboard() {
  const { profile } = useAuth();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [schedules, setSchedules] = useState<TeacherSchedule[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (t) {
        setTeacher(t);
        const [s, r] = await Promise.all([
          fetchTeacherScheduleByTeacher(t.id),
          fetchRemarks({ teacherId: t.id }),
        ]);
        setSchedules(s);
        setRemarks(r);
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const today = new Date().getDay();
  const todaySchedule = schedules
    .filter((s) => s.day_of_week === today)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Greeting
  const hour = new Date().getHours();
  const greetingTeacher = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Weekly overview
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const classesByDay = Array.from({ length: 7 }, (_, i) => schedules.filter((s) => s.day_of_week === i).length);
  const maxClasses = Math.max(...classesByDay, 1);

  // Schedule timeline colors
  const subjectColors = ['border-blue-500', 'border-emerald-500', 'border-amber-500', 'border-purple-500', 'border-pink-500'];

  // Current time for "Now" indicator
  const currentTimeStr = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;

  // Remark category badge styles
  const remarkCategoryStyle = (category: string) => {
    switch (category) {
      case 'academic': return 'bg-blue-100 text-blue-700';
      case 'behaviour': return 'bg-orange-100 text-orange-700';
      case 'attendance': return 'bg-red-100 text-red-700';
      case 'performance': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  if (loading) return (
    <DashboardLayout title="Dashboard">
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Greeting banner */}
        <div className="rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{greetingTeacher}, {teacher?.full_name || profile?.full_name || 'Teacher'} 👋</h2>
            <p className="mt-1 text-sm text-indigo-100">Ready for today's classes?</p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-xs text-indigo-200">{todayStr}</p>
            <p className="mt-0.5 text-sm font-semibold">{todaySchedule.length} {todaySchedule.length === 1 ? 'class' : 'classes'} today</p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="hover:shadow-md transition-shadow duration-200">
            <StatCard label="Today's Classes" value={todaySchedule.length} icon={<CalendarDays className="h-5 w-5" />} color="amber" />
          </div>
          <div className="hover:shadow-md transition-shadow duration-200">
            <StatCard label="My Remarks" value={remarks.length} icon={<Megaphone className="h-5 w-5" />} color="cyan" />
          </div>
        </div>

        {/* Today's Schedule — timeline */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Today's Schedule — {getDayName(today)}</h3>
          {todaySchedule.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <svg viewBox="0 0 64 64" className="h-12 w-12 mb-3 text-gray-200" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="8" y="12" width="48" height="44" rx="4" />
                <path d="M8 22h48" />
                <path d="M22 8v8M42 8v8" />
                <path d="M20 34h8M36 34h8M20 44h8" />
              </svg>
              <p className="text-sm font-medium">No classes today</p>
              <p className="text-xs mt-1">Enjoy your free day!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todaySchedule.map((s, idx) => {
                const isNow = currentTimeStr >= s.start_time && currentTimeStr <= s.end_time;
                return (
                  <div key={s.id} className="flex gap-4">
                    {/* Time column */}
                    <div className="w-20 flex-shrink-0 pt-1">
                      <span className="text-xs font-bold text-gray-900">{formatTime(s.start_time)}</span>
                      <span className="block text-[10px] text-gray-400">{formatTime(s.end_time)}</span>
                    </div>
                    {/* Card with colored left border */}
                    <div className={`flex-1 rounded-xl border-l-4 ${subjectColors[idx % subjectColors.length]} bg-white border border-gray-100 shadow-sm p-3`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">{s.class?.name} - {s.section?.name}</p>
                        {isNow && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Now
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{s.subject?.name || '—'} · Room {s.room_number || '—'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Weekly Overview — CSS bar chart */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Weekly Overview</h3>
          <div className="flex items-end gap-2 h-24">
            {classesByDay.map((count, i) => {
              const isToday = i === today;
              const heightPct = (count / maxClasses) * 100;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-bold text-gray-700">{count > 0 ? count : ''}</span>
                  <div
                    className="w-full rounded-t-md transition-all duration-500"
                    style={{ height: `${Math.max(heightPct, 8)}%`, backgroundColor: isToday ? '#3b82f6' : '#e5e7eb' }}
                  />
                  <span className={`text-[10px] font-medium ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>{weekDays[i]}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recent Remarks */}
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Recent Remarks</h3>
          {remarks.length === 0 ? (
            <p className="text-sm text-gray-400">No remarks added yet</p>
          ) : (
            <div className="space-y-3">
              {remarks.slice(0, 5).map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    {r.student && (
                      <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        {r.student.full_name}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${remarkCategoryStyle(r.category)}`}>
                      {r.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{r.remark}</p>
                  <p className="mt-1.5 text-xs text-gray-400 text-right">{formatDate(r.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
