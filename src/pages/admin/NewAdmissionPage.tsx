import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, Copy, X, Lock,
  ArrowLeft, AlertTriangle, IndianRupee, Pencil, Printer,
  MessageCircle, PlusCircle, Users, Trash2,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input, Select } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchClasses, fetchSchool,
  fetchFeeStructuresForClass,
  createAdmissionWithFees,
  fetchFees,
  fetchGatewayStatus,
  createOnlinePayment,
  payWithCheckout,
  checkOnlinePayment,
  onlineCharges,
} from '@/services/api';
import type {
  Class, Section, School,
  AdmissionFeeLineItem, AdmissionDiscount,
  AdmissionPaymentOption, AdmissionPaymentMode,
  AdmissionFeesData,
} from '@/types';
import { INDIAN_STATES, formatCurrency } from '@/lib/utils';
import { generateParentCredentials, normalizeMobile, parentFromStudent, schoolShortName } from '@/lib/parentUtils';

// ─── Wizard persistence key ───────────────────────────────────────────────────
// v4: one form for the parents + any number of children (siblings).
const WIZARD_KEY = 'veducore_admission_wizard_v4';

// ─── Types ────────────────────────────────────────────────────────────────────

/** One child being admitted. Parents, address and payment are shared. */
interface ChildForm {
  // Step 1
  full_name: string;
  date_of_birth: string;
  gender: string;
  // Step 3 — Class & School
  class_id: string;
  class_name: string;
  section_id: string;
  section_name: string;
  admission_number: string;
  prev_school_name: string;
  prev_school_board: string;
  tc_number: string;
  tc_date: string;
  transport_selected: boolean;
  // Step 4 — Fees (this child's own fee heads and concession)
  fee_lines: AdmissionFeeLineItem[];
  discount: AdmissionDiscount;
  /** Class the fee lines were loaded for; reloaded when the class changes. */
  fees_loaded_for: string;
  no_structure_warning: boolean;
}

interface PaymentForm {
  payment_option: AdmissionPaymentOption;
  /** Total being paid now for all children together. */
  amount_paying: string;
  payment_mode: AdmissionPaymentMode;
  transaction_ref: string;
  payment_date: string;
  remarks: string;
}

interface FormData {
  // Step 1 — Parents
  father_name: string;
  mother_name: string;
  parent_email: string;
  phone: string;
  whatsapp: string;
  same_as_phone: boolean;
  // Step 2 — Address
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pin_code: string;
  country: string;
  // Children (at least one)
  children: ChildForm[];
  // Step 4 — Payment (shared)
  payment: PaymentForm;
}

/** What was saved for one child — kept so a retry never admits a child twice. */
interface ChildResult {
  name: string;
  admissionNumber: string;
  className: string;
  receiptNumber: string;
  receiptId: string | null;
  studentId: string;
  fees: AdmissionFeesData;
  paidNow: number;
  balanceDue: number;
  onlinePaid: boolean | null;
}

const today = () => new Date().toISOString().split('T')[0];

const EMPTY_DISCOUNT: AdmissionDiscount = { type: 'flat', value: 0, reason: 'Other', reason_note: '' };

function emptyChild(): ChildForm {
  return {
    full_name: '', date_of_birth: '', gender: 'male',
    class_id: '', class_name: '', section_id: '', section_name: '',
    admission_number: '', prev_school_name: '', prev_school_board: '',
    tc_number: '', tc_date: '', transport_selected: false,
    fee_lines: [], discount: { ...EMPTY_DISCOUNT }, fees_loaded_for: '', no_structure_warning: false,
  };
}

const EMPTY_PAYMENT: PaymentForm = {
  payment_option: 'later', amount_paying: '', payment_mode: 'Cash',
  transaction_ref: '', payment_date: today(), remarks: '',
};

function initialForm(): FormData {
  return {
    father_name: '', mother_name: '', parent_email: '',
    phone: '', whatsapp: '', same_as_phone: false,
    address_line1: '', address_line2: '', city: '', state: '',
    pin_code: '', country: 'India',
    children: [emptyChild()],
    payment: { ...EMPTY_PAYMENT, payment_date: today() },
  };
}

/** Same parents and address, fresh children and payment ("Admit another child of these parents"). */
function sameFamilyForm(prev: FormData): FormData {
  return { ...prev, children: [emptyChild()], payment: { ...EMPTY_PAYMENT, payment_date: today() } };
}

const STEP_LABELS = ['Parents & Children', 'Address', 'Class & School', 'Fees', 'Review'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One child's fee totals (before any payment). */
function childFeeSummary(c: ChildForm) {
  const totalFees = round2(c.fee_lines.filter((l) => l.include).reduce((s, l) => s + (l.amount || 0), 0));
  const raw = c.discount.value > 0
    ? c.discount.type === 'percent'
      ? round2((totalFees * Math.min(c.discount.value, 100)) / 100)
      : round2(c.discount.value)
    : 0;
  const discountAmount = Math.min(Math.max(raw, 0), totalFees);
  return { totalFees, discountAmount, netPayable: round2(totalFees - discountAmount) };
}

/**
 * Splits the amount paid now across the children in proportion to what each
 * owes (the last one takes the rounding remainder). Same rule the server uses
 * across one child's fee heads.
 */
function splitPayment(children: ChildForm[], payment: PaymentForm) {
  const nets = children.map((c) => childFeeSummary(c).netPayable);
  const totalNet = round2(nets.reduce((s, n) => s + n, 0));
  const paying = payment.payment_option === 'later'
    ? 0
    : Math.min(totalNet, Math.max(0, round2(parseFloat(payment.amount_paying) || 0)));
  let left = paying;
  const shares = nets.map((net, i) => {
    const share = i === nets.length - 1
      ? Math.min(left, net)
      : Math.min(left, net, totalNet > 0 ? round2((paying * net) / totalNet) : 0);
    left = round2(left - share);
    return share;
  });
  return { nets, totalNet, paying, shares, balance: round2(totalNet - paying) };
}

/** A child's fees in the shape the receipt printer and the save call use. */
function childFeesData(c: ChildForm, payment: PaymentForm, share: number): AdmissionFeesData {
  const { netPayable } = childFeeSummary(c);
  return {
    line_items: c.fee_lines,
    discount: c.discount,
    payment_option: share <= 0 ? 'later' : share >= netPayable ? 'full' : 'partial',
    amount_paying: String(share),
    payment_mode: payment.payment_mode,
    transaction_ref: payment.transaction_ref,
    payment_date: payment.payment_date,
    remarks: payment.remarks,
    fee_structures_loaded: true,
    no_structure_warning: c.no_structure_warning,
  };
}

/** Fee summary for one child's saved fees (receipt printing). */
function computeFeeSummary(fees: AdmissionFeesData) {
  const totalFees = round2(fees.line_items.filter((l) => l.include).reduce((s, l) => s + l.amount, 0));
  const raw = fees.discount.value > 0
    ? fees.discount.type === 'percent'
      ? round2((totalFees * Math.min(fees.discount.value, 100)) / 100)
      : round2(fees.discount.value)
    : 0;
  const discountAmount = Math.min(Math.max(raw, 0), totalFees);
  const netPayable = round2(totalFees - discountAmount);
  const paidNow = fees.payment_option === 'later' ? 0 : Math.min(netPayable, parseFloat(fees.amount_paying) || 0);
  return { totalFees, discountAmount, netPayable, paidNow, balanceDue: round2(netPayable - paidNow) };
}

function makeIdempotencyKey(admissionNumber: string, schoolId: string) {
  return `adm-${schoolId.slice(0, 8)}-${admissionNumber}-${Date.now()}`;
}

function combinedAddress(f: FormData) {
  return [f.address_line1, f.address_line2 || null, f.city, `${f.state} - ${f.pin_code}`, f.country]
    .filter(Boolean).join(', ');
}

const childLabel = (c: ChildForm, i: number) => c.full_name.trim() || `Child ${i + 1}`;

// ─── Print Receipt ────────────────────────────────────────────────────────────

const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

function printReceipt(params: {
  receiptNumber: string;
  admissionNumber: string;
  studentName: string;
  fatherName: string;
  className: string;
  schoolName: string;
  schoolAddress: string;
  fees: AdmissionFeesData;
  paidNow: number;
  balanceDue: number;
  collectedByName: string;
  paymentDate: string;
}) {
  const { totalFees, discountAmount, netPayable } = computeFeeSummary(params.fees);
  const { paidNow, balanceDue } = params;
  const sym = '₹';

  const rows = params.fees.line_items
    .filter((l) => l.include && l.amount > 0)
    .map(
      (l) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${esc(l.fee_type)}</td>
         <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${sym}${l.amount.toFixed(2)}</td></tr>`
    )
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fee Receipt ${esc(params.receiptNumber)}</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:480px;margin:40px auto;color:#111;font-size:13px}
    h1{font-size:18px;margin:0 0 4px}
    .sub{font-size:12px;color:#555;margin:2px 0}
    .divider{border:none;border-top:2px solid #111;margin:12px 0}
    table{width:100%;border-collapse:collapse}
    .total-row td{font-weight:bold;padding:8px 10px;border-top:2px solid #111}
    .label{color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    @media print{body{margin:10px}}
  </style></head><body>
  <div style="text-align:center;margin-bottom:16px">
    <h1>${esc(params.schoolName)}</h1>
    <p class="sub">${esc(params.schoolAddress)}</p>
    <hr class="divider"/>
    <p style="font-size:15px;font-weight:bold;margin:4px 0">FEE RECEIPT</p>
    <p class="sub">Receipt No: <b>${esc(params.receiptNumber)}</b> &nbsp;|&nbsp; Date: ${esc(params.paymentDate)}</p>
  </div>
  <table style="margin-bottom:12px">
    <tr><td class="label">Student</td><td><b>${esc(params.studentName)}</b></td></tr>
    <tr><td class="label">Father</td><td>${esc(params.fatherName)}</td></tr>
    <tr><td class="label">Class</td><td>${esc(params.className)}</td></tr>
    <tr><td class="label">Admission No.</td><td>${esc(params.admissionNumber)}</td></tr>
  </table>
  <hr class="divider"/>
  <table>
    <thead><tr style="background:#f3f4f6">
      <th style="text-align:left;padding:6px 10px">Fee Head</th>
      <th style="text-align:right;padding:6px 10px">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td style="padding:6px 10px;color:#6b7280">Total Fees</td>
          <td style="text-align:right;padding:6px 10px">${sym}${totalFees.toFixed(2)}</td></tr>
      ${discountAmount > 0
        ? `<tr><td style="padding:6px 10px;color:#059669">Discount (${esc(params.fees.discount.reason)})</td>
               <td style="text-align:right;padding:6px 10px;color:#059669">- ${sym}${discountAmount.toFixed(2)}</td></tr>`
        : ''}
      <tr><td style="padding:6px 10px">Net Payable</td>
          <td style="text-align:right;padding:6px 10px">${sym}${netPayable.toFixed(2)}</td></tr>
      <tr class="total-row">
        <td>Paid Now${paidNow > 0 ? ` (${esc(params.fees.payment_mode)})` : ''}</td>
        <td style="text-align:right">${sym}${paidNow.toFixed(2)}</td>
      </tr>
      ${balanceDue > 0
        ? `<tr><td style="padding:6px 10px;color:#dc2626">Balance Due</td>
               <td style="text-align:right;padding:6px 10px;color:#dc2626">${sym}${balanceDue.toFixed(2)}</td></tr>`
        : ''}
    </tfoot>
  </table>
  ${params.fees.transaction_ref && paidNow > 0
    ? `<p style="margin-top:12px;font-size:12px;color:#374151">Ref/Txn No: <b>${esc(params.fees.transaction_ref)}</b></p>`
    : ''}
  <hr class="divider"/>
  <p style="font-size:11px;color:#6b7280;text-align:center">Collected by: ${esc(params.collectedByName)}</p>
  <p style="font-size:10px;color:#9ca3af;text-align:center;margin-top:8px">This is a computer-generated receipt. No signature required.</p>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=560,height=780');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

/** Open WhatsApp with one message covering every child admitted. */
function sendWhatsAppReceipt(params: {
  whatsapp: string;
  schoolName: string;
  paymentMode: string;
  results: ChildResult[];
}) {
  const phone = params.whatsapp.replace(/\D/g, '');
  const fullPhone = phone.startsWith('91') ? phone : `91${phone}`;
  const paid = params.results.reduce((s, r) => s + r.paidNow, 0);
  const due = params.results.reduce((s, r) => s + r.balanceDue, 0);
  const msg =
    `*Admission — ${params.schoolName}*\n\n` +
    params.results.map((r) =>
      `${r.name} (${r.className})\nAdmission No: ${r.admissionNumber}\nReceipt No: ${r.receiptNumber}\n`
      + `Paid: ₹${r.paidNow.toFixed(2)}${r.balanceDue > 0 ? ` · Due: ₹${r.balanceDue.toFixed(2)}` : ''}\n`).join('\n') +
    (params.results.length > 1 ? `\nTotal paid: ₹${paid.toFixed(2)}${due > 0 ? ` · Total due: ₹${due.toFixed(2)}` : ''}\n` : '') +
    (paid > 0 ? `Mode: ${params.paymentMode}\n` : '') +
    `\nThank you.`;
  window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ─── Small shared components ──────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      className="ml-2 rounded-md p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-600 transition-colors" title="Copy">
      {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function ReviewCard({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        {onEdit && (
          <button type="button" onClick={onEdit}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 transition-colors">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value, capitalize, highlight }: { label: string; value: string; capitalize?: boolean; highlight?: 'red' | 'green' }) {
  const valClass = highlight === 'red' ? 'text-red-600 font-semibold' : highlight === 'green' ? 'text-emerald-600 font-semibold' : 'font-medium text-slate-900';
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="flex-shrink-0 text-slate-500">{label}</span>
      <span className={`text-right ${valClass} ${capitalize ? 'capitalize' : ''}`}>{value || '—'}</span>
    </div>
  );
}

function CredentialsBox({ username, password }: { username: string; password: string }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Lock className="h-4 w-4 text-brand-600" />
        <span className="text-sm font-semibold text-brand-800">Parent Portal Credentials</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-brand-700">Login (Mobile):</span>
          <div className="flex items-center gap-1">
            <code className="rounded bg-white px-2 py-0.5 font-mono text-brand-800">{username}</code>
            <CopyButton text={username} />
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-brand-700">Password:</span>
          <div className="flex items-center gap-1">
            <code className="rounded bg-white px-2 py-0.5 font-mono text-brand-800">{password}</code>
            <CopyButton text={password} />
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-brand-600">One login for all children. Share it with the parent and ask them to change the password after first login.</p>
    </div>
  );
}

function ChildHeader({ i, c, extra }: { i: number; c: ChildForm; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
        {childLabel(c, i)}
        {c.class_name && <span className="text-xs font-normal text-slate-500">· {c.class_name}{c.section_name ? ` - ${c.section_name}` : ''}</span>}
      </p>
      {extra}
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

interface StepProps {
  formData: FormData;
  errors: Record<string, string>;
  update: (patch: Partial<FormData>) => void;
  updateChild: (i: number, patch: Partial<ChildForm>) => void;
}

// Step 1: Parents & Children
function Step1({ formData, errors, update, updateChild }: StepProps) {
  const kids = formData.children;
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Parent Details</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Father's Name" required value={formData.father_name} onChange={(e) => update({ father_name: e.target.value })} error={errors.father_name} placeholder="Father's full name" />
          <Input label="Mother's Name" required value={formData.mother_name} onChange={(e) => update({ mother_name: e.target.value })} error={errors.mother_name} placeholder="Mother's full name" />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Parent Mobile Number <span className="text-red-500">*</span></label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-[10px] border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm">+91</span>
              <input type="tel" maxLength={10} value={formData.phone}
                onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 10); update({ phone: d, whatsapp: formData.same_as_phone ? d : formData.whatsapp }); }}
                className="flex-1 rounded-r-[10px] border border-slate-200 px-3 py-2 text-sm focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25"
                placeholder="10-digit mobile number" />
            </div>
            {errors.phone
              ? <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
              : <p className="mt-1 text-xs text-slate-400">Parent logs in with this number</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">WhatsApp Number</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-[10px] border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm">+91</span>
              <input type="tel" maxLength={10} value={formData.whatsapp} disabled={formData.same_as_phone}
                onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 10); update({ whatsapp: d }); }}
                className="flex-1 rounded-r-[10px] border border-slate-200 px-3 py-2 text-sm focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                placeholder="10-digit mobile number" />
            </div>
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={formData.same_as_phone}
                onChange={(e) => update({ same_as_phone: e.target.checked, whatsapp: e.target.checked ? formData.phone : formData.whatsapp })}
                className="rounded" />
              Same as mobile number
            </label>
            {errors.whatsapp && <p className="mt-1 text-xs text-red-600">{errors.whatsapp}</p>}
          </div>
          <Input label="Parent Email (optional)" type="email" value={formData.parent_email} onChange={(e) => update({ parent_email: e.target.value })} error={errors.parent_email} placeholder="parent@example.com" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            {kids.length > 1 ? `Children (${kids.length})` : 'Student Details'}
          </h3>
          <button type="button" onClick={() => update({ children: [...kids, emptyChild()] })}
            className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100">
            <PlusCircle className="h-3.5 w-3.5" /> Add another child (sibling)
          </button>
        </div>
        {kids.map((c, i) => (
          <div key={i} className={kids.length > 1 ? 'rounded-xl border border-slate-200 p-4' : ''}>
            {kids.length > 1 && (
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Child {i + 1}</p>
                <button type="button" title="Remove this child"
                  onClick={() => update({ children: kids.filter((_, j) => j !== i) })}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input label="Student Full Name" required value={c.full_name} onChange={(e) => updateChild(i, { full_name: e.target.value })} error={errors[`c${i}_full_name`]} placeholder="Enter full name" />
              <Input label="Date of Birth" type="date" required value={c.date_of_birth} onChange={(e) => updateChild(i, { date_of_birth: e.target.value })} error={errors[`c${i}_date_of_birth`]} max={today()} />
              <Select label="Gender" required value={c.gender} onChange={(e) => updateChild(i, { gender: e.target.value })} error={errors[`c${i}_gender`]}>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </div>
          </div>
        ))}
        {kids.length > 1 && (
          <p className="text-xs text-violet-600">
            All children share these parent details, address and one parent login. Class and fees are asked for each child in the next steps.
          </p>
        )}
      </div>
    </div>
  );
}

// Step 2: Address
function Step2({ formData, errors, update }: StepProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Address Details</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input label="Address Line 1" required value={formData.address_line1} onChange={(e) => update({ address_line1: e.target.value })} error={errors.address_line1} placeholder="House/Flat No., Street, Area" />
        </div>
        <div className="sm:col-span-2">
          <Input label="Address Line 2" value={formData.address_line2} onChange={(e) => update({ address_line2: e.target.value })} placeholder="Landmark, Colony (optional)" />
        </div>
        <Input label="City" required value={formData.city} onChange={(e) => update({ city: e.target.value })} error={errors.city} />
        <Select label="State" required value={formData.state} onChange={(e) => update({ state: e.target.value })} error={errors.state}>
          <option value="" disabled>Select State</option>
          {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Input label="PIN Code" required value={formData.pin_code} onChange={(e) => update({ pin_code: e.target.value.replace(/\D/g, '').slice(0, 6) })} error={errors.pin_code} maxLength={6} placeholder="6-digit PIN" />
        <Input label="Country" value={formData.country} onChange={(e) => update({ country: e.target.value })} />
      </div>
    </div>
  );
}

// Step 3: Class & School — asked for every child
interface Step3Props extends StepProps {
  classes: (Class & { sections: Section[] })[];
}

function Step3({ formData, errors, updateChild, classes }: Step3Props) {
  const kids = formData.children;
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
        Class & Admission Details{kids.length > 1 ? ' — for each child' : ''}
      </h3>
      {kids.map((c, i) => {
        const selectedClass = classes.find((cl) => cl.id === c.class_id);
        const sections = selectedClass?.sections ?? [];
        return (
          <div key={i} className="space-y-4 rounded-xl border border-slate-200 p-4">
            <ChildHeader i={i} c={c} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Class" required value={c.class_id}
                onChange={(e) => {
                  const cls = classes.find((cl) => cl.id === e.target.value);
                  // A new class means a different fee structure: reload it in the Fees step.
                  updateChild(i, { class_id: e.target.value, class_name: cls?.name ?? '', section_id: '', section_name: '', fees_loaded_for: '', fee_lines: [] });
                }} error={errors[`c${i}_class_id`]}>
                <option value="">Select class</option>
                {classes.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
              </Select>
              <Select label="Section" required value={c.section_id}
                onChange={(e) => { const sec = sections.find((s) => s.id === e.target.value); updateChild(i, { section_id: e.target.value, section_name: sec?.name ?? '' }); }}
                error={errors[`c${i}_section_id`]} disabled={!c.class_id}>
                <option value="">Select section</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Input label="Admission Number" required value={c.admission_number} onChange={(e) => updateChild(i, { admission_number: e.target.value })}
                error={errors[`c${i}_admission_number`]} placeholder="e.g. 2026051" />
              <Input label="Previous School Name" value={c.prev_school_name} onChange={(e) => updateChild(i, { prev_school_name: e.target.value })} placeholder="Optional" />
              <Select label="Previous School Board" value={c.prev_school_board} onChange={(e) => updateChild(i, { prev_school_board: e.target.value })}>
                <option value="">Select board (optional)</option>
                <option value="CBSE">CBSE</option>
                <option value="ICSE">ICSE</option>
                <option value="State Board">State Board</option>
                <option value="Other">Other</option>
              </Select>
              <Input label="Transfer Certificate Number" value={c.tc_number} onChange={(e) => updateChild(i, { tc_number: e.target.value })} placeholder="Optional" />
              <Input label="TC Issued Date" type="date" value={c.tc_date} onChange={(e) => updateChild(i, { tc_date: e.target.value })} max={today()} />
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
                  <input type="checkbox" checked={c.transport_selected}
                    onChange={(e) => updateChild(i, {
                      transport_selected: e.target.checked,
                      // Tick / untick the transport fee head if it's already loaded.
                      fee_lines: c.fee_lines.map((l) => (/transport/i.test(l.fee_type) ? { ...l, include: e.target.checked } : l)),
                    })} className="rounded" />
                  <span>Student requires school transport</span>
                </label>
                <p className="mt-1 text-xs text-slate-400">Includes the Transport fee head (if the class has one). Assign the bus from the Transport module.</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Step 4: Fees — each child's fee heads + concession, one payment for the family
interface Step4Props extends StepProps {
  schoolId: string;
  academicYear: string;
  canCollectPayment: boolean;
}

function Step4Fees({ formData, errors, update, updateChild, schoolId, academicYear, canCollectPayment }: Step4Props) {
  const [onlineEnabled, setOnlineEnabled] = useState<boolean | null>(null);
  useEffect(() => { fetchGatewayStatus().then((g) => setOnlineEnabled(!!g.active)).catch(() => setOnlineEnabled(false)); }, []);
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const kids = formData.children;
  const payment = formData.payment;

  // Load the fee structure for every child whose class changed / isn't loaded yet.
  const loadKey = kids.map((c) => `${c.class_id}:${c.fees_loaded_for}`).join('|');
  useEffect(() => {
    kids.forEach((c, i) => {
      if (!c.class_id || c.fees_loaded_for === c.class_id) return;
      setLoading((l) => ({ ...l, [i]: true }));
      fetchFeeStructuresForClass(schoolId, c.class_id, academicYear)
        .then((structures) => {
          const lines: AdmissionFeeLineItem[] = structures.map((s) => ({
            fee_type: s.name,
            amount: Number(s.amount) || 0,
            include: s.fee_type !== 'Transport' || c.transport_selected,
            editable: true,
          }));
          // No structure: start empty — never charge made-up amounts.
          updateChild(i, { fee_lines: lines, fees_loaded_for: c.class_id, no_structure_warning: structures.length === 0 });
        })
        .catch(() => updateChild(i, { fee_lines: [], fees_loaded_for: c.class_id, no_structure_warning: true }))
        .finally(() => setLoading((l) => ({ ...l, [i]: false })));
    });
  }, [loadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const split = splitPayment(kids, payment);
  const updatePayment = (patch: Partial<PaymentForm>) => update({ payment: { ...payment, ...patch } });

  // Keep "Pay Now (Full)" equal to the total if fees are edited afterwards.
  useEffect(() => {
    if (payment.payment_option === 'full' && payment.amount_paying !== String(split.totalNet)) {
      updatePayment({ amount_paying: String(split.totalNet) });
    }
  }, [split.totalNet, payment.payment_option]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsRef = payment.payment_option !== 'later' && payment.payment_mode !== 'Cash' && payment.payment_mode !== 'Online (Razorpay)';
  const isRazorpay = payment.payment_option !== 'later' && payment.payment_mode === 'Online (Razorpay)';

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Fees{kids.length > 1 ? ' — for each child' : ''}</h3>

      {kids.map((c, i) => {
        const s = childFeeSummary(c);
        const setLine = (idx: number, patch: Partial<AdmissionFeeLineItem>) =>
          updateChild(i, { fee_lines: c.fee_lines.map((l, j) => (j === idx ? { ...l, ...patch } : l)) });
        return (
          <div key={i} className="space-y-4 rounded-xl border border-slate-200 p-4">
            <ChildHeader i={i} c={c} extra={<span className="text-sm font-semibold text-slate-900">{formatCurrency(s.netPayable, '₹')}</span>} />

            {c.no_structure_warning && !loading[i] && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <p className="text-sm text-amber-800">
                  No fee structure for {c.class_name || 'this class'} ({academicYear}). Add the fee heads below, or{' '}
                  <a href="/admin/fees" target="_blank" rel="noreferrer" className="underline font-medium">set up the class fees in the Fees module</a>.
                </p>
              </div>
            )}

            {loading[i] ? (
              <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-8">
                <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
                <span className="text-sm text-slate-500">Loading fee structure…</span>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/80">
                    <tr>
                      <th className="w-8 px-4 py-2.5" />
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Fee Head</th>
                      <th className="w-36 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Amount (₹)</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {c.fee_lines.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-4 text-center text-xs text-slate-400">No fee heads yet.</td></tr>
                    )}
                    {c.fee_lines.map((line, idx) => (
                      <tr key={idx} className={line.include ? '' : 'opacity-50'}>
                        <td className="px-4 py-3 text-center">
                          <input type="checkbox" checked={line.include} onChange={(e) => setLine(idx, { include: e.target.checked })}
                            className="rounded border-slate-300 text-brand-600" />
                        </td>
                        <td className="px-4 py-3">
                          <input type="text" value={line.fee_type} onChange={(e) => setLine(idx, { fee_type: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
                            placeholder="Fee head name" />
                          {errors[`c${i}_fee_type_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`c${i}_fee_type_${idx}`]}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                            <input type="number" min="0" step="0.01" value={line.amount === 0 ? '' : line.amount}
                              onChange={(e) => setLine(idx, { amount: Math.max(0, parseFloat(e.target.value) || 0) })}
                              className="w-full rounded-lg border border-slate-200 py-1.5 pl-6 pr-2.5 text-right text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30" />
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button type="button" onClick={() => updateChild(i, { fee_lines: c.fee_lines.filter((_, j) => j !== idx) })}
                            className="rounded p-1 text-slate-300 transition-colors hover:text-red-500">
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
                  <button type="button" onClick={() => updateChild(i, { fee_lines: [...c.fee_lines, { fee_type: '', amount: 0, include: true, editable: true }] })}
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-600 transition-colors hover:text-brand-800">
                    <PlusCircle className="h-3.5 w-3.5" /> Add fee line
                  </button>
                </div>
              </div>
            )}

            {/* Concession for this child */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Discount type</label>
                <select value={c.discount.type} onChange={(e) => updateChild(i, { discount: { ...c.discount, type: e.target.value as AdmissionDiscount['type'] } })}
                  className="w-full appearance-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                  <option value="flat">Flat (₹)</option>
                  <option value="percent">Percent (%)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{c.discount.type === 'flat' ? 'Discount (₹)' : 'Discount (%)'}</label>
                <input type="number" min="0" max={c.discount.type === 'percent' ? 100 : undefined} step="0.01"
                  value={c.discount.value === 0 ? '' : c.discount.value}
                  onChange={(e) => updateChild(i, { discount: { ...c.discount, value: Math.max(0, parseFloat(e.target.value) || 0) } })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  placeholder="0" />
                {errors[`c${i}_discount`] && <p className="mt-0.5 text-xs text-red-500">{errors[`c${i}_discount`]}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Reason</label>
                <select value={c.discount.reason} onChange={(e) => updateChild(i, { discount: { ...c.discount, reason: e.target.value as AdmissionDiscount['reason'] } })}
                  className="w-full appearance-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                  <option>Sibling</option>
                  <option>Staff Child</option>
                  <option>Merit</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>Total {formatCurrency(s.totalFees, '₹')}</p>
                {s.discountAmount > 0 && <p className="text-emerald-600">− {formatCurrency(s.discountAmount, '₹')}</p>}
                <p className="text-sm font-semibold text-slate-900">Net {formatCurrency(s.netPayable, '₹')}</p>
              </div>
            </div>
            {c.discount.reason === 'Other' && c.discount.value > 0 && (
              <input type="text" value={c.discount.reason_note} onChange={(e) => updateChild(i, { discount: { ...c.discount, reason_note: e.target.value } })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="Specify discount reason…" />
            )}
          </div>
        );
      })}

      {/* Family summary */}
      <div className="space-y-2 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand-700">{kids.length > 1 ? 'Total for all children' : 'Fee Summary'}</p>
        {kids.length > 1 && kids.map((c, i) => (
          <div key={i} className="flex justify-between text-sm text-slate-700">
            <span>{childLabel(c, i)}</span>
            <span className="font-medium">{formatCurrency(split.nets[i], '₹')}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-brand-200 pt-2 text-sm font-semibold text-slate-900">
          <span>Net Payable</span>
          <span>{formatCurrency(split.totalNet, '₹')}</span>
        </div>
        {payment.payment_option !== 'later' && (
          <>
            <div className="flex justify-between text-sm text-brand-700">
              <span>Paying Now</span>
              <span className="font-medium">{formatCurrency(split.paying, '₹')}</span>
            </div>
            <div className={`flex justify-between text-sm font-semibold ${split.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              <span>Balance Due</span>
              <span>{formatCurrency(split.balance, '₹')}</span>
            </div>
            {kids.length > 1 && split.paying > 0 && (
              <p className="pt-1 text-xs text-slate-500">
                Split: {kids.map((c, i) => `${childLabel(c, i)} ${formatCurrency(split.shares[i], '₹')}`).join(' · ')} — each child gets their own receipt.
              </p>
            )}
          </>
        )}
      </div>

      {/* Payment (one for the family) */}
      <div className="space-y-4 rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
        <p className="text-sm font-semibold text-slate-700">Payment</p>

        {!canCollectPayment && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
            <p className="text-xs text-amber-800">Your role can&apos;t collect payments. This admission will be saved as <b>Pay Later</b>.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {(['full', 'partial', 'later'] as AdmissionPaymentOption[]).map((opt) => {
            const disabled = (!canCollectPayment && opt !== 'later') || (opt !== 'later' && split.totalNet <= 0);
            const labels = { full: 'Pay Now (Full)', partial: 'Pay Partial', later: 'Pay Later' };
            return (
              <label key={opt} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all ${
                payment.payment_option === opt ? 'border-brand-500 bg-brand-50 font-medium text-brand-700' : 'border-slate-200 text-slate-600 hover:border-brand-300'
              } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}>
                <input type="radio" name="payment_option" value={opt} checked={payment.payment_option === opt} disabled={disabled}
                  onChange={() => updatePayment({ payment_option: opt, amount_paying: opt === 'full' ? String(split.totalNet) : opt === 'later' ? '' : payment.amount_paying })}
                  className="sr-only" />
                {labels[opt]}
              </label>
            );
          })}
        </div>

        {payment.payment_option !== 'later' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Amount Paying Now{kids.length > 1 ? ' (all children)' : ''} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                <input type="number" min="0" max={split.totalNet} step="0.01" value={payment.amount_paying}
                  readOnly={payment.payment_option === 'full'}
                  onChange={(e) => updatePayment({ amount_paying: e.target.value })}
                  className={`w-full rounded-xl border py-2 pl-7 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                    errors.amount_paying ? 'border-red-400 bg-red-50' : 'border-slate-300'
                  } ${payment.payment_option === 'full' ? 'cursor-not-allowed bg-slate-50' : ''}`}
                  placeholder="0.00" />
              </div>
              {errors.amount_paying && <p className="mt-1 text-xs text-red-600">{errors.amount_paying}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Mode <span className="text-red-500">*</span></label>
              <select value={payment.payment_mode} onChange={(e) => updatePayment({ payment_mode: e.target.value as AdmissionPaymentMode })}
                className="w-full appearance-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                <option>Cash</option>
                <option value="Online (Razorpay)" disabled={onlineEnabled === false}>Online (Razorpay){onlineEnabled === false ? ' — not set up' : ''}</option>
                <option>UPI</option>
                <option>Card</option>
                <option>Cheque</option>
                <option>Online/Bank Transfer</option>
              </select>
            </div>
            {isRazorpay && (
              <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 sm:col-span-2">
                After you confirm, the Razorpay window opens for the parent to pay by UPI / card
                {kids.length > 1 ? ' — once for each child' : ''}.
                They pay {formatCurrency(onlineCharges(split.paying).total, '₹')} (fee + 2% convenience fee + 18% GST on it);
                {' '}{formatCurrency(split.paying, '₹')} is credited to the fees.
              </div>
            )}
            {needsRef && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Transaction / Reference No. <span className="text-red-500">*</span></label>
                <input type="text" value={payment.transaction_ref} onChange={(e) => updatePayment({ transaction_ref: e.target.value })}
                  className={`w-full rounded-xl border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                    errors.transaction_ref ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
                  placeholder="Enter transaction or reference number" />
                {errors.transaction_ref && <p className="mt-1 text-xs text-red-600">{errors.transaction_ref}</p>}
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Date</label>
              <input type="date" value={payment.payment_date} max={today()} onChange={(e) => updatePayment({ payment_date: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              {errors.payment_date && <p className="mt-1 text-xs text-red-600">{errors.payment_date}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Remarks <span className="font-normal text-slate-400">(optional)</span></label>
              <input type="text" value={payment.remarks} onChange={(e) => updatePayment({ remarks: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="Optional note about this payment" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Step 5: Review
function Step5Review({ formData, credentials, onEditStep }: {
  formData: FormData;
  credentials: { username: string; password: string } | null;
  onEditStep: (step: number) => void;
}) {
  const kids = formData.children;
  const payment = formData.payment;
  const split = splitPayment(kids, payment);
  const PAYMENT_LABELS: Record<string, string> = { full: 'Pay Now (Full)', partial: 'Pay Partial', later: 'Pay Later' };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Review & Confirm</h3>

      <ReviewCard title="Parents" onEdit={() => onEditStep(1)}>
        <ReviewRow label="Father's Name" value={formData.father_name} />
        <ReviewRow label="Mother's Name" value={formData.mother_name} />
        <ReviewRow label="Mobile" value={formData.phone} />
        {formData.whatsapp && formData.whatsapp !== formData.phone && <ReviewRow label="WhatsApp" value={formData.whatsapp} />}
        {formData.parent_email && <ReviewRow label="Email" value={formData.parent_email} />}
      </ReviewCard>

      <ReviewCard title="Address" onEdit={() => onEditStep(2)}>
        <ReviewRow label="Address" value={combinedAddress(formData)} />
      </ReviewCard>

      {kids.map((c, i) => {
        const s = childFeeSummary(c);
        return (
          <ReviewCard key={i} title={kids.length > 1 ? `Child ${i + 1} — ${childLabel(c, i)}` : 'Student'} onEdit={() => onEditStep(3)}>
            <ReviewRow label="Name" value={c.full_name} />
            <ReviewRow label="Date of Birth" value={c.date_of_birth} />
            <ReviewRow label="Gender" value={c.gender} capitalize />
            <ReviewRow label="Class" value={`${c.class_name}${c.section_name ? ` - ${c.section_name}` : ''}`} />
            <ReviewRow label="Admission No." value={c.admission_number} />
            {c.prev_school_name && <ReviewRow label="Previous School" value={`${c.prev_school_name}${c.prev_school_board ? ` (${c.prev_school_board})` : ''}`} />}
            <ReviewRow label="Transport" value={c.transport_selected ? 'Yes' : 'No'} />
            <div className="mt-1 space-y-1 border-t border-slate-200 pt-2">
              {c.fee_lines.filter((l) => l.include && l.amount > 0).map((l, j) => (
                <div key={j} className="flex justify-between text-sm">
                  <span className="text-slate-600">{l.fee_type}</span>
                  <span className="font-medium text-slate-900">{formatCurrency(l.amount, '₹')}</span>
                </div>
              ))}
              {s.discountAmount > 0 && <ReviewRow label={`Discount (${c.discount.reason})`} value={`− ${formatCurrency(s.discountAmount, '₹')}`} highlight="green" />}
              <ReviewRow label="Net Payable" value={formatCurrency(s.netPayable, '₹')} />
              {payment.payment_option !== 'later' && <ReviewRow label="Paying now" value={formatCurrency(split.shares[i], '₹')} />}
            </div>
          </ReviewCard>
        );
      })}

      <ReviewCard title="Payment" onEdit={() => onEditStep(4)}>
        <ReviewRow label={kids.length > 1 ? 'Net Payable (all children)' : 'Net Payable'} value={formatCurrency(split.totalNet, '₹')} />
        <ReviewRow label="Payment Option" value={PAYMENT_LABELS[payment.payment_option]} />
        {payment.payment_option !== 'later' && (
          <>
            <ReviewRow label="Paying Now" value={formatCurrency(split.paying, '₹')} />
            <ReviewRow label="Balance Due" value={formatCurrency(split.balance, '₹')} highlight={split.balance > 0 ? 'red' : 'green'} />
            <ReviewRow label="Payment Mode" value={payment.payment_mode} />
            {payment.transaction_ref && <ReviewRow label="Ref / Txn No." value={payment.transaction_ref} />}
          </>
        )}
      </ReviewCard>

      {credentials ? (
        <CredentialsBox username={credentials.username} password={credentials.password} />
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Enter a valid parent mobile number to create the parent login.</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewAdmissionPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();

  const schoolId = profile?.school_id ?? '';
  // Admin accounts (owner or staff); the server checks the staff role's fee permission too.
  const canCollectPayment = profile?.role === 'admin';

  const [classes, setClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Children already saved in this submission (index → result), so a retry
  // after a partial failure never admits the same child twice.
  const [results, setResults] = useState<Record<number, ChildResult>>({});
  const [resultParentCredentials, setResultParentCredentials] = useState<{ username: string; password: string } | null>(null);
  const idempotencyKeys = useRef<Record<number, string>>({});

  const [formData, setFormData] = useState<FormData>(() => {
    try {
      const raw = sessionStorage.getItem(WIZARD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FormData>;
        const base = initialForm();
        return {
          ...base, ...parsed,
          children: parsed.children?.length ? parsed.children.map((c) => ({ ...emptyChild(), ...c })) : base.children,
          payment: { ...base.payment, ...(parsed.payment ?? {}) },
        };
      }
    } catch { /* ignore */ }
    return initialForm();
  });

  useEffect(() => {
    try { sessionStorage.setItem(WIZARD_KEY, JSON.stringify(formData)); } catch { /* ignore quota errors */ }
  }, [formData]);

  useEffect(() => {
    if (!schoolId) return;
    setClassesLoading(true);
    fetchClasses(schoolId)
      .then(setClasses)
      .catch(() => toast('Failed to load classes', 'error'))
      .finally(() => setClassesLoading(false));
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!schoolId) return;
    fetchSchool(schoolId).then(setSchool).catch(console.error);
  }, [schoolId]);

  const update = useCallback((patch: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateChild = useCallback((i: number, patch: Partial<ChildForm>) => {
    setFormData((prev) => ({ ...prev, children: prev.children.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  }, []);

  const academicYear = school?.academic_year ?? '2026-27';


  // ── Validation ──────────────────────────────────────────────────────────────

  function validateStep(step: number): Record<string, string> {
    const e: Record<string, string> = {};
    const kids = formData.children;

    if (step === 1) {
      if (!formData.father_name.trim()) e.father_name = "Father's name is required";
      if (!formData.mother_name.trim()) e.mother_name = "Mother's name is required";
      if (!normalizeMobile(formData.phone)) e.phone = 'Enter a valid 10-digit mobile number';
      if (!formData.same_as_phone && formData.whatsapp && !normalizeMobile(formData.whatsapp)) e.whatsapp = 'Enter a valid 10-digit number';
      if (formData.parent_email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formData.parent_email.trim())) {
        e.parent_email = 'Enter a valid email address';
      }
      if (kids.length === 0) e.children = 'Add at least one child';
      kids.forEach((c, i) => {
        if (!c.full_name.trim()) e[`c${i}_full_name`] = 'Student name is required';
        if (!c.date_of_birth) e[`c${i}_date_of_birth`] = 'Date of birth is required';
        else if (c.date_of_birth > today()) e[`c${i}_date_of_birth`] = 'Date of birth cannot be in the future';
        if (!c.gender) e[`c${i}_gender`] = 'Gender is required';
      });
    }

    if (step === 2) {
      if (!formData.address_line1.trim()) e.address_line1 = 'Address is required';
      if (!formData.city.trim()) e.city = 'City is required';
      if (!formData.state.trim()) e.state = 'State is required';
      if (!/^\d{6}$/.test(formData.pin_code)) e.pin_code = 'PIN code must be exactly 6 digits';
    }

    if (step === 3) {
      const seen = new Map<string, number>();
      kids.forEach((c, i) => {
        if (!c.class_id) e[`c${i}_class_id`] = 'Class is required';
        if (!c.section_id) e[`c${i}_section_id`] = 'Section is required';
        const adm = c.admission_number.trim();
        if (!adm) e[`c${i}_admission_number`] = 'Admission number is required';
        else if (seen.has(adm.toUpperCase())) e[`c${i}_admission_number`] = `Same number as child ${seen.get(adm.toUpperCase())! + 1}`;
        else seen.set(adm.toUpperCase(), i);
      });
    }

    if (step === 4) {
      kids.forEach((c, i) => {
        c.fee_lines.forEach((l, idx) => {
          if (l.include && l.amount > 0 && !l.fee_type.trim()) e[`c${i}_fee_type_${idx}`] = 'Fee head name is required';
        });
        if (c.discount.type === 'percent' && c.discount.value > 100) e[`c${i}_discount`] = 'Cannot be more than 100%';
        const { totalFees } = childFeeSummary(c);
        if (c.discount.type === 'flat' && c.discount.value > totalFees) e[`c${i}_discount`] = 'Cannot be more than the total fees';
      });
      const p = formData.payment;
      if (p.payment_option !== 'later') {
        const { totalNet } = splitPayment(kids, p);
        const amt = parseFloat(p.amount_paying) || 0;
        if (amt <= 0) e.amount_paying = 'Enter amount to pay';
        else if (amt > totalNet + 0.001) e.amount_paying = `Cannot exceed net payable (₹${totalNet.toFixed(2)})`;
        if (p.payment_mode !== 'Cash' && p.payment_mode !== 'Online (Razorpay)' && !p.transaction_ref.trim()) {
          e.transaction_ref = 'Transaction / Reference No. is required for non-cash payments';
        }
        if (p.payment_date && p.payment_date > today()) e.payment_date = 'Payment date cannot be in the future';
      }
    }

    return e;
  }

  function goTo(step: number) {
    setErrors({});
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleNext() {
    const e = validateStep(currentStep);
    if (Object.keys(e).length > 0) { setErrors(e); toast('Please fix the highlighted fields', 'error'); return; }
    goTo(currentStep + 1);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (saving) return;
    // Re-check everything (an earlier step may have been edited from Review).
    for (const step of [1, 2, 3, 4]) {
      const e = validateStep(step);
      if (Object.keys(e).length > 0) { setErrors(e); setCurrentStep(step); toast('Please fix the highlighted fields', 'error'); return; }
    }

    setSaving(true);
    const kids = formData.children;
    const payment = formData.payment;
    const split = splitPayment(kids, payment);
    const address = combinedAddress(formData);
    const done: Record<number, ChildResult> = { ...results };
    let creds = resultParentCredentials;

    try {
      for (let i = 0; i < kids.length; i++) {
        if (done[i]) continue; // already admitted in an earlier attempt
        const c = kids[i];
        const share = split.shares[i];
        const fees = childFeesData(c, payment, share);
        // Online payments are recorded only after Razorpay confirms them.
        const payOnline = share > 0 && payment.payment_mode === 'Online (Razorpay)';
        if (!idempotencyKeys.current[i]) idempotencyKeys.current[i] = makeIdempotencyKey(c.admission_number, schoolId);

        let result;
        try {
          result = await createAdmissionWithFees({
            school_id: schoolId,
            admission_number: c.admission_number.trim(),
            full_name: c.full_name.trim(),
            father_name: formData.father_name.trim(),
            mother_name: formData.mother_name.trim() || null,
            parent_email: formData.parent_email.trim() || null,
            date_of_birth: c.date_of_birth || null,
            gender: c.gender,
            class_id: c.class_id,
            section_id: c.section_id,
            address,
            parent_phone: normalizeMobile(formData.phone),
            whatsapp_number: (formData.same_as_phone ? formData.phone : formData.whatsapp) || null,
            previous_school: c.prev_school_name || null,
            previous_board: c.prev_school_board || null,
            tc_number: c.tc_number || null,
            tc_date: c.tc_date || null,
            admission_date: today(),
            academic_year: academicYear,
            fee_lines: c.fee_lines,
            discount: c.discount,
            payment_option: payOnline ? 'later' : fees.payment_option,
            amount_paying: payOnline ? 0 : share,
            payment_mode: payment.payment_mode,
            transaction_ref: payment.transaction_ref,
            payment_date: payment.payment_date || today(),
            remarks: payment.remarks,
            collected_by: profile?.id ?? '',
            collected_by_name: profile?.full_name ?? '',
            idempotency_key: idempotencyKeys.current[i],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to complete admission';
          const savedCount = Object.keys(done).length;
          throw new Error(`${childLabel(c, i)}: ${msg}${savedCount ? ` (${savedCount} child${savedCount > 1 ? 'ren' : ''} already admitted — fix this and press Complete again)` : ''}`);
        }

        if (!creds && result.parentCredentials) creds = result.parentCredentials;
        if (result.parentError) toast(`${childLabel(c, i)} admitted, but parent login failed: ${result.parentError}`, 'error');

        let onlinePaid: boolean | null = null;
        if (payOnline) {
          onlinePaid = false;
          try {
            // Split this child's share across their new fee rows in proportion.
            const created = (await fetchFees({ studentId: result.student.id })).filter((f) => Number(f.amount) > Number(f.paid_amount));
            const totalDue = created.reduce((s, f) => s + Number(f.amount) - Number(f.paid_amount), 0);
            let left = Math.round(share * 100);
            const allocations = created.map((f, k) => {
              const due = Math.round((Number(f.amount) - Number(f.paid_amount)) * 100);
              const part = k === created.length - 1 ? left : Math.min(left, Math.round((due / Math.round(totalDue * 100)) * share * 100));
              left -= part;
              return { fee_id: f.id, amount: Math.min(part, due) / 100 };
            }).filter((a) => a.amount > 0);
            const pay = await createOnlinePayment({ channel: 'checkout', allocations, admission_receipt_id: result.receiptId });
            try {
              await payWithCheckout(pay, {
                name: `${school?.name || 'Admission fees'} — ${c.full_name}`,
                prefill: { name: formData.father_name, email: formData.parent_email || undefined },
              });
              onlinePaid = true;
            } catch (payErr) {
              const chk = await checkOnlinePayment(pay.online_payment_id).catch(() => null);
              if (chk?.status === 'paid') onlinePaid = true;
              else toast(payErr instanceof Error && payErr.message === 'cancelled'
                ? `${c.full_name}: admission saved, online payment not completed — the amount is pending in Fees.`
                : `${c.full_name}: admission saved, but payment failed: ${payErr instanceof Error ? payErr.message : ''}`, 'error');
            }
          } catch (startErr) {
            toast(`${c.full_name}: admission saved, but online payment couldn't start: ${startErr instanceof Error ? startErr.message : ''}`, 'error');
          }
        }

        const { netPayable } = childFeeSummary(c);
        const paidNow = payOnline ? (onlinePaid ? share : 0) : share;
        done[i] = {
          name: c.full_name.trim(),
          admissionNumber: c.admission_number.trim(),
          className: `${c.class_name}${c.section_name ? ` - ${c.section_name}` : ''}`,
          receiptNumber: result.receiptNumber,
          receiptId: result.receiptId,
          studentId: result.student.id,
          fees,
          paidNow,
          balanceDue: round2(netPayable - paidNow),
          onlinePaid,
        };
        setResults({ ...done });
      }

      setResultParentCredentials(creds);
      try { sessionStorage.removeItem(WIZARD_KEY); } catch { /* ignore */ }
      setSubmitted(true);
      toast(kids.length > 1 ? `${kids.length} children admitted` : 'Admission complete', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to complete admission', 'error');
    } finally {
      setSaving(false);
    }
  }

  function resetAll(next: FormData) {
    setResults({});
    setResultParentCredentials(null);
    idempotencyKeys.current = {};
    setFormData(next);
    setCurrentStep(1);
    setSubmitted(false);
    setErrors({});
  }

  // Preview of the parent login: their mobile number + parentfirstname@schoolshortname.
  const previewMobile = normalizeMobile(formData.phone);
  const firstChild = formData.children[0] ?? emptyChild();
  const credentials = school !== null && previewMobile
    ? (() => {
        const c = generateParentCredentials({
          mobile: previewMobile,
          parentName: parentFromStudent({ ...formData, full_name: firstChild.full_name }).name,
          shortName: schoolShortName(school),
        });
        return { username: c.username, password: c.password };
      })()
    : null;

  const savedList = formData.children.map((_, i) => results[i]).filter(Boolean) as ChildResult[];
  const totalPaid = round2(savedList.reduce((s, r) => s + r.paidNow, 0));
  const totalDue = round2(savedList.reduce((s, r) => s + r.balanceDue, 0));
  const savedCount = Object.keys(results).length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout title="New Admission">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center">
          <button onClick={() => navigate('/admin/students')}
            className="mr-3 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-slate-900">New Student Admission</h1>
        </div>

        {classesLoading ? (
          <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="skeleton-shimmer h-3.5 w-28 rounded-md" />
                  <div className="skeleton-shimmer h-10 w-full rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {submitted ? (
              // ── Success Screen ──────────────────────────────────────────────
              <div className="flex flex-col items-center px-6 py-12 text-center sm:px-10">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle className="h-10 w-10 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                  {savedList.length > 1 ? `${savedList.length} Children Admitted!` : 'Admission Successful!'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Students enrolled and fee records created.</p>

                <div className="mt-6 w-full space-y-3">
                  {savedList.map((r, i) => (
                    <div key={i} className="rounded-xl bg-slate-50 p-4 text-left">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                          <p className="text-xs text-slate-500">{r.className} · Adm. No. <b>{r.admissionNumber}</b></p>
                          {r.receiptNumber && <p className="text-xs text-brand-700">Receipt {r.receiptNumber}</p>}
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-emerald-700">Paid {formatCurrency(r.paidNow, '₹')}</p>
                          {r.balanceDue > 0 && <p className="text-red-600">Due {formatCurrency(r.balanceDue, '₹')}</p>}
                          {r.onlinePaid === false && <p className="text-amber-600">Online payment not completed</p>}
                        </div>
                      </div>
                      {r.receiptNumber && (
                        <button
                          onClick={() => printReceipt({
                            receiptNumber: r.receiptNumber,
                            admissionNumber: r.admissionNumber,
                            studentName: r.name,
                            fatherName: formData.father_name,
                            className: r.className,
                            schoolName: school?.name ?? 'School',
                            schoolAddress: school?.address ?? '',
                            fees: r.fees,
                            paidNow: r.paidNow,
                            balanceDue: r.balanceDue,
                            collectedByName: profile?.full_name ?? '',
                            paymentDate: r.paidNow > 0 ? (r.fees.payment_date || today()) : today(),
                          })}
                          className="mt-3 flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                          <Printer className="h-3.5 w-3.5" /> Print Receipt
                        </button>
                      )}
                    </div>
                  ))}
                  {savedList.length > 1 && (
                    <div className="flex justify-between rounded-xl border border-slate-200 px-4 py-2 text-sm">
                      <span className="text-slate-500">Total</span>
                      <span><b className="text-emerald-700">Paid {formatCurrency(totalPaid, '₹')}</b>{totalDue > 0 && <b className="ml-3 text-red-600">Due {formatCurrency(totalDue, '₹')}</b>}</span>
                    </div>
                  )}
                </div>

                {resultParentCredentials && (
                  <div className="mt-4 w-full">
                    <CredentialsBox username={resultParentCredentials.username} password={resultParentCredentials.password} />
                  </div>
                )}

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {(formData.same_as_phone ? formData.phone : formData.whatsapp) && savedList.length > 0 && (
                    <button
                      onClick={() => sendWhatsAppReceipt({
                        whatsapp: formData.same_as_phone ? formData.phone : formData.whatsapp,
                        schoolName: school?.name ?? 'School',
                        paymentMode: formData.payment.payment_mode,
                        results: savedList,
                      })}
                      className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100">
                      <MessageCircle className="h-4 w-4" /> Send on WhatsApp
                    </button>
                  )}
                  <button onClick={() => resetAll(sameFamilyForm(formData))}
                    className="flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100">
                    <Users className="h-4 w-4" /> Another child of same parents
                  </button>
                  <button onClick={() => resetAll(initialForm())}
                    className="flex items-center gap-2 rounded-xl border border-brand-300 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100">
                    <PlusCircle className="h-4 w-4" /> New Admission
                  </button>
                  <button onClick={() => navigate('/admin/students')}
                    className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
                    Go to Students
                  </button>
                </div>

                {totalDue > 0 && (
                  <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <b>Note:</b> Balance of {formatCurrency(totalDue, '₹')} is recorded as pending dues in the Fees module.
                  </p>
                )}
              </div>
            ) : (
              <>
                {savedCount > 0 && (
                  <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:px-6">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Already admitted: {formData.children.map((c, i) => (results[i] ? `${childLabel(c, i)} (${results[i].admissionNumber})` : null)).filter(Boolean).join(', ')}.
                      Pressing Complete again only saves the remaining children.
                    </span>
                  </div>
                )}

                {/* ── Stepper ─────────────────────────────────────────────── */}
                <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
                  <div className="flex items-center overflow-x-auto">
                    {STEP_LABELS.map((label, idx) => {
                      const step = idx + 1;
                      const isCompleted = step < currentStep;
                      const isActive = step === currentStep;
                      return (
                        <React.Fragment key={step}>
                          <div className="flex flex-shrink-0 flex-col items-center">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                              isCompleted ? 'bg-emerald-500 text-white'
                              : isActive ? 'bg-brand-600 text-white'
                              : 'border-2 border-slate-200 bg-slate-100 text-slate-400'}`}>
                              {isCompleted ? <CheckCircle className="h-4 w-4" /> : step}
                            </div>
                            <span className={`mt-1 whitespace-nowrap text-xs font-medium ${
                              isCompleted ? 'text-emerald-600' : isActive ? 'text-brand-600' : 'text-slate-400'}`}>
                              {label}
                            </span>
                          </div>
                          {idx < STEP_LABELS.length - 1 && (
                            <div className={`mx-1 mb-4 h-0.5 min-w-[8px] flex-1 ${step < currentStep ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                <div className="px-4 py-6 sm:px-6">
                  {currentStep === 1 && <Step1 formData={formData} errors={errors} update={update} updateChild={updateChild} />}
                  {currentStep === 2 && <Step2 formData={formData} errors={errors} update={update} updateChild={updateChild} />}
                  {currentStep === 3 && (
                    <Step3 formData={formData} errors={errors} update={update} updateChild={updateChild} classes={classes} />
                  )}
                  {currentStep === 4 && (
                    <Step4Fees formData={formData} errors={errors} update={update} updateChild={updateChild}
                      schoolId={schoolId} academicYear={academicYear} canCollectPayment={canCollectPayment} />
                  )}
                  {currentStep === 5 && <Step5Review formData={formData} credentials={credentials} onEditStep={goTo} />}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4 sm:px-6">
                  <div>
                    {currentStep > 1 && <Button variant="outline" onClick={() => goTo(currentStep - 1)}>← Back</Button>}
                  </div>
                  <div className="flex items-center gap-3">
                    {currentStep < 5 ? (
                      <Button onClick={handleNext}>{currentStep === 4 ? 'Review →' : 'Next →'}</Button>
                    ) : (
                      <Button loading={saving} onClick={handleSubmit} disabled={saving}>
                        <IndianRupee className="mr-1 h-4 w-4" />
                        {formData.children.length > 1 ? `Admit ${formData.children.length} Children` : 'Complete Admission'}
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
