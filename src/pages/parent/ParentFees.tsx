import { useEffect, useState, useCallback } from 'react';
import { IndianRupee, CreditCard, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, StatCard } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchParentByUserId, fetchParentStudents, fetchFees, fetchSchool, recordFeePayment } from '@/services/api';
import type { Parent, Student, Fee, School, PaymentSetup } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';

type PaymentPlan = 'full' | 'emi' | 'quarterly';

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

  // Payment modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedFee, setSelectedFee] = useState<Fee | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan>('full');
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Invoice modal
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [lastPaymentId, setLastPaymentId] = useState<string>('');
  const [lastPaymentMethod, setLastPaymentMethod] = useState<string>('');
  const [invoiceFee, setInvoiceFee] = useState<Fee | null>(null);

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
        if (kids.length > 0 && !selectedChildId) {
          setSelectedChildId(kids[0].id);
          // Load school from first child
          if (kids[0].school_id) {
            const s = await fetchSchool(kids[0].school_id);
            setSchool(s);
          }
        }
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id, selectedChildId]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadFees = useCallback(async () => {
    if (!selectedChildId) return;
    try {
      const f = await fetchFees({ studentId: selectedChildId });
      setFees(f);
    } catch { /* handled */ }
  }, [selectedChildId]);

  useEffect(() => { loadFees(); }, [loadFees]);

  // Load school when selected child changes
  useEffect(() => {
    const child = children.find((c) => c.id === selectedChildId);
    if (child?.school_id) {
      fetchSchool(child.school_id).then((s) => setSchool(s)).catch(() => {});
    }
  }, [selectedChildId, children]);

  const totalAmount = fees.reduce((s, f) => s + Number(f.amount), 0);
  const totalPaid = fees.reduce((s, f) => s + Number(f.paid_amount), 0);
  const totalOutstanding = fees.reduce((s, f) => s + Number(f.remaining_amount), 0);

  const selectedChild = children.find((c) => c.id === selectedChildId);

  function getPayAmount(fee: Fee, plan: PaymentPlan): number {
    if (plan === 'full') return Number(fee.remaining_amount);
    if (plan === 'quarterly') return Number(fee.remaining_amount) / 4;
    return Math.ceil(Number(fee.remaining_amount) / 3);
  }

  async function handlePaymentSuccess(paymentId: string, method: string, fee: Fee) {
    const today = new Date().toISOString().split('T')[0];
    try {
      await recordFeePayment(fee.id, {
        school_id: fee.school_id,
        student_id: fee.student_id,
        amount: getPayAmount(fee, selectedPlan),
        payment_date: today,
        payment_method: method,
        receipt_number: paymentId,
        recorded_by: profile?.id,
      });
      setLastPaymentId(paymentId);
      setLastPaymentMethod(method);
      setInvoiceFee(fee);
      setPaymentModalOpen(false);
      setPaymentLoading(false);
      setInvoiceModalOpen(true);
      loadFees();
    } catch {
      toast('Payment recorded but failed to update record. Contact admin.', 'error');
      setPaymentLoading(false);
    }
  }

  async function handleProceedToPay() {
    if (!selectedFee) return;
    const isMock = import.meta.env.VITE_MOCK_AUTH === 'true';
    const schoolId = selectedFee.school_id;
    const stored = localStorage.getItem(`veducore_payment_setup_${schoolId}`);

    if (!stored && !isMock) {
      toast('Online payment is not set up by your school. Please contact the school office.', 'error');
      return;
    }

    const payAmount = getPayAmount(selectedFee, selectedPlan);

    if (isMock) {
      const mockPaymentId = 'pay_mock_' + Date.now();
      await handlePaymentSuccess(mockPaymentId, 'Online (Simulated)', selectedFee);
      return;
    }

    const setup = JSON.parse(stored!) as PaymentSetup;
    setPaymentLoading(true);

    const rzp = new window.Razorpay({
      key: setup.razorpay_key_id,
      amount: (payAmount + 5) * 100,
      currency: 'INR',
      name: school?.name || 'School Fees',
      description: selectedFee.fee_type,
      handler: (response: RazorpayResponse) => {
        handlePaymentSuccess(response.razorpay_payment_id, 'Online (Razorpay)', selectedFee);
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
    setSelectedPlan('full');
    setPaymentModalOpen(true);
  }

  function openInvoiceForFee(fee: Fee) {
    setInvoiceFee(fee);
    setLastPaymentId(fee.receipt_number || '');
    setLastPaymentMethod(fee.payment_method || '');
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

  if (loading) return <DashboardLayout title="Fees"><LoadingSpinner /></DashboardLayout>;

  return (
    <DashboardLayout title="Fees">
      <style>{printStyles}</style>
      <div className="space-y-6">
        <PageHeader title="Fee Information" description="View and pay your child's fees online" />

        {children.length > 1 && (
          <Card className="p-4">
            <Select label="Select Child" value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
              {children.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total Fees" value={formatCurrency(totalAmount, '₹')} icon={<IndianRupee className="h-5 w-5" />} color="blue" />
          <StatCard label="Paid" value={formatCurrency(totalPaid, '₹')} icon={<IndianRupee className="h-5 w-5" />} color="emerald" />
          <StatCard label="Outstanding" value={formatCurrency(totalOutstanding, '₹')} icon={<IndianRupee className="h-5 w-5" />} color="red" />
        </div>

        {fees.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center rounded-xl border border-dashed border-gray-300">
            <IndianRupee className="h-10 w-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No fee records</p>
          </div>
        ) : (
          <div className="space-y-4">
            {fees.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="font-semibold text-gray-900">{f.fee_type}</span>
                  <StatusBadge status={f.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                  <div>
                    <span className="text-gray-500">Amount</span>
                    <p className="font-medium text-gray-900">{formatCurrency(f.amount, '₹')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Paid</span>
                    <p className="font-medium text-emerald-700">{formatCurrency(f.paid_amount, '₹')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Remaining</span>
                    <p className="font-medium text-red-600">{formatCurrency(f.remaining_amount, '₹')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-sm mb-3">
                  {isPastDue(f) ? (
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  ) : null}
                  <span className={isPastDue(f) ? 'text-red-600 font-medium' : 'text-gray-500'}>
                    Due: {formatDate(f.due_date)}
                    {isPastDue(f) ? ' (Overdue)' : ''}
                  </span>
                </div>
                <div className="flex gap-2">
                  {f.status !== 'paid' ? (
                    <Button size="sm" icon={<CreditCard className="h-3.5 w-3.5" />} onClick={() => openPayModal(f)}>
                      Pay Now
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />} onClick={() => openInvoiceForFee(f)}>
                      Download Invoice
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Payment Options Modal ── */}
      {selectedFee && (
        <Modal
          open={paymentModalOpen}
          onClose={() => { setPaymentModalOpen(false); setPaymentLoading(false); }}
          title="Choose Payment Plan"
          description={`${selectedFee.fee_type} — ${selectedChild?.full_name || ''}`}
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setPaymentModalOpen(false)}>Cancel</Button>
              <Button onClick={handleProceedToPay} loading={paymentLoading} icon={<CreditCard className="h-4 w-4" />}>
                Proceed to Pay
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {/* Plan options */}
            <div className="space-y-2">
              {/* Full payment — always shown */}
              <button
                onClick={() => setSelectedPlan('full')}
                className={`w-full rounded-xl border p-3 text-left transition-all ${selectedPlan === 'full' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Full Payment</p>
                    <p className="text-xs text-gray-500 mt-0.5">Pay the entire remaining amount</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(Number(selectedFee.remaining_amount), '₹')}</p>
                  </div>
                </div>
              </button>

              {/* Quarterly — if remaining > 1000 */}
              {Number(selectedFee.remaining_amount) > 1000 && (
                <button
                  onClick={() => setSelectedPlan('quarterly')}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${selectedPlan === 'quarterly' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Quarterly</p>
                      <p className="text-xs text-gray-500 mt-0.5">Pay in 4 installments</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{formatCurrency(Number(selectedFee.remaining_amount) / 4, '₹')}<span className="text-xs font-normal text-gray-500">/quarter</span></p>
                    </div>
                  </div>
                </button>
              )}

              {/* EMI — if remaining > 2000 */}
              {Number(selectedFee.remaining_amount) > 2000 && (
                <button
                  onClick={() => setSelectedPlan('emi')}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${selectedPlan === 'emi' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">EMI (3 months)</p>
                      <p className="text-xs text-gray-500 mt-0.5">Pay in 3 monthly installments</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{formatCurrency(Math.ceil(Number(selectedFee.remaining_amount) / 3), '₹')}<span className="text-xs font-normal text-gray-500">/month</span></p>
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* Breakdown */}
            <div className="rounded-xl bg-gray-50 p-3 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Fee Amount</span>
                <span className="font-medium">{formatCurrency(getPayAmount(selectedFee, selectedPlan), '₹')}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Platform Fee</span>
                <span className="font-medium">₹5</span>
              </div>
              <div className="flex justify-between py-1 border-t border-gray-200 mt-1">
                <span className="font-semibold text-gray-900">Total to Pay</span>
                <span className="font-bold text-gray-900">{formatCurrency(getPayAmount(selectedFee, selectedPlan) + 5, '₹')}</span>
              </div>
            </div>

            <p className="text-xs text-center text-gray-400">🔒 Secure payment powered by Razorpay</p>
          </div>
        </Modal>
      )}

      {/* ── Invoice Modal ── */}
      {invoiceFee && (
        <Modal
          open={invoiceModalOpen}
          onClose={() => setInvoiceModalOpen(false)}
          title="Payment Invoice"
          size="lg"
          footer={
            <div className="flex items-center gap-3 no-print">
              <Button variant="outline" onClick={() => setInvoiceModalOpen(false)}>Close</Button>
              <Button icon={<Download className="h-4 w-4" />} onClick={() => window.print()}>Print Invoice</Button>
            </div>
          }
        >
          <style>{printStyles}</style>
          <div id="invoice-print-area" className="space-y-4 text-sm">
            {/* School header */}
            <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
              {school?.logo_url && (
                <img src={school.logo_url} alt="School logo" className="h-14 w-14 object-contain rounded-lg border border-gray-100" />
              )}
              <div>
                <h2 className="text-lg font-bold text-gray-900">{school?.name || 'School'}</h2>
                {school?.address && <p className="text-gray-500 text-xs">{school.address}</p>}
                {school?.contact_number && <p className="text-gray-500 text-xs">Tel: {school.contact_number}</p>}
              </div>
            </div>

            {/* Invoice meta */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500">Invoice Number</p>
                <p className="font-semibold text-gray-900">{generateInvoiceNumber(invoiceFee)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Date</p>
                <p className="font-semibold text-gray-900">{new Date().toLocaleDateString('en-IN')}</p>
              </div>
            </div>

            {/* Student + Parent info */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Student</p>
                <p className="font-medium text-gray-900">{selectedChild?.full_name || invoiceFee.student?.full_name || '—'}</p>
                {(selectedChild?.class || invoiceFee.student?.class) && (
                  <p className="text-xs text-gray-500">Class: {(selectedChild?.class || invoiceFee.student?.class)?.name}</p>
                )}
                {(selectedChild?.admission_number || invoiceFee.student?.admission_number) && (
                  <p className="text-xs text-gray-500">Adm #: {selectedChild?.admission_number || invoiceFee.student?.admission_number}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Parent / Guardian</p>
                <p className="font-medium text-gray-900">{parent?.full_name || '—'}</p>
                {parent?.email && <p className="text-xs text-gray-500">{parent.email}</p>}
              </div>
            </div>

            {/* Fee table */}
            <table className="w-full text-left text-sm border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 font-semibold text-gray-600">Fee Type</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 text-right">Amount</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 text-right">Platform Fee</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-200">
                  <td className="px-3 py-2 text-gray-900">{invoiceFee.fee_type}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(invoiceFee.paid_amount, '₹')}</td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {lastPaymentMethod.includes('Razorpay') || lastPaymentMethod.includes('Simulated') ? '₹5' : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">
                    {lastPaymentMethod.includes('Razorpay') || lastPaymentMethod.includes('Simulated')
                      ? formatCurrency(invoiceFee.paid_amount + 5, '₹')
                      : formatCurrency(invoiceFee.paid_amount, '₹')}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Payment details */}
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 space-y-1">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span className="font-medium text-emerald-800 text-sm">Payment Successful</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Payment Date</span>
                <span className="font-medium">{new Date().toLocaleDateString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Payment Method</span>
                <span className="font-medium">{lastPaymentMethod || invoiceFee.payment_method || '—'}</span>
              </div>
              {lastPaymentId && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Payment ID</span>
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
