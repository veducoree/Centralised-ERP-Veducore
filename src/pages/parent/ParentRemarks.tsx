import { useEffect, useState, useCallback } from 'react';
import { Megaphone } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { fetchParentByUserId, fetchParentStudents, fetchRemarks } from '@/services/api';
import type { Student, Remark } from '@/types';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

export default function ParentRemarks() {
  const { profile } = useAuth();
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [remarks, setRemarks] = useState<Remark[]>([]);
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
          const r = await fetchRemarks({ studentId: initialChildId });
          setRemarks(r);
        }
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadRemarks = useCallback(async () => {
    if (!selectedChildId) return;
    try {
      const r = await fetchRemarks({ studentId: selectedChildId });
      setRemarks(r);
    } catch { /* handled */ }
  }, [selectedChildId]);

  useEffect(() => { loadRemarks(); }, [loadRemarks]);

  if (loading) return <DashboardLayout title="Remarks"><LoadingSpinner variant="cards" /></DashboardLayout>;

  return (
    <DashboardLayout title="Remarks">
      <div className="space-y-6">
        <PageHeader title="Remarks" description="View remarks from teachers about your child" />

        {children.length > 1 && (
          <Card className="p-4">
            <Select label="Select Child" value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
              {children.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </Card>
        )}

        {remarks.length === 0 ? (
          <Card className="p-8 text-center">
            <Megaphone className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No remarks available</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {remarks.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <Megaphone className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="info">{r.category}</Badge>
                      <span className="text-xs text-gray-400">{formatDate(r.created_at)}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-gray-700">{r.remark}</p>
                    {r.teacher && <p className="mt-1 text-xs text-gray-400">By {r.teacher.full_name}</p>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
