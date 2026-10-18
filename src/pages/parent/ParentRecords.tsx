import { useEffect, useState, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { fetchParentByUserId, fetchParentStudents, fetchStudentRecords } from '@/services/api';
import type { Parent, Student, StudentRecord } from '@/types';
import { formatDate } from '@/lib/utils';

export default function ParentRecords() {
  const { profile } = useAuth();
  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const p = await fetchParentByUserId(profile.id);
      if (p) {
        setParent(p);
        const links = await fetchParentStudents(p.id);
        const kids = links.map((l) => l.student).filter(Boolean) as Student[];
        setChildren(kids);
        if (kids.length > 0 && !selectedChildId) setSelectedChildId(kids[0].id);
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id, selectedChildId]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadRecords = useCallback(async () => {
    if (!selectedChildId) return;
    try {
      const r = await fetchStudentRecords({ studentId: selectedChildId });
      setRecords(r);
    } catch { /* handled */ }
  }, [selectedChildId]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  if (loading) return <DashboardLayout title="Academic Records"><LoadingSpinner /></DashboardLayout>;

  return (
    <DashboardLayout title="Academic Records">
      <div className="space-y-6">
        <PageHeader title="Academic Records" description="View your child's academic performance" />

        {children.length > 1 && (
          <Card className="p-4">
            <Select label="Select Child" value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
              {children.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </Card>
        )}

        <Card className="p-4">
          {records.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <FileText className="h-10 w-10 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No academic records available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-gray-600">Subject</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Exam</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Marks</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Grade</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Date</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.subject_name}</td>
                      <td className="px-3 py-2 text-gray-700 capitalize">{r.exam_name}</td>
                      <td className="px-3 py-2 text-gray-700">{r.marks}/{r.max_marks}</td>
                      <td className="px-3 py-2 text-gray-700">{r.grade || '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{formatDate(r.date)}</td>
                      <td className="px-3 py-2 text-gray-500">{r.teacher_comment || '—'}</td>
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
