import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, Upload, Copy, X, Lock, FileText, ImageIcon,
  ArrowLeft, AlertTriangle, IndianRupee, Pencil, Printer,
  MessageCircle, PlusCircle,
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
import { generateParentCredentials } from '@/lib/parentUtils';

// ─── Wizard persistence key ───────────────────────────────────────────────────
const WIZARD_KEY = 'veducore_admission_wizard_v2';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  // Step 1 — Personal
  full_name: string;
  father_name: string;
  mother_name: string;
  parent_email: string;
  phone: string;
  whatsapp: string;
  same_as_phone: boolean;
  date_of_birth: string;
  gender: string;
  // Step 2 — Address
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pin_code: string;
  country: string;
  // Step 3 — Class & School
  class_name: string;
  class_id: string;
  section_name: string;
  section_id: string;
  admission_number: string;
  prev_school_name: string;
  prev_school_board: string;
  tc_number: string;
  tc_date: string;
  transport_selected: boolean;
  // Step 4 — Documents
  prev_tc_file: File | null;
  student_aadhar: File | null;
  parent_aadhar: File | null;
  residence_proof: File | null;
  // Step 5 — Fees
  fees: AdmissionFeesData;
}

const DEFAULT_FEES: AdmissionFeesData = {
  line_items: [],
  discount: { type: 'flat', value: 0, reason: 'Other', reason_note: '' },
  payment_option: 'later',
  amount_paying: '',
  payment_mode: 'Cash',
  transaction_ref: '',
  payment_date: new Date().toISOString().split('T')[0],
  remarks: '',
  fee_structures_loaded: false,
  no_structure_warning: false,
};

const INITIAL_FORM: FormData = {
  full_name: '', father_name: '', mother_name: '', parent_email: '',
  phone: '', whatsapp: '', same_as_phone: false,
  date_of_birth: '', gender: 'male',
  address_line1: '', address_line2: '', city: '', state: '',
  pin_code: '', country: 'India',
  class_name: '', class_id: '', section_name: '', section_id: '',
  admission_number: '', prev_school_name: '', prev_school_board: '',
  tc_number: '', tc_date: '',
  transport_selected: false,
  prev_tc_file: null, student_aadhar: null,
  parent_aadhar: null, residence_proof: null,
  fees: DEFAULT_FEES,
};

const STEP_LABELS = ['Personal', 'Address', 'Class & School', 'Documents', 'Fees', 'Review'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compute fee summary from current fees state */
function computeFeeSummary(fees: AdmissionFeesData) {
  const totalFees = fees.line_items
    .filter((l) => l.include)
    .reduce((s, l) => s + l.amount, 0);

  const discountAmount =
    fees.discount.value > 0
      ? fees.discount.type === 'percent'
        ? Math.round((totalFees * fees.discount.value) / 100 * 100) / 100
        : fees.discount.value
      : 0;

  const netPayable = Math.max(0, totalFees - discountAmount);

  const paidNow =
    fees.payment_option === 'later'
      ? 0
      : Math.min(netPayable, parseFloat(fees.amount_paying) || 0);

  const balanceDue = Math.max(0, netPayable - paidNow);

  return { totalFees, discountAmount, netPayable, paidNow, balanceDue };
}

/** Generate a unique idempotency key for this wizard session */
function makeIdempotencyKey(admissionNumber: string, schoolId: string) {
  return `adm-${schoolId.slice(0, 8)}-${admissionNumber}-${Date.now()}`;
}

// ─── Print Receipt ────────────────────────────────────────────────────────────

function printReceipt(params: {
  receiptNumber: string;
  admissionNumber: string;
  studentName: string;
  fatherName: string;
  className: string;
  schoolName: string;
  schoolAddress: string;
  fees: AdmissionFeesData;
  collectedByName: string;
  paymentDate: string;
}) {
  const { totalFees, discountAmount, netPayable, paidNow, balanceDue } =
    computeFeeSummary(params.fees);
  const sym = '₹';

  const rows = params.fees.line_items
    .filter((l) => l.include)
    .map(
      (l) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${l.fee_type}</td>
         <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${sym}${l.amount.toFixed(2)}</td></tr>`
    )
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fee Receipt ${params.receiptNumber}</title>
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
    <h1>${params.schoolName}</h1>
    <p class="sub">${params.schoolAddress}</p>
    <hr class="divider"/>
    <p style="font-size:15px;font-weight:bold;margin:4px 0">FEE RECEIPT</p>
    <p class="sub">Receipt No: <b>${params.receiptNumber}</b> &nbsp;|&nbsp; Date: ${params.paymentDate}</p>
  </div>
  <table style="margin-bottom:12px">
    <tr><td class="label">Student</td><td><b>${params.studentName}</b></td></tr>
    <tr><td class="label">Father</td><td>${params.fatherName}</td></tr>
    <tr><td class="label">Class</td><td>${params.className}</td></tr>
    <tr><td class="label">Admission No.</td><td>${params.admissionNumber}</td></tr>
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
        ? `<tr><td style="padding:6px 10px;color:#059669">Discount (${params.fees.discount.reason})</td>
               <td style="text-align:right;padding:6px 10px;color:#059669">- ${sym}${discountAmount.toFixed(2)}</td></tr>`
        : ''}
      <tr><td style="padding:6px 10px">Net Payable</td>
          <td style="text-align:right;padding:6px 10px">${sym}${netPayable.toFixed(2)}</td></tr>
      <tr class="total-row">
        <td>Paid Now (${params.fees.payment_mode})</td>
        <td style="text-align:right">${sym}${paidNow.toFixed(2)}</td>
      </tr>
      ${balanceDue > 0
        ? `<tr><td style="padding:6px 10px;color:#dc2626">Balance Due</td>
               <td style="text-align:right;padding:6px 10px;color:#dc2626">${sym}${balanceDue.toFixed(2)}</td></tr>`
        : ''}
    </tfoot>
  </table>
  ${params.fees.transaction_ref
    ? `<p style="margin-top:12px;font-size:12px;color:#374151">Ref/Txn No: <b>${params.fees.transaction_ref}</b></p>`
    : ''}
  <hr class="divider"/>
  <p style="font-size:11px;color:#6b7280;text-align:center">Collected by: ${params.collectedByName}</p>
  <p style="font-size:10px;color:#9ca3af;text-align:center;margin-top:8px">This is a computer-generated receipt. No signature required.</p>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=560,height=780');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

/** Open WhatsApp with a pre-filled receipt summary message */
function sendWhatsAppReceipt(params: {
  whatsapp: string;
  studentName: string;
  admissionNumber: string;
  receiptNumber: string;
  schoolName: string;
  paidNow: number;
  balanceDue: number;
  paymentMode: string;
}) {
  const phone = params.whatsapp.replace(/\D/g, '');
  const fullPhone = phone.startsWith('91') ? phone : `91${phone}`;
  const msg =
    `*Fee Receipt — ${params.schoolName}*\n\n` +
    `Student: ${params.studentName}\n` +
    `Admission No: ${params.admissionNumber}\n` +
    `Receipt No: ${params.receiptNumber}\n` +
    `Paid Now: ₹${params.paidNow.toFixed(2)} (${params.paymentMode})\n` +
    (params.balanceDue > 0 ? `Balance Due: ₹${params.balanceDue.toFixed(2)}\n` : '') +
    `\nThank you for your payment.`;
  window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ─── UploadField ──────────────────────────────────────────────────────────────

interface UploadFieldProps {
  label: string; required?: boolean; file: File | null;
  onChange: (file: File | null) => void; accept?: string;
  error?: string; note?: string; showPreview?: boolean;
}

function UploadField({ label, required, file, onChange, accept, error, note, showPreview }: UploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file && showPreview && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file, showPreview]);

  return (
    <div className="w-full">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
        {note && <span className="ml-1 font-normal text-slate-400">{note}</span>}
      </label>
      {file ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          {showPreview && previewUrl
            ? <img src={previewUrl} alt="preview" className="h-20 w-20 rounded-lg object-cover border border-emerald-200 flex-shrink-0" />
            : <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>}
          <div className="flex flex-1 flex-col min-w-0">
            <span className="truncate text-sm font-medium text-emerald-700">{file.name}</span>
            <span className="text-xs text-emerald-500">{formatFileSize(file.size)}</span>
          </div>
          <button type="button" onClick={() => onChange(null)}
            className="rounded-lg p-1 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div role="button" tabIndex={0}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition-colors ${
            dragOver ? 'border-brand-400 bg-brand-50'
            : error ? 'border-red-300 bg-red-50'
            : 'border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50'}`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onChange(f); }}>
          {showPreview ? <ImageIcon className="mb-2 h-8 w-8 text-slate-300" /> : <Upload className="mb-2 h-8 w-8 text-slate-300" />}
          <span className="text-sm font-medium text-slate-500">Click to upload or drag & drop</span>
          {accept && <span className="mt-1 text-xs text-slate-400">{accept.replace(/\./g, '').replace(/,/g, ', ').toUpperCase()}</span>}
        </div>
      )}
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0] ?? null; onChange(f); e.target.value = ''; }} />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      className="ml-2 rounded-md p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-600 transition-colors" title="Copy">
      {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

// ─── Shared review sub-components ─────────────────────────────────────────────

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
          <span className="text-brand-700">Username:</span>
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
      <p className="mt-3 text-xs text-brand-600">Share these credentials with the parent. Advise them to change their password after first login.</p>
    </div>
  );
}

// ─── Step interfaces ──────────────────────────────────────────────────────────

interface StepProps {
  formData: FormData;
  errors: Record<string, string>;
  update: (patch: Partial<FormData>) => void;
}

// ─── Step 1: Personal ─────────────────────────────────────────────────────────

function Step1({ formData, errors, update }: StepProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Personal Details</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Student Full Name" required value={formData.full_name} onChange={(e) => update({ full_name: e.target.value })} error={errors.full_name} placeholder="Enter full name" />
        <Input label="Father's Name" required value={formData.father_name} onChange={(e) => update({ father_name: e.target.value })} error={errors.father_name} placeholder="Father's full name" />
        <Input label="Mother's Name" required value={formData.mother_name} onChange={(e) => update({ mother_name: e.target.value })} error={errors.mother_name} placeholder="Mother's full name" />
        <Input label="Parent Email (preferred)" type="email" required value={formData.parent_email} onChange={(e) => update({ parent_email: e.target.value })} error={errors.parent_email} placeholder="parent@example.com" />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone Number <span className="text-red-500">*</span></label>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-[10px] border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm">+91</span>
            <input type="tel" maxLength={10} value={formData.phone}
              onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 10); update({ phone: d, whatsapp: formData.same_as_phone ? d : formData.whatsapp }); }}
              className="flex-1 rounded-r-[10px] border border-slate-200 px-3 py-2 text-sm focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25"
              placeholder="10-digit mobile number" />
          </div>
          {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
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
            Same as phone number
          </label>
        </div>
        <Input label="Date of Birth" type="date" required value={formData.date_of_birth} onChange={(e) => update({ date_of_birth: e.target.value })} error={errors.date_of_birth} />
        <Select label="Gender" required value={formData.gender} onChange={(e) => update({ gender: e.target.value })} error={errors.gender}>
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </Select>
      </div>
    </div>
  );
}

// ─── Step 2: Address ──────────────────────────────────────────────────────────

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
        <Input label="PIN Code" required value={formData.pin_code} onChange={(e) => update({ pin_code: e.target.value })} error={errors.pin_code} maxLength={6} placeholder="6-digit PIN" />
        <Input label="Country" value={formData.country} onChange={(e) => update({ country: e.target.value })} />
      </div>
    </div>
  );
}

// ─── Step 3: Class & School ───────────────────────────────────────────────────

interface Step3Props extends StepProps { classes: (Class & { sections: Section[] })[] }

function Step3({ formData, errors, update, classes }: Step3Props) {
  const selectedClass = classes.find((c) => c.id === formData.class_id);
  const availableSections = selectedClass?.sections ?? [];
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Class & Admission Details</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Class" required value={formData.class_id}
          onChange={(e) => {
            const cls = classes.find((c) => c.id === e.target.value);
            update({
              class_id: e.target.value, class_name: cls?.name ?? '',
              section_id: '', section_name: '',
              // Reset fee structures when class changes
              fees: { ...formData.fees, fee_structures_loaded: false, line_items: [] },
            });
          }} error={errors.class_id}>
          <option value="">Select class</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select label="Section" required value={formData.section_id}
          onChange={(e) => { const sec = availableSections.find((s) => s.id === e.target.value); update({ section_id: e.target.value, section_name: sec?.name ?? '' }); }}
          error={errors.section_id} disabled={!formData.class_id}>
          <option value="">Select section</option>
          {availableSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Input label="Admission Number" required value={formData.admission_number} onChange={(e) => update({ admission_number: e.target.value })} error={errors.admission_number} placeholder="e.g. 20240051" />
        <Input label="Previous School Name" value={formData.prev_school_name} onChange={(e) => update({ prev_school_name: e.target.value })} placeholder="Optional" />
        <Select label="Previous School Board" value={formData.prev_school_board} onChange={(e) => update({ prev_school_board: e.target.value })}>
          <option value="">Select board (optional)</option>
          <option value="CBSE">CBSE</option>
          <option value="ICSE">ICSE</option>
          <option value="State Board">State Board</option>
          <option value="Other">Other</option>
        </Select>
        <Input label="Transfer Certificate Number" value={formData.tc_number} onChange={(e) => update({ tc_number: e.target.value })} placeholder="Optional" />
        <Input label="TC Issued Date" type="date" value={formData.tc_date} onChange={(e) => update({ tc_date: e.target.value })} />
        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={formData.transport_selected}
              onChange={(e) => update({ transport_selected: e.target.checked })} className="rounded" />
            <span>Student requires school transport</span>
          </label>
          <p className="mt-1 text-xs text-slate-400">Transport Fee will be included in the fee structure if checked.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Documents ────────────────────────────────────────────────────────

function Step4({ formData, errors, update }: StepProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Document Uploads</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UploadField label="Previous School TC" file={formData.prev_tc_file} onChange={(f) => update({ prev_tc_file: f })} accept=".pdf,image/*" note="(if applicable, optional)" />
        <UploadField label="Student Aadhar Card" required file={formData.student_aadhar} onChange={(f) => update({ student_aadhar: f })} accept=".pdf,image/*" error={errors.student_aadhar} />
        <UploadField label="Parent Aadhar Card" required file={formData.parent_aadhar} onChange={(f) => update({ parent_aadhar: f })} accept=".pdf,image/*" error={errors.parent_aadhar} />
        <UploadField label="Residence Proof" required file={formData.residence_proof} onChange={(f) => update({ residence_proof: f })} accept=".pdf,image/*" error={errors.residence_proof} />
      </div>
    </div>
  );
}

// ─── Step 5: Fees ─────────────────────────────────────────────────────────────

interface Step5FeesProps extends StepProps {
  schoolId: string;
  academicYear: string;
  canCollectPayment: boolean; // only admin/accountant
}

function Step5Fees({ formData, errors, update, schoolId, academicYear, canCollectPayment }: Step5FeesProps) {
  const [onlineEnabled, setOnlineEnabled] = useState<boolean | null>(null);
  useEffect(() => { fetchGatewayStatus().then((g) => setOnlineEnabled(!!g.active)).catch(() => setOnlineEnabled(false)); }, []);
  const fees = formData.fees;
  const [loadingStructures, setLoadingStructures] = useState(false);

  // Auto-load fee structures when this step is first shown or when class changes
  useEffect(() => {
    if (!formData.class_id || fees.fee_structures_loaded) return;
    setLoadingStructures(true);

    fetchFeeStructuresForClass(schoolId, formData.class_id, academicYear)
      .then((structures) => {
        // Build default line items from structures
        const defaultLines: AdmissionFeeLineItem[] = structures.map((s) => ({
          fee_type: s.name,
          amount: s.amount,
          include: s.fee_type !== 'Transport' || formData.transport_selected,
          editable: true,
        }));

        // If no structures, add sensible defaults
        const lines: AdmissionFeeLineItem[] =
          defaultLines.length > 0
            ? defaultLines
            : [
                { fee_type: 'Registration Fee', amount: 500, include: true, editable: true },
                { fee_type: 'Admission Fee', amount: 2000, include: true, editable: true },
                { fee_type: 'Tuition Fee (First Term)', amount: 5000, include: true, editable: true },
                { fee_type: 'Annual Charges', amount: 1500, include: true, editable: true },
                ...(formData.transport_selected
                  ? [{ fee_type: 'Transport Fee', amount: 3000, include: true, editable: true }]
                  : []),
              ];

        update({
          fees: {
            ...fees,
            line_items: lines,
            fee_structures_loaded: true,
            no_structure_warning: structures.length === 0,
          },
        });
      })
      .catch(() => {
        update({ fees: { ...fees, fee_structures_loaded: true, no_structure_warning: true } });
      })
      .finally(() => setLoadingStructures(false));
  }, [formData.class_id, fees.fee_structures_loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFees = (patch: Partial<AdmissionFeesData>) =>
    update({ fees: { ...fees, ...patch } });

  const updateLine = (idx: number, patch: Partial<AdmissionFeeLineItem>) => {
    const next = fees.line_items.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    updateFees({ line_items: next });
  };

  const addLine = () => {
    updateFees({
      line_items: [
        ...fees.line_items,
        { fee_type: '', amount: 0, include: true, editable: true },
      ],
    });
  };

  const removeLine = (idx: number) => {
    updateFees({ line_items: fees.line_items.filter((_, i) => i !== idx) });
  };

  const { totalFees, discountAmount, netPayable, paidNow, balanceDue } = computeFeeSummary(fees);

  const needsRef =
    fees.payment_option !== 'later' &&
    fees.payment_mode !== 'Cash' &&
    fees.payment_mode !== 'Online (Razorpay)';
  const isRazorpay = fees.payment_option !== 'later' && fees.payment_mode === 'Online (Razorpay)';

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Fee Collection</h3>

      {/* No-structure warning */}
      {fees.no_structure_warning && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">No fee structure found for this class.</p>
            <p className="mt-0.5">Default line items have been added. You can edit them below or{' '}
              <a href="/admin/fees" target="_blank" rel="noreferrer" className="underline font-medium">set up a fee structure in the Fees module</a>.
              You may also proceed with "Pay Later".
            </p>
          </div>
        </div>
      )}

      {/* Fee table */}
      {loadingStructures ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-10">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent mr-2" />
          <span className="text-sm text-slate-500">Loading fee structure…</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-8"></th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Fee Head</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 w-36">Amount (₹)</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {fees.line_items.map((line, idx) => (
                <tr key={idx} className={line.include ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={line.include}
                      onChange={(e) => updateLine(idx, { include: e.target.checked })}
                      className="rounded border-slate-300 text-brand-600" />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={line.fee_type}
                      onChange={(e) => updateLine(idx, { fee_type: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
                      placeholder="Fee head name"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={line.amount === 0 ? '' : line.amount}
                        onChange={(e) => updateLine(idx, { amount: parseFloat(e.target.value) || 0 })}
                        disabled={!line.editable}
                        className="w-full rounded-lg border border-slate-200 pl-6 pr-2.5 py-1.5 text-sm text-right focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30 disabled:bg-slate-50"
                      />
                    </div>
                    {errors[`fee_amount_${idx}`] && <p className="text-xs text-red-500 mt-0.5">{errors[`fee_amount_${idx}`]}</p>}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button type="button" onClick={() => removeLine(idx)}
                      className="rounded p-1 text-slate-300 hover:text-red-500 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
            <button type="button" onClick={addLine}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-800 transition-colors">
              <PlusCircle className="h-3.5 w-3.5" /> Add fee line
            </button>
          </div>
        </div>
      )}

      {/* Discount */}
      <div className="rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)] p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Discount / Concession <span className="font-normal text-slate-400">(optional)</span></p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
            <div className="flex gap-3">
              {(['flat', 'percent'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-700">
                  <input type="radio" name="discount_type" value={t}
                    checked={fees.discount.type === t}
                    onChange={() => updateFees({ discount: { ...fees.discount, type: t } })}
                    className="text-brand-600" />
                  {t === 'flat' ? 'Flat (₹)' : 'Percent (%)'}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {fees.discount.type === 'flat' ? 'Amount (₹)' : 'Percent (%)'}
            </label>
            <input type="number" min="0" step="0.01" value={fees.discount.value === 0 ? '' : fees.discount.value}
              onChange={(e) => updateFees({ discount: { ...fees.discount, value: parseFloat(e.target.value) || 0 } })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="0" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Reason</label>
            <select value={fees.discount.reason}
              onChange={(e) => updateFees({ discount: { ...fees.discount, reason: e.target.value as AdmissionDiscount['reason'] } })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 appearance-none">
              <option>Sibling</option>
              <option>Staff Child</option>
              <option>Merit</option>
              <option>Other</option>
            </select>
          </div>
        </div>
        {fees.discount.reason === 'Other' && fees.discount.value > 0 && (
          <input type="text" value={fees.discount.reason_note}
            onChange={(e) => updateFees({ discount: { ...fees.discount, reason_note: e.target.value } })}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="Specify discount reason…" />
        )}
      </div>

      {/* Live summary box */}
      <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 mb-3">Fee Summary</p>
        <div className="flex justify-between text-sm text-slate-700">
          <span>Total Fees</span>
          <span className="font-medium">{formatCurrency(totalFees, '₹')}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-sm text-emerald-700">
            <span>Discount ({fees.discount.reason})</span>
            <span className="font-medium">− {formatCurrency(discountAmount, '₹')}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-semibold border-t border-brand-200 pt-2 text-slate-900">
          <span>Net Payable</span>
          <span>{formatCurrency(netPayable, '₹')}</span>
        </div>
        {fees.payment_option !== 'later' && (
          <>
            <div className="flex justify-between text-sm text-brand-700">
              <span>Paid Now</span>
              <span className="font-medium">{formatCurrency(paidNow, '₹')}</span>
            </div>
            <div className={`flex justify-between text-sm font-semibold ${balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              <span>Balance Due</span>
              <span>{formatCurrency(balanceDue, '₹')}</span>
            </div>
          </>
        )}
      </div>

      {/* Payment */}
      <div className="rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)] p-4 space-y-4">
        <p className="text-sm font-semibold text-slate-700">Payment</p>

        {!canCollectPayment && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-800">Only Admin can collect payments. This admission will be saved as <b>Pay Later</b>.</p>
          </div>
        )}

        {/* Payment option */}
        <div className="flex flex-wrap gap-3">
          {(['full', 'partial', 'later'] as AdmissionPaymentOption[]).map((opt) => {
            const disabled = !canCollectPayment && opt !== 'later';
            const labels = { full: 'Pay Now (Full)', partial: 'Pay Partial', later: 'Pay Later' };
            return (
              <label key={opt} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm cursor-pointer transition-all ${
                fees.payment_option === opt
                  ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                  : 'border-slate-200 text-slate-600 hover:border-brand-300'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <input type="radio" name="payment_option" value={opt}
                  checked={fees.payment_option === opt} disabled={disabled}
                  onChange={() => {
                    const next: Partial<AdmissionFeesData> = { payment_option: opt };
                    if (opt === 'full') next.amount_paying = String(netPayable);
                    updateFees(next);
                  }} className="sr-only" />
                {labels[opt]}
              </label>
            );
          })}
        </div>

        {fees.payment_option !== 'later' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Amount Paying Now <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                <input type="number" min="0" max={netPayable} step="0.01"
                  value={fees.amount_paying}
                  readOnly={fees.payment_option === 'full'}
                  onChange={(e) => updateFees({ amount_paying: e.target.value })}
                  className={`w-full rounded-xl border pl-7 pr-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                    errors.amount_paying ? 'border-red-400 bg-red-50' : 'border-slate-300'
                  } ${fees.payment_option === 'full' ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                  placeholder="0.00" />
              </div>
              {errors.amount_paying && <p className="mt-1 text-xs text-red-600">{errors.amount_paying}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Mode <span className="text-red-500">*</span></label>
              <select value={fees.payment_mode}
                onChange={(e) => updateFees({ payment_mode: e.target.value as AdmissionPaymentMode })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 appearance-none">
                <option>Cash</option>
                <option value="Online (Razorpay)" disabled={onlineEnabled === false}>Online (Razorpay){onlineEnabled === false ? ' — not set up' : ''}</option>
                <option>UPI</option>
                <option>Card</option>
                <option>Cheque</option>
                <option>Online/Bank Transfer</option>
              </select>
            </div>
            {isRazorpay && (
              <div className="sm:col-span-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
                After you confirm the admission, the Razorpay window opens for the parent to pay by UPI / card.
                They pay {formatCurrency(onlineCharges(parseFloat(fees.amount_paying) || 0).total, '₹')} (fee + 2% convenience fee + 18% GST on it);
                {' '}{formatCurrency(parseFloat(fees.amount_paying) || 0, '₹')} is credited to the fees.
              </div>
            )}
            {needsRef && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Transaction / Reference No. <span className="text-red-500">*</span>
                </label>
                <input type="text" value={fees.transaction_ref}
                  onChange={(e) => updateFees({ transaction_ref: e.target.value })}
                  className={`w-full rounded-xl border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                    errors.transaction_ref ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
                  placeholder="Enter transaction or reference number" />
                {errors.transaction_ref && <p className="mt-1 text-xs text-red-600">{errors.transaction_ref}</p>}
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Date</label>
              <input type="date" value={fees.payment_date}
                onChange={(e) => updateFees({ payment_date: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Remarks <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="text" value={fees.remarks}
                onChange={(e) => updateFees({ remarks: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="Optional note about this payment" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 6: Review ───────────────────────────────────────────────────────────

interface Step6Props {
  formData: FormData;
  credentials: { username: string; password: string } | null;
  onEditStep: (step: number) => void;
}

function Step6({ formData, credentials, onEditStep }: Step6Props) {
  const { totalFees, discountAmount, netPayable, paidNow, balanceDue } = computeFeeSummary(formData.fees);

  const combinedAddress = [
    formData.address_line1, formData.address_line2 || null, formData.city,
    `${formData.state} - ${formData.pin_code}`, formData.country,
  ].filter(Boolean).join(', ');

  const docs = [
    { label: 'Previous School TC', file: formData.prev_tc_file },
    { label: 'Student Aadhar Card', file: formData.student_aadhar },
    { label: 'Parent Aadhar Card', file: formData.parent_aadhar },
    { label: 'Residence Proof', file: formData.residence_proof },
  ];

  const PAYMENT_LABELS: Record<string, string> = { full: 'Pay Now (Full)', partial: 'Pay Partial', later: 'Pay Later' };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Review & Confirm</h3>

      <ReviewCard title="Personal Details" onEdit={() => onEditStep(1)}>
        <ReviewRow label="Name" value={formData.full_name} />
        <ReviewRow label="Father's Name" value={formData.father_name} />
        <ReviewRow label="Mother's Name" value={formData.mother_name} />
        <ReviewRow label="Email" value={formData.parent_email} />
        <ReviewRow label="Phone" value={formData.phone} />
        {formData.whatsapp && formData.whatsapp !== formData.phone && <ReviewRow label="WhatsApp" value={formData.whatsapp} />}
        <ReviewRow label="Date of Birth" value={formData.date_of_birth} />
        <ReviewRow label="Gender" value={formData.gender} capitalize />
      </ReviewCard>

      <ReviewCard title="Address" onEdit={() => onEditStep(2)}>
        <ReviewRow label="Address" value={combinedAddress} />
      </ReviewCard>

      <ReviewCard title="Class & School" onEdit={() => onEditStep(3)}>
        <ReviewRow label="Class" value={formData.class_name} />
        <ReviewRow label="Section" value={formData.section_name} />
        <ReviewRow label="Admission No." value={formData.admission_number} />
        {formData.prev_school_name && <ReviewRow label="Previous School" value={`${formData.prev_school_name}${formData.prev_school_board ? ` (${formData.prev_school_board})` : ''}`} />}
        <ReviewRow label="Transport" value={formData.transport_selected ? 'Yes' : 'No'} />
      </ReviewCard>

      <ReviewCard title="Documents" onEdit={() => onEditStep(4)}>
        <div className="grid grid-cols-2 gap-2">
          {docs.map(({ label, file }) => (
            <div key={label} className="flex items-center gap-2">
              {file ? <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-500" /> : <span className="text-slate-400">—</span>}
              <span className={`text-sm ${file ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
            </div>
          ))}
        </div>
      </ReviewCard>

      {/* Fees & Payment summary */}
      <ReviewCard title="Fees & Payment" onEdit={() => onEditStep(5)}>
        {formData.fees.line_items.filter((l) => l.include).length === 0 ? (
          <p className="text-sm text-slate-400">No fee items selected — student will be enrolled with Pay Later.</p>
        ) : (
          <>
            <div className="mb-2 space-y-1">
              {formData.fees.line_items.filter((l) => l.include).map((l, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-600">{l.fee_type}</span>
                  <span className="font-medium text-slate-900">{formatCurrency(l.amount, '₹')}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 pt-2 space-y-1">
              <ReviewRow label="Total Fees" value={formatCurrency(totalFees, '₹')} />
              {discountAmount > 0 && <ReviewRow label={`Discount (${formData.fees.discount.reason})`} value={`− ${formatCurrency(discountAmount, '₹')}`} highlight="green" />}
              <ReviewRow label="Net Payable" value={formatCurrency(netPayable, '₹')} />
              <ReviewRow label="Payment Option" value={PAYMENT_LABELS[formData.fees.payment_option]} />
              {formData.fees.payment_option !== 'later' && (
                <>
                  <ReviewRow label="Paid Now" value={formatCurrency(paidNow, '₹')} />
                  <ReviewRow label="Balance Due" value={formatCurrency(balanceDue, '₹')} highlight={balanceDue > 0 ? 'red' : 'green'} />
                  <ReviewRow label="Payment Mode" value={formData.fees.payment_mode} />
                  {formData.fees.transaction_ref && <ReviewRow label="Ref / Txn No." value={formData.fees.transaction_ref} />}
                </>
              )}
            </div>
          </>
        )}
      </ReviewCard>

      {credentials === null ? (
        <div className="flex items-center justify-center rounded-xl border border-brand-100 bg-brand-50 p-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent mr-2" />
          <span className="text-sm text-brand-600">Loading credentials…</span>
        </div>
      ) : (
        <CredentialsBox username={credentials.username} password={credentials.password} />
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
  // Only admin can collect payments
  const canCollectPayment = profile?.role === 'admin';

  const [classes, setClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Result from submission
  const [resultAdmissionNumber, setResultAdmissionNumber] = useState('');
  const [resultReceiptNumber, setResultReceiptNumber] = useState('');
  const [resultReceiptId, setResultReceiptId] = useState<string | null>(null);
  const [resultStudentName, setResultStudentName] = useState('');
  const [resultParentCredentials, setResultParentCredentials] = useState<{ username: string; password: string } | null>(null);
  // Online (Razorpay) at admission: null = not used, true = paid, false = not completed
  const [onlinePaid, setOnlinePaid] = useState<boolean | null>(null);

  // Idempotency key — generated once per wizard session, persists across refresh
  const idempotencyKeyRef = useRef<string>('');

  // ── Persist wizard to sessionStorage (excluding File objects) ──
  const [formData, setFormData] = useState<FormData>(() => {
    try {
      const raw = sessionStorage.getItem(WIZARD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Omit<FormData, 'prev_tc_file' | 'student_aadhar' | 'parent_aadhar' | 'residence_proof'>;
        return {
          ...INITIAL_FORM,
          ...parsed,
          prev_tc_file: null, student_aadhar: null,
          parent_aadhar: null, residence_proof: null,
        };
      }
    } catch { /* ignore */ }
    return INITIAL_FORM;
  });

  // Persist on every change (skip File fields)
  useEffect(() => {
    try {
      const { prev_tc_file, student_aadhar, parent_aadhar, residence_proof, ...rest } = formData; // eslint-disable-line @typescript-eslint/no-unused-vars
      sessionStorage.setItem(WIZARD_KEY, JSON.stringify(rest));
    } catch { /* ignore quota errors */ }
  }, [formData]);

  // Fetch classes on mount
  useEffect(() => {
    if (!schoolId) return;
    setClassesLoading(true);
    fetchClasses(schoolId)
      .then(setClasses)
      .catch(() => toast('Failed to load classes', 'error'))
      .finally(() => setClassesLoading(false));
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch school for credential generation + academic year
  useEffect(() => {
    if (!schoolId) return;
    fetchSchool(schoolId).then(setSchool).catch(console.error);
  }, [schoolId]);

  const update = useCallback((patch: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  }, []);

  const academicYear = school?.academic_year ?? '2026-27';

  // ── Reset fee structures when class changes after fees step was loaded ──
  const prevClassRef = useRef(formData.class_id);
  useEffect(() => {
    if (prevClassRef.current && prevClassRef.current !== formData.class_id && formData.fees.fee_structures_loaded) {
      toast('Class changed — fee structure has been reset.', 'error');
      update({ fees: { ...formData.fees, fee_structures_loaded: false, line_items: [] } });
    }
    prevClassRef.current = formData.class_id;
  }, [formData.class_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation ──────────────────────────────────────────────────────────────

  function validateStep(step: number): Record<string, string> {
    const e: Record<string, string> = {};

    if (step === 1) {
      if (!formData.full_name.trim()) e.full_name = 'Student name is required';
      if (!formData.father_name.trim()) e.father_name = "Father's name is required";
      if (!formData.mother_name.trim()) e.mother_name = "Mother's name is required";
      if (!formData.parent_email.trim()) {
        e.parent_email = 'Parent email is required';
      } else if (!formData.parent_email.includes('@') || !formData.parent_email.split('@')[1]?.includes('.')) {
        e.parent_email = 'Enter a valid email address';
      }
      if (!formData.phone.trim()) {
        e.phone = 'Phone number is required';
      } else if (!/^\d{10}$/.test(formData.phone)) {
        e.phone = 'Enter a valid 10-digit mobile number';
      }
      if (!formData.date_of_birth) e.date_of_birth = 'Date of birth is required';
      if (!formData.gender) e.gender = 'Gender is required';
    }

    if (step === 2) {
      if (!formData.address_line1.trim()) e.address_line1 = 'Address is required';
      if (!formData.city.trim()) e.city = 'City is required';
      if (!formData.state.trim()) e.state = 'State is required';
      if (!formData.pin_code.trim()) {
        e.pin_code = 'PIN code is required';
      } else if (!/^\d{6}$/.test(formData.pin_code)) {
        e.pin_code = 'PIN code must be exactly 6 digits';
      }
    }

    if (step === 3) {
      if (!formData.class_id) e.class_id = 'Class is required';
      if (!formData.section_id) e.section_id = 'Section is required';
      if (!formData.admission_number.trim()) e.admission_number = 'Admission number is required';
    }

    if (step === 4) {
      if (!formData.student_aadhar) e.student_aadhar = 'Student Aadhar card is required';
      if (!formData.parent_aadhar) e.parent_aadhar = 'Parent Aadhar card is required';
      if (!formData.residence_proof) e.residence_proof = 'Residence proof is required';
    }

    if (step === 5) {
      const fees = formData.fees;
      const includedLines = fees.line_items.filter((l) => l.include);

      // Validate line items
      includedLines.forEach((l, i) => {
        if (!l.fee_type.trim()) e[`fee_type_${i}`] = 'Fee head name is required';
        if (l.amount < 0) e[`fee_amount_${i}`] = 'Amount cannot be negative';
      });

      const { netPayable } = computeFeeSummary(fees);

      if (fees.payment_option !== 'later') {
        const amt = parseFloat(fees.amount_paying) || 0;
        if (amt <= 0) {
          e.amount_paying = 'Enter amount to pay';
        } else if (amt > netPayable) {
          e.amount_paying = `Cannot exceed net payable (₹${netPayable.toFixed(2)})`;
        }
        if (!fees.payment_mode) e.payment_mode = 'Payment mode is required';
        if (fees.payment_mode !== 'Cash' && fees.payment_mode !== 'Online (Razorpay)' && !fees.transaction_ref.trim()) {
          e.transaction_ref = 'Transaction / Reference No. is required for non-cash payments';
        }
      }
    }

    return e;
  }

  function handleNext() {
    const e = validateStep(currentStep);
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setErrors({});
    setCurrentStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleBack() {
    setErrors({});
    setCurrentStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleEditStep(step: number) {
    setErrors({});
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    // Double-submit guard
    if (saving) return;

    // Generate idempotency key once
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = makeIdempotencyKey(formData.admission_number, schoolId);
    }

    setSaving(true);
    try {
      const address = [
        formData.address_line1,
        formData.address_line2 || null,
        formData.city,
        `${formData.state} - ${formData.pin_code}`,
        formData.country,
      ].filter(Boolean).join(', ');

      const paidAmount =
        formData.fees.payment_option === 'later'
          ? 0
          : parseFloat(formData.fees.amount_paying) || 0;
      // Online payments are recorded only after Razorpay confirms them, so the
      // admission is saved with the amount still due.
      const payOnline = formData.fees.payment_option !== 'later' && formData.fees.payment_mode === 'Online (Razorpay)' && paidAmount > 0;

      const result = await createAdmissionWithFees({
        school_id: schoolId,
        admission_number: formData.admission_number,
        full_name: formData.full_name,
        father_name: formData.father_name,
        mother_name: formData.mother_name || null,
        parent_email: formData.parent_email || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender,
        class_id: formData.class_id,
        section_id: formData.section_id,
        address,
        admission_date: new Date().toISOString().split('T')[0],
        academic_year: academicYear,
        fee_lines: formData.fees.line_items,
        discount: formData.fees.discount,
        payment_option: payOnline ? 'later' : formData.fees.payment_option,
        amount_paying: payOnline ? 0 : paidAmount,
        payment_mode: formData.fees.payment_mode,
        transaction_ref: formData.fees.transaction_ref,
        payment_date: formData.fees.payment_date || new Date().toISOString().split('T')[0],
        remarks: formData.fees.remarks,
        collected_by: profile?.id ?? '',
        collected_by_name: profile?.full_name ?? '',
        idempotency_key: idempotencyKeyRef.current,
      });

      if (payOnline) {
        setOnlinePaid(false);
        try {
          // Split the amount across the new fee rows in proportion, like cash.
          const created = (await fetchFees({ studentId: result.student.id })).filter((f) => Number(f.amount) > Number(f.paid_amount));
          const total = created.reduce((s, f) => s + Number(f.amount) - Number(f.paid_amount), 0);
          let left = Math.round(paidAmount * 100);
          const allocations = created.map((f, i) => {
            const due = Math.round((Number(f.amount) - Number(f.paid_amount)) * 100);
            const share = i === created.length - 1 ? left : Math.min(left, Math.round((due / Math.round(total * 100)) * paidAmount * 100));
            left -= share;
            return { fee_id: f.id, amount: Math.min(share, due) / 100 };
          }).filter((a) => a.amount > 0);
          const payment = await createOnlinePayment({ channel: 'checkout', allocations, admission_receipt_id: result.receiptId });
          try {
            await payWithCheckout(payment, { name: school?.name || 'Admission fees', prefill: { name: formData.father_name, email: formData.parent_email || undefined } });
            setOnlinePaid(true);
            toast('Payment received', 'success');
          } catch (payErr) {
            const c = await checkOnlinePayment(payment.online_payment_id).catch(() => null);
            if (c?.status === 'paid') { setOnlinePaid(true); }
            else toast(payErr instanceof Error && payErr.message === 'cancelled'
              ? 'Admission saved. Online payment was not completed — the amount is pending in Fees.'
              : `Admission saved, but payment failed: ${payErr instanceof Error ? payErr.message : ''}`, 'error');
          }
        } catch (startErr) {
          toast(`Admission saved, but online payment couldn't start: ${startErr instanceof Error ? startErr.message : ''}`, 'error');
        }
      }

      // Store results for success screen
      setResultAdmissionNumber(formData.admission_number);
      setResultReceiptNumber(result.receiptNumber);
      setResultReceiptId(result.receiptId);
      setResultStudentName(formData.full_name);
      setResultParentCredentials(result.parentCredentials);

      // Clear wizard session storage
      try { sessionStorage.removeItem(WIZARD_KEY); } catch { /* ignore */ }

      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to complete admission';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Credentials for review step ─────────────────────────────────────────────
  const parentCreds = school !== null
    ? generateParentCredentials(formData.full_name, formData.admission_number, school.name, formData.date_of_birth)
    : null;
  const credentials = parentCreds ? { username: parentCreds.username, password: parentCreds.password } : null;

  const summaryNow = computeFeeSummary(formData.fees);
  // If the online payment didn't go through, nothing was collected.
  const resultPaidNow = onlinePaid === false ? 0 : summaryNow.paidNow;
  const resultBalanceDue = onlinePaid === false ? summaryNow.balanceDue + summaryNow.paidNow : summaryNow.balanceDue;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout title="New Admission">
      <div className="max-w-4xl mx-auto">
        {/* Page header */}
        <div className="flex items-center mb-6">
          <button onClick={() => navigate('/admin/students')}
            className="mr-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-slate-900">New Student Admission</h1>
        </div>

        {classesLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
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
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
            {submitted ? (
              // ── Success Screen ──────────────────────────────────────────────
              <div className="flex flex-col items-center px-6 py-12 text-center sm:px-10">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle className="h-10 w-10 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Admission Successful!</h2>
                <p className="mt-1 text-sm text-slate-500">Student has been enrolled and fee records created.</p>

                {/* Admission + Receipt info */}
                <div className="mt-6 w-full rounded-xl bg-slate-50 p-4 text-left space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Student Name</span>
                    <span className="text-sm font-semibold text-slate-900">{resultStudentName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Admission Number</span>
                    <span className="text-sm font-semibold text-slate-900">{resultAdmissionNumber}</span>
                  </div>
                  {resultReceiptNumber && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Receipt Number</span>
                      <span className="text-sm font-semibold text-brand-700">{resultReceiptNumber}</span>
                    </div>
                  )}
                  {formData.fees.payment_option !== 'later' && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Paid Now</span>
                        <span className="text-sm font-semibold text-emerald-700">{formatCurrency(resultPaidNow, '₹')}</span>
                      </div>
                      {resultBalanceDue > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Balance Due</span>
                          <span className="text-sm font-semibold text-red-600">{formatCurrency(resultBalanceDue, '₹')}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Parent credentials */}
                {resultParentCredentials && (
                  <div className="mt-4 w-full">
                    <CredentialsBox username={resultParentCredentials.username} password={resultParentCredentials.password} />
                  </div>
                )}

                {/* Action buttons */}
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {/* Print receipt */}
                  {formData.fees.payment_option !== 'later' && resultReceiptNumber && (
                    <button
                      onClick={() => printReceipt({
                        receiptNumber: resultReceiptNumber,
                        admissionNumber: resultAdmissionNumber,
                        studentName: resultStudentName,
                        fatherName: formData.father_name,
                        className: formData.class_name,
                        schoolName: school?.name ?? 'School',
                        schoolAddress: school?.address ?? '',
                        fees: formData.fees,
                        collectedByName: profile?.full_name ?? '',
                        paymentDate: formData.fees.payment_date,
                      })}
                      className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                      <Printer className="h-4 w-4" /> Print Receipt
                    </button>
                  )}

                  {/* WhatsApp */}
                  {formData.whatsapp && resultReceiptNumber && formData.fees.payment_option !== 'later' && (
                    <button
                      onClick={() => sendWhatsAppReceipt({
                        whatsapp: formData.whatsapp,
                        studentName: resultStudentName,
                        admissionNumber: resultAdmissionNumber,
                        receiptNumber: resultReceiptNumber,
                        schoolName: school?.name ?? 'School',
                        paidNow: resultPaidNow,
                        balanceDue: resultBalanceDue,
                        paymentMode: formData.fees.payment_mode,
                      })}
                      className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                      <MessageCircle className="h-4 w-4" /> Send on WhatsApp
                    </button>
                  )}

                  {/* Add Another */}
                  <button
                    onClick={() => {
                      idempotencyKeyRef.current = '';
                      setFormData(INITIAL_FORM);
                      setCurrentStep(1);
                      setSubmitted(false);
                      setErrors({});
                    }}
                    className="flex items-center gap-2 rounded-xl border border-brand-300 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors">
                    <PlusCircle className="h-4 w-4" /> Add Another Admission
                  </button>

                  <button onClick={() => navigate('/admin/students')}
                    className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
                    Go to Students
                  </button>
                </div>

                {resultBalanceDue > 0 && (
                  <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <b>Note:</b> Balance of {formatCurrency(resultBalanceDue, '₹')} has been recorded as pending dues in the Fees module.
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* ── Stepper ─────────────────────────────────────────────── */}
                <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
                  <div className="flex items-center overflow-x-auto">
                    {STEP_LABELS.map((label, idx) => {
                      const step = idx + 1;
                      const isCompleted = step < currentStep;
                      const isActive = step === currentStep;
                      return (
                        <React.Fragment key={step}>
                          <div className="flex flex-col items-center flex-shrink-0">
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
                            <div className={`mb-4 mx-1 h-0.5 flex-1 min-w-[8px] ${step < currentStep ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* ── Step Content ───────────────────────────────────────── */}
                <div className="px-4 py-6 sm:px-6">
                  {currentStep === 1 && <Step1 formData={formData} errors={errors} update={update} />}
                  {currentStep === 2 && <Step2 formData={formData} errors={errors} update={update} />}
                  {currentStep === 3 && <Step3 formData={formData} errors={errors} update={update} classes={classes} />}
                  {currentStep === 4 && <Step4 formData={formData} errors={errors} update={update} />}
                  {currentStep === 5 && (
                    <Step5Fees
                      formData={formData} errors={errors} update={update}
                      schoolId={schoolId} academicYear={academicYear}
                      canCollectPayment={canCollectPayment}
                    />
                  )}
                  {currentStep === 6 && (
                    <Step6 formData={formData} credentials={credentials} onEditStep={handleEditStep} />
                  )}
                </div>

                {/* ── Footer ─────────────────────────────────────────────── */}
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4 sm:px-6">
                  <div>
                    {currentStep > 1 && (
                      <Button variant="outline" onClick={handleBack}>← Back</Button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Step 5 shortcut — pay later skip */}
                    {currentStep === 5 && formData.fees.no_structure_warning && formData.fees.payment_option !== 'later' && (
                      <button type="button"
                        onClick={() => { update({ fees: { ...formData.fees, payment_option: 'later' } }); setErrors({}); setCurrentStep(6); }}
                        className="text-xs text-slate-500 hover:text-slate-700 underline">
                        Skip — Pay Later
                      </button>
                    )}
                    {currentStep < 6 ? (
                      <Button onClick={handleNext}>
                        {currentStep === 5 ? 'Review →' : 'Next →'}
                      </Button>
                    ) : (
                      <Button loading={saving} onClick={handleSubmit} disabled={saving}>
                        <IndianRupee className="h-4 w-4 mr-1" />
                        Complete Admission
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
