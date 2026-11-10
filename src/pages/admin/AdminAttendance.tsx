import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
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
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="font-medium text-gray-600">Select a class and date</p>
            <p className="mt-1 text-sm text-gray-400">Choose a section to view attendance</p>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="font-medium text-gray-600">No attendance recorded</p>
            <p className="mt-1 text-sm text-gray-400">No attendance for {formatDate(selectedDate)}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card className="p-4"><p className="text-sm text-gray-500">Present</p><p className="text-2xl font-bold text-emerald-600">{stats.present}</p></Card>
              <Card className="p-4"><p className="text-sm text-gray-500">Absent</p><p className="text-2xl font-bold text-red-600">{stats.absent}</p></Card>
              <Card className="p-4"><p className="text-sm text-gray-500">Late</p><p className="text-2xl font-bold text-amber-600">{stats.late}</p></Card>
              <Card className="p-4"><p className="text-sm text-gray-500">Leave</p><p className="text-2xl font-bold text-cyan-600">{stats.leave}</p></Card>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-600">Student</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.filter((r) => !search || (r.student?.full_name ?? '').toLowerCase().includes(search.toLowerCase())).map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.student?.full_name || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-gray-500">{r.notes || '—'}</td>
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
