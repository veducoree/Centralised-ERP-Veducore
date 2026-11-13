import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { UserCheck, UserX, Clock, CalendarOff } from 'lucide-react';
import { Card, StatCard } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner, SearchInput } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { fetchClasses, fetchAttendance } from '@/services/api';
import type { Class, Section, Attendance } from '@/types';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';

export default function AdminAttendance() {
  const { profile } = useAuth();
  const [classes, setClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, leave: 0 });

  const loadClasses = useCallback(async () => {
    if (!profile?.school_id) return;
    try {
      const data = await fetchClasses(profile.school_id);
      setClasses(data);
    } catch (err) { console.error(err); }
  }, [profile?.school_id]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  const loadAttendance = useCallback(async () => {
    if (!selectedSection) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchAttendance({ sectionId: selectedSection, date: selectedDate });
      setRecords(data);
      setStats({
        present: data.filter((a) => a.status === 'present').length,
        absent: data.filter((a) => a.status === 'absent').length,
        late: data.filter((a) => a.status === 'late').length,
        leave: data.filter((a) => a.status === 'leave').length,
      });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [selectedSection, selectedDate]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  return (
    <DashboardLayout title="Attendance">
      <div className="space-y-6">
        <PageHeader title="Attendance Overview" description="View attendance records for all classes" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <Select label="Class / Section" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
              <option value="">Select section...</option>
              {classes.map((c) => c.sections.map((s) => (
                <option key={s.id} value={s.id}>{c.name} - Section {s.name}</option>
              )))}
            </Select>
          </div>
          <div>
            <Input label="Date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
          <div className="flex-1 min-w-0">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by student name..." />
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : !selectedSection ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white py-16 text-center">
            <p className="font-medium text-slate-600">Select a class and date</p>
            <p className="mt-1 text-sm text-slate-400">Choose a section to view attendance</p>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white py-16 text-center">
            <p className="font-medium text-slate-600">No attendance recorded</p>
            <p className="mt-1 text-sm text-slate-400">No attendance for {formatDate(selectedDate)}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              <StatCard label="Present" value={stats.present} icon={<UserCheck />} color="emerald" />
              <StatCard label="Absent" value={stats.absent} icon={<UserX />} color="red" />
              <StatCard label="Late" value={stats.late} icon={<Clock />} color="amber" />
              <StatCard label="Leave" value={stats.leave} icon={<CalendarOff />} color="cyan" />
            </div>

            <div className="overflow-x-auto rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-[#F7F8FE]">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Student</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.filter((r) => !search || (r.student?.full_name ?? '').toLowerCase().includes(search.toLowerCase())).map((r) => (
                    <tr key={r.id} className="hover:bg-[#F7F8FE]">
                      <td className="px-4 py-3 font-medium text-slate-900">{r.student?.full_name || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-slate-500">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
