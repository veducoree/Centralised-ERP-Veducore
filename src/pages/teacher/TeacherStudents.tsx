import { useEffect, useState, useCallback } from 'react';
import { Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SearchInput, PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { StudentPhotoUpload } from '@/components/ui/StudentPhotoUpload';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeacherByUserId, fetchTeacherAssignments, fetchStudentsBySection } from '@/services/api';
import type { Teacher, ClassAssignment, Student } from '@/types';
import { StatusBadge } from '@/components/ui/Badge';


export default function TeacherStudents() {
  const { profile } = useAuth();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState('');
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
        if (a.length > 0) {
          setSelectedSection(a[0].section_id);
        }
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadStudents = useCallback(async () => {
    if (!selectedSection) return;
    try {
      const s = await fetchStudentsBySection(selectedSection);
      setStudents(s);
    } catch { /* handled */ }
  }, [selectedSection]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.admission_number.toLowerCase().includes(search.toLowerCase())
  );

  const uniqueSections = assignments.reduce((acc: { id: string; label: string }[], a) => {
    if (!acc.find((x) => x.id === a.section_id)) {
      acc.push({ id: a.section_id, label: `${a.class?.name} - ${a.section?.name}` });
    }
    return acc;
  }, []);

  return (
    <DashboardLayout title="Students">
      <div className="space-y-6">
        <PageHeader title="My Students" description="Students from your assigned classes" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1 min-w-0">
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="h-[42px] w-full rounded-xl border border-gray-200 bg-white px-3 pr-8 text-sm text-gray-700 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none bg-no-repeat"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundPosition: 'right 12px center' }}
            >
              {uniqueSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <SearchInput value={search} onChange={setSearch} placeholder="Search students..." />
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <Users className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No students found</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600">Photo</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Admission No.</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Gender</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3"><StudentPhotoUpload student={s} onUpdated={loadStudents} /></td>
                    <td className="px-4 py-3 font-medium text-gray-900">{s.admission_number}</td>
                    <td className="px-4 py-3 text-gray-700">{s.full_name}</td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{s.gender || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
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
