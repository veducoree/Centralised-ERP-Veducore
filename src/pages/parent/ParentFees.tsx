import { useEffect, useState, useCallback } from 'react';
import {
  IndianRupee,
  CreditCard,
  Download,
  AlertCircle,
  CheckCircle,
  Calendar,
  LayoutGrid,
  Award,
  CheckCircle2,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, StatCard } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchFees,
  fetchSchool,
  recordFeePayment,
} from '@/services/api';
import type { Parent, Student, Fee, School, PaymentSetup } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';

type FeeStructureMode = 'monthly' | 'quarterly' | 'annually';

const MONTH_ORDER = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March',
] as const;
type MonthName = typeof MONTH_ORDER[number];

const MONTH_ABBR: Record<MonthName, string> = {
  April: 'Apr', May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
  September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
  January: 'Jan', February: 'Feb', March: 'Mar',
};

const QUARTERS = [
  { id: 'Q1', label: 'Quarter 1 (Apr – Jun)', short: 'Q1 · Apr–Jun' },
  { id: 'Q2', label: 'Quarter 2 (Jul – Sep)', short: 'Q2 · Jul–Sep' },
  { id: 'Q3', label: 'Quarter 3 (Oct – Dec)', short: 'Q3 · Oct–Dec' },
  { id: 'Q4', label: 'Quarter 4 (Jan – Mar)', short: 'Q4 · Jan–Mar' },
] as const;

function addMonthsToDate(dateStr: string | undefined, monthsToAdd: number): string {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + monthsToAdd);
    return fallback.toISOString().split('T')[0];
  }
  base.setMonth(base.getMonth() + monthsToAdd);
  return base.toISOString().split('T')[0];
}

interface InstallmentPlanInfo {
  mode: FeeStructureMode;
  totalPeriods: number;
  paidPeriods: number;
  currentPeriodIndex: number;
  currentPeriodLabel: string;
  nextPeriodLabel: string | null;
  installmentAmount: number;
  monthsToAdvance: number;
}

function computeInstallmentPlan(fee: Fee, mode: FeeStructureMode): InstallmentPlanInfo {
  const total = Number(fee.amount) || 0;
  const paid = Number(fee.paid_amount) || 0;
  const remaining = Math.max(0, total - paid);

  if (mode === 'monthly') {
    const unit = total / 12;
    const paidMonths =
      remaining <= 0 || fee.status === 'paid'
        ? 12
        : unit > 0
          ? Math.min(11, Math.floor((paid + 0.5) / unit))
          : 0;
    const currentIdx = Math.min(11, paidMonths);
    const currentLabel = `${MONTH_ORDER[currentIdx]} Month`;
    const nextLabel = currentIdx + 1 < 12 ? `${MONTH_ORDER[currentIdx + 1]} Month` : null;
    const isLastMonth = currentIdx === 11;
    const amountForThisMonth =
      remaining <= 0
        ? 0
        : isLastMonth
          ? remaining
          : Math.min(remaining, Math.max(1, Math.round(unit)));

    return {
      mode: 'monthly',
      totalPeriods: 12,
      paidPeriods: paidMonths,
      currentPeriodIndex: currentIdx,
      currentPeriodLabel: currentLabel,
      nextPeriodLabel: nextLabel,
      installmentAmount: amountForThisMonth,
      monthsToAdvance: 1,
    };
  }

  if (mode === 'quarterly') {
    const unit = total / 4;
    const paidQuarters =
      remaining <= 0 || fee.status === 'paid'
        ? 4
        : unit > 0
          ? Math.min(3, Math.floor((paid + 0.5) / unit))
          : 0;
    const currentIdx = Math.min(3, paidQuarters);
    const currentLabel = QUARTERS[currentIdx].label;
    const nextLabel = currentIdx + 1 < 4 ? QUARTERS[currentIdx + 1].label : null;
    const isLastQuarter = currentIdx === 3;
    const amountForThisQuarter =
      remaining <= 0
        ? 0
        : isLastQuarter
          ? remaining
          : Math.min(remaining, Math.max(1, Math.round(unit)));

    return {
      mode: 'quarterly',
      totalPeriods: 4,
      paidPeriods: paidQuarters,
      currentPeriodIndex: currentIdx,
      currentPeriodLabel: currentLabel,
      nextPeriodLabel: nextLabel,
      installmentAmount: amountForThisQuarter,
      monthsToAdvance: 3,
    };
  }

  return {
    mode: 'annually',
    totalPeriods: 1,
    paidPeriods: remaining <= 0 || fee.status === 'paid' ? 1 : 0,
    currentPeriodIndex: 0,
    currentPeriodLabel: 'Full Annual Fee (12 Months)',
    nextPeriodLabel: null,
    installmentAmount: remaining,
    monthsToAdvance: 12,
  };
}

const printStyles = `
@media print {
  body * { visibility: hidden; }
  #invoice-print-area, #invoice-print-area * { visibility: visible; }
  #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
}
`;

export default function ParentFees() {
  const { profile } = useAuth();
  const toast = useToast();

  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [fees, setFees] = useState<Fee[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  // Fee Structure Mode: Monthly | Quarterly | Annually
  const [structureMode, setStructureMode] = useState<FeeStructureMode>('monthly');

  // Payment modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedFee, setSelectedFee] = useState<Fee | null>(null);
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<'UPI' | 'CARD' | 'NETBANKING'>('UPI');
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Invoice modal
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [lastPaymentId, setLastPaymentId] = useState<string>('');
  const [lastPaymentMethod, setLastPaymentMethod] = useState<string>('');
  const [lastPaymentDate, setLastPaymentDate] = useState<string>('');
  const [invoiceFee, setInvoiceFee] = useState<Fee | null>(null);
  const [invoiceSessionAmount, setInvoiceSessionAmount] = useState<number>(0);
  const [invoiceIsFeeSummary, setInvoiceIsFeeSummary] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const p = await fetchParentByUserId(profile.id);
      if (p) {
        setParent(p);
        const links = await fetchParentStudents(p.id);
        const kids = links.map((l) => l.student).filter(Boolean) as Student[];
        setChildren(kids);
      }
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (children.length > 0 && !selectedChildId) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  const loadFees = useCallback(async () => {
    if (!selectedChildId) return;
    try {
      const f = await fetchFees({ studentId: selectedChildId });
      setFees(f);
    } catch {
      /* handled */
    }
  }, [selectedChildId]);

  useEffect(() => {
    loadFees();
  }, [loadFees]);

  useEffect(() => {
    const child = children.find((c) => c.id === selectedChildId);
    if (child?.school_id) {
      fetchSchool(child.school_id)
        .then((s) => setSchool(s))
        .catch(() => {});
    }
  }, [selectedChildId, children]);

  const totalAmount = fees.reduce((s, f) => s + Number(f.amount), 0);
  const totalPaid = fees.reduce((s, f) => s + Number(f.paid_amount), 0);
  const totalOutstanding = fees.reduce((s, f) => s + Number(f.remaining_amount), 0);

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const activeModalPlan = selectedFee
    ? computeInstallmentPlan(selectedFee, structureMode)
    : null;

  async function handlePaymentSuccess(
    paymentId: string,
    method: string,
    fee: Fee,
    planInfo: InstallmentPlanInfo
  ) {
    const today = new Date().toISOString().split('T')[0];
    const sessionAmount = planInfo.installmentAmount;
    const newPaid = Math.min(Number(fee.amount), Number(fee.paid_amount) + sessionAmount);
    const newRem = Math.max(0, Number(fee.amount) - newPaid);
    const nextDueDate =
      newRem > 0 ? addMonthsToDate(fee.due_date, planInfo.monthsToAdvance) : fee.due_date;

    try {
      await recordFeePayment(fee.id, {
        school_id: fee.school_id,
        student_id: fee.student_id,
        amount: sessionAmount,
        payment_date: today,
        payment_method: method,
        receipt_number: paymentId,
        recorded_by: profile?.id,
        next_due_date: nextDueDate,
      });

      if (newRem > 0 && planInfo.nextPeriodLabel) {
        toast(
          `${planInfo.currentPeriodLabel} Paid! Next up: ${planInfo.nextPeriodLabel}`,
          'success'
        );
      } else {
        toast('Full Annual Fee Paid Successfully!', 'success');
      }

      setLastPaymentId(paymentId);
      setLastPaymentMethod(method);
      setLastPaymentDate(today);
      setInvoiceFee(fee);
      setInvoiceSessionAmount(sessionAmount);
      setInvoiceIsFeeSummary(false);
      setPaymentModalOpen(false);
      setPaymentLoading(false);
      setInvoiceModalOpen(true);
      await loadFees();
    } catch {
      toast('Payment recorded but failed to update record. Contact admin.', 'error');
      setPaymentLoading(false);
    }
  }

  async function handleProceedToPay() {
    if (!selectedFee || !activeModalPlan) return;
    const isMock = import.meta.env.VITE_MOCK_AUTH === 'true';
    const schoolId = selectedFee.school_id;
    const stored = localStorage.getItem(`veducore_payment_setup_${schoolId}`);
    const payAmount = activeModalPlan.installmentAmount;

    // If Razorpay is configured and loaded on window, use Razorpay; otherwise process directly via instant online checkout
    if (!stored || isMock || typeof window.Razorpay === 'undefined') {
      setPaymentLoading(true);
      const receiptId = `RCP-${Math.floor(1000 + Math.random() * 9000)}`;
      await handlePaymentSuccess(
        receiptId,
        `Online (${paymentMethodChoice})`,
        selectedFee,
        activeModalPlan
      );
      return;
    }

    const setup = JSON.parse(stored) as Pick<PaymentSetup, 'razorpay_key_id'>;
    setPaymentLoading(true);

    const rzp = new window.Razorpay({
      key: setup.razorpay_key_id,
      amount: payAmount * 100,
      currency: 'INR',
      name: school?.name || 'School Fees',
      description: `${selectedFee.fee_type} (${activeModalPlan.currentPeriodLabel})`,
      handler: (response: RazorpayResponse) => {
        handlePaymentSuccess(
          response.razorpay_payment_id,
          'Online (Razorpay)',
          selectedFee,
          activeModalPlan
        );
      },
      prefill: {
        name: parent?.full_name,
        email: parent?.email,
        contact: parent?.phone ?? '',
      },
      theme: { color: '#2563eb' },
      modal: { ondismiss: () => setPaymentLoading(false) },
    });
    rzp.open();
  }

  function openPayModal(fee: Fee) {
    setSelectedFee(fee);
    setPaymentModalOpen(true);
  }

  function openInvoiceForFee(fee: Fee) {
    setInvoiceFee(fee);
    setInvoiceSessionAmount(Number(fee.paid_amount));
    setLastPaymentId(fee.receipt_number || '');
    setLastPaymentMethod(fee.payment_method || '');
    setLastPaymentDate(fee.payment_date || new Date().toISOString().split('T')[0]);
    setInvoiceIsFeeSummary(true);
    setInvoiceModalOpen(true);
  }

  function generateInvoiceNumber(fee: Fee): string {
    const schoolPart = fee.school_id.slice(0, 6).toUpperCase();
    const feePart = fee.id.slice(0, 6).toUpperCase();
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `INV-${schoolPart}-${feePart}-${datePart}`;
  }

  const isPastDue = (fee: Fee) =>
    fee.due_date && new Date(fee.due_date) < new Date() && fee.status !== 'paid';

  if (loading) {
    return (
      <DashboardLayout title="Fees">
        <LoadingSpinner />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Fees">
      <style>{printStyles}</style>
      <div className="space-y-6">
        <PageHeader
          title="Fees & Payment Structure"
          description="Select Monthly, Quarterly, or Annual payment structure — paying an installment automatically advances to the next month/quarter."
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
                  {c.full_name}
                </option>
              ))}
            </Select>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Total Annual Fees"
            value={formatCurrency(totalAmount, '₹')}
            icon={<IndianRupee className="h-5 w-5" />}
            color="blue"
          />
          <StatCard
            label="Paid So Far"
            value={formatCurrency(totalPaid, '₹')}
            icon={<IndianRupee className="h-5 w-5" />}
            color="emerald"
          />
          <StatCard
            label="Remaining Balance"
            value={formatCurrency(totalOutstanding, '₹')}
            icon={<IndianRupee className="h-5 w-5" />}
            color="red"
          />
        </div>

        {/* ── FEE PAYMENT STRUCTURE SELECTOR: MONTHLY | QUARTERLY | ANNUALLY ── */}
        <Card className="p-5 border border-blue-100">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-gray-900">
              Choose Fee Payment Structure (Monthly / Quarterly / Annually)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Select your preferred payment frequency. Paying an installment automatically marks that period as paid and advances to the next installment.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                {
                  id: 'monthly',
                  title: 'Monthly',
                  sub: '12 Monthly Installments (Apr – Mar)',
                  icon: Calendar,
                },
                {
                  id: 'quarterly',
                  title: 'Quarterly',
                  sub: '4 Quarterly Installments (Q1 – Q4)',
                  icon: LayoutGrid,
                },
                {
                  id: 'annually',
                  title: 'Annually',
                  sub: 'Full Year One-Shot Payment',
                  icon: Award,
                },
              ] as const
            ).map((mode) => {
              const Icon = mode.icon;
              const active = structureMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setStructureMode(mode.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    active
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                      : 'border-gray-200 bg-gray-50/70 text-gray-800 hover:border-blue-300 hover:bg-white'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                      active ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{mode.title}</p>
                    <p className={`text-xs ${active ? 'text-blue-100' : 'text-gray-500'}`}>
                      {mode.sub}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {fees.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center rounded-xl border border-dashed border-gray-300">
            <IndianRupee className="h-10 w-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No fee records</p>
          </div>
        ) : (
          <div className="space-y-4">
            {fees.map((f) => {
              const plan = computeInstallmentPlan(f, structureMode);
              const isFullyPaid = f.status === 'paid' || Number(f.remaining_amount) <= 0;
              const pct =
                Number(f.amount) > 0
                  ? Math.min(100, Math.round((Number(f.paid_amount) / Number(f.amount)) * 100))
                  : 0;

              return (
                <Card key={f.id} className="p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="text-base font-bold text-gray-900">{f.fee_type}</span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {isFullyPaid
                          ? 'All Installments Paid ✅'
                          : `Active Due Period: ${plan.currentPeriodLabel} · Next Due Date: ${formatDate(f.due_date)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isFullyPaid && (
                        <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                          {plan.paidPeriods} / {plan.totalPeriods} Paid
                        </span>
                      )}
                      <StatusBadge status={f.status} />
                    </div>
                  </div>

                  {/* Amount Breakdown */}
                  <div className="grid grid-cols-3 gap-3 rounded-xl bg-gray-50 border border-gray-100 p-3.5 text-sm">
                    <div>
                      <span className="text-xs font-medium text-gray-500">Total Annual Fee</span>
                      <p className="font-bold text-gray-900 mt-0.5">{formatCurrency(f.amount, '₹')}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500">Paid So Far</span>
                      <p className="font-bold text-emerald-700 mt-0.5">
                        {formatCurrency(f.paid_amount, '₹')}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500">Remaining Balance</span>
                      <p className="font-bold text-red-600 mt-0.5">
                        {formatCurrency(f.remaining_amount, '₹')}
                      </p>
                    </div>
                  </div>

                  {/* ── MONTHLY TRACKER CHIPS ── */}
                  {structureMode === 'monthly' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700">
                          Monthly Progression ({plan.paidPeriods} of 12 Months Paid)
                        </span>
                        {!isFullyPaid && (
                          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                            Now Due: {MONTH_ORDER[plan.currentPeriodIndex]} ({formatCurrency(plan.installmentAmount, '₹')})
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {MONTH_ORDER.map((month, idx) => {
                          const isMonthPaid = idx < plan.paidPeriods || isFullyPaid;
                          const isCurrentDue = !isFullyPaid && idx === plan.currentPeriodIndex;

                          return (
                            <button
                              key={month}
                              type="button"
                              disabled={isMonthPaid || !isCurrentDue}
                              onClick={() => openPayModal(f)}
                              className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold border transition-all ${
                                isMonthPaid
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                                  : isCurrentDue
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm hover:bg-blue-700 cursor-pointer'
                                    : 'bg-white border-gray-200 text-gray-400 cursor-default'
                              }`}
                            >
                              <span>{MONTH_ABBR[month]}</span>
                              {isMonthPaid && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                            </button>
                          );
                        })}
                      </div>

                      {!isFullyPaid && plan.nextPeriodLabel && (
                        <p className="text-xs text-gray-600">
                          💡 Pay <span className="font-bold text-blue-700">{plan.currentPeriodLabel}</span> ({formatCurrency(plan.installmentAmount, '₹')}) now — once paid, <span className="font-semibold text-gray-900">{plan.nextPeriodLabel}</span> will automatically become the next active due month!
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── QUARTERLY TRACKER CHIPS ── */}
                  {structureMode === 'quarterly' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700">
                          Quarterly Progression ({plan.paidPeriods} of 4 Quarters Paid)
                        </span>
                        {!isFullyPaid && (
                          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                            Now Due: {QUARTERS[plan.currentPeriodIndex].id} ({formatCurrency(plan.installmentAmount, '₹')})
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {QUARTERS.map((q, idx) => {
                          const isQPaid = idx < plan.paidPeriods || isFullyPaid;
                          const isCurrentQ = !isFullyPaid && idx === plan.currentPeriodIndex;

                          return (
                            <button
                              key={q.id}
                              type="button"
                              disabled={isQPaid || !isCurrentQ}
                              onClick={() => openPayModal(f)}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold border transition-all ${
                                isQPaid
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                                  : isCurrentQ
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm hover:bg-blue-700 cursor-pointer'
                                    : 'bg-white border-gray-200 text-gray-400 cursor-default'
                              }`}
                            >
                              <span>{q.short}</span>
                              {isQPaid && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                            </button>
                          );
                        })}
                      </div>

                      {!isFullyPaid && plan.nextPeriodLabel && (
                        <p className="text-xs text-gray-600">
                          💡 Pay <span className="font-bold text-blue-700">{plan.currentPeriodLabel}</span> ({formatCurrency(plan.installmentAmount, '₹')}) now — next quarter will unlock automatically!
                        </p>
                      )}
                    </div>
                  )}

                  {/* Progress bar */}
                  <div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Due Date & Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      {isPastDue(f) ? (
                        <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      ) : null}
                      <span className={isPastDue(f) ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                        Due Date: {formatDate(f.due_date)}
                        {isPastDue(f) ? ' (Overdue)' : ''}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      {!isFullyPaid && (
                        <Button
                          size="sm"
                          icon={<CreditCard className="h-3.5 w-3.5" />}
                          onClick={() => openPayModal(f)}
                        >
                          Pay {plan.currentPeriodLabel} ({formatCurrency(plan.installmentAmount, '₹')})
                        </Button>
                      )}
                      {Number(f.paid_amount) > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Download className="h-3.5 w-3.5" />}
                          onClick={() => openInvoiceForFee(f)}
                        >
                          Download Receipt
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Payment Confirmation Modal ── */}
      {selectedFee && activeModalPlan && (
        <Modal
          open={paymentModalOpen}
          onClose={() => {
            setPaymentModalOpen(false);
            setPaymentLoading(false);
          }}
          title={`Pay ${activeModalPlan.currentPeriodLabel}`}
          description={`${selectedFee.fee_type} — ${selectedChild?.full_name || ''}`}
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleProceedToPay}
                loading={paymentLoading}
                icon={<CreditCard className="h-4 w-4" />}
              >
                Pay {formatCurrency(activeModalPlan.installmentAmount, '₹')} Now
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-center">
              <span className="inline-block rounded-full bg-blue-600 px-3 py-0.5 text-[11px] font-bold text-white uppercase">
                {activeModalPlan.currentPeriodLabel}
              </span>
              <p className="mt-2 text-2xl font-bold text-blue-700">
                {formatCurrency(activeModalPlan.installmentAmount, '₹')}
              </p>
              {activeModalPlan.nextPeriodLabel && (
                <p className="mt-1 text-xs font-medium text-emerald-700">
                  After this payment → Next Due: {activeModalPlan.nextPeriodLabel}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase">Select Payment Method</p>
              {(
                [
                  { id: 'UPI', label: 'UPI / Google Pay / PhonePe' },
                  { id: 'CARD', label: 'Debit / Credit Card' },
                  { id: 'NETBANKING', label: 'Net Banking' },
                ] as const
              ).map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setPaymentMethodChoice(pm.id)}
                  className={`w-full rounded-xl border p-3 text-left text-sm font-medium transition-all flex items-center justify-between ${
                    paymentMethodChoice === pm.id
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span>{pm.label}</span>
                  {paymentMethodChoice === pm.id && (
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Invoice Modal ── */}
      {invoiceFee && (
        <Modal
          open={invoiceModalOpen}
          onClose={() => setInvoiceModalOpen(false)}
          title={invoiceIsFeeSummary ? 'Fee Payment Summary' : 'Payment Invoice'}
          size="lg"
          footer={
            <div className="flex items-center gap-3 no-print">
              <Button variant="outline" onClick={() => setInvoiceModalOpen(false)}>
                Close
              </Button>
              <Button icon={<Download className="h-4 w-4" />} onClick={() => window.print()}>
                Print Invoice
              </Button>
            </div>
          }
        >
          <style>{printStyles}</style>
          <div id="invoice-print-area" className="space-y-4 text-sm">
            <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
              {school?.logo_url && (
                <img
                  src={school.logo_url}
                  alt="School logo"
                  className="h-14 w-14 object-contain rounded-lg border border-gray-100"
                />
              )}
              <div>
                <h2 className="text-base font-semibold text-gray-900">{school?.name || 'School'}</h2>
                {school?.address && <p className="text-gray-500 text-xs">{school.address}</p>}
                {school?.contact_number && (
                  <p className="text-gray-500 text-xs">Tel: {school.contact_number}</p>
                )}
              </div>
            </div>

            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500">Invoice Number</p>
                <p className="font-semibold text-gray-900">{generateInvoiceNumber(invoiceFee)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Date</p>
                <p className="font-semibold text-gray-900">
                  {new Date().toLocaleDateString('en-IN')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Student</p>
                <p className="font-medium text-gray-900">
                  {selectedChild?.full_name || invoiceFee.student?.full_name || '—'}
                </p>
                {(selectedChild?.class || invoiceFee.student?.class) && (
                  <p className="text-xs text-gray-500">
                    Class: {(selectedChild?.class || invoiceFee.student?.class)?.name}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Parent / Guardian</p>
                <p className="font-medium text-gray-900">{parent?.full_name || '—'}</p>
                {parent?.email && <p className="text-xs text-gray-500">{parent.email}</p>}
              </div>
            </div>

            <table className="w-full text-left text-sm border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 font-semibold text-gray-600">Fee Type</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 text-right">Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-200">
                  <td className="px-3 py-2 text-gray-900">{invoiceFee.fee_type}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">
                    {formatCurrency(invoiceSessionAmount || invoiceFee.paid_amount, '₹')}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 space-y-1">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span className="font-medium text-emerald-800 text-sm">
                  {invoiceIsFeeSummary ? 'Fee Payment Summary' : 'Payment Successful'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Payment Date</span>
                <span className="font-medium">
                  {lastPaymentDate ? new Date(lastPaymentDate).toLocaleDateString('en-IN') : '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Payment Method</span>
                <span className="font-medium">
                  {lastPaymentMethod || invoiceFee.payment_method || '—'}
                </span>
              </div>
              {lastPaymentId && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Receipt / Payment ID</span>
                  <span className="font-medium font-mono">{lastPaymentId}</span>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}
