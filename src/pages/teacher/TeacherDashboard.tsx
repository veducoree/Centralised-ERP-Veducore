import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Fingerprint, Users, ClipboardList, ClipboardCheck, Megaphone, Plane, ChevronRight,
  Coffee, BellOff, BookOpen, Clock,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchTeacherByUserId, fetchTeacherScheduleByTeacher, fetchTeacherAssignments, fetchSubstitutions,
  fetchMyNotifications, fetchMyAttendanceSections, fetchStudentsBySection, fetchAttendance,
  fetchMyStaffAttendance, markMyAttendance,
} from '@/services/api';
import type { Teacher, TeacherSchedule, TimetableSubstitution, Notification, StaffAttendanceRow } from '@/types';

const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const time12 = (t: string | null | undefined) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const STAFF_LABEL: Record<string, string> = { present: 'Present', late: 'Late', half_day: 'Half day', leave: 'On leave', absent: 'Absent' };

function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
      {action}
    </div>
  );
}

export default function TeacherDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const today = localISO();
  const weekday = new Date().getDay();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [slots, setSlots] = useState<TeacherSchedule[]>([]);
  const [duties, setDuties] = useState<TimetableSubstitution[]>([]);
  const [notices, setNotices] = useState<Notification[]>([]);
  const [classCount, setClassCount] = useState(0);
  const [myClass, setMyClass] = useState<{ label: string; students: number; marked: number } | null>(null);
  const [me, setMe] = useState<StaffAttendanceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (!t) return;
      setTeacher(t);
      const [assignments, schedule, subs, notifs, sections, myRows] = await Promise.all([
        fetchTeacherAssignments(t.id).catch(() => []),
        fetchTeacherScheduleByTeacher(t.id).catch(() => [] as TeacherSchedule[]),
        fetchSubstitutions({ substituteTeacherId: t.id, from: today, to: today }).catch(() => [] as TimetableSubstitution[]),
        fetchMyNotifications(10).catch(() => [] as Notification[]),
        fetchMyAttendanceSections().catch(() => []),
        fetchMyStaffAttendance(t.id, today, today).catch(() => [] as StaffAttendanceRow[]),
      ]);
      setClassCount(new Set(assignments.map((a) => a.section_id)).size);
      setSlots(schedule.filter((s) => s.day_of_week === weekday).sort((a, b) => a.start_time.localeCompare(b.start_time)));
      setDuties(subs);
      setNotices(notifs.slice(0, 4));
      setMe(myRows[0] ?? null);
      const own = sections.find((s) => s.is_class_teacher);
      if (own) {
        const [students, att] = await Promise.all([
          fetchStudentsBySection(own.section_id).catch(() => []),
          fetchAttendance({ sectionId: own.section_id, date: today }).catch(() => []),
        ]);
        setMyClass({ label: own.label, students: students.length, marked: att.length });
      }
    } finally {
      setLoading(false);
    }
  }, [profile?.id, today, weekday]);

  useEffect(() => { load(); }, [load]);

  async function markPresent() {
    setMarking(true);
    try { setMe(await markMyAttendance(false)); toast('Marked present', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not mark', 'error'); }
    finally { setMarking(false); }
  }

  const nowStr = new Date().toTimeString().slice(0, 5);
  const liveId = useMemo(() => slots.find((s) => s.start_time.slice(0, 5) <= nowStr && nowStr < s.end_time.slice(0, 5))?.id, [slots, nowStr]);

  if (loading) return <DashboardLayout title="Dashboard"><DashboardSkeleton cards={4} /></DashboardLayout>;

  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const classDone = !!myClass && myClass.students > 0 && myClass.marked >= myClass.students;

  const quick = [
    { label: 'Class attendance', icon: <ClipboardList className="h-5 w-5" />, tint: 'bg-[#E6F8F1] text-[#22C08A]', path: '/teacher/attendance' },
    { label: 'Exam marks', icon: <ClipboardCheck className="h-5 w-5" />, tint: 'bg-[#EEF0FD] text-[#5B6EE8]', path: '/teacher/exam-marks' },
    { label: 'Remarks', icon: <Megaphone className="h-5 w-5" />, tint: 'bg-[#FEF3E0] text-[#F5A623]', path: '/teacher/remarks' },
    { label: 'Apply leave', icon: <Plane className="h-5 w-5" />, tint: 'bg-[#FDE7F3] text-[#EC4899]', path: '/teacher/my-attendance' },
  ];

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Greeting */}
        <div className="rounded-[20px] bg-gradient-to-br from-[#5B6EE8] to-[#7B8CF7] p-6 text-white shadow-[0_8px_30px_rgba(91,110,232,0.25)]">
          <p className="text-sm text-white/80">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="mt-1 text-2xl font-semibold">{greet}, {(teacher?.full_name || profile?.full_name || '').split(' ')[0]}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1"><BookOpen className="h-3.5 w-3.5" /> {classCount} classes</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1"><Clock className="h-3.5 w-3.5" /> {slots.length + duties.length} periods today</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-6">
            {/* My attendance */}
            <Card className="flex items-center gap-4 p-5">
              <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${me ? 'bg-[#E6F8F1] text-[#22C08A]' : 'bg-[#FEF3E0] text-[#F5A623]'}`}>
                {me ? <CheckCircle2 className="h-5 w-5" /> : <Fingerprint className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">My attendance</p>
                <p className="font-semibold text-[#0F172A]">{me ? `${STAFF_LABEL[me.status]}${me.check_in ? ` · ${time12(me.check_in)}` : ''}` : 'Not marked yet'}</p>
              </div>
              {me
                ? <button onClick={() => navigate('/teacher/my-attendance')} aria-label="Open my attendance" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><ChevronRight className="h-5 w-5" /></button>
                : <Button size="sm" loading={marking} onClick={markPresent}>Mark present</Button>}
            </Card>

            {/* Class teacher */}
            {myClass && (
              <Card className="flex cursor-pointer items-center gap-4 p-5" onClick={() => navigate('/teacher/attendance')}>
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#EEF0FD] text-[#5B6EE8]"><Users className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">Class teacher · {myClass.label}</p>
                  <p className="font-semibold text-[#0F172A]">
                    {myClass.marked === 0 ? "Today's attendance not taken" : classDone ? 'Attendance done' : `${myClass.marked}/${myClass.students} marked`}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classDone ? 'bg-[#E6F8F1] text-emerald-700' : 'bg-[#FEF3E0] text-amber-700'}`}>{classDone ? 'Done' : 'Take now'}</span>
              </Card>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-4">
              {quick.map((q) => (
                <button key={q.label} onClick={() => navigate(q.path)}
                  className="flex items-center gap-3 rounded-[20px] bg-white p-4 text-left shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition hover:-translate-y-0.5">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${q.tint}`}>{q.icon}</span>
                  <span className="text-sm font-semibold text-[#0F172A]">{q.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {/* Today's classes */}
            <Card className="p-5">
              <SectionHead title="Today's classes" action={
                <button onClick={() => navigate('/teacher/schedule')} className="flex items-center gap-0.5 text-xs font-medium text-[#5B6EE8] hover:underline">Timetable <ChevronRight className="h-3.5 w-3.5" /></button>
              } />
              {slots.length === 0 && duties.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center"><Coffee className="mb-2 h-7 w-7 text-slate-300" /><p className="text-sm text-slate-400">No classes scheduled today</p></div>
              ) : (
                <ul className="space-y-2">
                  {slots.map((s) => {
                    const live = s.id === liveId;
                    return (
                      <li key={s.id} className={`flex items-center gap-4 rounded-xl px-3 py-2.5 ${live ? 'bg-[#F8F9FF] ring-1 ring-[#5B6EE8]/30' : ''}`}>
                        <div className="w-20 flex-shrink-0">
                          <p className={`text-sm font-semibold ${live ? 'text-[#5B6EE8]' : 'text-[#0F172A]'}`}>{time12(s.start_time)}</p>
                          <p className="text-[11px] text-slate-400">{time12(s.end_time)}</p>
                        </div>
                        <span className={`h-9 w-1 rounded-full ${live ? 'bg-[#5B6EE8]' : 'bg-[#E8EAF3]'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#0F172A]">{s.subject?.name ?? 'Class'}</p>
                          <p className="truncate text-xs text-slate-500">{s.class?.name}{s.section?.name ? ` - ${s.section.name}` : ''}{s.room_number ? ` · Room ${s.room_number}` : ''}</p>
                        </div>
                        {live && <span className="rounded-md bg-[#5B6EE8] px-1.5 py-0.5 text-[10px] font-bold text-white">NOW</span>}
                      </li>
                    );
                  })}
                  {duties.map((d) => (
                    <li key={d.id} className="flex items-center gap-4 rounded-xl px-3 py-2.5">
                      <div className="w-20 flex-shrink-0">
                        <p className="text-sm font-semibold text-[#0F172A]">{time12(d.start_time)}</p>
                        <p className="text-[11px] text-slate-400">{time12(d.end_time)}</p>
                      </div>
                      <span className="h-9 w-1 rounded-full bg-[#F5A623]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#0F172A]">{d.subject?.name ?? 'Substitution'}</p>
                        <p className="truncate text-xs text-slate-500">{d.class?.name}{d.section?.name ? ` - ${d.section.name}` : ''} · Substitution</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Notices */}
            <Card className="p-5">
              <SectionHead title="Notices" />
              {notices.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center"><BellOff className="mb-2 h-7 w-7 text-slate-300" /><p className="text-sm text-slate-400">You're all caught up</p></div>
              ) : (
                <ul className="divide-y divide-[#F1F2F8]">
                  {notices.map((n) => (
                    <li key={n.id} className="flex gap-3 py-3">
                      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-[#5B6EE8]'}`} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#0F172A]">{n.title}</p>
                        <p className="line-clamp-2 text-xs text-slate-500">{n.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
