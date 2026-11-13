import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchSchool, fetchTimetablePeriods, fetchTeacherSchedules, fetchTeachers,
  fetchClasses, fetchSubjects, fetchSubjectAllotments,
} from '@/services/api';
import type { Class, School, Section, Subject, Teacher, TeacherSchedule, TimetablePeriod } from '@/types';
import { getTimetableDays, sortPeriods } from '@/lib/timetable';
import { ClassTimetableTab, type Allotment } from '@/components/timetable/ClassTimetableTab';
import { TeacherTimetableTab } from '@/components/timetable/TeacherTimetableTab';
import { SubstitutionsTab } from '@/components/timetable/SubstitutionsTab';
import { PeriodsTab } from '@/components/timetable/PeriodsTab';

type Tab = 'class' | 'teacher' | 'substitutions' | 'periods';

const TABS: { id: Tab; label: string }[] = [
  { id: 'class', label: 'Class Timetable' },
  { id: 'teacher', label: 'Teacher Timetable' },
  { id: 'substitutions', label: 'Substitutions' },
  { id: 'periods', label: 'Periods & Days' },
];

const TAB_CLASSES = {
  active: 'border-b-2 border-brand-600 text-brand-600 font-semibold bg-white px-4 py-2.5 text-sm whitespace-nowrap',
  inactive: 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 px-4 py-2.5 text-sm border-b-2 border-transparent whitespace-nowrap',
};

export default function AdminTimetable() {
  const { profile } = useAuth();
  const toast = useToast();
  const schoolId = profile?.school_id;

  const [tab, setTab] = useState<Tab>('class');
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);
  const [periods, setPeriods] = useState<TimetablePeriod[]>([]);
  const [schedules, setSchedules] = useState<TeacherSchedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allotments, setAllotments] = useState<Allotment[]>([]);

  const loadData = useCallback(async (showSpinner = false) => {
    if (!schoolId) return;
    if (showSpinner) setLoading(true);
    try {
      const [sch, per, sched, tch, cls, subs, allot] = await Promise.all([
        fetchSchool(schoolId),
        fetchTimetablePeriods(schoolId),
        fetchTeacherSchedules(schoolId),
        fetchTeachers(schoolId),
        fetchClasses(schoolId),
        fetchSubjects(schoolId),
        fetchSubjectAllotments(schoolId),
      ]);
      setSchool(sch);
      setPeriods(sortPeriods(per));
      setSchedules(sched);
      setTeachers(tch);
      setClasses(cls);
      setSubjects(subs);
      setAllotments(allot);
    } catch {
      toast('Failed to load timetable', 'error');
    } finally {
      setLoading(false);
    }
  }, [schoolId, toast]);

  useEffect(() => { loadData(true); }, [loadData]);

  const days = getTimetableDays(school);
  const reload = () => { loadData(); };

  return (
    <DashboardLayout title="Timetable">
      <div className="space-y-6">
        <PageHeader
          title="Timetable"
          description="Weekly class timetables, teacher clash checks and substitutes for absent teachers"
        />

        <div className="overflow-x-auto border-b border-slate-200">
          <div className="flex">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? TAB_CLASSES.active : TAB_CLASSES.inactive}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading || !schoolId ? (
          <LoadingSpinner variant="cards" />
        ) : tab === 'class' ? (
          <ClassTimetableTab
            schoolId={schoolId}
            periods={periods}
            days={days}
            schedules={schedules}
            teachers={teachers}
            classes={classes}
            subjects={subjects}
            allotments={allotments}
            onChanged={reload}
            onGoToPeriods={() => setTab('periods')}
          />
        ) : tab === 'teacher' ? (
          <TeacherTimetableTab periods={periods} days={days} schedules={schedules} teachers={teachers} />
        ) : tab === 'substitutions' ? (
          <SubstitutionsTab schoolId={schoolId} periods={periods} days={days} schedules={schedules} teachers={teachers} />
        ) : (
          <PeriodsTab
            key={days.join(',')}
            schoolId={schoolId}
            periods={periods}
            schedules={schedules}
            days={days}
            onChanged={reload}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
