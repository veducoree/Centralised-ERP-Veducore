import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Bus, Plus, MapPin, IndianRupee, Users, Trash2, Pencil,
  UserPlus, CheckCircle2, ArrowRight, Navigation, Phone,
  Clock, AlertTriangle,
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
  fetchTransportAll,
  saveTransportBus,
  deleteTransportBusWithStops,
  createOrUpdateAssignment,
  updateAssignmentStatus,
  deleteAssignment,
  fetchStudents,
  fetchClasses,
  createFee,
  createNotification,
} from '@/services/api';
import type {
  TransportBus,
  TransportStop,
  StudentTransportAssignment,
  TransportFareSnapshot,
  Student,
  Class,
  Section,
} from '@/types';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
const FARE_PERIODS = ['Monthly', 'Quarterly', 'Yearly'] as const;
type FarePeriod = typeof FARE_PERIODS[number];

const BUS_STATUSES = ['active', 'maintenance', 'inactive'] as const;
const busStatusLabel: Record<string, string> = {
  active: 'Active', maintenance: 'Maintenance', inactive: 'Inactive',
};

interface DraftStop {
  id?: string;          // present when editing an existing stop
  stop_name: string;
  area_landmark: string;
  amount: string;
  fare_period: FarePeriod;
  pickup_time: string;
  drop_time: string;
  distance_km: string;
}

const emptyStop = (): DraftStop => ({
  stop_name: '', area_landmark: '', amount: '',
  fare_period: 'Monthly', pickup_time: '', drop_time: '', distance_km: '',
});

// ─────────────────────────────────────────────────────────────
export default function AdminTransport() {
  const { profile } = useAuth();
  const toast = useToast();

  // ── Core data ────────────────────────────────────────────
  const [buses, setBuses]           = useState<TransportBus[]>([]);
  const [stops, setStops]           = useState<TransportStop[]>([]);
  const [assignments, setAssignments] = useState<StudentTransportAssignment[]>([]);
  const [students, setStudents]     = useState<Student[]>([]);
  const [classes, setClasses]       = useState<(Class & { sections?: Section[] })[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  // ── Bus form ─────────────────────────────────────────────
  const [busModalOpen, setBusModalOpen]   = useState(false);
  const [editingBus, setEditingBus]       = useState<TransportBus | null>(null);
  const [busNumber, setBusNumber]         = useState('');
  const [routeName, setRouteName]         = useState('');
  const [busCapacity, setBusCapacity]     = useState('40');
  const [driverName, setDriverName]       = useState('');
  const [driverPhone, setDriverPhone]     = useState('');
  const [conductorName, setConductorName] = useState('');
  const [conductorPhone, setConductorPhone] = useState('');
  const [busStatus, setBusStatus]         = useState('active');
  const [stopsDraft, setStopsDraft]       = useState<DraftStop[]>([emptyStop(), emptyStop(), emptyStop()]);
  const [deleteBusId, setDeleteBusId]     = useState<string | null>(null);

  // ── Assign modal ─────────────────────────────────────────
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<StudentTransportAssignment | null>(null);
  const [assignClassFilter, setAssignClassFilter] = useState('');
  const [assignStudentId, setAssignStudentId]     = useState('');
  const [assignBusId, setAssignBusId]             = useState('');
  const [assignStopId, setAssignStopId]           = useState('');
  const [assignStartDate, setAssignStartDate]     = useState(() => new Date().toISOString().split('T')[0]);
  const [autoCreateFee, setAutoCreateFee]         = useState(true);
  const [assignDueDate, setAssignDueDate]         = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 10); return d.toISOString().split('T')[0];
  });

  // ── Reject modal ─────────────────────────────────────────
  const [rejectAssignmentId, setRejectAssignmentId] = useState<string | null>(null);
  const [rejectReason, setRejectReason]             = useState('');

  // ── Stop transport modal ──────────────────────────────────
  const [stopAssignmentId, setStopAssignmentId] = useState<string | null>(null);

  // ── Table filters ─────────────────────────────────────────
  const [search, setSearch]           = useState('');
  const [busFilter, setBusFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ── Load all data from DB ─────────────────────────────────
  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [transport, studentList, classList] = await Promise.all([
        fetchTransportAll(profile.school_id),
        fetchStudents(profile.school_id),
        fetchClasses(profile.school_id),
      ]);
      setBuses(transport.buses);
      setStops(transport.stops);
      setAssignments(transport.assignments);
      setStudents(studentList);
      setClasses(classList);
    } catch {
      toast('Failed to load transport data', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Bus form helpers ──────────────────────────────────────
  function resetBusForm() {
    setEditingBus(null);
    setBusNumber(''); setRouteName(''); setBusCapacity('40');
    setDriverName(''); setDriverPhone('');
    setConductorName(''); setConductorPhone('');
    setBusStatus('active');
    setStopsDraft([emptyStop(), emptyStop(), emptyStop()]);
  }

  function openAddBus() { resetBusForm(); setBusModalOpen(true); }

  function openEditBus(bus: TransportBus) {
    setEditingBus(bus);
    setBusNumber(bus.bus_number);
    setRouteName(bus.route_name);
    setBusCapacity(String(bus.capacity ?? 40));
    setDriverName(bus.driver_name || '');
    setDriverPhone(bus.driver_phone || '');
    setConductorName(bus.conductor_name || '');
    setConductorPhone(bus.conductor_phone || '');
    setBusStatus(bus.status || 'active');
    setStopsDraft(
      bus.stops?.length > 0
        ? bus.stops.map((s) => ({
            id: s.id,
            stop_name: s.stop_name,
            area_landmark: s.area_landmark || '',
            amount: String(s.amount),
            fare_period: (s.fare_period as FarePeriod) || 'Monthly',
            pickup_time: s.pickup_time || '',
            drop_time: s.drop_time || '',
            distance_km: s.distance_km !== undefined ? String(s.distance_km) : '',
          }))
        : [emptyStop()]
    );
    setBusModalOpen(true);
  }

  async function handleSaveBus(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.school_id) return;
    const cleanBusNo = busNumber.trim();
    const cleanRoute = routeName.trim();
    if (!cleanBusNo) { toast('Bus Number is required', 'error'); return; }
    if (!cleanRoute) { toast('Route Name is required', 'error'); return; }

    const validStops = stopsDraft
      .map((r, idx) => ({
        ...(r.id ? { id: r.id } : {}),
        stop_name: r.stop_name.trim(),
        area_landmark: r.area_landmark.trim() || undefined,
        amount: Number(r.amount),
        fare_period: r.fare_period || 'Monthly',
        pickup_time: r.pickup_time.trim() || undefined,
        drop_time: r.drop_time.trim() || undefined,
        distance_km: r.distance_km.trim() ? Number(r.distance_km) : undefined,
        stop_order: idx + 1,
      }))
      .filter((r) => r.stop_name && !isNaN(r.amount) && r.amount > 0);

    if (validStops.length === 0) {
      toast('At least one valid stop with a fare amount is required', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveTransportBus(
        profile.school_id,
        {
          ...(editingBus ? { id: editingBus.id } : {}),
          bus_number: cleanBusNo,
          route_name: cleanRoute,
          capacity: parseInt(busCapacity, 10) || 40,
          driver_name: driverName.trim() || undefined,
          driver_phone: driverPhone.trim() || undefined,
          conductor_name: conductorName.trim() || undefined,
          conductor_phone: conductorPhone.trim() || undefined,
          status: busStatus,
        },
        validStops
      );
      await loadData();
      setBusModalOpen(false);
      resetBusForm();
      toast(editingBus ? `Updated ${cleanBusNo}` : `Added ${cleanBusNo} with ${validStops.length} stops`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save bus', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDeleteBus() {
    if (!deleteBusId) return;
    // Check if any active assignments exist on this bus's stops
    const busStopIds = new Set(
      stops.filter((s) => s.bus_id === deleteBusId).map((s) => s.id)
    );
    const hasActive = assignments.some(
      (a) => busStopIds.has(a.stop_id) &&
             (a.status === 'active' || a.status === 'approved' || a.status === 'pending')
    );
    if (hasActive) {
      toast('This bus has active student assignments. Stop or remove them first.', 'error');
      setDeleteBusId(null);
      return;
    }
    setSaving(true);
    try {
      await deleteTransportBusWithStops(deleteBusId);
      await loadData();
      setDeleteBusId(null);
      toast('Bus and all its stops deleted', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete bus', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Assign student ────────────────────────────────────────
  function openAssignModal(assignment?: StudentTransportAssignment) {
    setEditingAssignment(assignment || null);
    setAssignClassFilter('');
    setAssignStudentId(assignment?.student_id || '');
    const defaultBusId = assignment?.bus_id || buses[0]?.id || '';
    setAssignBusId(defaultBusId);
    const busObj = buses.find((b) => b.id === defaultBusId) || buses[0];
    setAssignStopId(assignment?.stop_id || busObj?.stops[0]?.id || '');
    setAssignStartDate(new Date().toISOString().split('T')[0]);
    setAutoCreateFee(!assignment);
    setAssignModalOpen(true);
  }

  async function handleAssignStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.school_id) return;
    if (!assignStudentId) { toast('Please select a student', 'error'); return; }
    const stop = stops.find((s) => s.id === assignStopId);
    if (!stop) { toast('Please select a stop', 'error'); return; }
    const bus  = buses.find((b) => b.id === assignBusId) || buses.find((b) => b.id === stop.bus_id);

    setSaving(true);
    try {
      const fareSnapshot: TransportFareSnapshot = {
        amount: stop.amount,
        fare_period: (stop.fare_period as FarePeriod) || 'Monthly',
        stop_name: stop.stop_name,
        bus_number: bus?.bus_number,
        route_name: bus?.route_name,
      };

      const saved = await createOrUpdateAssignment({
        ...(editingAssignment?.id ? { id: editingAssignment.id } : {}),
        school_id: profile.school_id,
        student_id: assignStudentId,
        bus_id: stop.bus_id || assignBusId,
        stop_id: stop.id,
        start_date: assignStartDate,
        status: 'approved',
        applied_by_parent: false,
        fare_snapshot: fareSnapshot,
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      });

      // Create fee record if requested
      if (autoCreateFee) {
        try {
          const fee = await createFee({
            school_id: profile.school_id,
            student_id: assignStudentId,
            fee_type: `Transport Fee (${bus?.bus_number || 'Bus'} - ${stop.stop_name})`,
            amount: stop.amount,
            due_date: assignDueDate || new Date().toISOString().split('T')[0],
          });
          // Link fee to assignment
          if (fee?.id && saved?.id) {
            await updateAssignmentStatus(saved.id, { status: 'approved', fee_id: fee.id });
          }
        } catch { /* non-fatal */ }
      }

      await loadData();
      setAssignModalOpen(false);
      toast(`Assigned ${stop.stop_name} (${formatCurrency(stop.amount)}/${(stop.fare_period || 'month').toLowerCase()})`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to assign transport', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Approve ────────────────────────────────────────────────
  async function handleApprove(assignment: StudentTransportAssignment) {
    if (!profile?.school_id || !assignment.id) return;

    // Capacity check
    const bus = buses.find((b) => b.id === assignment.bus_id);
    if (bus?.capacity) {
      const approvedCount = assignments.filter(
        (a) => a.bus_id === bus.id && (a.status === 'active' || a.status === 'approved')
      ).length;
      if (approvedCount >= bus.capacity) {
        toast(`Bus ${bus.bus_number} is full (${bus.capacity} seats). Cannot approve more students.`, 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const stop = stops.find((s) => s.id === assignment.stop_id);
      const fareSnapshot: TransportFareSnapshot = {
        amount: stop?.amount ?? assignment.amount,
        fare_period: (stop?.fare_period as FarePeriod) || assignment.fare_period || 'Monthly',
        stop_name: stop?.stop_name ?? assignment.stop_name,
        bus_number: bus?.bus_number ?? assignment.bus_number,
        route_name: bus?.route_name ?? assignment.route_name,
      };

      // Create fee record
      let feeId: string | undefined;
      try {
        const fee = await createFee({
          school_id: profile.school_id,
          student_id: assignment.student_id,
          fee_type: `Transport Fee (${fareSnapshot.bus_number || 'Bus'} - ${fareSnapshot.stop_name})`,
          amount: fareSnapshot.amount,
          due_date: new Date().toISOString().split('T')[0],
        });
        feeId = fee?.id;
      } catch { /* non-fatal */ }

      await updateAssignmentStatus(assignment.id, {
        status: 'approved',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        fare_snapshot: fareSnapshot,
        ...(feeId ? { fee_id: feeId } : {}),
      });

      // Notify parent
      try {
        await createNotification({
          school_id: profile.school_id,
          title: 'Transport Application Approved',
          message: `Your transport application for ${fareSnapshot.stop_name} (${formatCurrency(fareSnapshot.amount)}/${fareSnapshot.fare_period.toLowerCase()}) has been approved.`,
          type: 'success',
        });
      } catch { /* non-fatal */ }

      await loadData();
      toast(`Approved transport for ${fareSnapshot.stop_name}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to approve', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Reject ─────────────────────────────────────────────────
  async function handleConfirmReject() {
    if (!profile?.school_id || !rejectAssignmentId) return;
    if (!rejectReason.trim()) { toast('Please enter a rejection reason', 'error'); return; }
    const assignment = assignments.find((a) => a.id === rejectAssignmentId);
    setSaving(true);
    try {
      await updateAssignmentStatus(rejectAssignmentId, {
        status: 'rejected',
        reject_reason: rejectReason.trim(),
      });

      try {
        await createNotification({
          school_id: profile.school_id,
          title: 'Transport Application Not Approved',
          message: `Your transport application for ${assignment?.stop_name || 'stop'} could not be approved. Reason: ${rejectReason.trim()}`,
          type: 'warning',
        });
      } catch { /* non-fatal */ }

      await loadData();
      setRejectAssignmentId(null);
      setRejectReason('');
      toast('Application rejected and parent notified', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to reject', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Stop transport ─────────────────────────────────────────
  async function handleConfirmStopTransport() {
    if (!stopAssignmentId) return;
    setSaving(true);
    try {
      await updateAssignmentStatus(stopAssignmentId, {
        status: 'stopped',
        end_date: new Date().toISOString().split('T')[0],
      });
      await loadData();
      setStopAssignmentId(null);
      toast('Transport stopped for student', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to stop transport', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete assignment ──────────────────────────────────────
  async function handleDeleteAssignment(assignmentId: string) {
    setSaving(true);
    try {
      await deleteAssignment(assignmentId);
      await loadData();
      toast('Assignment removed', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove assignment', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Derived / memoised state ──────────────────────────────
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const enrolledEntries = useMemo(() =>
    assignments
      .map((a) => ({ assignment: a, student: studentMap.get(a.student_id) }))
      .filter((e): e is { assignment: StudentTransportAssignment; student: Student } => Boolean(e.student)),
    [assignments, studentMap]
  );

  const filteredEnrolled = useMemo(() => {
    return enrolledEntries.filter(({ assignment, student }) => {
      if (busFilter && assignment.bus_id !== busFilter) return false;
      if (statusFilter && assignment.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          student.full_name.toLowerCase().includes(q) ||
          student.admission_number.toLowerCase().includes(q) ||
          (assignment.stop_name || '').toLowerCase().includes(q) ||
          (assignment.bus_number || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [enrolledEntries, busFilter, statusFilter, search]);

  const stopStudentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assignments
      .filter((a) => a.status === 'active' || a.status === 'approved')
      .forEach((a) => { counts[a.stop_id] = (counts[a.stop_id] || 0) + 1; });
    return counts;
  }, [assignments]);

  const activeCount  = useMemo(() => assignments.filter((a) => a.status === 'active' || a.status === 'approved').length, [assignments]);
  const pendingCount = useMemo(() => assignments.filter((a) => a.status === 'pending').length, [assignments]);
  const totalBilling = useMemo(() =>
    assignments
      .filter((a) => a.status === 'active' || a.status === 'approved')
      .reduce((sum, a) => sum + Number(a.fare_snapshot?.amount ?? a.amount ?? 0), 0),
    [assignments]
  );

  const assignableStudents = useMemo(() =>
    assignClassFilter ? students.filter((s) => s.class_id === assignClassFilter) : students,
    [students, assignClassFilter]
  );

  const selectedBusForAssign = buses.find((b) => b.id === assignBusId) || buses[0];
  const stopsForAssignBus    = selectedBusForAssign?.stops ?? [];
  const selectedAssignStop   = stops.find((s) => s.id === assignStopId);

  // ─────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────
  function StatusPill({ status }: { status?: string }) {
    const map: Record<string, { label: string; cls: string }> = {
      pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-800' },
      active:   { label: 'Active',   cls: 'bg-emerald-100 text-emerald-800' },
      approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800' },
      rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
      stopped:  { label: 'Stopped',  cls: 'bg-slate-100 text-slate-600' },
    };
    const s = map[status || 'active'] ?? map['active'];
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>
        {s.label}
      </span>
    );
  }

  const renderStopFormFields = () => (
    <div className="space-y-5">
      {/* Bus info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
        <div className="sm:col-span-4">
          <Input label="Bus Number *" placeholder="e.g. UP50BS353"
            value={busNumber} onChange={(e) => setBusNumber(e.target.value.toUpperCase())} required />
        </div>
        <div className="sm:col-span-5">
          <Input label="Route Name *" placeholder="e.g. Sector 14 → School"
            value={routeName} onChange={(e) => setRouteName(e.target.value)} required />
        </div>
        <div className="sm:col-span-3">
          <Input label="Seat Capacity *" type="number" min="1" max="80"
            value={busCapacity} onChange={(e) => setBusCapacity(e.target.value)} required />
        </div>
        <div className="sm:col-span-6">
          <Input label="Driver Name" placeholder="e.g. Rajesh Kumar"
            value={driverName} onChange={(e) => setDriverName(e.target.value)} />
        </div>
        <div className="sm:col-span-6">
          <Input label="Driver Mobile" placeholder="e.g. 9876543210"
            value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
        </div>
        <div className="sm:col-span-6">
          <Input label="Conductor Name (optional)" placeholder="e.g. Meena Devi"
            value={conductorName} onChange={(e) => setConductorName(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <Input label="Conductor Mobile" placeholder="optional"
            value={conductorPhone} onChange={(e) => setConductorPhone(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <Select label="Bus Status" value={busStatus} onChange={(e) => setBusStatus(e.target.value)}>
            {BUS_STATUSES.map((s) => <option key={s} value={s}>{busStatusLabel[s]}</option>)}
          </Select>
        </div>
      </div>

      {/* Stops */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Stops &amp; Fares ({stopsDraft.length})
            </h4>
            <p className="text-xs text-slate-500">Each stop has its own fare and billing period.</p>
          </div>
          <Button type="button" size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setStopsDraft((p) => [...p, emptyStop()])}>
            Add Stop
          </Button>
        </div>

        {stopsDraft.map((row, idx) => (
          <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800">
                <MapPin className="h-3 w-3" /> Stop #{idx + 1}
              </span>
              {stopsDraft.length > 1 && (
                <button type="button"
                  onClick={() => setStopsDraft((p) => p.filter((_, i) => i !== idx))}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <Input label="Stop Name *" placeholder="e.g. Sector 14 Gate"
                  value={row.stop_name}
                  onChange={(e) => setStopsDraft((p) => p.map((r, i) => i === idx ? { ...r, stop_name: e.target.value } : r))}
                  required={idx === 0} />
              </div>
              <div className="sm:col-span-3">
                <Input label="Area / Landmark" placeholder="e.g. Near Huda Market"
                  value={row.area_landmark}
                  onChange={(e) => setStopsDraft((p) => p.map((r, i) => i === idx ? { ...r, area_landmark: e.target.value } : r))} />
              </div>
              <div className="sm:col-span-2">
                <Input label="Fare (₹) *" type="number" min="1" placeholder="1500"
                  value={row.amount}
                  onChange={(e) => setStopsDraft((p) => p.map((r, i) => i === idx ? { ...r, amount: e.target.value } : r))}
                  required={idx === 0} />
              </div>
              <div className="sm:col-span-2">
                <Select label="Period"
                  value={row.fare_period}
                  onChange={(e) => setStopsDraft((p) => p.map((r, i) => i === idx ? { ...r, fare_period: e.target.value as FarePeriod } : r))}>
                  {FARE_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-1">
                <Input label="Pickup" placeholder="07:30"
                  value={row.pickup_time}
                  onChange={(e) => setStopsDraft((p) => p.map((r, i) => i === idx ? { ...r, pickup_time: e.target.value } : r))} />
              </div>
              <div className="sm:col-span-1">
                <Input label="Drop" placeholder="14:30"
                  value={row.drop_time}
                  onChange={(e) => setStopsDraft((p) => p.map((r, i) => i === idx ? { ...r, drop_time: e.target.value } : r))} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) return <DashboardLayout title="Transport"><LoadingSpinner /></DashboardLayout>;

  // ─────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Transport">
      <div className="space-y-6">
        <PageHeader
          title="School Transport Management"
          description="Manage buses, routes, stop-wise fares and student assignments. All data is stored in the database."
          action={buses.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={openAddBus}>
                Add Bus & Route
              </Button>
              <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => openAssignModal()}>
                Assign Student
              </Button>
            </div>
          ) : undefined}
        />

        {/* ── Onboarding ── */}
        {buses.length === 0 ? (
          <Card className="overflow-hidden border border-slate-200 p-0">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#EEF0FD]">
                  <Bus className="h-5 w-5 text-[#5B6EE8]" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6EE8]">Step 1 · Setup</span>
                  <h2 className="text-[15px] font-semibold text-slate-900">Add your first Bus, Route & Stops</h2>
                </div>
              </div>
            </div>
            <form onSubmit={handleSaveBus} className="p-6 space-y-5">
              {renderStopFormFields()}
              <div className="flex justify-end pt-2 border-t border-slate-100">
                <Button type="submit" loading={saving} icon={<ArrowRight className="h-4 w-4" />}>
                  Save & Activate Transport
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <>
            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Active Buses & Routes" value={buses.length}
                icon={<Bus className="h-5 w-5" />} color="blue" />
              <StatCard label="Total Route Stops" value={stops.length}
                icon={<MapPin className="h-5 w-5" />} color="amber" />
              <StatCard label="Students on Transport" value={activeCount}
                icon={<Users className="h-5 w-5" />} color="emerald"
                trend={pendingCount > 0 ? `${pendingCount} pending approval` : undefined} />
              <StatCard label="Total Transport Billing" value={formatCurrency(totalBilling)}
                icon={<IndianRupee className="h-5 w-5" />} color="violet" />
            </div>

            {/* ── Buses & Stops ── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Bus className="h-5 w-5 text-brand-600" /> Buses, Routes & Stops
                </h3>
                <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={openAddBus}>
                  Add Bus
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {buses.map((bus) => {
                  const busStudents = stops
                    .filter((s) => s.bus_id === bus.id)
                    .reduce((acc, s) => acc + (stopStudentCounts[s.id] || 0), 0);
                  const capacity = bus.capacity ?? 40;

                  return (
                    <Card key={bus.id} className="overflow-hidden border border-slate-200 p-0">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-[#F8F9FF] px-5 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#EEF0FD]">
                            <Bus className="h-4 w-4 text-[#5B6EE8]" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold text-sm text-slate-900">{bus.bus_number}</h4>
                              <span className="rounded-full bg-[#EEF0FD] px-2.5 py-0.5 text-[11px] font-semibold text-[#5B6EE8]">
                                {bus.stops.length} stops
                              </span>
                              {bus.status && bus.status !== 'active' && (
                                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 capitalize">
                                  {bus.status}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 truncate mt-0.5">{bus.route_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => openEditBus(bus)}
                            className="rounded-[10px] p-1.5 text-slate-400 hover:bg-[#EEF0FD] hover:text-[#5B6EE8] transition-colors" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleteBusId(bus.id)}
                            className="rounded-[10px] p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Driver bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-5 py-2.5 text-xs text-slate-600 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <span>Driver: <strong>{bus.driver_name || 'Not assigned'}</strong></span>
                          {bus.driver_phone && (
                            <span className="inline-flex items-center gap-1 text-brand-600 font-medium">
                              <Phone className="h-3 w-3" />{bus.driver_phone}
                            </span>
                          )}
                        </div>
                        <Badge color={busStudents >= capacity ? 'red' : busStudents > 0 ? 'blue' : 'gray'}>
                          {busStudents} / {capacity} seats
                        </Badge>
                      </div>

                      {/* Stops */}
                      <div className="p-5 space-y-2.5">
                        {bus.stops.map((stop, sIdx) => (
                          <div key={stop.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-2.5 hover:border-brand-200 transition-colors">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 border border-brand-200 mt-0.5">
                                {sIdx + 1}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate">{stop.stop_name}</p>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                  {stop.area_landmark && (
                                    <span className="inline-flex items-center gap-1">
                                      <Navigation className="h-3 w-3 text-brand-500" />{stop.area_landmark}
                                    </span>
                                  )}
                                  {stop.pickup_time && (
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="h-3 w-3 text-slate-400" />↑ {stop.pickup_time}
                                    </span>
                                  )}
                                  {stop.drop_time && (
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="h-3 w-3 text-slate-400" />↓ {stop.drop_time}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {stopStudentCounts[stop.id] > 0 && (
                                <span className="text-[11px] font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                                  {stopStudentCounts[stop.id]} stu
                                </span>
                              )}
                              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                                {formatCurrency(stop.amount)} / {(stop.fare_period || 'month').toLowerCase()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* ── Assignments Table ── */}
            <Card className="p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Users className="h-4 w-4 text-brand-600" /> Parent Applications &amp; Assigned Students
                  </h3>
                  <p className="text-xs text-slate-500">
                    All assignments are stored in the database. Approve or reject pending ones.
                  </p>
                </div>
                <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => openAssignModal()}>
                  Assign Student
                </Button>
              </div>

              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1 min-w-0">
                  <SearchInput value={search} onChange={setSearch} placeholder="Search student, bus, stop..." />
                </div>
                <div className="w-full sm:w-52">
                  <Select value={busFilter} onChange={(e) => setBusFilter(e.target.value)}>
                    <option value="">All Buses</option>
                    {buses.map((b) => <option key={b.id} value={b.id}>{b.bus_number} — {b.route_name}</option>)}
                  </Select>
                </div>
                <div className="w-full sm:w-36">
                  <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="active">Active</option>
                    <option value="rejected">Rejected</option>
                    <option value="stopped">Stopped</option>
                  </Select>
                </div>
              </div>

              {filteredEnrolled.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
                  <Bus className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-600">No transport records found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Student</th>
                        <th className="px-4 py-3">Class</th>
                        <th className="px-4 py-3">Bus & Route</th>
                        <th className="px-4 py-3">Stop</th>
                        <th className="px-4 py-3">Fare</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEnrolled.map(({ student, assignment }) => (
                        <tr key={assignment.id || assignment.student_id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                                {getInitials(student.full_name)}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{student.full_name}</p>
                                <p className="text-xs text-slate-400">{student.admission_number}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-sm">
                            {student.class?.name || '—'}{student.section?.name ? ` (${student.section.name})` : ''}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900 text-xs">{assignment.bus_number || 'Bus'}</p>
                            <p className="text-[11px] text-slate-400">{assignment.route_name || '—'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                              <MapPin className="h-3 w-3" />{assignment.stop_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-emerald-700 text-sm">
                            {formatCurrency(assignment.fare_snapshot?.amount ?? assignment.amount)}
                            <span className="block text-[10px] font-normal text-slate-400">
                              / {(assignment.fare_snapshot?.fare_period || assignment.fare_period || 'month').toLowerCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3"><StatusPill status={assignment.status} /></td>
                          <td className="px-4 py-3 text-xs text-slate-400">{formatDate(assignment.assigned_at)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {assignment.status === 'pending' && (
                                <>
                                  <Button size="sm" onClick={() => handleApprove(assignment)} loading={saving}>
                                    Approve
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    className="border-red-200 text-red-600 hover:bg-red-50"
                                    onClick={() => { setRejectAssignmentId(assignment.id!); setRejectReason(''); }}>
                                    Reject
                                  </Button>
                                </>
                              )}
                              {(assignment.status === 'active' || assignment.status === 'approved') && (
                                <>
                                  <button onClick={() => openAssignModal(assignment)}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Edit stop">
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => setStopAssignmentId(assignment.id!)}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Stop transport">
                                    <Clock className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                              {(assignment.status === 'rejected' || assignment.status === 'stopped') && (
                                <button onClick={() => handleDeleteAssignment(assignment.id!)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete record">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
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

      {/* ── Add / Edit Bus Modal ── */}
      <Modal open={busModalOpen} onClose={() => setBusModalOpen(false)}
        title={editingBus ? `Edit ${editingBus.bus_number}` : 'Add Bus, Route & Stops'} size="xl">
        <form onSubmit={handleSaveBus} className="space-y-4">
          {renderStopFormFields()}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setBusModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editingBus ? 'Update' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── Assign Student Modal ── */}
      <Modal open={assignModalOpen} onClose={() => setAssignModalOpen(false)}
        title={editingAssignment ? 'Change Stop' : 'Assign Student to Transport'} size="md">
        <form onSubmit={handleAssignStudent} className="space-y-4">
          <Select label="Filter by Class" value={assignClassFilter}
            onChange={(e) => { setAssignClassFilter(e.target.value); setAssignStudentId(''); }}>
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Student *" value={assignStudentId}
            onChange={(e) => setAssignStudentId(e.target.value)} required>
            <option value="">Choose student...</option>
            {assignableStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.admission_number}) — {s.class?.name || ''} {s.section?.name || ''}
              </option>
            ))}
          </Select>
          <Select label="Bus & Route *" value={assignBusId}
            onChange={(e) => { setAssignBusId(e.target.value); setAssignStopId(buses.find((b) => b.id === e.target.value)?.stops[0]?.id || ''); }} required>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.bus_number} — {b.route_name}</option>)}
          </Select>
          <Select label="Stop *" value={assignStopId}
            onChange={(e) => setAssignStopId(e.target.value)} required>
            <option value="">Choose stop...</option>
            {stopsForAssignBus.map((st, idx) => (
              <option key={st.id} value={st.id}>
                #{idx + 1} {st.stop_name} — {formatCurrency(st.amount)}/{(st.fare_period || 'month').toLowerCase()}
              </option>
            ))}
          </Select>

          {selectedAssignStop && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-brand-900">{selectedAssignStop.stop_name}</p>
                <p className="text-[11px] text-brand-600">
                  {selectedAssignStop.area_landmark}
                  {selectedAssignStop.pickup_time ? ` · ↑ ${selectedAssignStop.pickup_time}` : ''}
                  {selectedAssignStop.drop_time   ? ` · ↓ ${selectedAssignStop.drop_time}`   : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-brand-900">{formatCurrency(selectedAssignStop.amount)}</p>
                <p className="text-[10px] text-brand-500">/ {(selectedAssignStop.fare_period || 'month').toLowerCase()}</p>
              </div>
            </div>
          )}

          <Input label="Start Date" type="date" value={assignStartDate}
            onChange={(e) => setAssignStartDate(e.target.value)} />

          {!editingAssignment && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={autoCreateFee}
                  onChange={(e) => setAutoCreateFee(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Create Transport Fee record ({selectedAssignStop ? `${formatCurrency(selectedAssignStop.amount)}/${(selectedAssignStop.fare_period || 'month').toLowerCase()}` : '—'})
                  </p>
                  <p className="text-[11px] text-slate-500">Creates an invoice in the Fees module.</p>
                </div>
              </label>
              {autoCreateFee && (
                <Input label="Fee Due Date" type="date" value={assignDueDate}
                  onChange={(e) => setAssignDueDate(e.target.value)} />
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editingAssignment ? 'Update' : 'Assign'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── Reject Modal ── */}
      <Modal open={Boolean(rejectAssignmentId)} onClose={() => setRejectAssignmentId(null)}
        title="Reject Transport Application" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              The parent will be notified with the reason via Notifications.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Rejection Reason *</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3}
              placeholder="e.g. Bus is full for this route. Please select another stop."
              className="w-full rounded-[10px] border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectAssignmentId(null)}>Cancel</Button>
            <Button loading={saving} onClick={handleConfirmReject}
              className="bg-red-600 hover:bg-red-700 text-white border-0">
              Confirm Reject
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Stop Transport Confirm ── */}
      <ConfirmDialog
        open={Boolean(stopAssignmentId)}
        onClose={() => setStopAssignmentId(null)}
        onConfirm={handleConfirmStopTransport}
        title="Stop Student Transport"
        message="Mark this transport assignment as stopped? Existing fee records will not be deleted."
        confirmText="Stop Transport"
        variant="danger"
        loading={saving}
      />

      {/* ── Delete Bus Confirm ── */}
      <ConfirmDialog
        open={Boolean(deleteBusId)}
        onClose={() => setDeleteBusId(null)}
        onConfirm={handleConfirmDeleteBus}
        title="Delete Bus & Route"
        message="Delete this bus and all its stops? Students must have no active assignments on this bus."
        confirmText="Delete"
        variant="danger"
        loading={saving}
      />
    </DashboardLayout>
  );
}
