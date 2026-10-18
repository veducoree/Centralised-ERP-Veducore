import { useEffect, useState, useCallback } from 'react';
import { CalendarDays } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeacherByUserId, fetchTeacherScheduleByTeacher } from '@/services/api';
import type { Teacher, TeacherSchedule } from '@/types';
import { formatTime, getDayName } from '@/lib/utils';

export default function TeacherSchedule() {
  const { profile } = useAuth();
  const [schedules, setSchedules] = useState<TeacherSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (t) {
        const s = await fetchTeacherScheduleByTeacher(t.id);
        setSchedules(s);
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const days = [1, 2, 3, 4, 5];

  return (
    <DashboardLayout title="My Schedule">
      <div className="space-y-6">
        <PageHeader title="My Weekly Schedule" description="Your teaching timetable" />

        {loading ? (
          <LoadingSpinner />
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <CalendarDays className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No schedule assigned</p>
            <p className="mt-1 text-sm text-gray-400">Contact your administrator</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {days.map((day) => {
              const items = schedules.filter((s) => s.day_of_week === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
              return (
                <Card key={day} className="p-4">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">{getDayName(day)}</h3>
                  {items.length === 0 ? (
                    <p className="text-sm text-gray-400">No classes</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((s) => (
                        <div key={s.id} className="rounded-lg bg-gray-50 px-3 py-2.5">
                          <p className="text-sm font-medium text-gray-900">{formatTime(s.start_time)} - {formatTime(s.end_time)}</p>
                          <p className="text-xs text-gray-500">{s.class?.name} - {s.section?.name}</p>
                          <p className="text-xs text-gray-400">{s.subject?.name || '—'} &middot; Room {s.room_number || '—'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
