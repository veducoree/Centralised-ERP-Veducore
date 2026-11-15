import { useEffect, useState, useCallback, useMemo, type SVGProps, type ReactElement } from 'react';
import {
  Bus, Plus, MapPin, IndianRupee, Users, Trash2, Pencil,
  UserPlus, ArrowRight, Navigation, Phone, Clock, AlertTriangle,
  ShieldCheck, Check, X, Inbox, Armchair, Wrench, Ban,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SearchInput, PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
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
  VehicleType,
} from '@/types';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────
const FARE_PERIODS = ['Monthly', 'Quarterly', 'Yearly'] as const;
type FarePeriod = typeof FARE_PERIODS[number];

const STATUSES = ['active', 'maintenance', 'inactive'] as const;
const statusLabel: Record<string, string> = {
  active: 'Running', maintenance: 'In Maintenance', inactive: 'Inactive',
};

/** Van outline icon in lucide style (lucide-react 0.446 has no van). */
function VanIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 6v5a1 1 0 0 0 1 1h6.102a1 1 0 0 1 .712.298l.898.91a1 1 0 0 1 .288.702V17a1 1 0 0 1-1 1h-3" />
      <path d="M5 18H3a1 1 0 0 1-1-1V8a2 2 0 0 1 2-2h12c1.1 0 2.1.8 2.4 1.8l1.176 4.2" />
      <path d="M9 18h5" />
      <circle cx="16" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}

interface VehicleMeta {
  label: string;
  plural: string;
  Icon: (p: { className?: string }) => ReactElement;
  defaultCapacity: number;
  maxCapacity: number;
  hint: string;
  helperLabel: string;
  /** tile, chip and accent classes */
  tile: string;
  chip: string;
  accent: string;
}

const VEHICLE: Record<VehicleType, VehicleMeta> = {
  bus: {
    label: 'Bus', plural: 'Buses',
    Icon: ({ className }) => <Bus className={className} />,
    defaultCapacity: 40, maxCapacity: 80,
    hint: 'Large vehicle · 25–80 seats · long routes',
    helperLabel: 'Conductor',
    tile: 'bg-[#EEF0FD] text-[#5B6EE8]',
    chip: 'bg-[#EEF0FD] text-[#4A5BD4]',
    accent: 'border-[#5B6EE8] ring-[#5B6EE8]/20 bg-[#F6F7FF]',
  },
  van: {
    label: 'Van', plural: 'Vans',
    Icon: ({ className }) => <VanIcon className={className} />,
    defaultCapacity: 12, maxCapacity: 25,
    hint: 'Small vehicle · 7–25 seats · narrow lanes, short routes',
    helperLabel: 'Helper / Attendant',
    tile: 'bg-amber-50 text-amber-600',
    chip: 'bg-amber-50 text-amber-700',
    accent: 'border-amber-500 ring-amber-500/20 bg-amber-50/50',
  },
};

const vt = (v?: string): VehicleType => (v === 'van' ? 'van' : 'bus');
const isLive = (s?: string) => s === 'approved' || s === 'active';
const periodWord = (p?: string) => (p || 'Monthly').toLowerCase().replace('ly', '');
const toMonthly = (amount: number, period?: string) =>
  period === 'Yearly' ? amount / 12 : period === 'Quarterly' ? amount / 3 : amount;
const today = () => new Date().toISOString().split('T')[0];

function daysUntil(date?: string | null): number | null {
  if (!date) return null;
  const ms = new Date(date + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime();
  return Math.round(ms / 86400000);
}

function friendlyError(err: unknown, fallback: string) {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23503') return 'This stop or vehicle has student records linked to it. Mark the vehicle Inactive instead of deleting.';
  if (e?.code === '23505') return 'This student already has an assignment in that state. Refresh and try again.';
  return e?.message || fallback;
}

interface DraftStop {
  id?: string;
  stop_name: string;
  area_landmark: string;
  amount: string;
  fare_period: FarePeriod;
  pickup_time: string;
  drop_time: string;
}

const emptyStop = (): DraftStop => ({
  stop_name: '', area_landmark: '', amount: '', fare_period: 'Monthly', pickup_time: '', drop_time: '',
});

type Tab = 'vehicles' | 'students';
type TypeFilter = 'all' | VehicleType;

// ─────────────────────────────────────────────────────────────
export default function AdminTransport() {
  const { profile } = useAuth();
  const toast = useToast();

  // ── Core data ────────────────────────────────────────────
  const [vehicles, setVehicles]       = useState<TransportBus[]>([]);
  const [stops, setStops]             = useState<TransportStop[]>([]);
  const [assignments, setAssignments] = useState<StudentTransportAssignment[]>([]);
  const [students, setStudents]       = useState<Student[]>([]);
  const [classes, setClasses]         = useState<(Class & { sections?: Section[] })[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [busyId, setBusyId]           = useState<string | null>(null);

  // ── View state ───────────────────────────────────────────
  const [tab, setTab]               = useState<Tab>('vehicles');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [vehicleSearch, setVehicleSearch] = useState('');

  // ── Vehicle form ─────────────────────────────────────────
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle]     = useState<TransportBus | null>(null);
  const [vehicleType, setVehicleType]   = useState<VehicleType>('bus');
  const [regNumber, setRegNumber]       = useState('');
  const [routeName, setRouteName]       = useState('');
  const [capacity, setCapacity]         = useState('40');
  const [capacityTouched, setCapacityTouched] = useState(false);
  const [driverName, setDriverName]     = useState('');
  const [driverPhone, setDriverPhone]   = useState('');
  const [helperName, setHelperName]     = useState('');
  const [helperPhone, setHelperPhone]   = useState('');
  const [vehicleStatus, setVehicleStatus] = useState('active');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [fitnessExpiry, setFitnessExpiry]     = useState('');
  const [permitExpiry, setPermitExpiry]       = useState('');
  const [stopsDraft, setStopsDraft]     = useState<DraftStop[]>([emptyStop()]);
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null);

  // ── Assign modal ─────────────────────────────────────────
  const [assignModalOpen, setAssignModalOpen]     = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<StudentTransportAssignment | null>(null);
  const [assignClassFilter, setAssignClassFilter] = useState('');
  const [assignStudentId, setAssignStudentId]     = useState('');
  const [assignVehicleId, setAssignVehicleId]     = useState('');
  const [assignStopId, setAssignStopId]           = useState('');
  const [assignStartDate, setAssignStartDate]     = useState(today);
  const [autoCreateFee, setAutoCreateFee]         = useState(true);
  const [assignDueDate, setAssignDueDate]         = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 10); return d.toISOString().split('T')[0];
  });

  // ── Reject / stop modals ─────────────────────────────────
  const [rejectAssignmentId, setRejectAssignmentId] = useState<string | null>(null);
  const [rejectReason, setRejectReason]             = useState('');
  const [stopAssignmentId, setStopAssignmentId]     = useState<string | null>(null);

  // ── Student table filters ────────────────────────────────
  const [search, setSearch]             = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ── Load ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    try {
      const [transport, studentList, classList] = await Promise.all([
        fetchTransportAll(profile.school_id),
        fetchStudents(profile.school_id),
        fetchClasses(profile.school_id),
      ]);
      setVehicles(transport.buses);
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

  // ── Derived ──────────────────────────────────────────────
  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const seatsUsed = useMemo(() => {
    const m: Record<string, number> = {};
    assignments.filter((a) => isLive(a.status) && a.bus_id)
      .forEach((a) => { m[a.bus_id!] = (m[a.bus_id!] || 0) + 1; });
    return m;
  }, [assignments]);

  const stopStudentCounts = useMemo(() => {
    const m: Record<string, number> = {};
    assignments.filter((a) => isLive(a.status)).forEach((a) => { m[a.stop_id] = (m[a.stop_id] || 0) + 1; });
    return m;
  }, [assignments]);

  const busCount = vehicles.filter((v) => vt(v.vehicle_type) === 'bus').length;
  const vanCount = vehicles.length - busCount;
  const liveAssignments = assignments.filter((a) => isLive(a.status));
  const pending = assignments.filter((a) => a.status === 'pending');
  const runningVehicles = vehicles.filter((v) => (v.status || 'active') === 'active');
  const totalSeats = runningVehicles.reduce((s, v) => s + (v.capacity ?? 0), 0);
  const filledSeats = runningVehicles.reduce((s, v) => s + (seatsUsed[v.id] || 0), 0);
  const monthlyRevenue = liveAssignments.reduce((sum, a) => sum + toMonthly(
    Number(a.fare_snapshot?.amount ?? a.amount ?? 0),
    a.fare_snapshot?.fare_period ?? a.fare_period,
  ), 0);

  const paperAlerts = useMemo(() => {
    const out: { vehicle: TransportBus; doc: string; days: number }[] = [];
    for (const v of vehicles) {
      if (v.status === 'inactive') continue;
      for (const [doc, date] of [['Insurance', v.insurance_expiry], ['Fitness', v.fitness_expiry], ['Permit', v.permit_expiry]] as const) {
        const d = daysUntil(date);
        if (d !== null && d <= 30) out.push({ vehicle: v, doc, days: d });
      }
    }
    return out.sort((a, b) => a.days - b.days);
  }, [vehicles]);

  const visibleVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (typeFilter !== 'all' && vt(v.vehicle_type) !== typeFilter) return false;
      if (!q) return true;
      return v.bus_number.toLowerCase().includes(q)
        || v.route_name.toLowerCase().includes(q)
        || (v.driver_name || '').toLowerCase().includes(q)
        || v.stops.some((s) => s.stop_name.toLowerCase().includes(q));
    });
  }, [vehicles, typeFilter, vehicleSearch]);

  const enrolled = useMemo(() => assignments
    .map((a) => ({ assignment: a, student: studentMap.get(a.student_id) }))
    .filter((e): e is { assignment: StudentTransportAssignment; student: Student } => Boolean(e.student)),
  [assignments, studentMap]);

  const filteredEnrolled = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrolled.filter(({ assignment, student }) => {
      if (typeFilter !== 'all' && vt(assignment.vehicle_type) !== typeFilter) return false;
      if (vehicleFilter && assignment.bus_id !== vehicleFilter) return false;
      if (statusFilter && (statusFilter === 'approved' ? !isLive(assignment.status) : assignment.status !== statusFilter)) return false;
      if (!q) return true;
      return student.full_name.toLowerCase().includes(q)
        || student.admission_number.toLowerCase().includes(q)
        || (assignment.stop_name || '').toLowerCase().includes(q)
        || (assignment.bus_number || '').toLowerCase().includes(q);
    });
  }, [enrolled, typeFilter, vehicleFilter, statusFilter, search]);

  // ── Vehicle form ─────────────────────────────────────────
  function resetVehicleForm(type: VehicleType = 'bus') {
    setEditingVehicle(null);
    setVehicleType(type);
    setRegNumber(''); setRouteName('');
    setCapacity(String(VEHICLE[type].defaultCapacity)); setCapacityTouched(false);
    setDriverName(''); setDriverPhone(''); setHelperName(''); setHelperPhone('');
    setVehicleStatus('active');
    setInsuranceExpiry(''); setFitnessExpiry(''); setPermitExpiry('');
    setStopsDraft([emptyStop()]);
  }

  function openAddVehicle(type?: VehicleType) {
    resetVehicleForm(type ?? (typeFilter === 'van' ? 'van' : 'bus'));
    setVehicleModalOpen(true);
  }

  function openEditVehicle(v: TransportBus) {
    setEditingVehicle(v);
    setVehicleType(vt(v.vehicle_type));
    setRegNumber(v.bus_number);
    setRouteName(v.route_name);
    setCapacity(String(v.capacity ?? VEHICLE[vt(v.vehicle_type)].defaultCapacity));
    setCapacityTouched(true);
    setDriverName(v.driver_name || ''); setDriverPhone(v.driver_phone || '');
    setHelperName(v.conductor_name || ''); setHelperPhone(v.conductor_phone || '');
    setVehicleStatus(v.status || 'active');
    setInsuranceExpiry(v.insurance_expiry || '');
    setFitnessExpiry(v.fitness_expiry || '');
    setPermitExpiry(v.permit_expiry || '');
    setStopsDraft(v.stops.length > 0
      ? v.stops.map((s) => ({
          id: s.id,
          stop_name: s.stop_name,
          area_landmark: s.area_landmark || '',
          amount: String(s.amount),
          fare_period: (s.fare_period as FarePeriod) || 'Monthly',
          pickup_time: s.pickup_time || '',
          drop_time: s.drop_time || '',
        }))
      : [emptyStop()]);
    setVehicleModalOpen(true);
  }

  function chooseType(t: VehicleType) {
    setVehicleType(t);
    if (!capacityTouched) setCapacity(String(VEHICLE[t].defaultCapacity));
  }

  const updateStop = (idx: number, patch: Partial<DraftStop>) =>
    setStopsDraft((p) => p.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  async function handleSaveVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.school_id) return;
    const meta = VEHICLE[vehicleType];
    const reg = regNumber.trim();
    const route = routeName.trim();
    const cap = parseInt(capacity, 10);
    if (!reg) { toast(`${meta.label} number is required`, 'error'); return; }
    if (!route) { toast('Route name is required', 'error'); return; }
    if (!cap || cap < 1 || cap > meta.maxCapacity) {
      toast(`${meta.label} capacity must be between 1 and ${meta.maxCapacity}`, 'error'); return;
    }
    if (editingVehicle && cap < (seatsUsed[editingVehicle.id] || 0)) {
      toast(`${seatsUsed[editingVehicle.id]} students already ride this ${meta.label.toLowerCase()} — capacity can't be lower`, 'error'); return;
    }

    const validStops = stopsDraft
      .map((r, idx) => ({
        ...(r.id ? { id: r.id } : {}),
        stop_name: r.stop_name.trim(),
        area_landmark: r.area_landmark.trim() || undefined,
        amount: Number(r.amount),
        fare_period: r.fare_period,
        pickup_time: r.pickup_time || undefined,
        drop_time: r.drop_time || undefined,
        stop_order: idx + 1,
      }))
      .filter((r) => r.stop_name && !isNaN(r.amount) && r.amount > 0);

    if (validStops.length === 0) { toast('Add at least one stop with a fare', 'error'); return; }

    setSaving(true);
    try {
      await saveTransportBus(profile.school_id, {
        ...(editingVehicle ? { id: editingVehicle.id } : {}),
        vehicle_type: vehicleType,
        bus_number: reg,
        route_name: route,
        capacity: cap,
        driver_name: driverName.trim() || undefined,
        driver_phone: driverPhone.trim() || undefined,
        conductor_name: helperName.trim() || undefined,
        conductor_phone: helperPhone.trim() || undefined,
        status: vehicleStatus,
        insurance_expiry: insuranceExpiry || null,
        fitness_expiry: fitnessExpiry || null,
        permit_expiry: permitExpiry || null,
      }, validStops);
      await loadData();
      setVehicleModalOpen(false);
      toast(editingVehicle ? `${meta.label} ${reg} updated` : `${meta.label} ${reg} added with ${validStops.length} stop${validStops.length > 1 ? 's' : ''}`, 'success');
    } catch (err) {
      const msg = (err as { code?: string })?.code === '23505'
        ? `A vehicle with number ${reg} already exists`
        : friendlyError(err, 'Failed to save vehicle');
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDeleteVehicle() {
    if (!deleteVehicleId) return;
    const v = vehicleMap.get(deleteVehicleId);
    const stopIds = new Set(v?.stops.map((s) => s.id));
    const linked = assignments.filter((a) => a.bus_id === deleteVehicleId || stopIds.has(a.stop_id));
    if (linked.some((a) => isLive(a.status) || a.status === 'pending')) {
      toast('Students are still assigned or waiting on this vehicle. Stop or reject them first.', 'error');
      setDeleteVehicleId(null);
      return;
    }
    if (linked.length > 0) {
      toast('This vehicle has past student records. Mark it Inactive to keep the history.', 'error');
      setDeleteVehicleId(null);
      return;
    }
    setSaving(true);
    try {
      await deleteTransportBusWithStops(deleteVehicleId);
      await loadData();
      toast(`${VEHICLE[vt(v?.vehicle_type)].label} deleted`, 'success');
    } catch (err) {
      toast(friendlyError(err, 'Failed to delete vehicle'), 'error');
    } finally {
      setSaving(false);
      setDeleteVehicleId(null);
    }
  }

  // ── Assign ───────────────────────────────────────────────
  function firstStopOf(id: string) { return vehicleMap.get(id)?.stops[0]?.id || ''; }

  function openAssignModal(assignment?: StudentTransportAssignment, presetVehicleId?: string) {
    setEditingAssignment(assignment || null);
    setAssignClassFilter('');
    setAssignStudentId(assignment?.student_id || '');
    const vid = assignment?.bus_id || presetVehicleId || runningVehicles[0]?.id || vehicles[0]?.id || '';
    setAssignVehicleId(vid);
    setAssignStopId(assignment?.stop_id || firstStopOf(vid));
    setAssignStartDate(today());
    setAutoCreateFee(!assignment);
    setAssignModalOpen(true);
  }

  const assignableStudents = useMemo(
    () => (assignClassFilter ? students.filter((s) => s.class_id === assignClassFilter) : students),
    [students, assignClassFilter],
  );
  const assignVehicle = vehicleMap.get(assignVehicleId);
  const assignStop = stops.find((s) => s.id === assignStopId);
  const existingLive = !editingAssignment && assignStudentId
    ? assignments.find((a) => a.student_id === assignStudentId && isLive(a.status))
    : undefined;

  function seatsLeft(v: TransportBus, ignoreStudentId?: string) {
    const used = assignments.filter((a) => a.bus_id === v.id && isLive(a.status) && a.student_id !== ignoreStudentId).length;
    return (v.capacity ?? 0) - used;
  }

  async function handleAssignStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.school_id) return;
    if (!assignStudentId) { toast('Please select a student', 'error'); return; }
    const stop = assignStop;
    const vehicle = assignVehicle;
    if (!stop || !vehicle) { toast('Please select a vehicle and stop', 'error'); return; }
    if (seatsLeft(vehicle, assignStudentId) <= 0) {
      toast(`${VEHICLE[vt(vehicle.vehicle_type)].label} ${vehicle.bus_number} is full (${vehicle.capacity} seats)`, 'error'); return;
    }

    // A student has at most one live assignment — moving them updates it.
    const target = editingAssignment ?? existingLive;

    setSaving(true);
    try {
      const fareSnapshot: TransportFareSnapshot = {
        amount: stop.amount,
        fare_period: (stop.fare_period as FarePeriod) || 'Monthly',
        stop_name: stop.stop_name,
        bus_number: vehicle.bus_number,
        route_name: vehicle.route_name,
        vehicle_type: vt(vehicle.vehicle_type),
      };
      const saved = await createOrUpdateAssignment({
        ...(target?.id ? { id: target.id } : {}),
        school_id: profile.school_id,
        student_id: assignStudentId,
        bus_id: vehicle.id,
        stop_id: stop.id,
        start_date: assignStartDate,
        status: 'approved',
        applied_by_parent: target?.applied_by_parent ?? false,
        fare_snapshot: fareSnapshot,
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      });

      if (autoCreateFee && !editingAssignment) {
        try {
          const fee = await createFee({
            school_id: profile.school_id,
            student_id: assignStudentId,
            fee_type: `Transport Fee (${VEHICLE[vt(vehicle.vehicle_type)].label} ${vehicle.bus_number} - ${stop.stop_name})`,
            amount: stop.amount,
            due_date: assignDueDate || today(),
          });
          if (fee?.id && saved?.id) await updateAssignmentStatus(saved.id, { status: 'approved', fee_id: fee.id });
        } catch { /* fee is optional — assignment already saved */ }
      }

      notifyParent(assignStudentId, target ? 'Transport updated' : 'Transport assigned',
        `${studentMap.get(assignStudentId)?.full_name || 'Your child'} will travel by ${VEHICLE[vt(vehicle.vehicle_type)].label} ${vehicle.bus_number} from ${stop.stop_name}`
        + `${stop.pickup_time ? ` (pickup ${stop.pickup_time})` : ''}. Fare ${formatCurrency(stop.amount)}/${periodWord(stop.fare_period)}.`,
        'success');

      await loadData();
      setAssignModalOpen(false);
      toast(target ? 'Transport updated' : `Assigned to ${vehicle.bus_number} · ${stop.stop_name}`, 'success');
    } catch (err) {
      toast(friendlyError(err, 'Failed to assign transport'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function notifyParent(studentId: string, title: string, message: string, type: string) {
    if (!profile?.school_id) return;
    createNotification({
      school_id: profile.school_id,
      audience: 'student',
      student_id: studentId,
      category: 'transport',
      title, message, type,
    }).catch(() => { /* non-fatal */ });
  }

  // ── Approve / reject / stop ──────────────────────────────
  async function handleApprove(a: StudentTransportAssignment) {
    if (!profile?.school_id || !a.id) return;
    const vehicle = a.bus_id ? vehicleMap.get(a.bus_id) : undefined;
    const stop = stops.find((s) => s.id === a.stop_id);
    if (!vehicle || !stop) { toast('That stop no longer exists. Reject this application.', 'error'); return; }
    const meta = VEHICLE[vt(vehicle.vehicle_type)];
    if (vehicle.status !== 'active') { toast(`${meta.label} ${vehicle.bus_number} is not running right now`, 'error'); return; }
    if (seatsLeft(vehicle, a.student_id) <= 0) {
      toast(`${meta.label} ${vehicle.bus_number} is full (${vehicle.capacity} seats)`, 'error'); return;
    }

    setBusyId(a.id);
    try {
      const fareSnapshot: TransportFareSnapshot = {
        amount: stop.amount,
        fare_period: (stop.fare_period as FarePeriod) || 'Monthly',
        stop_name: stop.stop_name,
        bus_number: vehicle.bus_number,
        route_name: vehicle.route_name,
        vehicle_type: vt(vehicle.vehicle_type),
      };

      // A change request replaces the current live assignment.
      const current = assignments.find((x) => x.student_id === a.student_id && isLive(x.status) && x.id !== a.id);
      if (current?.id) await updateAssignmentStatus(current.id, { status: 'stopped', end_date: today() });

      let feeId: string | undefined;
      try {
        const fee = await createFee({
          school_id: profile.school_id,
          student_id: a.student_id,
          fee_type: `Transport Fee (${meta.label} ${vehicle.bus_number} - ${stop.stop_name})`,
          amount: stop.amount,
          due_date: today(),
        });
        feeId = fee?.id;
      } catch { /* non-fatal */ }

      await updateAssignmentStatus(a.id, {
        status: 'approved',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        fare_snapshot: fareSnapshot,
        ...(feeId ? { fee_id: feeId } : {}),
      });

      notifyParent(a.student_id, 'Transport application approved',
        `Approved: ${meta.label} ${vehicle.bus_number} from ${stop.stop_name}${stop.pickup_time ? ` (pickup ${stop.pickup_time})` : ''}. `
        + `Fare ${formatCurrency(stop.amount)}/${periodWord(stop.fare_period)}.`, 'success');

      await loadData();
      toast(`Approved · ${vehicle.bus_number} · ${stop.stop_name}`, 'success');
    } catch (err) {
      toast(friendlyError(err, 'Failed to approve'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmReject() {
    if (!rejectAssignmentId) return;
    if (!rejectReason.trim()) { toast('Please enter a reason', 'error'); return; }
    const a = assignments.find((x) => x.id === rejectAssignmentId);
    setSaving(true);
    try {
      await updateAssignmentStatus(rejectAssignmentId, { status: 'rejected', reject_reason: rejectReason.trim() });
      if (a) {
        notifyParent(a.student_id, 'Transport application not approved',
          `Your application for ${a.stop_name || 'the selected stop'} could not be approved. Reason: ${rejectReason.trim()}`, 'warning');
      }
      await loadData();
      setRejectAssignmentId(null);
      setRejectReason('');
      toast('Application rejected — parent notified', 'success');
    } catch (err) {
      toast(friendlyError(err, 'Failed to reject'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmStopTransport() {
    if (!stopAssignmentId) return;
    const a = assignments.find((x) => x.id === stopAssignmentId);
    setSaving(true);
    try {
      await updateAssignmentStatus(stopAssignmentId, { status: 'stopped', end_date: today() });
      if (a) notifyParent(a.student_id, 'Transport stopped', `School transport from ${a.stop_name} has been stopped from ${formatDate(today())}.`, 'info');
      await loadData();
      setStopAssignmentId(null);
      toast('Transport stopped', 'success');
    } catch (err) {
      toast(friendlyError(err, 'Failed to stop transport'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAssignment(id: string) {
    setBusyId(id);
    try {
      await deleteAssignment(id);
      await loadData();
      toast('Record removed', 'success');
    } catch (err) {
      toast(friendlyError(err, 'Failed to remove record'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Small render pieces
  // ─────────────────────────────────────────────────────────
  function TypeChip({ type }: { type?: string }) {
    const m = VEHICLE[vt(type)];
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.chip}`}>
        <m.Icon className="h-3 w-3" /> {m.label}
      </span>
    );
  }

  function StatusPill({ status }: { status?: string }) {
    const map: Record<string, { label: string; cls: string }> = {
      pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-800' },
      active:   { label: 'Active',   cls: 'bg-emerald-100 text-emerald-800' },
      approved: { label: 'Active',   cls: 'bg-emerald-100 text-emerald-800' },
      rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
      stopped:  { label: 'Stopped',  cls: 'bg-slate-100 text-slate-600' },
    };
    const s = map[status || 'active'] ?? map.active;
    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>;
  }

  function SegButton({ value, label, count }: { value: TypeFilter; label: string; count: number }) {
    const active = typeFilter === value;
    const Icon = value === 'all' ? null : VEHICLE[value].Icon;
    return (
      <button type="button" onClick={() => setTypeFilter(value)}
        className={`inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-sm font-semibold transition-colors ${
          active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
        {Icon && <Icon className="h-4 w-4" />}
        {label}
        <span className={`rounded-full px-1.5 text-[11px] ${active ? 'bg-slate-100 text-slate-700' : 'bg-slate-200/70 text-slate-500'}`}>{count}</span>
      </button>
    );
  }

  const renderVehicleForm = () => {
    const meta = VEHICLE[vehicleType];
    return (
      <div className="space-y-5">
        {/* Type picker */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800">Vehicle type *</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(['bus', 'van'] as const).map((t) => {
              const m = VEHICLE[t];
              const active = vehicleType === t;
              return (
                <button key={t} type="button" onClick={() => chooseType(t)} aria-pressed={active}
                  className={`relative flex items-center gap-3 rounded-xl border-2 p-3.5 text-left transition-all ${
                    active ? `${m.accent} ring-4` : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] ${m.tile}`}>
                    <m.Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{m.label}</p>
                    <p className="text-xs text-slate-500">{m.hint}</p>
                  </div>
                  {active && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Basic info */}
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <Input label={`${meta.label} number *`} placeholder={vehicleType === 'van' ? 'e.g. UP50AT1234' : 'e.g. UP50BS353'}
              value={regNumber} onChange={(e) => setRegNumber(e.target.value.toUpperCase())} required />
          </div>
          <div className="sm:col-span-5">
            <Input label="Route name *" placeholder="e.g. Civil Lines → School"
              value={routeName} onChange={(e) => setRouteName(e.target.value)} required />
          </div>
          <div className="sm:col-span-3">
            <Input label="Seats *" type="number" min="1" max={meta.maxCapacity}
              value={capacity} onChange={(e) => { setCapacity(e.target.value); setCapacityTouched(true); }} required />
          </div>
          <div className="sm:col-span-6">
            <Input label="Driver name" placeholder="e.g. Rajesh Kumar" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          </div>
          <div className="sm:col-span-6">
            <Input label="Driver mobile" type="tel" inputMode="numeric" placeholder="10-digit number"
              value={driverPhone} onChange={(e) => setDriverPhone(e.target.value.replace(/[^\d+ ]/g, ''))} />
          </div>
          <div className="sm:col-span-6">
            <Input label={`${meta.helperLabel} name`} placeholder="optional" value={helperName} onChange={(e) => setHelperName(e.target.value)} />
          </div>
          <div className="sm:col-span-6">
            <Input label={`${meta.helperLabel} mobile`} type="tel" inputMode="numeric" placeholder="optional"
              value={helperPhone} onChange={(e) => setHelperPhone(e.target.value.replace(/[^\d+ ]/g, ''))} />
          </div>
        </div>

        {/* Status + papers */}
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-4">
          <div className="sm:col-span-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold text-slate-800">Status &amp; papers</p>
            <p className="text-xs text-slate-500">— we'll warn you 30 days before anything expires.</p>
          </div>
          <Select label="Status" value={vehicleStatus} onChange={(e) => setVehicleStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
          </Select>
          <Input label="Insurance valid till" type="date" value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} />
          <Input label="Fitness valid till" type="date" value={fitnessExpiry} onChange={(e) => setFitnessExpiry(e.target.value)} />
          <Input label="Permit valid till" type="date" value={permitExpiry} onChange={(e) => setPermitExpiry(e.target.value)} />
        </div>

        {/* Stops */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Stops &amp; fares ({stopsDraft.length})</h4>
              <p className="text-xs text-slate-500">In pickup order. Each stop has its own fare.</p>
            </div>
            <Button type="button" size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setStopsDraft((p) => [...p, emptyStop()])}>
              Add stop
            </Button>
          </div>

          {stopsDraft.map((row, idx) => (
            <div key={row.id ?? `new-${idx}`} className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  <MapPin className="h-3 w-3" /> Stop {idx + 1}
                </span>
                {stopsDraft.length > 1 && (
                  <button type="button" onClick={() => setStopsDraft((p) => p.filter((_, i) => i !== idx))}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
                <div className="col-span-2 sm:col-span-4">
                  <Input label="Stop name *" placeholder="e.g. Sector 14 Gate" value={row.stop_name}
                    onChange={(e) => updateStop(idx, { stop_name: e.target.value })} required={idx === 0} />
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <Input label="Landmark" placeholder="e.g. Near Huda Market" value={row.area_landmark}
                    onChange={(e) => updateStop(idx, { area_landmark: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Input label="Fare (₹) *" type="number" min="1" placeholder="1500" value={row.amount}
                    onChange={(e) => updateStop(idx, { amount: e.target.value })} required={idx === 0} />
                </div>
                <div className="sm:col-span-2">
                  <Select label="Per" value={row.fare_period}
                    onChange={(e) => updateStop(idx, { fare_period: e.target.value as FarePeriod })}>
                    {FARE_PERIODS.map((p) => <option key={p} value={p}>{p.replace('ly', '')}</option>)}
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <Input label="Pickup time" type="time" value={row.pickup_time}
                    onChange={(e) => updateStop(idx, { pickup_time: e.target.value })} />
                </div>
                <div className="sm:col-span-3">
                  <Input label="Drop time" type="time" value={row.drop_time}
                    onChange={(e) => updateStop(idx, { drop_time: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) return <DashboardLayout title="Transport"><LoadingSpinner /></DashboardLayout>;

  // ─────────────────────────────────────────────────────────
  // Page
  // ─────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Transport">
      <div className="space-y-6">
        <PageHeader
          title="Transport"
          description="Buses and vans, their routes, stop-wise fares, and which students ride them."
          action={vehicles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => openAddVehicle()}>
                Add Vehicle
              </Button>
              <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => openAssignModal()}>
                Assign Student
              </Button>
            </div>
          ) : undefined}
        />

        {vehicles.length === 0 ? (
          /* ── Onboarding ── */
          <Card className="overflow-hidden border border-slate-200 p-0">
            <div className="border-b border-slate-100 px-6 py-5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6EE8]">Get started</span>
              <h2 className="text-[15px] font-semibold text-slate-900">Add your first school bus or van</h2>
              <p className="mt-0.5 text-xs text-slate-500">Choose the vehicle type, add its route and stops. You can add more any time.</p>
            </div>
            <form onSubmit={handleSaveVehicle} className="space-y-5 p-6">
              {renderVehicleForm()}
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Button type="submit" loading={saving} icon={<ArrowRight className="h-4 w-4" />}>
                  Save {VEHICLE[vehicleType].label}
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <>
            {/* ── Stats ── */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Fleet" value={`${busCount} ${busCount === 1 ? 'Bus' : 'Buses'} · ${vanCount} ${vanCount === 1 ? 'Van' : 'Vans'}`}
                icon={<Bus className="h-5 w-5" />} color="blue"
                trend={vehicles.length !== runningVehicles.length ? `${vehicles.length - runningVehicles.length} not running` : `${stops.length} stops`} />
              <StatCard label="Students on transport" value={liveAssignments.length}
                icon={<Users className="h-5 w-5" />} color="emerald"
                trend={pending.length > 0 ? `${pending.length} waiting for approval` : undefined} />
              <StatCard label="Seats filled" value={totalSeats ? `${filledSeats} / ${totalSeats}` : '—'}
                icon={<Armchair className="h-5 w-5" />} color="amber"
                trend={totalSeats ? `${Math.round((filledSeats / totalSeats) * 100)}% occupancy` : undefined} />
              <StatCard label="Transport fees / month" value={formatCurrency(Math.round(monthlyRevenue))}
                icon={<IndianRupee className="h-5 w-5" />} color="violet" />
            </div>

            {/* ── Pending applications ── */}
            {pending.length > 0 && (
              <Card className="border border-amber-200 bg-amber-50/40 p-0">
                <div className="flex items-center gap-2 border-b border-amber-100 px-5 py-3">
                  <Inbox className="h-4 w-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-slate-900">Parent applications</h3>
                  <span className="rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-800">{pending.length}</span>
                </div>
                <div className="divide-y divide-amber-100">
                  {pending.map((a) => {
                    const st = studentMap.get(a.student_id);
                    const v = a.bus_id ? vehicleMap.get(a.bus_id) : undefined;
                    const current = assignments.find((x) => x.student_id === a.student_id && isLive(x.status));
                    const left = v ? seatsLeft(v, a.student_id) : 0;
                    return (
                      <div key={a.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700 ring-1 ring-amber-200">
                            {getInitials(st?.full_name || '?')}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {st?.full_name || 'Student'}{' '}
                              <span className="font-normal text-slate-500">· {st?.class?.name || ''}{st?.section?.name ? `-${st.section.name}` : ''}</span>
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                              <TypeChip type={a.vehicle_type} />
                              <span className="font-medium">{a.bus_number}</span>
                              <span>· {a.stop_name}</span>
                              <span className="font-semibold text-emerald-700">· {formatCurrency(a.fare_snapshot?.amount ?? a.amount)}/{periodWord(a.fare_snapshot?.fare_period ?? a.fare_period)}</span>
                              {current && <span className="text-amber-700">· change from {current.bus_number} / {current.stop_name}</span>}
                              {v && <span className={left > 0 ? 'text-slate-400' : 'font-semibold text-red-600'}>· {left > 0 ? `${left} seats left` : 'full'}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 gap-2">
                          <Button size="sm" icon={<Check className="h-3.5 w-3.5" />} loading={busyId === a.id}
                            disabled={Boolean(busyId)} onClick={() => handleApprove(a)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" icon={<X className="h-3.5 w-3.5" />}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => { setRejectAssignmentId(a.id!); setRejectReason(''); }}>
                            Reject
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* ── Paperwork alerts ── */}
            {paperAlerts.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50/60 px-5 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <p className="text-sm font-bold text-red-800">Papers need renewal</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {paperAlerts.map(({ vehicle, doc, days }) => (
                    <button key={vehicle.id + doc} type="button" onClick={() => openEditVehicle(vehicle)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs ring-1 ring-red-200 hover:ring-red-300">
                      <span className="font-semibold text-slate-800">{vehicle.bus_number}</span>
                      <span className="text-slate-500">{doc}</span>
                      <span className={days < 0 ? 'font-bold text-red-600' : 'font-semibold text-amber-700'}>
                        {days < 0 ? `expired ${-days}d ago` : days === 0 ? 'expires today' : `in ${days}d`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Toolbar: tabs + type filter ── */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex gap-1 border-b border-slate-200">
                {([['vehicles', 'Vehicles & Routes', vehicles.length], ['students', 'Students', liveAssignments.length]] as const).map(([key, label, n]) => (
                  <button key={key} type="button" onClick={() => setTab(key)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                      tab === key ? 'border-[#5B6EE8] text-[#4A5BD4]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                    {label} <span className="ml-1 text-xs text-slate-400">{n}</span>
                  </button>
                ))}
              </div>
              <div className="inline-flex self-start rounded-xl bg-slate-100 p-1">
                <SegButton value="all" label="All" count={vehicles.length} />
                <SegButton value="bus" label="Buses" count={busCount} />
                <SegButton value="van" label="Vans" count={vanCount} />
              </div>
            </div>

            {tab === 'vehicles' ? (
              <div className="space-y-4">
                <SearchInput value={vehicleSearch} onChange={setVehicleSearch} placeholder="Search number, route, driver or stop..." />

                {visibleVehicles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
                    {typeFilter === 'van' ? <VanIcon className="mx-auto h-8 w-8 text-slate-300" /> : <Bus className="mx-auto h-8 w-8 text-slate-300" />}
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      {vehicleSearch ? 'No vehicles match your search' : `No ${typeFilter === 'all' ? 'vehicles' : VEHICLE[typeFilter].plural.toLowerCase()} yet`}
                    </p>
                    {!vehicleSearch && typeFilter !== 'all' && (
                      <Button size="sm" variant="outline" className="mt-3" icon={<Plus className="h-3.5 w-3.5" />}
                        onClick={() => openAddVehicle(typeFilter)}>
                        Add {VEHICLE[typeFilter].label}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {visibleVehicles.map((v) => {
                      const meta = VEHICLE[vt(v.vehicle_type)];
                      const used = seatsUsed[v.id] || 0;
                      const cap = v.capacity ?? meta.defaultCapacity;
                      const pct = Math.min(100, Math.round((used / cap) * 100));
                      const status = v.status || 'active';
                      return (
                        <Card key={v.id} className={`overflow-hidden border border-slate-200 p-0 ${status === 'inactive' ? 'opacity-70' : ''}`}>
                          <div className="flex items-start justify-between gap-3 px-5 pt-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] ${meta.tile}`}>
                                <meta.Icon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <h4 className="text-[15px] font-bold tracking-wide text-slate-900">{v.bus_number}</h4>
                                  <TypeChip type={v.vehicle_type} />
                                  {status === 'maintenance' && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                      <Wrench className="h-3 w-3" /> Maintenance
                                    </span>
                                  )}
                                  {status === 'inactive' && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                      <Ban className="h-3 w-3" /> Inactive
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 truncate text-xs text-slate-500">{v.route_name}</p>
                              </div>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-0.5">
                              <button onClick={() => openAssignModal(undefined, v.id)} title="Assign student"
                                className="rounded-[10px] p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600">
                                <UserPlus className="h-4 w-4" />
                              </button>
                              <button onClick={() => openEditVehicle(v)} title="Edit"
                                className="rounded-[10px] p-1.5 text-slate-400 transition-colors hover:bg-[#EEF0FD] hover:text-[#5B6EE8]">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={() => setDeleteVehicleId(v.id)} title="Delete"
                                className="rounded-[10px] p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Seats bar */}
                          <div className="px-5 pt-3">
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="text-slate-500">Seats</span>
                              <span className={`font-semibold ${used >= cap ? 'text-red-600' : 'text-slate-700'}`}>
                                {used} / {cap} {used >= cap && '· Full'}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${pct}%` }} />
                            </div>
                          </div>

                          {/* Crew */}
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-y border-slate-100 bg-slate-50/70 px-5 py-2 text-xs text-slate-600">
                            <span>Driver: <strong className="text-slate-800">{v.driver_name || 'Not set'}</strong>
                              {v.driver_phone && (
                                <a href={`tel:${v.driver_phone}`} className="ml-1.5 inline-flex items-center gap-1 font-medium text-[#5B6EE8] hover:underline">
                                  <Phone className="h-3 w-3" />{v.driver_phone}
                                </a>
                              )}
                            </span>
                            {v.conductor_name && (
                              <span>{meta.helperLabel}: <strong className="text-slate-800">{v.conductor_name}</strong>
                                {v.conductor_phone && <span className="ml-1.5 text-slate-500">{v.conductor_phone}</span>}
                              </span>
                            )}
                          </div>

                          {/* Stops */}
                          <ol className="space-y-0 px-5 py-3">
                            {v.stops.map((stop, i) => (
                              <li key={stop.id} className="relative flex items-center justify-between gap-3 py-1.5 pl-6">
                                <span className={`absolute left-[7px] top-0 w-px bg-slate-200 ${i === 0 ? 'top-1/2' : ''} ${i === v.stops.length - 1 ? 'h-1/2' : 'h-full'}`} />
                                <span className="absolute left-[3px] top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-full border-2 border-white bg-slate-400 ring-1 ring-slate-300" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-800">{stop.stop_name}</p>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                    {stop.area_landmark && <span className="inline-flex items-center gap-1"><Navigation className="h-3 w-3" />{stop.area_landmark}</span>}
                                    {stop.pickup_time && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />↑ {stop.pickup_time}</span>}
                                    {stop.drop_time && <span>↓ {stop.drop_time}</span>}
                                  </div>
                                </div>
                                <div className="flex flex-shrink-0 items-center gap-2">
                                  {stopStudentCounts[stop.id] > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                                      <Users className="h-3 w-3" />{stopStudentCounts[stop.id]}
                                    </span>
                                  )}
                                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                    {formatCurrency(stop.amount)}<span className="font-normal text-emerald-600">/{periodWord(stop.fare_period)}</span>
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ol>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* ── Students tab ── */
              <Card className="p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <SearchInput value={search} onChange={setSearch} placeholder="Search student, vehicle or stop..." />
                  </div>
                  <div className="w-full sm:w-56">
                    <Select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)}>
                      <option value="">All vehicles</option>
                      {(['bus', 'van'] as const).map((t) => {
                        const list = vehicles.filter((v) => vt(v.vehicle_type) === t);
                        if (!list.length || (typeFilter !== 'all' && typeFilter !== t)) return null;
                        return (
                          <optgroup key={t} label={VEHICLE[t].plural}>
                            {list.map((v) => <option key={v.id} value={v.id}>{v.bus_number} — {v.route_name}</option>)}
                          </optgroup>
                        );
                      })}
                    </Select>
                  </div>
                  <div className="w-full sm:w-36">
                    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="">All status</option>
                      <option value="approved">Active</option>
                      <option value="pending">Pending</option>
                      <option value="rejected">Rejected</option>
                      <option value="stopped">Stopped</option>
                    </Select>
                  </div>
                </div>

                {filteredEnrolled.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
                    <Users className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No transport records found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <th className="px-4 py-3">Student</th>
                          <th className="px-4 py-3">Vehicle</th>
                          <th className="px-4 py-3">Stop</th>
                          <th className="px-4 py-3">Fare</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Since</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredEnrolled.map(({ student, assignment: a }) => (
                          <tr key={a.id || a.student_id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                                  {getInitials(student.full_name)}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900">{student.full_name}</p>
                                  <p className="text-xs text-slate-400">
                                    {student.admission_number} · {student.class?.name || '—'}{student.section?.name ? `-${student.section.name}` : ''}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <TypeChip type={a.vehicle_type} />
                                <span className="text-xs font-semibold text-slate-900">{a.bus_number || '—'}</span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-400">{a.route_name || ''}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs font-semibold text-slate-800">{a.stop_name}</p>
                              {a.pickup_time && <p className="text-[11px] text-slate-400">↑ {a.pickup_time}</p>}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-emerald-700">
                              {formatCurrency(a.fare_snapshot?.amount ?? a.amount)}
                              <span className="block text-[10px] font-normal text-slate-400">/ {periodWord(a.fare_snapshot?.fare_period ?? a.fare_period)}</span>
                            </td>
                            <td className="px-4 py-3">
                              <StatusPill status={a.status} />
                              {a.status === 'rejected' && a.reject_reason && (
                                <p className="mt-1 max-w-[180px] truncate text-[11px] text-slate-400" title={a.reject_reason}>{a.reject_reason}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">{formatDate(a.start_date || a.assigned_at)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {a.status === 'pending' && (
                                  <>
                                    <Button size="sm" loading={busyId === a.id} disabled={Boolean(busyId)} onClick={() => handleApprove(a)}>Approve</Button>
                                    <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50"
                                      onClick={() => { setRejectAssignmentId(a.id!); setRejectReason(''); }}>
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {isLive(a.status) && (
                                  <>
                                    <button onClick={() => openAssignModal(a)} title="Change vehicle / stop"
                                      className="rounded-lg p-1.5 text-slate-400 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]">
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => setStopAssignmentId(a.id!)} title="Stop transport"
                                      className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600">
                                      <Ban className="h-4 w-4" />
                                    </button>
                                  </>
                                )}
                                {(a.status === 'rejected' || a.status === 'stopped') && (
                                  <button onClick={() => handleDeleteAssignment(a.id!)} disabled={busyId === a.id} title="Delete record"
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
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
            )}
          </>
        )}
      </div>

      {/* ── Add / Edit Vehicle ── */}
      <Modal open={vehicleModalOpen} onClose={() => setVehicleModalOpen(false)} size="xl"
        title={editingVehicle ? `Edit ${VEHICLE[vehicleType].label} ${editingVehicle.bus_number}` : 'Add Vehicle'}>
        <form onSubmit={handleSaveVehicle} className="space-y-4">
          {renderVehicleForm()}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={() => setVehicleModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>
              {editingVehicle ? 'Save changes' : `Add ${VEHICLE[vehicleType].label}`}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Assign Student ── */}
      <Modal open={assignModalOpen} onClose={() => setAssignModalOpen(false)} size="md"
        title={editingAssignment ? 'Change Vehicle / Stop' : 'Assign Student'}>
        <form onSubmit={handleAssignStudent} className="space-y-4">
          {!editingAssignment && (
            <>
              <Select label="Class" value={assignClassFilter}
                onChange={(e) => { setAssignClassFilter(e.target.value); setAssignStudentId(''); }}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select label="Student *" value={assignStudentId} onChange={(e) => setAssignStudentId(e.target.value)} required>
                <option value="">Choose student...</option>
                {assignableStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.admission_number}) — {s.class?.name || ''} {s.section?.name || ''}
                  </option>
                ))}
              </Select>
              {existingLive && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Already on {existingLive.bus_number} · {existingLive.stop_name}. Saving will move them to the new stop.
                </p>
              )}
            </>
          )}
          {editingAssignment && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {studentMap.get(editingAssignment.student_id)?.full_name}
            </p>
          )}

          <Select label="Vehicle *" value={assignVehicleId} required
            onChange={(e) => { setAssignVehicleId(e.target.value); setAssignStopId(firstStopOf(e.target.value)); }}>
            {(['bus', 'van'] as const).map((t) => {
              const list = vehicles.filter((v) => vt(v.vehicle_type) === t);
              if (!list.length) return null;
              return (
                <optgroup key={t} label={VEHICLE[t].plural}>
                  {list.map((v) => {
                    const left = seatsLeft(v, assignStudentId);
                    const off = (v.status || 'active') !== 'active';
                    return (
                      <option key={v.id} value={v.id} disabled={off}>
                        {v.bus_number} — {v.route_name} · {off ? statusLabel[v.status!] : left > 0 ? `${left} seats left` : 'Full'}
                      </option>
                    );
                  })}
                </optgroup>
              );
            })}
          </Select>

          <Select label="Stop *" value={assignStopId} onChange={(e) => setAssignStopId(e.target.value)} required>
            <option value="">Choose stop...</option>
            {(assignVehicle?.stops ?? []).map((st, i) => (
              <option key={st.id} value={st.id}>
                {i + 1}. {st.stop_name} — {formatCurrency(st.amount)}/{periodWord(st.fare_period)}
              </option>
            ))}
          </Select>

          {assignStop && assignVehicle && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${VEHICLE[vt(assignVehicle.vehicle_type)].tile}`}>
                  {(() => { const I = VEHICLE[vt(assignVehicle.vehicle_type)].Icon; return <I className="h-4 w-4" />; })()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{assignStop.stop_name}</p>
                  <p className="text-[11px] text-slate-500">
                    {[assignStop.area_landmark, assignStop.pickup_time && `↑ ${assignStop.pickup_time}`, assignStop.drop_time && `↓ ${assignStop.drop_time}`].filter(Boolean).join(' · ') || assignVehicle.route_name}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900">{formatCurrency(assignStop.amount)}</p>
                <p className="text-[10px] text-slate-500">/ {periodWord(assignStop.fare_period)}</p>
              </div>
            </div>
          )}

          <Input label="Start date" type="date" value={assignStartDate} onChange={(e) => setAssignStartDate(e.target.value)} />

          {!editingAssignment && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-3.5">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={autoCreateFee} onChange={(e) => setAutoCreateFee(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Create transport fee {assignStop ? `(${formatCurrency(assignStop.amount)})` : ''}
                  </p>
                  <p className="text-[11px] text-slate-500">Adds an invoice in Fees so the parent can pay it.</p>
                </div>
              </label>
              {autoCreateFee && (
                <Input label="Fee due date" type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} />
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editingAssignment || existingLive ? 'Save' : 'Assign'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── Reject ── */}
      <Modal open={Boolean(rejectAssignmentId)} onClose={() => setRejectAssignmentId(null)} title="Reject Application" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
            <p className="text-sm text-amber-800">The parent gets this reason as a notification.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason *</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3}
              placeholder="e.g. This van is full. Please choose the bus on the same route."
              className="w-full rounded-[10px] border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectAssignmentId(null)}>Cancel</Button>
            <Button loading={saving} onClick={handleConfirmReject} className="border-0 bg-red-600 text-white hover:bg-red-700">
              Reject
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(stopAssignmentId)}
        onClose={() => setStopAssignmentId(null)}
        onConfirm={handleConfirmStopTransport}
        title="Stop Transport"
        message="Stop transport for this student from today? Fee records already created are kept."
        confirmText="Stop Transport"
        variant="danger"
        loading={saving}
      />

      <ConfirmDialog
        open={Boolean(deleteVehicleId)}
        onClose={() => setDeleteVehicleId(null)}
        onConfirm={handleConfirmDeleteVehicle}
        title="Delete Vehicle"
        message="Delete this vehicle and all its stops? Vehicles with student history can't be deleted — mark them Inactive instead."
        confirmText="Delete"
        variant="danger"
        loading={saving}
      />
    </DashboardLayout>
  );
}
