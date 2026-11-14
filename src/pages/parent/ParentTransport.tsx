import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Bus,
  MapPin,
  Clock,
  Phone,
  UserCheck,
  IndianRupee,
  CheckCircle2,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchSchoolTransportData,
  applyForTransport,
  fetchFees,
} from '@/services/api';
import type {
  Student,
  TransportBus,
  TransportStop,
  StudentTransportAssignment,
  Fee,
} from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ParentTransport() {
  const { profile } = useAuth();
  const toast = useToast();

  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [buses, setBuses] = useState<TransportBus[]>([]);
  const [stops, setStops] = useState<TransportStop[]>([]);
  const [assignments, setAssignments] = useState<Record<string, StudentTransportAssignment>>({});
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);

  // Transport application state
  const [selectedBusFilter, setSelectedBusFilter] = useState<string>('all');
  const [selectedStopId, setSelectedStopId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

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
        setBuses(transportData.buses || []);
        setStops(transportData.stops || []);
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

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const childAssignment = selectedChild ? assignments[selectedChild.id] : undefined;

  useEffect(() => {
    if (childAssignment?.stop_id) {
      setSelectedStopId(childAssignment.stop_id);
    } else if (stops.length > 0 && !selectedStopId) {
      setSelectedStopId(stops[0].id);
    }
  }, [childAssignment?.stop_id, stops, selectedStopId]);

  const filteredStops = useMemo(() => {
    if (selectedBusFilter === 'all') return stops;
    return stops.filter(
      (s) => s.bus_id === selectedBusFilter || s.bus_number === selectedBusFilter
    );
  }, [stops, selectedBusFilter]);

  const selectedStopObj = useMemo(
    () => stops.find((s) => s.id === selectedStopId) || null,
    [stops, selectedStopId]
  );

  async function handleApplyTransport() {
    if (!selectedChild) return;
    if (!selectedStopObj) {
      toast('Please select a bus stop to apply for transport', 'error');
      return;
    }

    const schoolId = profile?.school_id || selectedChild.school_id;
    if (!schoolId) return;

    setSubmitting(true);
    try {
      const payload: StudentTransportAssignment = {
        student_id: selectedChild.id,
        student_name: selectedChild.full_name,
        class_name: selectedChild.class?.name,
        section_name: selectedChild.section?.name,
        bus_id: selectedStopObj.bus_id,
        bus_number: selectedStopObj.bus_number,
        route_name: selectedStopObj.route_name,
        stop_id: selectedStopObj.id,
        stop_name: selectedStopObj.stop_name,
        area_landmark: selectedStopObj.area_landmark,
        amount: selectedStopObj.amount,
        pickup_time: selectedStopObj.pickup_time,
        drop_time: selectedStopObj.drop_time,
        driver_name: selectedStopObj.driver_name,
        driver_phone: selectedStopObj.driver_phone,
        status: 'pending',
        applied_by_parent: true,
        assigned_at: new Date().toISOString(),
      };

      const saved = await applyForTransport(schoolId, payload);
      setAssignments((prev) => ({
        ...prev,
        [selectedChild.id]: saved,
      }));
      toast(
        `Transport application submitted for ${selectedChild.full_name} (${selectedStopObj.stop_name})`,
        'success'
      );
    } catch {
      toast('Failed to submit transport application', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Transport">
        <LoadingSpinner variant="cards" />
      </DashboardLayout>
    );
  }

  const transportFees = fees.filter((f) =>
    f.fee_type.toLowerCase().includes('transport')
  );

  return (
    <DashboardLayout title="Transport">
      <div className="space-y-6">
        <PageHeader
          title="School Transport Application"
          description="Select your preferred bus stop to apply for school transport and view your child's assigned bus details."
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

        {/* ── 1. CURRENT TRANSPORT STATUS FOR SELECTED CHILD ── */}
        {selectedChild && (
          <Card className="overflow-hidden border border-brand-100 p-0">
            <div className="bg-gradient-to-r from-brand-600 to-indigo-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                  <Bus className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold">
                    {selectedChild.full_name}&apos;s Transport Status
                  </h3>
                  <p className="text-xs text-brand-100">
                    {selectedChild.class?.name || 'Class'}{' '}
                    {selectedChild.section?.name ? `· Section ${selectedChild.section.name}` : ''}
                  </p>
                </div>
              </div>
              {childAssignment ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white border ${
                    childAssignment.status === 'pending'
                      ? 'bg-amber-400/25 border-amber-300/40'
                      : 'bg-emerald-400/20 border-emerald-300/40'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {childAssignment.status === 'pending' ? 'Pending Approval' : 'Active'}
                </span>
              ) : (
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-brand-100">
                  Not Applied
                </span>
              )}
            </div>

            <div className="p-5">
              {childAssignment ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 uppercase tracking-wider">
                      <MapPin className="h-4 w-4" />
                      Selected Bus Stop
                    </div>
                    <p className="mt-1.5 text-base font-semibold text-slate-900">
                      {childAssignment.stop_name}
                    </p>
                    {childAssignment.area_landmark && (
                      <p className="text-xs text-brand-600 mt-0.5">
                        Area: {childAssignment.area_landmark}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 uppercase tracking-wider">
                      <Clock className="h-4 w-4" />
                      Bus &amp; Route
                    </div>
                    <p className="mt-1.5 text-base font-semibold text-indigo-900">
                      {childAssignment.bus_number || 'School Bus'}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {childAssignment.route_name ? `Route: ${childAssignment.route_name}` : ''}
                      {childAssignment.pickup_time ? ` · Pickup: ${childAssignment.pickup_time}` : ''}
                    </p>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                      <IndianRupee className="h-4 w-4" />
                      Transport Fare Amount
                    </div>
                    <p className="mt-1.5 text-base font-semibold text-emerald-700">
                      {formatCurrency(childAssignment.amount, '₹')}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <UserCheck className="h-4 w-4" />
                      Driver / Contact
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-slate-900">
                      {childAssignment.driver_name || 'School Transport Desk'}
                    </p>
                    {childAssignment.driver_phone && (
                      <p className="text-xs text-brand-600 font-medium mt-0.5 flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {childAssignment.driver_phone}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm font-semibold text-slate-700">
                    No transport application submitted for {selectedChild.full_name} yet.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Select a bus stop below and click &ldquo;Apply for Transport&rdquo;.
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* ── 2. APPLY FOR SCHOOL TRANSPORT (SELECT BUS STOP) ── */}
        <Card className="p-5 space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {childAssignment ? 'Update Transport Bus Stop' : 'Apply for School Transport'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose your preferred bus stop from the list below and submit your application. It will be sent directly to the school administration.
            </p>
          </div>

          {stops.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">
              No transport stops have been added by the school administrator yet.
            </p>
          ) : (
            <>
              {buses.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBusFilter('all')}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold border transition-all ${
                      selectedBusFilter === 'all'
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                    }`}
                  >
                    All Buses ({stops.length} Stops)
                  </button>
                  {buses.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBusFilter(b.id)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold border transition-all ${
                        selectedBusFilter === b.id
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {b.bus_number} · {b.route_name}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredStops.map((stop, idx) => {
                  const isSelected = selectedStopId === stop.id;
                  const isCurrentApplied = childAssignment?.stop_id === stop.id;

                  return (
                    <button
                      key={stop.id}
                      type="button"
                      onClick={() => setSelectedStopId(stop.id)}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? 'border-brand-600 bg-brand-50/60 ring-2 ring-brand-600/20'
                          : 'border-slate-200 bg-white hover:border-brand-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-slate-900 text-sm truncate">
                              {stop.stop_name}
                            </p>
                            {isCurrentApplied && (
                              <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-slate-500 mt-0.5">
                            {stop.bus_number || 'School Bus'}
                            {stop.route_name ? ` · ${stop.route_name}` : ''}
                            {stop.stop_order ? ` · Stop #${stop.stop_order}` : ` · Stop #${idx + 1}`}
                          </p>
                          {(stop.area_landmark || stop.pickup_time) && (
                            <p className="text-xs text-slate-400 mt-1">
                              {stop.area_landmark ? `${stop.area_landmark}` : ''}
                              {stop.area_landmark && stop.pickup_time ? ' · ' : ''}
                              {stop.pickup_time ? `Pickup: ${stop.pickup_time}` : ''}
                            </p>
                          )}
                        </div>
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700 border border-emerald-200 flex-shrink-0">
                          {formatCurrency(stop.amount, '₹')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Selected Bus Stop</p>
                  <p className="text-sm font-bold text-slate-900">
                    {selectedStopObj
                      ? `${selectedStopObj.stop_name} (${selectedStopObj.bus_number || 'School Bus'}) — ${formatCurrency(selectedStopObj.amount, '₹')}`
                      : 'None selected'}
                  </p>
                </div>
                <Button
                  loading={submitting}
                  onClick={handleApplyTransport}
                  icon={<Bus className="h-4 w-4" />}
                >
                  {childAssignment ? 'Update Transport Application' : 'Apply for Transport'}
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* ── 3. TRANSPORT FEE RECORDS FOR SELECTED CHILD ── */}
        {transportFees.length > 0 && (
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
                    <span className="text-sm font-bold text-slate-900">
                      {formatCurrency(f.amount, '₹')}
                    </span>
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
