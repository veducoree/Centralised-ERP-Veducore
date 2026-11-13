import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, Shield } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Form';
import { SearchInput, PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { fetchStudents, fetchClasses } from '@/services/api';
import type { Student, Class, Section } from '@/types';
import { StatusBadge } from '@/components/ui/Badge';

export default function AdminTracking() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialise filters from URL query params so browser Back restores state
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]           = useState(() => searchParams.get('search') ?? '');
  const [classFilter, setClassFilter] = useState(() => searchParams.get('class')  ?? '');

  // Keep URL in sync with filter state so the browser history entry is complete
  useEffect(() => {
    const p = new URLSearchParams();
    if (search)      p.set('search', search);
    if (classFilter) p.set('class',  classFilter);
    // Replace (not push) so typing in the search box doesn't spam history
    setSearchParams(p, { replace: true });
  }, [search, classFilter, setSearchParams]);

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        fetchStudents(profile.school_id, { search: search || undefined, classId: classFilter || undefined }),
        fetchClasses(profile.school_id),
      ]);
      setStudents(s);
      setClasses(c);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.school_id, search, classFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <DashboardLayout title="Student Tracking">
      <div className="space-y-6">
        <PageHeader title="Student Tracking" description="Search and track student progress across the school" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1 min-w-0">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name, admission number..." />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-[42px] rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)] px-3 pr-8 text-sm text-slate-700 shadow-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:w-52 appearance-none bg-no-repeat"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundPosition: 'right 12px center' }}
          >
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white py-16 text-center">
            <Shield className="h-12 w-12 text-slate-300 mb-3" />
            <p className="font-medium text-slate-600">No students found</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-[#F7F8FE]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Admission No.</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Class</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Section</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-[#F7F8FE]">
                    <td className="px-4 py-3 font-medium text-slate-900">{s.admission_number}</td>
                    <td className="px-4 py-3 text-slate-700">{s.full_name}</td>
                    <td className="px-4 py-3 text-slate-700">{s.class?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{s.section?.name || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => {
                        const params = new URLSearchParams({ from: 'tracking' });
                        if (search) params.set('search', search);
                        if (classFilter) params.set('class', classFilter);
                        navigate(`/admin/students/${s.id}?${params.toString()}`);
                      }}>View Profile</Button>
                    </td>
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
