import { useEffect, useState, useCallback } from 'react';
import { ClipboardList } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, StatCard } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { fetchParentByUserId, fetchParentStudents, fetchAttendance } from '@/services/api';
import type { Student, Attendance } from '@/types';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';

export default function ParentAttendance() {
  const { profile } = useAuth();
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const p = await fetchParentByUserId(profile.id);
      if (p) {
        const links = await fetchParentStudents(p.id);
        const kids = links.map((l) => l.student).filter(Boolean) as Student[];
        setChildren(kids);
        if (kids.length > 0) {
          const initialChildId = kids[0].id;
          setSelectedChildId((prev) => prev || initialChildId);
          const a = await fetchAttendance({ studentId: initialChildId });
          setRecords(a);
        }
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadAttendance = useCallback(async () => {
    if (!selectedChildId) return;
    try {
      const a = await fetchAttendance({ studentId: selectedChildId });
      setRecords(a);
    } catch { /* handled */ }
  }, [selectedChildId]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  const present = records.filter((r) => r.status === 'present').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const late = records.filter((r) => r.status === 'late').length;
  const leave = records.filter((r) => r.status === 'leave').length;
  const rate = records.length > 0 ? Math.round((present / records.length) * 100) : 0;

  if (loading) return <DashboardLayout title="Attendance"><LoadingSpinner /></DashboardLayout>;

  return (
    <DashboardLayout title="Attendance">
      <div className="space-y-6">
        <PageHeader title="Attendance" description="View your child's attendance records" />

        {children.length > 1 && (
          <Card className="p-4">
            <Select label="Select Child" value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
              {children.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Attendance Rate" value={`${rate}%`} color="emerald" />
          <StatCard label="Present" value={present} color="blue" />
          <StatCard label="Absent" value={absent} color="red" />
          <StatCard label="Late / Leave" value={late + leave} color="amber" />
        </div>

        <Card className="p-4">
          {records.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <ClipboardList className="h-10 w-10 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No attendance records</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-gray-600">Date</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Status</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-medium text-gray-900">{formatDate(r.attendance_date)}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-gray-500">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
