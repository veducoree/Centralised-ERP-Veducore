import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, Repeat } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchTeacherByUserId, fetchTeacherScheduleByTeacher, fetchSchool, fetchTimetablePeriods, fetchSubstitutions,
} from '@/services/api';
import type { School, TeacherSchedule as Slot, TimetablePeriod, TimetableSubstitution } from '@/types';
import { formatDate, formatTime, getDayName } from '@/lib/utils';
import { addDays, getTimetableDays, slotsInPeriod, sortPeriods, toISODate, weekdayOf } from '@/lib/timetable';
import { TimetableGrid, SlotCard, EmptySlot } from '@/components/timetable/TimetableGrid';

export default function TeacherSchedule() {
  const { profile } = useAuth();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [periods, setPeriods] = useState<TimetablePeriod[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [duties, setDuties] = useState<TimetableSubstitution[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile?.id || !profile.school_id) return;
    setLoading(true);
    try {
      const today = toISODate(new Date());
      const [t, per, sch] = await Promise.all([
        fetchTeacherByUserId(profile.id),
        fetchTimetablePeriods(profile.school_id),
        fetchSchool(profile.school_id),
      ]);
      setPeriods(sortPeriods(per));
      setSchool(sch);
      if (t) {
        const [s, subs] = await Promise.all([
          fetchTeacherScheduleByTeacher(t.id),
          fetchSubstitutions({ substituteTeacherId: t.id, from: today, to: addDays(today, 6) }),
        ]);
        setSlots(s);
        setDuties(subs);
      }
    } catch { /* handled by empty state */ }
    finally { setLoading(false); }
  }, [profile?.id, profile?.school_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const days = getTimetableDays(school);
  const todayWeekday = new Date().getDay();
  const weekly = slots.filter((s) => days.includes(s.day_of_week)).length;

  return (
    <DashboardLayout title="My Timetable">
      <div className="space-y-6">
        <PageHeader title="My Timetable" description={`Your weekly teaching timetable · ${weekly} periods per week`} />

        {loading ? (
          <LoadingSpinner variant="cards" />
        ) : (
          <>
            {duties.length > 0 && (
              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Substitution duties (next 7 days)</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {duties.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {d.class?.name}-{d.section?.name} · {d.subject?.name || 'Class'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {d.period?.name ? `${d.period.name} · ` : ''}{formatTime(d.start_time)}–{formatTime(d.end_time)}
                          {d.note ? ` · ${d.note}` : ''}
                        </p>
                      </div>
                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {d.date === toISODate(new Date()) ? 'Today' : `${getDayName(weekdayOf(d.date)).slice(0, 3)}, ${formatDate(d.date)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {slots.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white py-16 text-center">
                <CalendarDays className="mb-3 h-12 w-12 text-slate-300" />
                <p className="font-medium text-slate-600">No timetable assigned</p>
                <p className="mt-1 text-sm text-slate-400">Contact your administrator</p>
              </div>
            ) : periods.length > 0 ? (
              <TimetableGrid
                periods={periods}
                days={days}
                highlightDay={todayWeekday}
                renderCell={(day, period) => {
                  const slot = slotsInPeriod(slots, day, period)[0];
                  if (!slot) return <EmptySlot />;
                  return (
                    <SlotCard
                      title={`${slot.class?.name ?? ''} - ${slot.section?.name ?? ''}`}
                      subtitle={slot.subject?.name || '—'}
                      meta={slot.room_number ? `Room ${slot.room_number}` : undefined}
                    />
                  );
                }}
              />
            ) : (
              // No bell schedule yet: fall back to a simple per-day list.
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {days.map((day) => {
                  const items = slots.filter((s) => s.day_of_week === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
                  return (
                    <Card key={day} className="p-4">
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">{getDayName(day)}</h3>
                      {items.length === 0 ? (
                        <p className="text-sm text-slate-400">No classes</p>
                      ) : (
                        <div className="space-y-2">
                          {items.map((s) => (
                            <div key={s.id} className="rounded-lg bg-slate-50 px-3 py-2.5">
                              <p className="text-sm font-medium text-slate-900">{formatTime(s.start_time)} - {formatTime(s.end_time)}</p>
                              <p className="text-xs text-slate-500">{s.class?.name} - {s.section?.name} · {s.subject?.name || '—'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
