import { useEffect, useState, useCallback } from 'react';
import { Plus, IndianRupee, Trash2, CreditCard, Eye, EyeOff, CheckCircle, Info } from 'lucide-react';
// Info is used in the Razorpay Key ID hint box in Tab 3
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { required, positiveNumber, paymentAmount, range } from '@/lib/validators';
import { SearchInput, PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchFees, fetchStudents, fetchFeeTypes, fetchClasses, createFee, recordFeePayment, deleteFee, fetchSchool, updateSchool, fetchGatewayStatus, saveGateway, disableGateway, onlineCharges, type GatewayStatus } from '@/services/api';
import type { Fee, Student, FeeType, FeeStructure, Class } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { StatusBadge, Badge } from '@/components/ui/Badge';

type ActiveTab = 'records' | 'structure' | 'setup';
type MethodFilter = 'all' | 'online' | 'offline';

const SAMPLE_STRUCTURES: FeeStructure[] = [
  { id: 'sample-1', school_id: '', name: 'Annual Tuition Fee 2024-25', fee_type: 'Tuition', class_id: null, amount: 25000, frequency: 'annual', due_day: 1, academic_year: '2024-25', is_active: true, created_at: '', updated_at: '' },
  { id: 'sample-2', school_id: '', name: 'Admission Fee', fee_type: 'Admission', class_id: null, amount: 5000, frequency: 'one_time', due_day: null, academic_year: '2024-25', is_active: true, created_at: '', updated_at: '' },
  { id: 'sample-3', school_id: '', name: 'Transport Fee', fee_type: 'Transport', class_id: null, amount: 3000, frequency: 'quarterly', due_day: 5, academic_year: '2024-25', is_active: true, created_at: '', updated_at: '' },
];

export default function AdminFees() {
  const { profile } = useAuth();
  const toast = useToast();

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<ActiveTab>('records');

  // ── Tab 1: Fee Records ──
  const [fees, setFees] = useState<Fee[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedFee, setSelectedFee] = useState<Fee | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feeForm, setFeeForm] = useState({ student_id: '', fee_type: '', amount: '', due_date: '' });
  const [feeErrors, setFeeErrors] = useState<Record<string, string>>({});
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'Cash', receipt_number: '' });
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({});

  // ── Tab 2: Fee Structure ──
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [structureModalOpen, setStructureModalOpen] = useState(false);
  const [editingStructure, setEditingStructure] = useState<FeeStructure | null>(null);
  const [deleteStructureId, setDeleteStructureId] = useState<string | null>(null);
  const [structureForm, setStructureForm] = useState({
    name: '', fee_type: 'Tuition', class_id: '', amount: '', frequency: 'annual' as FeeStructure['frequency'],
    due_day: '', academic_year: '2024-25', is_active: true,
  });
  const [structureErrors, setStructureErrors] = useState<Record<string, string>>({});
  const [structureSaving, setStructureSaving] = useState(false);
  const [assigningStructure, setAssigningStructure] = useState<FeeStructure | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  // ── Tab 3: Payment Setup (keys live on the server; the secret never comes back) ──
  const [gateway, setGateway] = useState<GatewayStatus>({ active: false });
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [gatewaySaving, setGatewaySaving] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [f, s, ft, cl] = await Promise.all([
        fetchFees({ schoolId: profile.school_id, status: statusFilter || undefined }),
        fetchStudents(profile.school_id),
        fetchFeeTypes(profile.school_id),
        fetchClasses(profile.school_id),
      ]);
      setFees(f);
      setStudents(s);
      setFeeTypes(ft);
      setClasses(cl);
    } catch { toast('Failed to load fees', 'error'); }
    finally { setLoading(false); }
  }, [profile?.school_id, statusFilter, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Patch school_id in sample structures once profile loads
  useEffect(() => {
    if (profile?.school_id) {
      setFeeStructures((prev) =>
        prev.map((s) => s.school_id === '' ? { ...s, school_id: profile.school_id! } : s)
      );
    }
  }, [profile?.school_id]);

  useEffect(() => {
    if (profile?.school_id) fetchGatewayStatus().then(setGateway).catch(() => {});
  }, [profile?.school_id]);

  // Load fee structures from school.settings or localStorage
  useEffect(() => {
    if (!profile?.school_id) return;
    const schoolId = profile.school_id;
    const stored = localStorage.getItem(`veducore_fee_structures_${schoolId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as FeeStructure[];
        if (Array.isArray(parsed)) {
          // Filter out legacy sample-1/2/3 entries so only admin-created structures remain
          const real = parsed.filter((s) => !s.id.startsWith('sample-'));
          setFeeStructures(real);
        }
      } catch { /* ignore */ }
    }
    fetchSchool(schoolId)
      .then((sch) => {
        const dbStructures = (sch?.settings as Record<string, unknown> | undefined)?.fee_structures;
        if (Array.isArray(dbStructures)) {
          const clean = (dbStructures as FeeStructure[]).filter((s) => !s.id.startsWith('sample-'));
          setFeeStructures(clean);
          localStorage.setItem(`veducore_fee_structures_${schoolId}`, JSON.stringify(clean));
        }
      })
      .catch(() => {});
  }, [profile?.school_id]);

  const persistStructuresToSchool = useCallback(
    async (nextStructures: FeeStructure[]) => {
      if (!profile?.school_id) return;
      localStorage.setItem(
        `veducore_fee_structures_${profile.school_id}`,
        JSON.stringify(nextStructures)
      );
      try {
        const sch = await fetchSchool(profile.school_id);
        const existingSettings =
          sch?.settings && typeof sch.settings === 'object'
            ? (sch.settings as Record<string, unknown>)
            : {};
        await updateSchool(profile.school_id, {
          settings: {
            ...existingSettings,
            fee_structures: nextStructures,
          },
        });
      } catch {
        // ignore
      }
    },
    [profile?.school_id]
  );  // ── Tab 1: Filters ──
  const isOnlinePayment = (pm: string | null) =>
    !!pm && (pm.includes('Razorpay') || pm.includes('Simulated') || pm.includes('Online'));

  const filtered = fees.filter((f) => {
    if (search) {
      const q = search.toLowerCase();
      if (!f.student?.full_name?.toLowerCase().includes(q) && !f.fee_type.toLowerCase().includes(q)) return false;
    }
    if (methodFilter === 'online' && !isOnlinePayment(f.payment_method)) return false;
    if (methodFilter === 'offline' && isOnlinePayment(f.payment_method)) return false;
    return true;
  });

  const totalCollected = fees.reduce((sum, f) => sum + Number(f.paid_amount), 0);
  const totalOutstanding = fees.reduce((sum, f) => sum + Number(f.remaining_amount), 0);
  const totalPending = fees.filter((f) => f.status === 'pending').length;

  // ── Tab 1: Handlers ──
  async function handleCreateFee() {
    if (!profile?.school_id) return;
    // Validate
    const e: Record<string, string> = {};
    if (!feeForm.student_id) e.student_id = 'Please select a student';
    if (!feeForm.fee_type)   e.fee_type   = 'Please select a fee type';
    const amtErr = required(feeForm.amount, 'Amount') ?? positiveNumber(feeForm.amount, 'Amount');
    if (amtErr) e.amount = amtErr;
    if (!feeForm.due_date)   e.due_date   = 'Due date is required';
    setFeeErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      await createFee({
        school_id: profile.school_id,
        student_id: feeForm.student_id,
        fee_type: feeForm.fee_type,
        amount: parseFloat(feeForm.amount),
        due_date: feeForm.due_date,
      });
      toast('Fee record created', 'success');
      setModalOpen(false);
      setFeeForm({ student_id: '', fee_type: '', amount: '', due_date: '' });
      setFeeErrors({});
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create fee', 'error');
    } finally { setSaving(false); }
  }

  async function handlePayment() {
    if (!selectedFee || !profile?.school_id) return;
    const remaining = Number(selectedFee.remaining_amount);
    // Validate
    const e: Record<string, string> = {};
    const amtErr = paymentAmount(paymentForm.amount, remaining, 'Payment amount');
    if (amtErr) e.amount = amtErr;
    if (!paymentForm.payment_date) e.payment_date = 'Payment date is required';
    setPaymentErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      await recordFeePayment(selectedFee.id, {
        school_id: profile.school_id,
        student_id: selectedFee.student_id,
        amount: parseFloat(paymentForm.amount),
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        receipt_number: paymentForm.receipt_number || undefined,
        recorded_by: profile.id,
      });
      toast('Payment recorded successfully', 'success');
      setPaymentModalOpen(false);
      setPaymentForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'Cash', receipt_number: '' });
      setPaymentErrors({});
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to record payment', 'error');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await deleteFee(deleteId); toast('Fee deleted', 'success'); loadData(); }
    catch { toast('Failed to delete fee', 'error'); }
  }

  // ── Tab 2: Structure Handlers ──
  function openAddStructure() {
    setEditingStructure(null);
    setStructureForm({ name: '', fee_type: 'Tuition', class_id: '', amount: '', frequency: 'annual', due_day: '', academic_year: '2024-25', is_active: true });
    setStructureErrors({});
    setStructureModalOpen(true);
  }

  function openEditStructure(fs: FeeStructure) {
    setEditingStructure(fs);
    setStructureForm({
      name: fs.name, fee_type: fs.fee_type, class_id: fs.class_id || '',
      amount: fs.amount.toString(), frequency: fs.frequency,
      due_day: fs.due_day?.toString() || '', academic_year: fs.academic_year, is_active: fs.is_active,
    });
    setStructureErrors({});
    setStructureModalOpen(true);
  }

  async function handleSaveStructure() {
    if (!profile?.school_id) return;
    // Validate
    const e: Record<string, string> = {};
    const nameErr = required(structureForm.name, 'Name');
    if (nameErr) e.name = nameErr;
    const amtErr = required(structureForm.amount, 'Amount') ?? positiveNumber(structureForm.amount, 'Amount');
    if (amtErr) e.amount = amtErr;
    if (!structureForm.academic_year.trim()) e.academic_year = 'Academic year is required';
    if (structureForm.due_day) {
      const dayErr = range(1, 31)(structureForm.due_day, 'Due day');
      if (dayErr) e.due_day = dayErr;
    }
    setStructureErrors(e);
    if (Object.keys(e).length > 0) return;

    setStructureSaving(true);
    try {
      const now = new Date().toISOString();
      let updatedList: FeeStructure[] = [];
      if (editingStructure) {
        updatedList = feeStructures.map((s) =>
          s.id === editingStructure.id
            ? { ...s, ...structureForm, class_id: structureForm.class_id || null, amount: parseFloat(structureForm.amount), due_day: structureForm.due_day ? parseInt(structureForm.due_day) : null, updated_at: now }
            : s
        );
      } else {
        const newEntry: FeeStructure = {
          id: Date.now().toString(),
          school_id: profile.school_id,
          name: structureForm.name,
          fee_type: structureForm.fee_type,
          class_id: structureForm.class_id || null,
          amount: parseFloat(structureForm.amount),
          frequency: structureForm.frequency,
          due_day: structureForm.due_day ? parseInt(structureForm.due_day) : null,
          academic_year: structureForm.academic_year,
          is_active: structureForm.is_active,
          created_at: now,
          updated_at: now,
        };
        updatedList = [...feeStructures, newEntry];
      }
      setFeeStructures(updatedList);
      await persistStructuresToSchool(updatedList);
      setStructureModalOpen(false);
      setStructureErrors({});
      toast(editingStructure ? 'Fee structure updated' : 'Fee structure added', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save fee structure', 'error');
    } finally {
      setStructureSaving(false);
    }
  }

  function handleDeleteStructure() {
    if (!deleteStructureId) return;
    const updatedList = feeStructures.filter((s) => s.id !== deleteStructureId);
    setFeeStructures(updatedList);
    persistStructuresToSchool(updatedList);
    toast('Fee structure deleted', 'success');
  }

  async function handleAssignToStudents(fs: FeeStructure) {
    if (!profile?.school_id) return;
    setAssignLoading(true);
    try {
      const studs = await fetchStudents(profile.school_id, fs.class_id ? { classId: fs.class_id } : undefined);
      const today = new Date();
      const currentYear = today.getFullYear();

      // Indian academic year month names April-first
      const MONTH_NAMES_AC = [
        'April', 'May', 'June', 'July', 'August', 'September',
        'October', 'November', 'December', 'January', 'February', 'March',
      ];

      if (fs.frequency === 'monthly') {
        // 12 records per student, April–March academic year
        const tasks: Promise<unknown>[] = [];
        for (const s of studs) {
          for (let i = 0; i < 12; i++) {
            const monthName = MONTH_NAMES_AC[i];
            // April(3)–December(11) use currentYear; January(0)–March(2) use currentYear+1
            const calMonth = i < 9 ? 3 + i : i - 9;
            const calYear  = i < 9 ? currentYear : currentYear + 1;
            const dueDay   = fs.due_day ?? 1;
            const dueDate  = new Date(calYear, calMonth, dueDay).toISOString().split('T')[0];
            tasks.push(
              createFee({
                school_id: profile.school_id!,
                student_id: s.id,
                fee_type: `${fs.name} - ${monthName}`,
                amount: fs.amount,
                due_date: dueDate,
              })
            );
          }
        }
        await Promise.all(tasks);
        toast(`Assigned 12 monthly records to ${studs.length} students`, 'success');

      } else if (fs.frequency === 'quarterly') {
        // 4 records per student
        const quarters: Array<{ label: string; calMonth: number; calYear: number }> = [
          { label: 'Q1', calMonth: 3,  calYear: currentYear },
          { label: 'Q2', calMonth: 6,  calYear: currentYear },
          { label: 'Q3', calMonth: 9,  calYear: currentYear },
          { label: 'Q4', calMonth: 0,  calYear: currentYear + 1 },
        ];
        const tasks: Promise<unknown>[] = [];
        for (const s of studs) {
          for (const q of quarters) {
            const dueDay  = fs.due_day ?? 1;
            const dueDate = new Date(q.calYear, q.calMonth, dueDay).toISOString().split('T')[0];
            tasks.push(
              createFee({
                school_id: profile.school_id!,
                student_id: s.id,
                fee_type: `${fs.name} - ${q.label}`,
                amount: fs.amount,
                due_date: dueDate,
              })
            );
          }
        }
        await Promise.all(tasks);
        toast(`Assigned 4 quarterly records to ${studs.length} students`, 'success');

      } else {
        // one_time or annual — single record
        const dueDate = fs.due_day
          ? new Date(today.getFullYear(), today.getMonth(), fs.due_day).toISOString().split('T')[0]
          : today.toISOString().split('T')[0];
        await Promise.all(
          studs.map((s) =>
            createFee({ school_id: profile.school_id!, student_id: s.id, fee_type: fs.name, amount: fs.amount, due_date: dueDate })
          )
        );
        toast(`Assigned to ${studs.length} students`, 'success');
      }

      setAssigningStructure(null);
      loadData();
    } catch { toast('Failed to assign fees', 'error'); }
    finally { setAssignLoading(false); }
  }

  // ── Tab 3: Setup Handlers ──
  async function handleSaveGateway() {
    if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId.trim())) { toast('Key ID must look like rzp_live_… or rzp_test_…', 'error'); return; }
    if (keySecret.trim().length < 10) { toast('Enter the Key Secret', 'error'); return; }
    setGatewaySaving(true);
    try {
      await saveGateway(keyId.trim(), keySecret.trim());
      setKeySecret('');
      setGateway(await fetchGatewayStatus());
      toast('Razorpay connected — parents can now pay online', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save keys', 'error');
    } finally { setGatewaySaving(false); }
  }

  async function handleDisableGateway() {
    try {
      await disableGateway();
      setGateway(await fetchGatewayStatus());
      toast('Online payments turned off', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }

  const sample = onlineCharges(10000);

  const TAB_CLASSES = {
    active: 'border-b-2 border-brand-600 text-brand-600 font-semibold bg-white px-4 py-2.5 text-sm',
    inactive: 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 px-4 py-2.5 text-sm border-b-2 border-transparent',
  };

  const frequencyLabel: Record<FeeStructure['frequency'], string> = {
    one_time: 'One Time', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual',
  };

  return (
    <DashboardLayout title="Fees">
      <div className="space-y-6">
        <PageHeader title="Fee Management" description="Manage fee records, structures and online payment setup" />

        {/* ── Tab Bar ── */}
        <div className="border-b border-slate-200">
          <div className="flex">
            {(['records', 'structure', 'setup'] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={activeTab === tab ? TAB_CLASSES.active : TAB_CLASSES.inactive}
              >
                {tab === 'records' ? 'Fee Records' : tab === 'structure' ? 'Fee Structure' : 'Payment Setup'}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════ TAB 1: FEE RECORDS ══════════════ */}
        {activeTab === 'records' && (
          <>
            <div className="flex justify-end">
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setFeeForm({ student_id: '', fee_type: '', amount: '', due_date: new Date().toISOString().split('T')[0] }); setModalOpen(true); }}>Cash Entry</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Total Collected" value={formatCurrency(totalCollected, '₹')} icon={<IndianRupee className="h-5 w-5" />} color="emerald" />
              <StatCard label="Outstanding" value={formatCurrency(totalOutstanding, '₹')} icon={<IndianRupee className="h-5 w-5" />} color="red" />
              <StatCard label="Pending Records" value={totalPending} icon={<CreditCard className="h-5 w-5" />} color="amber" />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1 min-w-0">
                <SearchInput value={search} onChange={setSearch} placeholder="Search by student or fee type..." />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 w-full sm:w-44 rounded-[10px] border border-slate-200 bg-white px-3 pr-9 text-sm text-slate-700 transition-colors focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25 appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%239ca3af%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpolyline%20points%3D%276%209%2012%2015%2018%209%27%3E%3C/polyline%3E%3C/svg%3E')] bg-no-repeat bg-[right_12px_center]"
              >
                <option value="">All Status</option>
                <option value="paid">Paid</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
              </select>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value as MethodFilter)}
                className="h-10 w-full sm:w-44 rounded-[10px] border border-slate-200 bg-white px-3 pr-9 text-sm text-slate-700 transition-colors focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25 appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%239ca3af%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpolyline%20points%3D%276%209%2012%2015%2018%209%27%3E%3C/polyline%3E%3C/svg%3E')] bg-no-repeat bg-[right_12px_center]"
              >
                <option value="all">All Methods</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            {loading ? (
              <LoadingSpinner />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white py-16 text-center">
                <IndianRupee className="h-12 w-12 text-slate-300 mb-3" />
                <p className="font-medium text-slate-600">No fee records found</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-[#F7F8FE]">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Student</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Fee Type</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Paid</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Method</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((f) => (
                      <tr key={f.id} className="hover:bg-[#F7F8FE]">
                        <td className="px-4 py-3 font-medium text-slate-900">{f.student?.full_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-700">{f.fee_type}</td>
                        <td className="px-4 py-3 text-slate-700">{formatCurrency(f.amount, '₹')}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <span>{formatCurrency(f.paid_amount, '₹')}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{formatDate(f.due_date)}</td>
                        <td className="px-4 py-3">
                          {f.payment_method ? (
                            isOnlinePayment(f.payment_method)
                              ? <Badge variant="default">Online</Badge>
                              : <Badge variant="neutral">Offline</Badge>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                            {f.status !== 'paid' && (
                              <Button size="sm" variant="outline" icon={<CreditCard className="h-3.5 w-3.5" />} onClick={() => { setSelectedFee(f); setPaymentForm({ ...paymentForm, amount: f.remaining_amount.toString() }); setPaymentModalOpen(true); }}>Pay</Button>
                            )}
                            <button onClick={() => setDeleteId(f.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
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
          </>
        )}

        {/* ══════════════ TAB 2: FEE STRUCTURE ══════════════ */}
        {activeTab === 'structure' && (
          <>
            <div className="flex justify-end">
              <Button icon={<Plus className="h-4 w-4" />} onClick={openAddStructure}>Add Fee Structure</Button>
            </div>

            {feeStructures.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white py-16 text-center">
                <IndianRupee className="h-12 w-12 text-slate-300 mb-3" />
                <p className="font-medium text-slate-600">No fee structures defined</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-[#F7F8FE]">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Class</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Frequency</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Due Day</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {feeStructures.map((fs) => (
                      <tr key={fs.id} className="hover:bg-[#F7F8FE]">
                        <td className="px-4 py-3 font-medium text-slate-900">{fs.name}</td>
                        <td className="px-4 py-3 text-slate-700">{fs.fee_type}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {fs.class_id ? (classes.find((c) => c.id === fs.class_id)?.name || fs.class_id) : 'All Classes'}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{formatCurrency(fs.amount, '₹')}</td>
                        <td className="px-4 py-3 text-slate-700">{frequencyLabel[fs.frequency]}</td>
                        <td className="px-4 py-3 text-slate-700">{fs.due_day ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={fs.is_active ? 'success' : 'neutral'}>{fs.is_active ? 'Active' : 'Inactive'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                            <Button size="sm" variant="outline" onClick={() => openEditStructure(fs)}>Edit</Button>
                            <Button size="sm" variant="outline" onClick={() => setAssigningStructure(fs)}>Assign to Students</Button>
                            <button onClick={() => setDeleteStructureId(fs.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
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
          </>
        )}

        {/* ══════════════ TAB 3: PAYMENT SETUP ══════════════ */}
        {activeTab === 'setup' && (
          <div className="space-y-5">
            {/* Status */}
            <Card className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-center ${gateway.active ? '' : ''}`}>
              <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${gateway.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                <CreditCard className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">
                  {gateway.active ? 'Online payments are active' : 'Online payments are off'}
                </p>
                <p className="text-sm text-slate-500">
                  {gateway.active
                    ? <>Razorpay {gateway.mode === 'live' ? 'Live' : 'Test'} · key {gateway.key_hint}{gateway.mode === 'test' && ' · test mode: no real money is charged'}</>
                    : 'Add your Razorpay keys below. Until then parents pay at the school office.'}
                </p>
              </div>
              {gateway.active && <Button variant="outline" onClick={() => setDisableOpen(true)}>Turn off</Button>}
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Keys */}
              <Card className="p-6">
                <h3 className="mb-1 text-sm font-semibold text-slate-900">{gateway.active ? 'Replace Razorpay keys' : 'Connect Razorpay'}</h3>
                <p className="mb-4 text-xs text-slate-500">Razorpay Dashboard → Account &amp; Settings → API Keys. The keys are checked with Razorpay before they are activated. The secret is stored on the server only and never shown again.</p>
                <div className="space-y-4">
                  <Input label="Key ID" placeholder="rzp_live_XXXXXXXXXXXX" value={keyId} onChange={(e) => setKeyId(e.target.value)} />
                  <div className="relative">
                    <Input label="Key Secret" type={showSecret ? 'text' : 'password'} placeholder="••••••••••••••••" value={keySecret}
                      onChange={(e) => setKeySecret(e.target.value)} autoComplete="off" />
                    <button type="button" onClick={() => setShowSecret((v) => !v)} aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                      className="absolute right-3 top-8 text-slate-400 hover:text-slate-600">
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button onClick={handleSaveGateway} loading={gatewaySaving} icon={<CheckCircle className="h-4 w-4" />}>
                    Verify &amp; activate
                  </Button>
                </div>
              </Card>

              {/* How charges work */}
              <Card className="p-6">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">What parents pay online</h3>
                <div className="rounded-xl bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between py-1"><span className="text-slate-500">Fee (example)</span><span className="tabular-nums">{formatCurrency(sample.fee, '₹')}</span></div>
                  <div className="flex justify-between py-1"><span className="text-slate-500">Convenience fee (incl. GST)</span><span className="tabular-nums">{formatCurrency(sample.extra, '₹')}</span></div>
                  <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Parent pays</span><span className="tabular-nums">{formatCurrency(sample.total, '₹')}</span></div>
                </div>
                <ul className="mt-4 space-y-2 text-xs text-slate-500">
                  <li className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-500" /> The full fee amount is credited to the student's account; the convenience fee covers online processing.</li>
                  <li className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-500" /> Payments made at the office (cash, cheque) have no extra charge.</li>
                  <li className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-500" /> A fee is marked paid only after Razorpay confirms the payment.</li>
                </ul>
              </Card>
            </div>
            <ConfirmDialog open={disableOpen} onClose={() => setDisableOpen(false)} onConfirm={handleDisableGateway}
              title="Turn off online payments?" message="Parents won't be able to pay in the app until you turn it back on. Your keys stay saved." />
          </div>
        )}
      </div>

      {/* ── Add Fee Modal ── */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setFeeErrors({}); }} title="Cash Entry" size="lg"
        footer={<><Button variant="outline" onClick={() => { setModalOpen(false); setFeeErrors({}); }}>Cancel</Button><Button onClick={handleCreateFee} loading={saving}>Create</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Select label="Student" required value={feeForm.student_id}
              error={feeErrors.student_id}
              onChange={(e) => { setFeeForm({ ...feeForm, student_id: e.target.value }); setFeeErrors((prev) => ({ ...prev, student_id: '' })); }}>
              <option value="">Select student...</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.admission_number})</option>)}
            </Select>
          </div>
          <Select label="Fee Type" required value={feeForm.fee_type}
            error={feeErrors.fee_type}
            onChange={(e) => {
              const ft = feeTypes.find((t) => t.name === e.target.value);
              setFeeForm({ ...feeForm, fee_type: e.target.value, amount: ft?.default_amount.toString() || feeForm.amount });
              setFeeErrors((prev) => ({ ...prev, fee_type: '' }));
            }}>
            <option value="">Select fee type...</option>
            {feeTypes.map((ft) => <option key={ft.id} value={ft.name}>{ft.name}</option>)}
            <option value="Custom">Custom</option>
          </Select>
          <Input label="Amount (₹)" type="number" required min="0.01" step="0.01"
            value={feeForm.amount} error={feeErrors.amount}
            onChange={(e) => { setFeeForm({ ...feeForm, amount: e.target.value }); setFeeErrors((prev) => ({ ...prev, amount: '' })); }} />
          <div className="sm:col-span-2">
            <Input label="Due Date" type="date" required value={feeForm.due_date}
              error={feeErrors.due_date}
              onChange={(e) => { setFeeForm({ ...feeForm, due_date: e.target.value }); setFeeErrors((prev) => ({ ...prev, due_date: '' })); }} />
          </div>
        </div>
      </Modal>

      {/* ── Record Payment Modal ── */}
      <Modal open={paymentModalOpen} onClose={() => { setPaymentModalOpen(false); setPaymentErrors({}); }}
        title="Record Payment"
        description={selectedFee ? `${selectedFee.student?.full_name ?? ''} — ${selectedFee.fee_type}` : undefined}
        size="lg"
        footer={<><Button variant="outline" onClick={() => { setPaymentModalOpen(false); setPaymentErrors({}); }}>Cancel</Button><Button onClick={handlePayment} loading={saving}>Record Payment</Button></>}>
        <div className="space-y-4">
          {/* Balance summary banner */}
          <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50 text-center text-sm">
            <div className="px-3 py-3">
              <p className="text-xs text-slate-500 mb-0.5">Total Amount</p>
              <p className="font-semibold text-slate-900">{formatCurrency(selectedFee?.amount ?? 0, '₹')}</p>
            </div>
            <div className="px-3 py-3">
              <p className="text-xs text-slate-500 mb-0.5">Already Paid</p>
              <p className="font-semibold text-emerald-700">{formatCurrency(selectedFee?.paid_amount ?? 0, '₹')}</p>
            </div>
            <div className="px-3 py-3">
              <p className="text-xs text-slate-500 mb-0.5">Remaining</p>
              <p className="font-bold text-red-600">{formatCurrency(selectedFee?.remaining_amount ?? 0, '₹')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Payment Amount (₹)" type="number" required
              min="0.01" step="0.01"
              max={selectedFee?.remaining_amount}
              value={paymentForm.amount}
              error={paymentErrors.amount}
              hint={selectedFee ? `Max: ${formatCurrency(selectedFee.remaining_amount, '₹')}` : undefined}
              onChange={(e) => { setPaymentForm({ ...paymentForm, amount: e.target.value }); setPaymentErrors((prev) => ({ ...prev, amount: '' })); }} />
            <Input label="Payment Date" type="date" required
              value={paymentForm.payment_date}
              error={paymentErrors.payment_date}
              onChange={(e) => { setPaymentForm({ ...paymentForm, payment_date: e.target.value }); setPaymentErrors((prev) => ({ ...prev, payment_date: '' })); }} />
            <Select label="Payment Method" value={paymentForm.payment_method}
              onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
              <option value="Online">Online Payment</option>
              <option value="Card">Card Payment</option>
            </Select>
            <Input label="Receipt Number" value={paymentForm.receipt_number}
              placeholder="Auto-generated if left blank"
              onChange={(e) => setPaymentForm({ ...paymentForm, receipt_number: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* ── Delete Fee Confirm ── */}
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Fee" message="Are you sure you want to delete this fee record?" confirmText="Delete" variant="danger" />

      {/* ── Fee Structure Modal ── */}
      <Modal open={structureModalOpen} onClose={() => { setStructureModalOpen(false); setStructureErrors({}); }}
        title={editingStructure ? 'Edit Fee Structure' : 'Add Fee Structure'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => { setStructureModalOpen(false); setStructureErrors({}); }}>Cancel</Button>
            <Button onClick={handleSaveStructure} loading={structureSaving}>{editingStructure ? 'Save Changes' : 'Add'}</Button>
          </>
        }>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Name — full width */}
          <div className="sm:col-span-2">
            <Input label="Name" required value={structureForm.name}
              error={structureErrors.name}
              placeholder="e.g. Annual Tuition Fee"
              onChange={(e) => { setStructureForm({ ...structureForm, name: e.target.value }); setStructureErrors((p) => ({ ...p, name: '' })); }} />
          </div>

          <Select label="Fee Type" value={structureForm.fee_type}
            onChange={(e) => setStructureForm({ ...structureForm, fee_type: e.target.value })}>
            {['Admission', 'Tuition', 'Transport', 'Hostel', 'Activity', 'Other'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>

          <Select label="Class" value={structureForm.class_id}
            onChange={(e) => setStructureForm({ ...structureForm, class_id: e.target.value })}>
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>

          <Input label="Amount (₹)" type="number" required min="0.01" step="0.01"
            value={structureForm.amount} error={structureErrors.amount}
            onChange={(e) => { setStructureForm({ ...structureForm, amount: e.target.value }); setStructureErrors((p) => ({ ...p, amount: '' })); }} />

          <Select label="Frequency" value={structureForm.frequency}
            onChange={(e) => setStructureForm({ ...structureForm, frequency: e.target.value as FeeStructure['frequency'] })}>
            <option value="one_time">One Time</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </Select>

          {structureForm.frequency !== 'one_time' && (
            <Input label="Due Day (1–31)" type="number" min="1" max="31"
              value={structureForm.due_day} error={structureErrors.due_day}
              placeholder="Day of month"
              onChange={(e) => { setStructureForm({ ...structureForm, due_day: e.target.value }); setStructureErrors((p) => ({ ...p, due_day: '' })); }} />
          )}

          <Input label="Academic Year" required value={structureForm.academic_year}
            error={structureErrors.academic_year}
            placeholder="e.g. 2026-27"
            onChange={(e) => { setStructureForm({ ...structureForm, academic_year: e.target.value }); setStructureErrors((p) => ({ ...p, academic_year: '' })); }} />

          {/* Active checkbox — full width */}
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={structureForm.is_active}
                onChange={(e) => setStructureForm({ ...structureForm, is_active: e.target.checked })}
                className="rounded" />
              Active
            </label>
          </div>
        </div>
      </Modal>

      {/* ── Delete Structure Confirm ── */}
      <ConfirmDialog open={!!deleteStructureId} onClose={() => setDeleteStructureId(null)} onConfirm={handleDeleteStructure} title="Delete Fee Structure" message="Are you sure you want to delete this fee structure?" confirmText="Delete" variant="danger" />

      {/* ── Assign to Students Modal ── */}
      <Modal open={!!assigningStructure} onClose={() => setAssigningStructure(null)} title="Assign to Students" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssigningStructure(null)}>Cancel</Button>
            <Button onClick={() => assigningStructure && handleAssignToStudents(assigningStructure)} loading={assignLoading}>Confirm & Assign</Button>
          </>
        }>
        {assigningStructure && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              This will create fee records of{' '}
              <strong>{formatCurrency(assigningStructure.amount, '₹')}</strong> ({assigningStructure.fee_type}) for:
            </p>
            <p className="font-medium">
              {assigningStructure.class_id
                ? (classes.find((c) => c.id === assigningStructure.class_id)?.name || assigningStructure.class_id) + ' students'
                : 'All students in the school'}
            </p>
            {assigningStructure.frequency === 'monthly' && (
              <p className="text-brand-700 bg-brand-50 rounded-lg px-3 py-2">
                Monthly frequency: <strong>12 records per student</strong> will be created (April – March).
              </p>
            )}
            {assigningStructure.frequency === 'quarterly' && (
              <p className="text-brand-700 bg-brand-50 rounded-lg px-3 py-2">
                Quarterly frequency: <strong>4 records per student</strong> will be created (Q1–Q4).
              </p>
            )}
            <p className="text-slate-500">Are you sure you want to proceed?</p>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
