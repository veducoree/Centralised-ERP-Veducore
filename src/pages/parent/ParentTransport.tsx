import { useEffect, useState, useCallback } from 'react';
import { Bus, Car, MapPin, Clock, Phone, UserCheck, IndianRupee, CheckCircle2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchSchoolTransportData,
  fetchFees,
} from '@/services/api';
import type { Student, StudentTransportAssignment, Fee } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ParentTransport() {
  const { profile } = useAuth();

  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [assignments, setAssignments] = useState<Record<string, StudentTransportAssignment>>({});
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const parent = await fetchParentByUserId(profile.id);
      let kids: Student[] = [];
      if (parent) {
        const links = await fetchParentStudents(parent.id);
        kids = links.map((l) => l.student).filter(Boolean) as Student[];
        setChildren(kids);
      }

      const schoolId = profile.school_id || kids[0]?.school_id;
      if (schoolId) {
        const transportData = await fetchSchoolTransportData(schoolId);
        setAssignments(transportData.assignments || {});
      }
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.school_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (children.length > 0 && !selectedChildId) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  useEffect(() => {
    if (!selectedChildId) return;
    fetchFees({ studentId: selectedChildId })
      .then((res) => setFees(res))
      .catch(() => {});
  }, [selectedChildId]);

  const vLabel = (t?: string) => (t === 'van' ? 'Van' : 'Bus');
  const per = (p?: string) => `/${(p || 'Monthly').toLowerCase().replace('ly', '')}`;

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const rawAssignment = selectedChild ? assignments[selectedChild.id] : undefined;
  // Only an approved/active assignment counts as "transport taken"
  const transport =
    rawAssignment && (!rawAssignment.status || rawAssignment.status === 'active' || rawAssignment.status === 'approved')
      ? rawAssignment
      : undefined;

  if (loading) {
    return (
      <DashboardLayout title="Transport">
        <LoadingSpinner variant="cards" />
      </DashboardLayout>
    );
  }

  const transportFees = fees.filter((f) => f.fee_type.toLowerCase().includes('transport'));
  const VehicleIcon = transport?.vehicle_type === 'van' ? Car : Bus;

  return (
    <DashboardLayout title="Transport">
      <div className="space-y-6">
        <PageHeader
          title="School Transport"
          description="Your child's school bus or van, stop and driver details."
        />

        {children.length > 1 && (
          <Card className="p-4">
            <Select
              label="Select Child"
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} — {c.class?.name || 'Class'}
                </option>
              ))}
            </Select>
          </Card>
        )}

        {selectedChild && (
          <Card className="overflow-hidden border border-brand-100 p-0">
            <div className="bg-gradient-to-r from-brand-600 to-indigo-600 px-5 py-4 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <VehicleIcon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold truncate">
                    {selectedChild.full_name}&apos;s Transport
                  </h3>
                  <p className="text-xs text-brand-100">
                    {selectedChild.class?.name || 'Class'}{' '}
                    {selectedChild.section?.name ? `· Section ${selectedChild.section.name}` : ''}
                  </p>
                </div>
              </div>
              {transport ? (
                <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {vLabel(transport.vehicle_type)}
                </span>
              ) : (
                <span className="flex-shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-brand-100">
                  No Transport
                </span>
              )}
            </div>

            <div className="p-5">
              {transport ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 uppercase tracking-wider">
                      <VehicleIcon className="h-4 w-4" />
                      {vLabel(transport.vehicle_type)} &amp; Route
                    </div>
                    <p className="mt-1.5 text-base font-semibold text-indigo-900">
                      {vLabel(transport.vehicle_type)} {transport.bus_number || ''}
                    </p>
                    {transport.route_name && (
                      <p className="text-xs text-slate-600 mt-0.5">Route: {transport.route_name}</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 uppercase tracking-wider">
                      <MapPin className="h-4 w-4" />
                      Stop
                    </div>
                    <p className="mt-1.5 text-base font-semibold text-slate-900">{transport.stop_name}</p>
                    {transport.area_landmark && (
                      <p className="text-xs text-brand-600 mt-0.5">Area: {transport.area_landmark}</p>
                    )}
                    {(transport.pickup_time || transport.drop_time) && (
                      <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {transport.pickup_time ? `Pickup: ${transport.pickup_time}` : ''}
                        {transport.pickup_time && transport.drop_time ? ' · ' : ''}
                        {transport.drop_time ? `Drop: ${transport.drop_time}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                      <IndianRupee className="h-4 w-4" />
                      Transport Fare
                    </div>
                    <p className="mt-1.5 text-base font-semibold text-emerald-700">
                      {formatCurrency(transport.amount, '₹')}
                      <span className="text-xs font-normal text-emerald-600">{per(transport.fare_period)}</span>
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <UserCheck className="h-4 w-4" />
                      Driver / Contact
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-slate-900">
                      {transport.driver_name || 'School Transport Desk'}
                    </p>
                    {transport.driver_phone && (
                      <a
                        href={`tel:${transport.driver_phone}`}
                        className="text-xs text-brand-600 font-medium mt-0.5 flex items-center gap-1"
                      >
                        <Phone className="h-3 w-3" />
                        {transport.driver_phone}
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <Bus className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    You have not taken school transport for {selectedChild.full_name}.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Please contact the school office if you want to start transport.
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {transport && transportFees.length > 0 && (
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Transport Fee Status</h3>
            <div className="space-y-2.5">
              {transportFees.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3.5"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{f.fee_type}</p>
                    <p className="text-xs text-slate-400">Due: {formatDate(f.due_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-900">{formatCurrency(f.amount, '₹')}</span>
                    <StatusBadge status={f.status} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
