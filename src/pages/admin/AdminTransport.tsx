import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Bus,
  Plus,
  MapPin,
  IndianRupee,
  Users,
  Trash2,
  Pencil,
  UserPlus,
  CheckCircle2,
  ArrowRight,
  Navigation,
  Phone,
  Clock,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SearchInput, PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchSchoolTransportData,
  saveSchoolTransportData,
  fetchStudents,
  fetchClasses,
  createFee,
} from '@/services/api';
import type {
  TransportBus,
  TransportStop,
  StudentTransportAssignment,
  Student,
  Class,
  Section,
} from '@/types';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';

interface DraftStopInput {
  id?: string;
  stop_name: string;
  area_landmark: string;
  amount: string;
  pickup_time: string;
  drop_time: string;
  distance_km: string;
}

function createEmptyStopRow(): DraftStopInput {
  return {
    stop_name: '',
    area_landmark: '',
    amount: '',
    pickup_time: '',
    drop_time: '',
    distance_km: '',
  };
}

export default function AdminTransport() {
  const { profile } = useAuth();
  const toast = useToast();

  const [buses, setBuses] = useState<TransportBus[]>([]);
  const [stops, setStops] = useState<TransportStop[]>([]);
  const [assignments, setAssignments] = useState<Record<string, StudentTransportAssignment>>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<(Class & { sections?: Section[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Bus + Route + Stops form state (used both for initial onboarding and Add/Edit Bus modal)
  const [busModalOpen, setBusModalOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<TransportBus | null>(null);
  const [busNumber, setBusNumber] = useState('');
  const [routeName, setRouteName] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [stopCountInput, setStopCountInput] = useState('3');
  const [busStopsDraft, setBusStopsDraft] = useState<DraftStopInput[]>([
    createEmptyStopRow(),
    createEmptyStopRow(),
    createEmptyStopRow(),
  ]);
  const [deleteBusId, setDeleteBusId] = useState<string | null>(null);

  // Assign student modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignClassFilter, setAssignClassFilter] = useState('');
  const [assignStudentId, setAssignStudentId] = useState('');
  const [assignBusId, setAssignBusId] = useState('');
  const [assignStopId, setAssignStopId] = useState('');
  const [autoCreateFee, setAutoCreateFee] = useState(true);
  const [assignDueDate, setAssignDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().split('T')[0];
  });
  const [removeStudentId, setRemoveStudentId] = useState<string | null>(null);

  // Filters for enrolled students table
  const [search, setSearch] = useState('');
  const [busFilter, setBusFilter] = useState('');

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [transportData, studentList, classList] = await Promise.all([
        fetchSchoolTransportData(profile.school_id),
        fetchStudents(profile.school_id),
        fetchClasses(profile.school_id),
      ]);
      setBuses(transportData.buses);
      setStops(transportData.stops);
      setAssignments(transportData.assignments);
      setStudents(studentList);
      setClasses(classList);
    } catch {
      toast('Failed to load transport data', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Adjust number of stop rows when "Number of Stops (Kitne Stop Hai)" changes
  function handleStopCountChange(val: string) {
    setStopCountInput(val);
    const num = Math.max(1, Math.min(25, parseInt(val, 10) || 1));
    setBusStopsDraft((prev) => {
      if (num === prev.length) return prev;
      if (num > prev.length) {
        const extra = Array.from({ length: num - prev.length }, () => createEmptyStopRow());
        return [...prev, ...extra];
      }
      return prev.slice(0, num);
    });
  }

  function resetBusForm() {
    setEditingBus(null);
    setBusNumber('');
    setRouteName('');
    setDriverName('');
    setDriverPhone('');
    setStopCountInput('3');
    setBusStopsDraft([
      createEmptyStopRow(),
      createEmptyStopRow(),
      createEmptyStopRow(),
    ]);
  }

  function openAddBusModal() {
    resetBusForm();
    setBusModalOpen(true);
  }

  function openEditBusModal(bus: TransportBus) {
    setEditingBus(bus);
    setBusNumber(bus.bus_number);
    setRouteName(bus.route_name);
    setDriverName(bus.driver_name || '');
    setDriverPhone(bus.driver_phone || '');
    const existingStops = bus.stops && bus.stops.length > 0
      ? bus.stops.map((s) => ({
          id: s.id,
          stop_name: s.stop_name,
          area_landmark: s.area_landmark || '',
          amount: String(s.amount),
          pickup_time: s.pickup_time || '',
          drop_time: s.drop_time || '',
          distance_km: s.distance_km !== undefined ? String(s.distance_km) : '',
        }))
      : [createEmptyStopRow()];
    setStopCountInput(String(existingStops.length));
    setBusStopsDraft(existingStops);
    setBusModalOpen(true);
  }

  async function handleSaveBusAndStops(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.school_id) return;

    const cleanBusNo = busNumber.trim();
    const cleanRoute = routeName.trim();
    if (!cleanBusNo) {
      toast('Please enter the Bus Number', 'error');
      return;
    }
    if (!cleanRoute) {
      toast('Please enter the Route Name', 'error');
      return;
    }

    const validStops = busStopsDraft
      .map((r, idx) => ({
        id: r.id || `stop-${Date.now()}-${idx}`,
        stop_name: r.stop_name.trim(),
        area_landmark: r.area_landmark.trim(),
        amount: Number(r.amount),
        pickup_time: r.pickup_time.trim(),
        drop_time: r.drop_time.trim(),
        distance_km: r.distance_km.trim() ? Number(r.distance_km) : undefined,
      }))
      .filter((r) => r.stop_name && !Number.isNaN(r.amount) && r.amount > 0);

    if (validStops.length === 0) {
      toast('Please enter at least one Stop Name and valid Fare Amount (₹)', 'error');
      return;
    }

    setSaving(true);
    try {
      const busId = editingBus?.id || `bus-${Date.now()}`;
      const now = new Date().toISOString();
      const builtStops: TransportStop[] = validStops.map((st, idx) => ({
        id: st.id,
        bus_id: busId,
        bus_number: cleanBusNo,
        route_name: cleanRoute,
        stop_order: idx + 1,
        stop_name: st.stop_name,
        area_landmark: st.area_landmark || undefined,
        amount: st.amount,
        pickup_time: st.pickup_time || undefined,
        drop_time: st.drop_time || undefined,
        distance_km: st.distance_km,
        driver_name: driverName.trim() || undefined,
        driver_phone: driverPhone.trim() || undefined,
        created_at: now,
      }));

      const newBus: TransportBus = {
        id: busId,
        bus_number: cleanBusNo,
        route_name: cleanRoute,
        driver_name: driverName.trim() || undefined,
        driver_phone: driverPhone.trim() || undefined,
        total_stops: builtStops.length,
        stops: builtStops,
        created_at: editingBus?.created_at || now,
      };

      const updatedBuses = editingBus
        ? buses.map((b) => (b.id === editingBus.id ? newBus : b))
        : [...buses, newBus];

      const allStops = updatedBuses.flatMap((b) => b.stops);
      const stopById = new Map(allStops.map((s) => [s.id, s]));

      // Sync any assigned students whose stop was updated
      const updatedAssignments = { ...assignments };
      Object.keys(updatedAssignments).forEach((stuId) => {
        const matched = stopById.get(updatedAssignments[stuId].stop_id);
        if (matched) {
          updatedAssignments[stuId] = {
            ...updatedAssignments[stuId],
            bus_id: matched.bus_id,
            bus_number: matched.bus_number,
            route_name: matched.route_name,
            stop_name: matched.stop_name,
            area_landmark: matched.area_landmark,
            amount: matched.amount,
            pickup_time: matched.pickup_time,
            drop_time: matched.drop_time,
            driver_name: matched.driver_name,
            driver_phone: matched.driver_phone,
          };
        }
      });

      const saved = await saveSchoolTransportData(profile.school_id, {
        buses: updatedBuses,
        stops: allStops,
        assignments: updatedAssignments,
      });

      setBuses(saved.buses);
      setStops(saved.stops);
      setAssignments(saved.assignments);
      setBusModalOpen(false);
      resetBusForm();
      toast(
        editingBus
          ? `Updated ${cleanBusNo} (${builtStops.length} stops)`
          : `Added ${cleanBusNo} with ${builtStops.length} stops`,
        'success'
      );
    } catch {
      toast('Failed to save bus and stops', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDeleteBus() {
    if (!profile?.school_id || !deleteBusId) return;
    setSaving(true);
    try {
      const busToDelete = buses.find((b) => b.id === deleteBusId);
      const deletedStopIds = new Set((busToDelete?.stops || []).map((s) => s.id));
      const updatedBuses = buses.filter((b) => b.id !== deleteBusId);
      const updatedStops = updatedBuses.flatMap((b) => b.stops);
      const updatedAssignments = { ...assignments };

      Object.keys(updatedAssignments).forEach((stuId) => {
        if (
          updatedAssignments[stuId].bus_id === deleteBusId ||
          deletedStopIds.has(updatedAssignments[stuId].stop_id)
        ) {
          delete updatedAssignments[stuId];
        }
      });

      const saved = await saveSchoolTransportData(profile.school_id, {
        buses: updatedBuses,
        stops: updatedStops,
        assignments: updatedAssignments,
      });

      setBuses(saved.buses);
      setStops(saved.stops);
      setAssignments(saved.assignments);
      setDeleteBusId(null);
      toast('Bus route and its stops removed', 'success');
    } catch {
      toast('Failed to delete bus route', 'error');
    } finally {
      setSaving(false);
    }
  }

  function openAssignModal(preselectStudentId?: string) {
    setAssignClassFilter('');
    setAssignStudentId(preselectStudentId || '');
    const existing = preselectStudentId ? assignments[preselectStudentId] : undefined;
    const defaultBusId = existing?.bus_id || buses[0]?.id || '';
    setAssignBusId(defaultBusId);
    const busObj = buses.find((b) => b.id === defaultBusId) || buses[0];
    setAssignStopId(existing?.stop_id || busObj?.stops[0]?.id || '');
    setAutoCreateFee(!existing);
    setAssignModalOpen(true);
  }

  async function handleAssignStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.school_id) return;
    if (!assignStudentId) {
      toast('Please select a student', 'error');
      return;
    }
    const stop = stops.find((s) => s.id === assignStopId);
    if (!stop) {
      toast('Please select a transport stop', 'error');
      return;
    }

    setSaving(true);
    try {
      const assignment: StudentTransportAssignment = {
        student_id: assignStudentId,
        bus_id: stop.bus_id,
        stop_id: stop.id,
        stop_name: stop.stop_name,
        area_landmark: stop.area_landmark,
        amount: stop.amount,
        route_name: stop.route_name,
        bus_number: stop.bus_number,
        pickup_time: stop.pickup_time,
        drop_time: stop.drop_time,
        driver_name: stop.driver_name,
        driver_phone: stop.driver_phone,
        status: 'active',
        assigned_at: new Date().toISOString(),
      };

      const updatedAssignments = {
        ...assignments,
        [assignStudentId]: assignment,
      };

      await saveSchoolTransportData(profile.school_id, {
        buses,
        stops,
        assignments: updatedAssignments,
      });

      if (autoCreateFee) {
        try {
          await createFee({
            school_id: profile.school_id,
            student_id: assignStudentId,
            fee_type: `Transport Fee (${stop.bus_number || 'Bus'} - ${stop.stop_name})`,
            amount: stop.amount,
            due_date: assignDueDate || new Date().toISOString().split('T')[0],
          });
        } catch {
          // non-fatal
        }
      }

      setAssignments(updatedAssignments);
      setAssignModalOpen(false);
      toast(
        `Assigned to ${stop.bus_number || 'Bus'} · ${stop.stop_name} (${formatCurrency(stop.amount)})`,
        'success'
      );
    } catch {
      toast('Failed to assign student transport', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveApplication(studentId: string) {
    if (!profile?.school_id) return;
    const existing = assignments[studentId];
    if (!existing) return;

    setSaving(true);
    try {
      const approved: StudentTransportAssignment = {
        ...existing,
        status: 'active',
        assigned_at: new Date().toISOString(),
      };
      const updatedAssignments = {
        ...assignments,
        [studentId]: approved,
      };

      await saveSchoolTransportData(profile.school_id, {
        buses,
        stops,
        assignments: updatedAssignments,
      });

      try {
        await createFee({
          school_id: profile.school_id,
          student_id: studentId,
          fee_type: `Transport Fee (${approved.bus_number || 'Bus'} - ${approved.stop_name})`,
          amount: approved.amount,
          due_date: assignDueDate || new Date().toISOString().split('T')[0],
        });
      } catch {
        // non-fatal
      }

      setAssignments(updatedAssignments);
      toast(`Approved transport for ${approved.stop_name} (${formatCurrency(approved.amount)})`, 'success');
    } catch {
      toast('Failed to approve transport application', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmRemoveStudent() {
    if (!profile?.school_id || !removeStudentId) return;
    setSaving(true);
    try {
      const updatedAssignments = { ...assignments };
      delete updatedAssignments[removeStudentId];
      await saveSchoolTransportData(profile.school_id, {
        buses,
        stops,
        assignments: updatedAssignments,
      });
      setAssignments(updatedAssignments);
      setRemoveStudentId(null);
      toast('Student removed from transport', 'success');
    } catch {
      toast('Failed to remove student from transport', 'error');
    } finally {
      setSaving(false);
    }
  }

  const enrolledEntries = useMemo(() => {
    const map = new Map(students.map((s) => [s.id, s]));
    return Object.values(assignments)
      .map((a) => ({
        assignment: a,
        student: map.get(a.student_id),
      }))
      .filter((item): item is { assignment: StudentTransportAssignment; student: Student } =>
        Boolean(item.student)
      );
  }, [assignments, students]);

  const filteredEnrolled = useMemo(() => {
    return enrolledEntries.filter(({ assignment, student }) => {
      if (busFilter && assignment.bus_id !== busFilter && assignment.bus_number !== busFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = student.full_name.toLowerCase().includes(q);
        const matchAdm = student.admission_number.toLowerCase().includes(q);
        const matchStop = assignment.stop_name.toLowerCase().includes(q);
        const matchBus = (assignment.bus_number || '').toLowerCase().includes(q);
        if (!matchName && !matchAdm && !matchStop && !matchBus) return false;
      }
      return true;
    });
  }, [enrolledEntries, busFilter, search]);

  const stopStudentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(assignments).forEach((a) => {
      counts[a.stop_id] = (counts[a.stop_id] || 0) + 1;
    });
    return counts;
  }, [assignments]);

  const totalTransportValue = useMemo(
    () => enrolledEntries.reduce((sum, item) => sum + Number(item.assignment.amount || 0), 0),
    [enrolledEntries]
  );

  const assignableStudents = useMemo(() => {
    if (!assignClassFilter) return students;
    return students.filter((s) => s.class_id === assignClassFilter);
  }, [students, assignClassFilter]);

  const selectedAssignBus = buses.find((b) => b.id === assignBusId) || buses[0];
  const stopsForSelectedBus = selectedAssignBus ? selectedAssignBus.stops : stops;
  const selectedAssignStop = stops.find((s) => s.id === assignStopId);

  // Reusable Bus + Route + Stops Form Body
  const renderBusAndStopsFormFields = () => (
    <div className="space-y-5">
      {/* Bus & Route Primary Info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
        <div className="sm:col-span-4">
          <Input
            label="Bus Number / Vehicle No. *"
            placeholder="e.g. Bus 01 (DL-1PC-4521)"
            value={busNumber}
            onChange={(e) => setBusNumber(e.target.value)}
            required
          />
        </div>
        <div className="sm:col-span-5">
          <Input
            label="Route Name (From – To) *"
            placeholder="e.g. Sector 14 – City Center – School"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            required
          />
        </div>
        <div className="sm:col-span-3">
          <Input
            label="Total Stops *"
            type="number"
            min="1"
            max="25"
            placeholder="e.g. 3"
            value={stopCountInput}
            onChange={(e) => handleStopCountChange(e.target.value)}
            required
          />
        </div>

        <div className="sm:col-span-6">
          <Input
            label="Driver Name (Optional)"
            placeholder="e.g. Rajesh Kumar"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
          />
        </div>
        <div className="sm:col-span-6">
          <Input
            label="Driver Mobile Number (Optional)"
            placeholder="e.g. 9876543210"
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
          />
        </div>
      </div>

      {/* Stops list along this route */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-gray-900">
              Route Stops & Fare Amounts ({busStopsDraft.length}{' '}
              {busStopsDraft.length === 1 ? 'Stop' : 'Stops'})
            </h4>
            <p className="text-xs text-gray-500">
              Enter each stop name, nearby landmark/area (so parents can find nearby stops), pickup timing, and fare amount.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => {
              const next = [...busStopsDraft, createEmptyStopRow()];
              setBusStopsDraft(next);
              setStopCountInput(String(next.length));
            }}
          >
            + Add Stop Row
          </Button>
        </div>

        {busStopsDraft.map((row, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                <MapPin className="h-3 w-3" />
                Stop #{idx + 1}
              </span>
              {busStopsDraft.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = busStopsDraft.filter((_, rIdx) => rIdx !== idx);
                    setBusStopsDraft(next);
                    setStopCountInput(String(next.length));
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <Input
                  label="Stop Name *"
                  placeholder="e.g. Sector 14 Main Gate"
                  value={row.stop_name}
                  onChange={(e) => {
                    const next = [...busStopsDraft];
                    next[idx] = { ...next[idx], stop_name: e.target.value };
                    setBusStopsDraft(next);
                  }}
                  required={idx === 0}
                />
              </div>
              <div className="sm:col-span-4">
                <Input
                  label="Area / Nearby Landmark *"
                  placeholder="e.g. Near Huda Market, Sector 14"
                  value={row.area_landmark}
                  onChange={(e) => {
                    const next = [...busStopsDraft];
                    next[idx] = { ...next[idx], area_landmark: e.target.value };
                    setBusStopsDraft(next);
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Fare Amount (₹) *"
                  type="number"
                  min="1"
                  placeholder="e.g. 1500"
                  value={row.amount}
                  onChange={(e) => {
                    const next = [...busStopsDraft];
                    next[idx] = { ...next[idx], amount: e.target.value };
                    setBusStopsDraft(next);
                  }}
                  required={idx === 0}
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Pickup Time"
                  placeholder="e.g. 07:30 AM"
                  value={row.pickup_time}
                  onChange={(e) => {
                    const next = [...busStopsDraft];
                    next[idx] = { ...next[idx], pickup_time: e.target.value };
                    setBusStopsDraft(next);
                  }}
                />
              </div>
              <div className="sm:col-span-1">
                <Input
                  label="Km"
                  type="number"
                  step="0.1"
                  placeholder="4.5"
                  value={row.distance_km}
                  onChange={(e) => {
                    const next = [...busStopsDraft];
                    next[idx] = { ...next[idx], distance_km: e.target.value };
                    setBusStopsDraft(next);
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout title="Transport">
        <LoadingSpinner />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Transport">
      <div className="space-y-6">
        <PageHeader
          title="School Transport Management"
          description="Configure buses, routes, number of stops, and stop-wise fare amounts. Parents can view all buses and find nearby stops from their app and portal."
          action={
            buses.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={openAddBusModal}
                >
                  Add Bus & Route
                </Button>
                <Button
                  icon={<UserPlus className="h-4 w-4" />}
                  onClick={() => openAssignModal()}
                >
                  Assign Student Transport
                </Button>
              </div>
            ) : undefined
          }
        />

        {/* ── STEP 1 ONBOARDING: WHEN 0 BUSES EXIST, ENTER BUS NUMBER, ROUTE & HOW MANY STOPS FIRST ── */}
        {buses.length === 0 ? (
          <Card className="overflow-hidden border-2 border-blue-100 p-0">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-xs">
                  <Bus className="h-6 w-6 text-white" />
                </div>
                <div>
                  <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
                    Step 1 · Bus & Route Setup
                  </span>
                  <h2 className="mt-0.5 text-lg font-bold">
                    Add School Bus Number, Route & Stops
                  </h2>
                  <p className="text-xs text-blue-100">
                    Enter the Bus Number, Route Name, how many stops are on this route, and each stop&apos;s name, location landmark, and fare amount (₹).
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveBusAndStops} className="p-6 space-y-5">
              {renderBusAndStopsFormFields()}

              <div className="flex justify-end pt-2 border-t border-gray-100">
                <Button
                  type="submit"
                  loading={saving}
                  icon={<ArrowRight className="h-4 w-4" />}
                >
                  Save Bus Route & Activate Transport
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <>
            {/* ── KPI STAT CARDS ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Active Buses & Routes"
                value={buses.length}
                icon={<Bus className="h-5 w-5" />}
                color="blue"
              />
              <StatCard
                label="Total Route Stops"
                value={stops.length}
                icon={<MapPin className="h-5 w-5" />}
                color="amber"
              />
              <StatCard
                label="Students on Transport"
                value={enrolledEntries.length}
                icon={<Users className="h-5 w-5" />}
                color="green"
              />
              <StatCard
                label="Total Transport Billing"
                value={formatCurrency(totalTransportValue)}
                icon={<IndianRupee className="h-5 w-5" />}
                color="purple"
              />
            </div>

            {/* ── SECTION 1: BUSES, ROUTES & THEIR STOPS ── */}
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Bus className="h-5 w-5 text-blue-600" />
                    School Buses, Routes & Stop-wise Fare List
                  </h3>
                  <p className="text-xs text-gray-500">
                    All buses and stops below are visible to parents on the Parent App & Website with nearby stop search.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={openAddBusModal}
                >
                  Add Another Bus
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {buses.map((bus) => {
                  const busStudentsCount = (bus.stops || []).reduce(
                    (acc, st) => acc + (stopStudentCounts[st.id] || 0),
                    0
                  );
                  return (
                    <Card key={bus.id} className="overflow-hidden border border-gray-200 p-0">
                      {/* Bus Header */}
                      <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-slate-900 to-blue-950 px-5 py-4 text-white">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-400/30">
                            <Bus className="h-5 w-5 text-blue-300" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-extrabold text-base text-white">
                                {bus.bus_number}
                              </h4>
                              <span className="rounded-full bg-blue-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-blue-100">
                                {bus.stops.length} {bus.stops.length === 1 ? 'Stop' : 'Stops'}
                              </span>
                            </div>
                            <p className="text-xs text-blue-200 truncate mt-0.5">
                              Route: {bus.route_name}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditBusModal(bus)}
                            className="rounded-lg p-1.5 text-blue-200 hover:bg-white/10 hover:text-white"
                            title="Edit Bus & Stops"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteBusId(bus.id)}
                            className="rounded-lg p-1.5 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                            title="Delete Bus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Driver & Meta Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-5 py-2.5 text-xs text-gray-600 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <span>
                            Driver: <strong>{bus.driver_name || 'Assigned Staff'}</strong>
                          </span>
                          {bus.driver_phone && (
                            <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                              <Phone className="h-3 w-3" />
                              {bus.driver_phone}
                            </span>
                          )}
                        </div>
                        <Badge color={busStudentsCount > 0 ? 'blue' : 'gray'}>
                          {busStudentsCount} {busStudentsCount === 1 ? 'Student' : 'Students'} Enrolled
                        </Badge>
                      </div>

                      {/* Ordered Stops Timeline */}
                      <div className="p-5 space-y-2.5">
                        {bus.stops.map((stop, sIdx) => {
                          const stCount = stopStudentCounts[stop.id] || 0;
                          return (
                            <div
                              key={stop.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-3.5 py-2.5 hover:border-blue-200 transition-colors"
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 border border-blue-200 mt-0.5">
                                  {sIdx + 1}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-gray-900 truncate">
                                    {stop.stop_name}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                                    {stop.area_landmark && (
                                      <span className="inline-flex items-center gap-1 text-gray-600">
                                        <Navigation className="h-3 w-3 text-blue-500" />
                                        {stop.area_landmark}
                                      </span>
                                    )}
                                    {stop.pickup_time && (
                                      <span className="inline-flex items-center gap-1">
                                        <Clock className="h-3 w-3 text-gray-400" />
                                        {stop.pickup_time}
                                      </span>
                                    )}
                                    {stop.distance_km !== undefined && (
                                      <span>· {stop.distance_km} km</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 flex-shrink-0">
                                {stCount > 0 && (
                                  <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                    {stCount} stu
                                  </span>
                                )}
                                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700 border border-emerald-200">
                                  {formatCurrency(stop.amount)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* ── SECTION 2: PARENT APPLICATIONS & ASSIGNED STUDENTS TABLE ── */}
            <Card className="p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    Parent Transport Applications &amp; Assigned Students
                  </h3>
                  <p className="text-xs text-gray-500">
                    When parents select a bus stop and apply for transport from the Parent App or Website, their application appears here.
                  </p>
                </div>
                <Button
                  size="sm"
                  icon={<UserPlus className="h-4 w-4" />}
                  onClick={() => openAssignModal()}
                >
                  Assign Student to Bus Stop
                </Button>
              </div>

              <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search by student, admission no, bus number, or stop..."
                  className="flex-1"
                />
                <div className="w-full sm:w-64">
                  <Select
                    value={busFilter}
                    onChange={(e) => setBusFilter(e.target.value)}
                  >
                    <option value="">All Buses & Routes</option>
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bus_number} — {b.route_name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {filteredEnrolled.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
                  <Bus className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="mt-2 text-sm font-medium text-gray-600">
                    No transport applications or assigned students yet
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Applications submitted by parents from the app or students assigned by admin will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/70 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        <th className="px-4 py-3">Student</th>
                        <th className="px-4 py-3">Class</th>
                        <th className="px-4 py-3">Bus & Route</th>
                        <th className="px-4 py-3">Selected Bus Stop</th>
                        <th className="px-4 py-3">Fare Amount</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Applied / Assigned</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredEnrolled.map(({ student, assignment }) => (
                        <tr key={student.id} className="hover:bg-gray-50/60">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                                {getInitials(student.full_name)}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900">
                                  {student.full_name}
                                </p>
                                <p className="text-xs text-gray-400">
                                  Adm: {student.admission_number}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {student.class?.name || '—'}{' '}
                            {student.section?.name ? `(${student.section.name})` : ''}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 text-xs">
                              {assignment.bus_number || 'School Bus'}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {assignment.route_name || 'Standard Route'}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                              <MapPin className="h-3 w-3" />
                              {assignment.stop_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-emerald-700">
                            {formatCurrency(assignment.amount)}
                          </td>
                          <td className="px-4 py-3">
                            {assignment.status === 'pending' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                                Pending Approval
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {formatDate(assignment.assigned_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {assignment.status === 'pending' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveApplication(student.id)}
                                  loading={saving}
                                >
                                  Approve
                                </Button>
                              )}
                              <button
                                type="button"
                                onClick={() => openAssignModal(student.id)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                title="Change stop"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setRemoveStudentId(student.id)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                title="Remove from transport"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {/* ── MODAL: ADD / EDIT BUS & STOPS ── */}
      <Modal
        open={busModalOpen}
        onClose={() => setBusModalOpen(false)}
        title={editingBus ? `Edit ${editingBus.bus_number} & Route Stops` : 'Add Bus, Route & Stops'}
        size="lg"
      >
        <form onSubmit={handleSaveBusAndStops} className="space-y-4">
          {renderBusAndStopsFormFields()}

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBusModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingBus ? 'Update Bus & Stops' : 'Save Bus & Stops'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: ASSIGN STUDENT TO BUS & STOP ── */}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Assign Student to Bus & Stop"
      >
        <form onSubmit={handleAssignStudent} className="space-y-4">
          <Select
            label="Filter by Class (Optional)"
            value={assignClassFilter}
            onChange={(e) => {
              setAssignClassFilter(e.target.value);
              setAssignStudentId('');
            }}
          >
            <option value="">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select
            label="Select Student *"
            value={assignStudentId}
            onChange={(e) => setAssignStudentId(e.target.value)}
            required
          >
            <option value="">Choose a student...</option>
            {assignableStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.admission_number}) — {s.class?.name || 'Class'}{' '}
                {s.section?.name ? `Sec ${s.section.name}` : ''}
              </option>
            ))}
          </Select>

          <Select
            label="Select Bus & Route *"
            value={assignBusId}
            onChange={(e) => {
              const newBusId = e.target.value;
              setAssignBusId(newBusId);
              const foundBus = buses.find((b) => b.id === newBusId);
              setAssignStopId(foundBus?.stops[0]?.id || '');
            }}
            required
          >
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bus_number} — {b.route_name} ({b.stops.length} stops)
              </option>
            ))}
          </Select>

          <Select
            label="Select Bus Stop *"
            value={assignStopId}
            onChange={(e) => setAssignStopId(e.target.value)}
            required
          >
            <option value="">Choose a stop...</option>
            {stopsForSelectedBus.map((st, idx) => (
              <option key={st.id} value={st.id}>
                Stop #{idx + 1}: {st.stop_name} — {formatCurrency(st.amount)}
                {st.area_landmark ? ` (${st.area_landmark})` : ''}
              </option>
            ))}
          </Select>

          {selectedAssignStop && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-900">
                    {selectedAssignStop.bus_number} · {selectedAssignStop.stop_name}
                  </p>
                  <p className="text-[11px] text-blue-700">
                    {selectedAssignStop.area_landmark || selectedAssignStop.route_name || 'School Route'}
                    {selectedAssignStop.pickup_time ? ` · Pickup: ${selectedAssignStop.pickup_time}` : ''}
                  </p>
                </div>
              </div>
              <span className="text-base font-extrabold text-blue-900">
                {formatCurrency(selectedAssignStop.amount)}
              </span>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoCreateFee}
                onChange={(e) => setAutoCreateFee(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-xs font-semibold text-gray-800">
                  Also add Transport Fee ({selectedAssignStop ? formatCurrency(selectedAssignStop.amount) : '₹0'}) to Student&apos;s Fee Records
                </p>
                <p className="text-[11px] text-gray-500">
                  Automatically creates a transport fee invoice so parents can pay it Monthly, Quarterly, or Annually.
                </p>
              </div>
            </label>

            {autoCreateFee && (
              <Input
                label="Transport Fee Due Date"
                type="date"
                value={assignDueDate}
                onChange={(e) => setAssignDueDate(e.target.value)}
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssignModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Assignment
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── CONFIRM DELETE BUS ── */}
      <ConfirmDialog
        open={Boolean(deleteBusId)}
        onClose={() => setDeleteBusId(null)}
        onConfirm={handleConfirmDeleteBus}
        title="Delete Bus & Route"
        message="Are you sure you want to delete this bus and all stops on its route? Students assigned to this bus will be unassigned."
        loading={saving}
      />

      {/* ── CONFIRM REMOVE STUDENT ── */}
      <ConfirmDialog
        open={Boolean(removeStudentId)}
        onClose={() => setRemoveStudentId(null)}
        onConfirm={handleConfirmRemoveStudent}
        title="Remove Student from Transport"
        message="Are you sure you want to remove this student from school transport?"
        loading={saving}
      />
    </DashboardLayout>
  );
}
