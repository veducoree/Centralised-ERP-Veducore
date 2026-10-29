import { useEffect, useState, useCallback } from 'react';
import { User, BookOpen, Calendar, MapPin } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { fetchParentByUserId, fetchParentStudents, fetchStudentById } from '@/services/api';
import type { Student } from '@/types';
import { formatDate, getInitials } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';

export default function ParentChild() {
  const { profile } = useAuth();
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [child, setChild] = useState<Student | null>(null);
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
          const c = await fetchStudentById(initialChildId);
          setChild(c);
        }
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadChild = useCallback(async () => {
    if (!selectedChildId) return;
    try {
      const c = await fetchStudentById(selectedChildId);
      setChild(c);
    } catch { /* handled */ }
  }, [selectedChildId]);

  useEffect(() => { loadChild(); }, [loadChild]);

  if (loading) return <DashboardLayout title="My Child"><LoadingSpinner variant="profile" /></DashboardLayout>;

  return (
    <DashboardLayout title="My Child">
      <div className="space-y-6">
        <PageHeader title="My Child" description="View your child's profile information" />

        {children.length > 1 && (
          <Card className="p-4">
            <Select label="Select Child" value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
              {children.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </Card>
        )}

        {child ? (
          <Card className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700 overflow-hidden">
                {child.avatar_url ? (
                  <img src={child.avatar_url} alt={child.full_name} className="h-full w-full rounded-full object-cover" />
                ) : (
                  getInitials(child.full_name)
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{child.full_name}</h2>
                <p className="text-sm text-gray-500">{child.admission_number}</p>
                <div className="mt-1"><StatusBadge status={child.status} /></div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow icon={<BookOpen className="h-4 w-4" />} label="Class" value={child.class?.name || '—'} />
              <InfoRow icon={<BookOpen className="h-4 w-4" />} label="Section" value={child.section?.name || '—'} />
              <InfoRow icon={<Calendar className="h-4 w-4" />} label="Date of Birth" value={formatDate(child.date_of_birth)} />
              <InfoRow icon={<User className="h-4 w-4" />} label="Gender" value={child.gender ? child.gender.charAt(0).toUpperCase() + child.gender.slice(1) : '—'} />
              <InfoRow icon={<Calendar className="h-4 w-4" />} label="Admission Date" value={formatDate(child.admission_date)} />
              <div className="sm:col-span-2"><InfoRow icon={<MapPin className="h-4 w-4" />} label="Address" value={child.address || '—'} /></div>
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-center">
            <User className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-600">No child linked to your account</p>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
      <div className="text-gray-400">{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}
