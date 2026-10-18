import { useEffect, useState, useCallback } from 'react';
import { Check, X, Clock, CalendarOff, Save, ClipboardCheck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { PageHeader, LoadingSpinner, SearchInput } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeacherByUserId, fetchTeacherAssignments, fetchStudentsBySection, fetchAttendance, upsertAttendance } from '@/services/api';
import type { Teacher, ClassAssignment, Student, Attendance } from '@/types';
import { cn } from '@/lib/utils';

type Status = 'present' | 'absent' | 'late' | 'leave';

export default function TeacherAttendance() {
  const { profile } = useAuth();
  const toast = useToast();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [existingAttendance, setExistingAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (t) {
        setTeacher(t);
        const a = await fetchTeacherAssignments(t.id);
        setAssignments(a);
        if (a.length > 0) setSelectedSection(a[0].section_id);
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
      setExistingAttendance(a);
      const statusMap: Record<string, Status> = {};
      s.forEach((student) => {
        const record = a.find((att) => att.student_id === student.id);
        statusMap[student.id] = (record?.status as Status) || 'present';
      });
      setStatuses(statusMap);
    } catch { /* handled */ }
  }, [selectedSection, selectedDate]);

  useEffect(() => { loadSectionData(); }, [loadSectionData]);

  const uniqueSections = assignments.reduce((acc: { id: string; label: string }[], a) => {
    if (!acc.find((x) => x.id === a.section_id)) {
      acc.push({ id: a.section_id, label: `${a.class?.name} - ${a.section?.name}` });
    }
    return acc;
  }, []);

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
      toast('Failed to save attendance', 'error');
    } finally {
      setSaving(false);
    }
  }

  const statusIcons = {
    present: <Check className="h-4 w-4" />,
    absent: <X className="h-4 w-4" />,
    late: <Clock className="h-4 w-4" />,
    leave: <CalendarOff className="h-4 w-4" />,
  };

  const statusClasses = {
    present: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    absent: 'bg-red-50 text-red-700 ring-red-200',
    late: 'bg-amber-50 text-amber-700 ring-amber-200',
    leave: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  };

  return (
    <DashboardLayout title="Attendance">
      <div className="space-y-6">
        <PageHeader title="Mark Attendance" description="Record attendance for your assigned classes" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Class / Section</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="h-[42px] w-full rounded-xl border border-gray-200 bg-white px-3 pr-8 text-sm text-gray-700 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none bg-no-repeat"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundPosition: 'right 12px center' }}
            >
              {uniqueSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Date</label>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="h-[42px] rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <div className="flex-1 min-w-0">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by student name..." />
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No students in this section</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => markAll('present')}>Mark All Present</Button>
              <Button size="sm" variant="outline" onClick={() => markAll('absent')}>Mark All Absent</Button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-600">#</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.filter((s) => !search || s.full_name.toLowerCase().includes(search.toLowerCase())).map((s, idx) => (
                    <tr key={s.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{idx + 1}</td>
                      <td className="px-4 py-3 text-gray-700">{s.full_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(['present', 'absent', 'late', 'leave'] as Status[]).map((st) => (
                            <button
                              key={st}
                              onClick={() => setStatus(s.id, st)}
                              className={cn(
                                'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-all',
                                statuses[s.id] === st ? statusClasses[st] : 'bg-white text-gray-400 ring-gray-200 hover:bg-gray-50'
                              )}
                            >
                              {statusIcons[st]}
                              <span className="capitalize">{st}</span>
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
