import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, UserX, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { fetchSubstitutions, createSubstitution, deleteSubstitution } from '@/services/api';
import type { Teacher, TeacherSchedule, TimetablePeriod, TimetableSubstitution } from '@/types';
import { cn, formatDate, formatTime, getDayName } from '@/lib/utils';
import { errorMessage, toISODate, toInputTime, weekdayOf } from '@/lib/timetable';

interface SubstitutionsTabProps {
  schoolId: string;
  periods: TimetablePeriod[];
  days: number[];
  schedules: TeacherSchedule[];
  teachers: Teacher[];
}

const t5 = toInputTime;
const overlapsTime = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  t5(aStart) < t5(bEnd) && t5(aEnd) > t5(bStart);

export function SubstitutionsTab({ schoolId, periods, days, schedules, teachers }: SubstitutionsTabProps) {
  const toast = useToast();
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [subs, setSubs] = useState<TimetableSubstitution[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [absentIds, setAbsentIds] = useState<string[]>([]);
  const [addAbsent, setAddAbsent] = useState('');
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TimetableSubstitution | null>(null);

  const weekday = weekdayOf(date);
  const isWorkingDay = days.includes(weekday);

  const loadSubs = useCallback(async () => {
    setLoadingSubs(true);
    try {
      setSubs(await fetchSubstitutions({ schoolId, from: date, to: date }));
    } catch (err) {
      toast(errorMessage(err, 'Failed to load substitutions'), 'error');
    } finally { setLoadingSubs(false); }
  }, [schoolId, date, toast]);

  useEffect(() => { loadSubs(); }, [loadSubs]);
  useEffect(() => { setAbsentIds([]); setPicks({}); }, [date]);

  // Teachers with a covered slot on this date are absent too.
  const absentSet = useMemo(() => {
    const set = new Set(absentIds);
    subs.forEach((s) => { if (s.original_teacher_id) set.add(s.original_teacher_id); });
    return set;
  }, [absentIds, subs]);

  const absentTeachers = teachers.filter((t) => absentSet.has(t.id));
  const daySlots = useMemo(
    () => schedules.filter((s) => s.day_of_week === weekday).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [schedules, weekday],
  );
  const subBySlot = useMemo(() => new Map(subs.map((s) => [s.schedule_id, s])), [subs]);

  const periodName = (slot: TeacherSchedule) =>
    periods.find((p) => p.id === slot.period_id)?.name || `${formatTime(slot.start_time)}`;

  /** Number of classes a teacher already has on this date (own + substitutions). */
  const dayLoad = useCallback(
    (teacherId: string) =>
      daySlots.filter((s) => s.teacher_id === teacherId).length +
      subs.filter((s) => s.substitute_teacher_id === teacherId).length,
    [daySlots, subs],
  );

  function freeTeachers(slot: TeacherSchedule) {
    return teachers
      .filter((t) => {
        if (t.id === slot.teacher_id || absentSet.has(t.id)) return false;
        const teaching = daySlots.some((s) => s.teacher_id === t.id && overlapsTime(s.start_time, s.end_time, slot.start_time, slot.end_time));
        if (teaching) return false;
        const covering = subs.some(
          (s) => s.substitute_teacher_id === t.id && s.schedule_id !== slot.id && s.start_time && s.end_time &&
            overlapsTime(s.start_time, s.end_time, slot.start_time, slot.end_time),
        );
        return !covering;
      })
      .map((t) => ({ teacher: t, load: dayLoad(t.id), knowsClass: schedules.some((s) => s.teacher_id === t.id && s.section_id === slot.section_id) }))
      .sort((a, b) => Number(b.knowsClass) - Number(a.knowsClass) || a.load - b.load || a.teacher.full_name.localeCompare(b.teacher.full_name));
  }

  async function assign(slot: TeacherSchedule) {
    const substituteId = picks[slot.id];
    if (!substituteId) { toast('Pick a substitute teacher', 'error'); return; }
    setAssigning(slot.id);
    try {
      await createSubstitution({ school_id: schoolId, date, schedule_id: slot.id, substitute_teacher_id: substituteId });
      toast('Substitute assigned', 'success');
      setPicks((p) => { const n = { ...p }; delete n[slot.id]; return n; });
      await loadSubs();
    } catch (err) {
      toast(errorMessage(err, 'Failed to assign'), 'error');
    } finally { setAssigning(null); }
  }

  async function handleRemove() {
    if (!removing) return;
    try {
      await deleteSubstitution(removing.id);
      toast('Substitution removed', 'success');
      await loadSubs();
    } catch (err) { toast(errorMessage(err, 'Failed to remove'), 'error'); }
  }

  const uncovered = absentTeachers.reduce(
    (n, t) => n + daySlots.filter((s) => s.teacher_id === t.id && !subBySlot.has(s.id)).length,
    0,
  );

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-full sm:w-48">
          <Input label="Date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        {isWorkingDay && (
          <>
            <div className="w-full sm:w-64">
              <Select label="Mark teacher absent" value={addAbsent} onChange={(e) => setAddAbsent(e.target.value)}>
                <option value="">Select teacher...</option>
                {teachers.filter((t) => !absentSet.has(t.id)).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} ({daySlots.filter((s) => s.teacher_id === t.id).length} classes)
                  </option>
                ))}
              </Select>
            </div>
            <Button
              icon={<UserX />}
              disabled={!addAbsent}
              onClick={() => { setAbsentIds((ids) => [...ids, addAbsent]); setAddAbsent(''); }}
            >
              Mark absent
            </Button>
          </>
        )}
        <p className="pb-2 text-sm text-slate-500">
          {getDayName(weekday)}, {formatDate(date)}
        </p>
      </Card>

      {!isWorkingDay ? (
        <Card className="flex flex-col items-center p-10 text-center">
          <CalendarDays className="mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-700">{getDayName(weekday)} is not a working day</p>
          <p className="mt-1 text-sm text-slate-500">Pick another date, or change working days in the Periods tab.</p>
        </Card>
      ) : absentTeachers.length === 0 ? (
        <Card className="flex flex-col items-center p-10 text-center">
          <UserX className="mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-700">No absent teachers for this date</p>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Mark a teacher absent to see their classes for the day. Only teachers who are free in that period are offered as substitutes.
          </p>
        </Card>
      ) : (
        <>
          <div className={cn('flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium', uncovered ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800')}>
            {uncovered ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {uncovered ? `${uncovered} ${uncovered === 1 ? 'class needs' : 'classes need'} a substitute` : 'All classes of absent teachers are covered'}
          </div>

          {absentTeachers.map((t) => {
            const slots = daySlots.filter((s) => s.teacher_id === t.id);
            const canUnmark = !slots.some((s) => subBySlot.has(s.id));
            return (
              <Card key={t.id} className="p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{t.full_name}</h3>
                    <p className="text-xs text-slate-500">{slots.length} classes on {getDayName(weekday)}</p>
                  </div>
                  {canUnmark && absentIds.includes(t.id) && (
                    <button
                      onClick={() => setAbsentIds((ids) => ids.filter((x) => x !== t.id))}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Not absent"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {slots.length === 0 ? (
                  <p className="text-sm text-slate-400">No classes on this day.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {slots.map((slot) => {
                      const sub = subBySlot.get(slot.id);
                      const options = sub ? [] : freeTeachers(slot);
                      return (
                        <div key={slot.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800">
                              {periodName(slot)} · {slot.class?.name}-{slot.section?.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {slot.subject?.name || '—'} · {formatTime(slot.start_time)}–{formatTime(slot.end_time)}
                            </p>
                          </div>
                          {sub ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                                <CheckCircle2 className="h-4 w-4" /> {sub.substitute_teacher?.full_name}
                              </span>
                              <button onClick={() => setRemoving(sub)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove substitute">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-full sm:w-64">
                                <Select
                                  fieldSize="sm"
                                  value={picks[slot.id] || ''}
                                  onChange={(e) => setPicks({ ...picks, [slot.id]: e.target.value })}
                                  aria-label="Substitute teacher"
                                >
                                  <option value="">{options.length ? 'Pick a free teacher...' : 'No teacher is free'}</option>
                                  {options.map(({ teacher, load, knowsClass }) => (
                                    <option key={teacher.id} value={teacher.id}>
                                      {teacher.full_name} · {load} today{knowsClass ? ' · teaches this class' : ''}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                              <Button size="sm" onClick={() => assign(slot)} loading={assigning === slot.id} disabled={!picks[slot.id]}>
                                Assign
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </>
      )}

      {subs.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Substitutions on {formatDate(date)} {loadingSubs && <span className="text-xs font-normal text-slate-400">· refreshing</span>}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Period</th>
                  <th className="py-2 pr-3 font-semibold">Class</th>
                  <th className="py-2 pr-3 font-semibold">Subject</th>
                  <th className="py-2 pr-3 font-semibold">Absent</th>
                  <th className="py-2 pr-3 font-semibold">Substitute</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-3 text-slate-700">{s.period?.name || formatTime(s.start_time)}</td>
                    <td className="py-2 pr-3 text-slate-700">{s.class?.name}-{s.section?.name}</td>
                    <td className="py-2 pr-3 text-slate-500">{s.subject?.name || '—'}</td>
                    <td className="py-2 pr-3 text-slate-500">{s.original_teacher?.full_name || '—'}</td>
                    <td className="py-2 pr-3 font-medium text-emerald-700">{s.substitute_teacher?.full_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={handleRemove}
        title="Remove substitute"
        message={`Remove ${removing?.substitute_teacher?.full_name ?? 'this substitute'} from this class?`}
        confirmText="Remove"
        variant="danger"
      />
    </div>
  );
}
