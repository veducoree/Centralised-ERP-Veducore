import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import type { Teacher, TeacherSchedule, TimetablePeriod } from '@/types';
import { cn } from '@/lib/utils';
import { slotsInPeriod } from '@/lib/timetable';
import { TimetableGrid, SlotCard, EmptySlot } from './TimetableGrid';

interface TeacherTimetableTabProps {
  periods: TimetablePeriod[];
  days: number[];
  schedules: TeacherSchedule[];
  teachers: Teacher[];
}

export function TeacherTimetableTab({ periods, days, schedules, teachers }: TeacherTimetableTabProps) {
  const [teacherId, setTeacherId] = useState('');

  useEffect(() => {
    if (!teacherId && teachers.length > 0) setTeacherId(teachers[0].id);
  }, [teachers, teacherId]);

  const loads = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of schedules) {
      if (days.includes(s.day_of_week)) m.set(s.teacher_id, (m.get(s.teacher_id) || 0) + 1);
    }
    return m;
  }, [schedules, days]);

  const teacherSlots = useMemo(() => schedules.filter((s) => s.teacher_id === teacherId), [schedules, teacherId]);
  const maxLoad = Math.max(1, ...teachers.map((t) => loads.get(t.id) || 0));

  if (teachers.length === 0) {
    return <Card className="p-8 text-center text-sm text-slate-500">No teachers yet.</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-full sm:w-64">
          <Select label="Teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
        </div>
        <p className="pb-2 text-sm text-slate-500">
          <span className="font-semibold text-slate-800">{loads.get(teacherId) || 0}</span> periods per week
        </p>
      </Card>

      {periods.length > 0 && (
        <TimetableGrid
          periods={periods}
          days={days}
          renderCell={(day, period) => {
            const slot = slotsInPeriod(teacherSlots, day, period)[0];
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
      )}

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900">Weekly load of all teachers</h3>
        <p className="mb-4 text-xs text-slate-500">Periods per week. Click a name to see their timetable.</p>
        <div className="space-y-2">
          {[...teachers]
            .sort((a, b) => (loads.get(b.id) || 0) - (loads.get(a.id) || 0))
            .map((t) => {
              const n = loads.get(t.id) || 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTeacherId(t.id)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50', t.id === teacherId && 'bg-[#F5F6FE]')}
                >
                  <span className="w-40 truncate text-sm text-slate-700 sm:w-56">{t.full_name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-[#5B6EE8]" style={{ width: `${(n / maxLoad) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right text-sm font-semibold tabular-nums text-slate-800">{n}</span>
                </button>
              );
            })}
        </div>
      </Card>
    </div>
  );
}
