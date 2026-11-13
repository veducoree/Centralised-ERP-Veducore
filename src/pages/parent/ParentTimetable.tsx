import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, Repeat } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchParentByUserId, fetchParentStudents, fetchSchool, fetchTimetablePeriods,
  fetchSectionTimetable, fetchSubstitutions,
} from '@/services/api';
import type { School, Student, TeacherSchedule, TimetablePeriod, TimetableSubstitution } from '@/types';
import { formatDate, formatTime, getDayName } from '@/lib/utils';
import { addDays, getTimetableDays, slotsInPeriod, sortPeriods, toISODate, weekdayOf } from '@/lib/timetable';
import { TimetableGrid, SlotCard, EmptySlot } from '@/components/timetable/TimetableGrid';

type Child = Student & { class?: { name: string } | null; section?: { name: string } | null };

export default function ParentTimetable() {
  const { profile } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState('');
  const [school, setSchool] = useState<School | null>(null);
  const [periods, setPeriods] = useState<TimetablePeriod[]>([]);
  const [slots, setSlots] = useState<TeacherSchedule[]>([]);
  const [subs, setSubs] = useState<TimetableSubstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingChild, setLoadingChild] = useState(false);

  const loadBase = useCallback(async () => {
    if (!profile?.id || !profile.school_id) return;
    setLoading(true);
    try {
      const [p, sch, per] = await Promise.all([
        fetchParentByUserId(profile.id),
        fetchSchool(profile.school_id),
        fetchTimetablePeriods(profile.school_id),
      ]);
      setSchool(sch);
      setPeriods(sortPeriods(per));
      if (p) {
        const links = await fetchParentStudents(p.id);
        const kids = links.map((l) => l.student).filter(Boolean) as Child[];
        setChildren(kids);
        if (kids.length > 0) setChildId((prev) => prev || kids[0].id);
      }
    } catch { /* handled by empty state */ }
    finally { setLoading(false); }
  }, [profile?.id, profile?.school_id]);

  useEffect(() => { loadBase(); }, [loadBase]);

  const child = children.find((c) => c.id === childId);
  const sectionId = child?.section_id;

  useEffect(() => {
    if (!sectionId) { setSlots([]); setSubs([]); return; }
    let cancelled = false;
    setLoadingChild(true);
    const today = toISODate(new Date());
    Promise.all([
      fetchSectionTimetable(sectionId),
      fetchSubstitutions({ sectionId, from: today, to: addDays(today, 6) }),
    ])
      .then(([s, sb]) => { if (!cancelled) { setSlots(s); setSubs(sb); } })
      .catch(() => { if (!cancelled) { setSlots([]); setSubs([]); } })
      .finally(() => { if (!cancelled) setLoadingChild(false); });
    return () => { cancelled = true; };
  }, [sectionId]);

  const days = getTimetableDays(school);
  const today = new Date().getDay();

  if (loading) return <DashboardLayout title="Timetable"><LoadingSpinner variant="cards" /></DashboardLayout>;

  return (
    <DashboardLayout title="Timetable">
      <div className="space-y-6">
        <PageHeader
          title="Class Timetable"
          description={child ? `${child.full_name} · ${child.class?.name ?? ''}${child.section?.name ? ` - ${child.section.name}` : ''}` : 'Your child’s weekly timetable'}
        />

        {children.length > 1 && (
          <Card className="p-4">
            <Select label="Select Child" value={childId} onChange={(e) => setChildId(e.target.value)}>
              {children.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </Card>
        )}

        {subs.length > 0 && (
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Repeat className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-slate-900">Substitute teachers this week</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {subs.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {s.period?.name || formatTime(s.start_time)} · {s.subject?.name || 'Class'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Taken by {s.substitute_teacher?.full_name || 'a substitute teacher'}
                    </p>
                  </div>
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {s.date === toISODate(new Date()) ? 'Today' : `${getDayName(weekdayOf(s.date)).slice(0, 3)}, ${formatDate(s.date)}`}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {!child ? (
          <Card className="p-8 text-center text-sm text-slate-500">No child linked to your account.</Card>
        ) : !sectionId ? (
          <Card className="p-8 text-center text-sm text-slate-500">{child.full_name} is not assigned to a section yet.</Card>
        ) : loadingChild ? (
          <LoadingSpinner variant="cards" />
        ) : slots.length === 0 || periods.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white py-16 text-center">
            <CalendarDays className="mb-3 h-12 w-12 text-slate-300" />
            <p className="font-medium text-slate-600">Timetable not published yet</p>
            <p className="mt-1 text-sm text-slate-400">The school has not set up this class&apos;s timetable.</p>
          </div>
        ) : (
          <TimetableGrid
            periods={periods}
            days={days}
            highlightDay={today}
            renderCell={(day, period) => {
              const slot = slotsInPeriod(slots, day, period)[0];
              if (!slot) return <EmptySlot />;
              return (
                <SlotCard
                  title={slot.subject?.name || 'Class'}
                  subtitle={slot.teacher?.full_name || undefined}
                  meta={slot.room_number ? `Room ${slot.room_number}` : undefined}
                />
              );
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
