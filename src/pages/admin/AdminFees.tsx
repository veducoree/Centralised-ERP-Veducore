import { useEffect, useState, useCallback } from 'react';
import { Plus, IndianRupee, Trash2, CreditCard, Eye, EyeOff, CheckCircle, Info } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SearchInput, PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchFees, fetchStudents, fetchFeeTypes, fetchClasses, createFee, recordFeePayment, deleteFee } from '@/services/api';
import type { Fee, Student, FeeType, FeeStructure, PaymentSetup, Class } from '@/types';
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
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'Cash', receipt_number: '' });

  // ── Tab 2: Fee Structure ──
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>(SAMPLE_STRUCTURES);
  const [classes, setClasses] = useState<Class[]>([]);
  const [structureModalOpen, setStructureModalOpen] = useState(false);
  const [editingStructure, setEditingStructure] = useState<FeeStructure | null>(null);
  const [deleteStructureId, setDeleteStructureId] = useState<string | null>(null);
  const [structureForm, setStructureForm] = useState({
    name: '', fee_type: 'Tuition', class_id: '', amount: '', frequency: 'annual' as FeeStructure['frequency'],
    due_day: '', academic_year: '2024-25', is_active: true,
  });
  const [assigningStructure, setAssigningStructure] = useState<FeeStructure | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  // ── Tab 3: Payment Setup ──
  const [setupForm, setSetupForm] = useState<Omit<PaymentSetup, 'id' | 'school_id' | 'is_verified' | 'created_at' | 'updated_at'>>({
    razorpay_key_id: '', account_holder_name: '',
    bank_name: '', account_number: '', ifsc_code: '',
  });
  const [setupSaved, setSetupSaved] = useState(false);
  const [showAccountNo, setShowAccountNo] = useState(false);
  const [setupErrors, setSetupErrors] = useState<Record<string, string>>({});

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

  // Load payment setup from localStorage on mount
  useEffect(() => {
    if (!profile?.school_id) return;
    const stored = localStorage.getItem(`veducore_payment_setup_${profile.school_id}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as PaymentSetup;
        setSetupForm({
          razorpay_key_id: parsed.razorpay_key_id || '',
          account_holder_name: parsed.account_holder_name || '',
          bank_name: parsed.bank_name || '',
          account_number: parsed.account_number || '',
          ifsc_code: parsed.ifsc_code || '',
        });
        setSetupSaved(true);
      } catch { /* ignore */ }
    }
  }, [profile?.school_id]);

  // ── Tab 1: Filters ──
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
    if (!profile?.school_id || !feeForm.student_id || !feeForm.fee_type || !feeForm.amount) return;
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
      loadData();
    } catch { toast('Failed to create fee', 'error'); }
    finally { setSaving(false); }
  }

  async function handlePayment() {
    if (!selectedFee || !profile?.school_id) return;
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
      loadData();
    } catch { toast('Failed to record payment', 'error'); }
    finally { setSaving(false); }
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
    setStructureModalOpen(true);
  }

  function openEditStructure(fs: FeeStructure) {
    setEditingStructure(fs);
    setStructureForm({
      name: fs.name, fee_type: fs.fee_type, class_id: fs.class_id || '',
      amount: fs.amount.toString(), frequency: fs.frequency,
      due_day: fs.due_day?.toString() || '', academic_year: fs.academic_year, is_active: fs.is_active,
    });
    setStructureModalOpen(true);
  }

  function handleSaveStructure() {
    if (!profile?.school_id || !structureForm.name || !structureForm.amount) {
      toast('Please fill required fields', 'error');
      return;
    }
    const now = new Date().toISOString();
    if (editingStructure) {
      setFeeStructures((prev) => prev.map((s) =>
        s.id === editingStructure.id
          ? { ...s, ...structureForm, class_id: structureForm.class_id || null, amount: parseFloat(structureForm.amount), due_day: structureForm.due_day ? parseInt(structureForm.due_day) : null, updated_at: now }
          : s
      ));
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
      setFeeStructures((prev) => [...prev, newEntry]);
    }
    setStructureModalOpen(false);
    toast(editingStructure ? 'Fee structure updated' : 'Fee structure added', 'success');
  }

  function handleDeleteStructure() {
    if (!deleteStructureId) return;
    setFeeStructures((prev) => prev.filter((s) => s.id !== deleteStructureId));
    toast('Fee structure deleted', 'success');
  }

  async function handleAssignToStudents(fs: FeeStructure) {
    if (!profile?.school_id) return;
    setAssignLoading(true);
    try {
      const studs = await fetchStudents(profile.school_id, fs.class_id ? { classId: fs.class_id } : undefined);
      const today = new Date();
      const dueDate = fs.due_day
        ? new Date(today.getFullYear(), today.getMonth(), fs.due_day).toISOString().split('T')[0]
        : today.toISOString().split('T')[0];
      await Promise.all(studs.map((s) =>
        createFee({ school_id: profile.school_id!, student_id: s.id, fee_type: fs.fee_type, amount: fs.amount, due_date: dueDate })
      ));
      toast(`Assigned to ${studs.length} students`, 'success');
      setAssigningStructure(null);
      loadData();
    } catch { toast('Failed to assign fees', 'error'); }
    finally { setAssignLoading(false); }
  }

  // ── Tab 3: Setup Handlers ──
  function handleSaveSetup() {
    if (!profile?.school_id) return;
    const errors: Record<string, string> = {};
    if (!setupForm.razorpay_key_id.startsWith('rzp_')) errors.razorpay_key_id = 'Key must start with rzp_';
    if (setupForm.ifsc_code.length !== 11) errors.ifsc_code = 'IFSC must be exactly 11 characters';
    if (!setupForm.account_holder_name) errors.account_holder_name = 'Required';
    if (!setupForm.bank_name) errors.bank_name = 'Required';
    if (!setupForm.account_number) errors.account_number = 'Required';
    setSetupErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast('Please fix the errors before saving', 'error');
      return;
    }
    const data: PaymentSetup = {
      id: `setup-${profile.school_id}`,
      school_id: profile.school_id,
      ...setupForm,
      ifsc_code: setupForm.ifsc_code.toUpperCase(),
      is_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(`veducore_payment_setup_${profile.school_id}`, JSON.stringify(data));
    setSetupSaved(true);
    toast('Payment setup saved successfully', 'success');
  }

  const maskedKey = setupForm.razorpay_key_id.length > 4
    ? 'rzp_****' + setupForm.razorpay_key_id.slice(-4)
    : setupForm.razorpay_key_id;

  const platformFeesTotal = fees.filter((f) => isOnlinePayment(f.payment_method)).length * 5;

  const TAB_CLASSES = {
    active: 'border-b-2 border-blue-600 text-blue-600 font-semibold bg-white px-4 py-2.5 text-sm',
    inactive: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-4 py-2.5 text-sm border-b-2 border-transparent',
  };

  const frequencyLabel: Record<FeeStructure['frequency'], string> = {
    one_time: 'One Time', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual',
  };

  return (
    <DashboardLayout title="Fees">
      <div className="space-y-6">
        <PageHeader title="Fee Management" description="Manage fee records, structures and online payment setup" />

        {/* ── Tab Bar ── */}
        <div className="border-b border-gray-200">
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
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setFeeForm({ student_id: '', fee_type: '', amount: '', due_date: new Date().toISOString().split('T')[0] }); setModalOpen(true); }}>Add Fee</Button>
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
                className="h-[42px] rounded-xl border border-gray-200 bg-white px-3 pr-8 text-sm text-gray-700 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-44 appearance-none bg-no-repeat"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundPosition: 'right 12px center' }}
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
                className="h-[42px] rounded-xl border border-gray-200 bg-white px-3 pr-8 text-sm text-gray-700 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-44 appearance-none bg-no-repeat"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundPosition: 'right 12px center' }}
              >
                <option value="all">All Methods</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            {loading ? (
              <LoadingSpinner />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
                <IndianRupee className="h-12 w-12 text-gray-300 mb-3" />
                <p className="font-medium text-gray-600">No fee records found</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50/50">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-600">Student</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Fee Type</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Amount</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Paid</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Due Date</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Method</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((f) => (
                      <tr key={f.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-medium text-gray-900">{f.student?.full_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{f.fee_type}</td>
                        <td className="px-4 py-3 text-gray-700">{formatCurrency(f.amount, '₹')}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <span>{formatCurrency(f.paid_amount, '₹')}</span>
                          {isOnlinePayment(f.payment_method) && (
                            <span className="ml-1 text-xs text-violet-500" title="₹5 platform fee collected">₹5</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{formatDate(f.due_date)}</td>
                        <td className="px-4 py-3">
                          {f.payment_method ? (
                            isOnlinePayment(f.payment_method)
                              ? <Badge variant="default">Online</Badge>
                              : <Badge variant="neutral">Offline</Badge>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                            {f.status !== 'paid' && (
                              <Button size="sm" variant="outline" icon={<CreditCard className="h-3.5 w-3.5" />} onClick={() => { setSelectedFee(f); setPaymentForm({ ...paymentForm, amount: f.remaining_amount.toString() }); setPaymentModalOpen(true); }}>Pay</Button>
                            )}
                            <button onClick={() => setDeleteId(f.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
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
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">⚠</span>
              <p className="text-sm text-amber-800">
                Fee structures are stored in-session only and will reset on page reload. Use "Assign to Students" to create persistent fee records for each student.
              </p>
            </div>
            <div className="flex justify-end">
              <Button icon={<Plus className="h-4 w-4" />} onClick={openAddStructure}>Add Fee Structure</Button>
            </div>

            {feeStructures.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
                <IndianRupee className="h-12 w-12 text-gray-300 mb-3" />
                <p className="font-medium text-gray-600">No fee structures defined</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50/50">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-600">Name</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Type</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Class</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Amount</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Frequency</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Due Day</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {feeStructures.map((fs) => (
                      <tr key={fs.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-medium text-gray-900">{fs.name}</td>
                        <td className="px-4 py-3 text-gray-700">{fs.fee_type}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {fs.class_id ? (classes.find((c) => c.id === fs.class_id)?.name || fs.class_id) : 'All Classes'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{formatCurrency(fs.amount, '₹')}</td>
                        <td className="px-4 py-3 text-gray-700">{frequencyLabel[fs.frequency]}</td>
                        <td className="px-4 py-3 text-gray-700">{fs.due_day ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={fs.is_active ? 'success' : 'neutral'}>{fs.is_active ? 'Active' : 'Inactive'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                            <Button size="sm" variant="outline" onClick={() => openEditStructure(fs)}>Edit</Button>
                            <Button size="sm" variant="outline" onClick={() => setAssigningStructure(fs)}>Assign to Students</Button>
                            <button onClick={() => setDeleteStructureId(fs.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
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
            {/* Info banner */}
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
              <p className="text-sm font-medium text-blue-800">Platform Fee Notice</p>
              <p className="mt-1 text-sm text-blue-700">
                A ₹5 platform fee is charged per successful online payment. This fee is collected by Veducore; the remaining amount is credited to your school.
              </p>
            </div>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Razorpay & Bank Details</h3>
                {setupSaved && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Payment Setup Complete ✓ ({maskedKey})
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Input
                    label="Razorpay Key ID"
                    value={setupForm.razorpay_key_id}
                    onChange={(e) => setSetupForm({ ...setupForm, razorpay_key_id: e.target.value })}
                    placeholder="rzp_live_..."
                  />
                  {setupErrors.razorpay_key_id && <p className="mt-1 text-xs text-red-600">{setupErrors.razorpay_key_id}</p>}
                </div>
                <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 p-3 sm:col-span-2">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-700">
                    Only your Razorpay <strong>Key ID</strong> (publishable key) is stored here. Your <strong>Key Secret</strong> should never be entered into a browser — keep it only on your server or Razorpay dashboard.
                  </p>
                </div>
                <div>
                  <Input
                    label="Account Holder Name"
                    value={setupForm.account_holder_name}
                    onChange={(e) => setSetupForm({ ...setupForm, account_holder_name: e.target.value })}
                  />
                  {setupErrors.account_holder_name && <p className="mt-1 text-xs text-red-600">{setupErrors.account_holder_name}</p>}
                </div>
                <div>
                  <Input
                    label="Bank Name"
                    value={setupForm.bank_name}
                    onChange={(e) => setSetupForm({ ...setupForm, bank_name: e.target.value })}
                  />
                  {setupErrors.bank_name && <p className="mt-1 text-xs text-red-600">{setupErrors.bank_name}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Account Number</label>
                  <div className="relative">
                    <input
                      type={showAccountNo ? 'text' : 'password'}
                      value={setupForm.account_number}
                      onChange={(e) => setSetupForm({ ...setupForm, account_number: e.target.value })}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 pr-10 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="Account number"
                    />
                    <button type="button" onClick={() => setShowAccountNo((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showAccountNo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {setupErrors.account_number && <p className="mt-1 text-xs text-red-600">{setupErrors.account_number}</p>}
                </div>
                <div>
                  <Input
                    label="IFSC Code"
                    value={setupForm.ifsc_code}
                    onChange={(e) => setSetupForm({ ...setupForm, ifsc_code: e.target.value.toUpperCase() })}
                    placeholder="e.g. HDFC0001234"
                  />
                  {setupErrors.ifsc_code && <p className="mt-1 text-xs text-red-600">{setupErrors.ifsc_code}</p>}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={handleSaveSetup}>Save & Verify</Button>
              </div>
            </Card>

            {/* How it works */}
            <Card className="p-4 bg-blue-50 border-blue-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">How Online Payments Work</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>• Parent clicks "Pay Now" on their fee and selects a payment plan (full, quarterly, or EMI).</li>
                <li>• Payment is processed securely via Razorpay. A ₹5 platform fee is added to each transaction for Veducore.</li>
                <li>• On success, the fee record is updated automatically and an invoice is generated for the parent to download or print.</li>
              </ul>
            </Card>

            {/* Platform fees collected stat */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Platform Fees Collected"
                value={formatCurrency(platformFeesTotal, '₹')}
                icon={<IndianRupee className="h-5 w-5" />}
                color="violet"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Add Fee Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Fee Record" size="md"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleCreateFee} loading={saving}>Create</Button></>}>
        <div className="space-y-4">
          <Select label="Student" required value={feeForm.student_id} onChange={(e) => setFeeForm({ ...feeForm, student_id: e.target.value })}>
            <option value="">Select student...</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.admission_number})</option>)}
          </Select>
          <Select label="Fee Type" required value={feeForm.fee_type} onChange={(e) => {
            const ft = feeTypes.find((t) => t.name === e.target.value);
            setFeeForm({ ...feeForm, fee_type: e.target.value, amount: ft?.default_amount.toString() || feeForm.amount });
          }}>
            <option value="">Select fee type...</option>
            {feeTypes.map((ft) => <option key={ft.id} value={ft.name}>{ft.name}</option>)}
            <option value="Custom">Custom</option>
          </Select>
          <Input label="Amount" type="number" required value={feeForm.amount} onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })} />
          <Input label="Due Date" type="date" required value={feeForm.due_date} onChange={(e) => setFeeForm({ ...feeForm, due_date: e.target.value })} />
        </div>
      </Modal>

      {/* ── Record Payment Modal ── */}
      <Modal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="Record Payment" description={`For ${selectedFee?.student?.full_name} - ${selectedFee?.fee_type}`} size="md"
        footer={<><Button variant="outline" onClick={() => setPaymentModalOpen(false)}>Cancel</Button><Button onClick={handlePayment} loading={saving}>Record Payment</Button></>}>
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Total Amount:</span><span className="font-medium">{formatCurrency(selectedFee?.amount || 0, '₹')}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Already Paid:</span><span className="font-medium">{formatCurrency(selectedFee?.paid_amount || 0, '₹')}</span></div>
            <div className="flex justify-between border-t border-gray-200 mt-1 pt-1"><span className="text-gray-500">Remaining:</span><span className="font-bold text-red-600">{formatCurrency(selectedFee?.remaining_amount || 0, '₹')}</span></div>
          </div>
          <Input label="Payment Amount" type="number" required value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
          <Input label="Payment Date" type="date" required value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} />
          <Select label="Payment Method" value={paymentForm.payment_method} onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}>
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
            <option value="Online">Online Payment</option>
            <option value="Card">Card Payment</option>
          </Select>
          <Input label="Receipt Number" value={paymentForm.receipt_number} onChange={(e) => setPaymentForm({ ...paymentForm, receipt_number: e.target.value })} placeholder="Optional" />
        </div>
      </Modal>

      {/* ── Delete Fee Confirm ── */}
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Fee" message="Are you sure you want to delete this fee record?" confirmText="Delete" variant="danger" />

      {/* ── Fee Structure Modal ── */}
      <Modal open={structureModalOpen} onClose={() => setStructureModalOpen(false)} title={editingStructure ? 'Edit Fee Structure' : 'Add Fee Structure'} size="md"
        footer={<><Button variant="outline" onClick={() => setStructureModalOpen(false)}>Cancel</Button><Button onClick={handleSaveStructure}>{editingStructure ? 'Save Changes' : 'Add'}</Button></>}>
        <div className="space-y-4">
          <Input label="Name" required value={structureForm.name} onChange={(e) => setStructureForm({ ...structureForm, name: e.target.value })} placeholder="e.g. Annual Tuition Fee" />
          <Select label="Fee Type" value={structureForm.fee_type} onChange={(e) => setStructureForm({ ...structureForm, fee_type: e.target.value })}>
            {['Admission', 'Tuition', 'Transport', 'Hostel', 'Activity', 'Other'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Select label="Class" value={structureForm.class_id} onChange={(e) => setStructureForm({ ...structureForm, class_id: e.target.value })}>
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Amount (₹)" type="number" required value={structureForm.amount} onChange={(e) => setStructureForm({ ...structureForm, amount: e.target.value })} />
          <Select label="Frequency" value={structureForm.frequency} onChange={(e) => setStructureForm({ ...structureForm, frequency: e.target.value as FeeStructure['frequency'] })}>
            <option value="one_time">One Time</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </Select>
          {structureForm.frequency !== 'one_time' && (
            <Input label="Due Day (1-31)" type="number" value={structureForm.due_day} onChange={(e) => setStructureForm({ ...structureForm, due_day: e.target.value })} placeholder="Day of month" />
          )}
          <Input label="Academic Year" value={structureForm.academic_year} onChange={(e) => setStructureForm({ ...structureForm, academic_year: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={structureForm.is_active} onChange={(e) => setStructureForm({ ...structureForm, is_active: e.target.checked })} className="rounded" />
            Active
          </label>
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
          <div className="space-y-3 text-sm text-gray-700">
            <p>This will create a fee record of <strong>{formatCurrency(assigningStructure.amount, '₹')}</strong> ({assigningStructure.fee_type}) for:</p>
            <p className="font-medium">
              {assigningStructure.class_id
                ? (classes.find((c) => c.id === assigningStructure.class_id)?.name || assigningStructure.class_id) + ' students'
                : 'All students in the school'}
            </p>
            <p className="text-gray-500">Are you sure you want to proceed?</p>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
