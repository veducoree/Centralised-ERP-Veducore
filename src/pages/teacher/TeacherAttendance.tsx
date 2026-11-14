import { useEffect, useState, useCallback } from 'react';
import { Check, X, Clock, CalendarOff, Save, ClipboardCheck, Stethoscope, Info } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { PageHeader, LoadingSpinner, SearchInput } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeacherByUserId, fetchMyAttendanceSections, fetchStudentsBySection, fetchAttendance, upsertAttendance } from '@/services/api';
import type { Teacher, Student } from '@/types';
import { cn } from '@/lib/utils';

type Status = 'present' | 'absent' | 'late' | 'leave' | 'medical';

const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const STATUS_LABEL: Record<Status, string> = { present: 'Present', absent: 'Absent', late: 'Late', leave: 'Leave', medical: 'Medical' };

export default function TeacherAttendance() {
  const { profile } = useAuth();
  const toast = useToast();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [sections, setSections] = useState<{ id: string; label: string; isClassTeacher: boolean }[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedDate, setSelectedDate] = useState(localISO());
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (t) {
        setTeacher(t);
        // Only sections this teacher may mark: those where they're the class teacher.
        const secs = (await fetchMyAttendanceSections()).map((x) => ({ id: x.section_id, label: x.label, isClassTeacher: x.is_class_teacher }));
        setSections(secs);
        if (secs.length > 0) setSelectedSection(secs[0].id);
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadSectionData = useCallback(async () => {
    if (!selectedSection) return;
    try {
      const [s, a] = await Promise.all([
        fetchStudentsBySection(selectedSection),
        fetchAttendance({ sectionId: selectedSection, date: selectedDate }),
      ]);
      setStudents(s);
      const statusMap: Record<string, Status> = {};
      s.forEach((student) => {
        const record = a.find((att) => att.student_id === student.id);
        statusMap[student.id] = (record?.status as Status) || 'present';
      });
      setStatuses(statusMap);
    } catch { /* handled */ }
  }, [selectedSection, selectedDate]);

  useEffect(() => { loadSectionData(); }, [loadSectionData]);

  function setStatus(studentId: string, status: Status) {
    setStatuses({ ...statuses, [studentId]: status });
  }

  function markAll(status: Status) {
    const all: Record<string, Status> = {};
    students.forEach((s) => { all[s.id] = status; });
    setStatuses(all);
  }

  async function handleSave() {
    if (!teacher || !selectedSection || !profile?.school_id) return;
    setSaving(true);
    try {
      const records = students.map((s) => ({
        school_id: profile.school_id!,
        student_id: s.id,
        section_id: selectedSection,
        teacher_id: teacher.id,
        attendance_date: selectedDate,
        status: statuses[s.id] || 'present',
      }));
      await upsertAttendance(records);
      toast('Attendance saved successfully', 'success');
      loadSectionData();
    } catch (err) {
      toast(err instanceof Error && /row-level security|policy/i.test(err.message)
        ? 'Only the class teacher can mark attendance for this section'
        : 'Failed to save attendance', 'error');
    } finally {
      setSaving(false);
    }
  }

  const statusIcons = {
    present: <Check className="h-4 w-4" />,
    absent: <X className="h-4 w-4" />,
    late: <Clock className="h-4 w-4" />,
    leave: <CalendarOff className="h-4 w-4" />,
    medical: <Stethoscope className="h-4 w-4" />,
  };

  const statusClasses = {
    present: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    absent: 'bg-red-50 text-red-700 ring-red-200',
    late: 'bg-amber-50 text-amber-700 ring-amber-200',
    leave: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
    medical: 'bg-violet-50 text-violet-700 ring-violet-200',
  };

  return (
    <DashboardLayout title="Attendance">
      <div className="space-y-6">
        <PageHeader title="Mark Attendance" description="Record daily attendance for your class. Parents of absent and late students are notified." />
        {!loading && sections.length === 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            Attendance is taken by the class teacher. You aren't the class teacher of any section — ask the office if that's wrong.
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Class / Section</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="h-[42px] w-full rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)] px-3 pr-8 text-sm text-slate-700 shadow-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 appearance-none bg-no-repeat"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundPosition: 'right 12px center' }}
            >
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}{s.isClassTeacher ? '' : ' (no class teacher set)'}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
            <input type="date" value={selectedDate} max={localISO()} onChange={(e) => setSelectedDate(e.target.value)}
              className="h-[42px] rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)] px-3.5 text-sm text-slate-700 shadow-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
          </div>
          <div className="flex-1 min-w-0">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by student name..." />
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-slate-300 mb-3" />
            <p className="font-medium text-slate-600">No students in this section</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-xs text-slate-500">Medical (ML) counts as present.</span>
              <Button size="sm" variant="outline" onClick={() => markAll('present')}>Mark All Present</Button>
              <Button size="sm" variant="outline" onClick={() => markAll('absent')}>Mark All Absent</Button>
            </div>

            <div className="overflow-x-auto rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-600">#</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Name</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.filter((s) => !search || s.full_name.toLowerCase().includes(search.toLowerCase())).map((s, idx) => (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">{idx + 1}</td>
                      <td className="px-4 py-3 text-slate-700">{s.full_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(['present', 'absent', 'late', 'leave', 'medical'] as Status[]).map((st) => (
                            <button
                              key={st}
                              onClick={() => setStatus(s.id, st)}
                              className={cn(
                                'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-all',
                                statuses[s.id] === st ? statusClasses[st] : 'bg-white text-slate-400 ring-slate-200 hover:bg-slate-50'
                              )}
                            >
                              {statusIcons[st]}
                              <span>{STATUS_LABEL[st]}</span>
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} loading={saving} icon={<Save className="h-4 w-4" />}>Save Attendance</Button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
