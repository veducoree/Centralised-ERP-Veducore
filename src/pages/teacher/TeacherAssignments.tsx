import { useEffect, useState, useCallback } from 'react';
import { Layers } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchTeacherByUserId,
  fetchClassAssignments,
  fetchClasses,
  fetchSubjects,
} from '@/services/api';
import type { ClassAssignment, Class, Section, Subject } from '@/types';

export default function TeacherAssignments() {
  const { profile } = useAuth();
  const toast = useToast();
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile?.id || !profile?.school_id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (!t) return;
      const allAssignments = await fetchClassAssignments(profile.school_id);
      setAssignments(allAssignments.filter((a) => a.teacher_id === t.id));
    } catch {
      toast('Failed to load assignments', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <DashboardLayout title="Class Assignments">
      <div className="space-y-6">
        <PageHeader
          title="My Class Assignments"
          description="Classes and subjects assigned to you by the admin"
        />

        {loading ? (
          <LoadingSpinner />
        ) : assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <Layers className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No assignments yet</p>
            <p className="mt-1 text-sm text-gray-400">
              Contact your admin to get class assignments
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600">Class</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Section</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Subject</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.class?.name}</td>
                    <td className="px-4 py-3 text-gray-700">{a.section?.name}</td>
                    <td className="px-4 py-3 text-gray-700">{a.subject?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
