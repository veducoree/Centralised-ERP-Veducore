import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Upload,
  Copy,
  X,
  Lock,
  FileText,
  ImageIcon,
  ArrowLeft,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input, Select } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { createStudent, fetchClasses, fetchSchool } from '@/services/api';
import type { Class, Section, School } from '@/types';
import { INDIAN_STATES } from '@/lib/utils';
import { generateParentCredentials } from '@/lib/parentUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  // Step 4 — Documents
  prev_tc_file: File | null;
  student_aadhar: File | null;
  parent_aadhar: File | null;
  residence_proof: File | null;
}

const INITIAL_FORM: FormData = {
  full_name: '',
  father_name: '',
  mother_name: '',
  parent_email: '',
  phone: '',
  whatsapp: '',
  same_as_phone: false,
  date_of_birth: '',
  gender: 'male',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  pin_code: '',
  country: 'India',
  class_name: '',
  class_id: '',
  section_name: '',
  section_id: '',
  admission_number: '',
  prev_school_name: '',
  prev_school_board: '',
  tc_number: '',
  tc_date: '',
  prev_tc_file: null,
  student_aadhar: null,
  parent_aadhar: null,
  residence_proof: null,
};

const STEP_LABELS = ['Personal', 'Address', 'Class & School', 'Documents', 'Review'];

// ─── Helpers ─────────────────────────────────────────────────────────────────


function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── UploadField ─────────────────────────────────────────────────────────────

interface UploadFieldProps {
  label: string;
  required?: boolean;
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  error?: string;
  note?: string;
  showPreview?: boolean;
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
    } else {
      setPreviewUrl(null);
    }
  }, [file, showPreview]);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onChange(dropped);
  }

  return (
    <div className="w-full">
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
        {note && <span className="ml-1 font-normal text-gray-400">{note}</span>}
      </label>

      {file ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          {showPreview && previewUrl ? (
            <img
              src={previewUrl}
              alt="preview"
              className="h-20 w-20 rounded-lg object-cover border border-emerald-200 flex-shrink-0"
            />
          ) : (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100">
              <FileText className="h-5 w-5 text-emerald-600" />
            </div>
          )}
          <div className="flex flex-1 flex-col min-w-0">
            <span className="truncate text-sm font-medium text-emerald-700">{file.name}</span>
            <span className="text-xs text-emerald-500">{formatFileSize(file.size)}</span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg p-1 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : error
              ? 'border-red-300 bg-red-50'
              : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
          }`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {showPreview ? (
            <ImageIcon className="mb-2 h-8 w-8 text-gray-300" />
          ) : (
            <Upload className="mb-2 h-8 w-8 text-gray-300" />
          )}
          <span className="text-sm font-medium text-gray-500">Click to upload or drag & drop</span>
          {accept && (
            <span className="mt-1 text-xs text-gray-400">{accept.replace(/\./g, '').replace(/,/g, ', ').toUpperCase()}</span>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          onChange(f);
          e.target.value = '';
        }}
      />

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── CopyButton ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 rounded-md p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-600 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <CheckCircle className="h-4 w-4 text-emerald-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ReviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="flex-shrink-0 text-gray-500">{label}</span>
      <span className={`text-right font-medium text-gray-900 ${capitalize ? 'capitalize' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

function CredentialsBox({ username, password }: { username: string; password: string }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Lock className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-semibold text-blue-800">Parent Portal Credentials</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-blue-700">Username:</span>
          <div className="flex items-center gap-1">
            <code className="rounded bg-white px-2 py-0.5 font-mono text-blue-800">{username}</code>
            <CopyButton text={username} />
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-blue-700">Password:</span>
          <div className="flex items-center gap-1">
            <code className="rounded bg-white px-2 py-0.5 font-mono text-blue-800">{password}</code>
            <CopyButton text={password} />
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-blue-600">
        Share these credentials with the parent to access the Parent Portal.
        Please advise them to change their password after first login.
      </p>
    </div>
  );
}

// ─── Step sub-components ──────────────────────────────────────────────────────

interface StepProps {
  formData: FormData;
  errors: Record<string, string>;
  update: (patch: Partial<FormData>) => void;
}

function Step1({ formData, errors, update }: StepProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Personal Details</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Student Full Name"
          required
          value={formData.full_name}
          onChange={(e) => update({ full_name: e.target.value })}
          error={errors.full_name}
          placeholder="Enter full name"
        />
        <Input
          label="Father's Name"
          required
          value={formData.father_name}
          onChange={(e) => update({ father_name: e.target.value })}
          error={errors.father_name}
          placeholder="Father's full name"
        />
        <Input
          label="Mother's Name"
          required
          value={formData.mother_name}
          onChange={(e) => update({ mother_name: e.target.value })}
          error={errors.mother_name}
          placeholder="Mother's full name"
        />
        <Input
          label="Parent Email (preferred)"
          type="email"
          required
          value={formData.parent_email}
          onChange={(e) => update({ parent_email: e.target.value })}
          error={errors.parent_email}
          placeholder="parent@example.com"
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
              +91
            </span>
            <input
              type="tel"
              maxLength={10}
              value={formData.phone}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                update({ phone: digits, whatsapp: formData.same_as_phone ? digits : formData.whatsapp });
              }}
              className="flex-1 rounded-r-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="10-digit mobile number"
            />
          </div>
          {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
        </div>
        <div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">WhatsApp Number</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                value={formData.whatsapp}
                disabled={formData.same_as_phone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                  update({ whatsapp: digits });
                }}
                className="flex-1 rounded-r-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
                placeholder="10-digit mobile number"
              />
            </div>
          </div>
          <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={formData.same_as_phone}
              onChange={(e) =>
                update({
                  same_as_phone: e.target.checked,
                  whatsapp: e.target.checked ? formData.phone : formData.whatsapp,
                })
              }
              className="rounded"
            />
            Same as phone number
          </label>
        </div>
        <Input
          label="Date of Birth"
          type="date"
          required
          value={formData.date_of_birth}
          onChange={(e) => update({ date_of_birth: e.target.value })}
          error={errors.date_of_birth}
        />
        <Select
          label="Gender"
          required
          value={formData.gender}
          onChange={(e) => update({ gender: e.target.value })}
          error={errors.gender}
        >
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </Select>
      </div>
    </div>
  );
}

function Step2({ formData, errors, update }: StepProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Address Details</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Address Line 1"
            required
            value={formData.address_line1}
            onChange={(e) => update({ address_line1: e.target.value })}
            error={errors.address_line1}
            placeholder="House/Flat No., Street, Area"
          />
        </div>
        <div className="sm:col-span-2">
          <Input
            label="Address Line 2"
            value={formData.address_line2}
            onChange={(e) => update({ address_line2: e.target.value })}
            placeholder="Landmark, Colony (optional)"
          />
        </div>
        <Input
          label="City"
          required
          value={formData.city}
          onChange={(e) => update({ city: e.target.value })}
          error={errors.city}
        />
        <Select
          label="State"
          required
          value={formData.state}
          onChange={(e) => update({ state: e.target.value })}
          error={errors.state}
        >
          <option value="" disabled>Select State</option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Input
          label="PIN Code"
          required
          value={formData.pin_code}
          onChange={(e) => update({ pin_code: e.target.value })}
          error={errors.pin_code}
          maxLength={6}
          placeholder="6-digit PIN"
        />
        <Input
          label="Country"
          value={formData.country}
          onChange={(e) => update({ country: e.target.value })}
        />
      </div>
    </div>
  );
}

interface Step3Props extends StepProps {
  classes: (Class & { sections: Section[] })[];
}

function Step3({ formData, errors, update, classes }: Step3Props) {
  const selectedClass = classes.find((c) => c.id === formData.class_id);
  const availableSections = selectedClass?.sections ?? [];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Class & Admission Details</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Class"
          required
          value={formData.class_id}
          onChange={(e) => {
            const cls = classes.find((c) => c.id === e.target.value);
            update({ class_id: e.target.value, class_name: cls?.name ?? '', section_id: '', section_name: '' });
          }}
          error={errors.class_id}
        >
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Select
          label="Section"
          required
          value={formData.section_id}
          onChange={(e) => {
            const sec = availableSections.find((s) => s.id === e.target.value);
            update({ section_id: e.target.value, section_name: sec?.name ?? '' });
          }}
          error={errors.section_id}
          disabled={!formData.class_id}
        >
          <option value="">Select section</option>
          {availableSections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

        <Input
          label="Admission Number"
          required
          value={formData.admission_number}
          onChange={(e) => update({ admission_number: e.target.value })}
          error={errors.admission_number}
          placeholder="e.g. 20240051"
        />
        <Input
          label="Previous School Name"
          value={formData.prev_school_name}
          onChange={(e) => update({ prev_school_name: e.target.value })}
          placeholder="Optional"
        />
        <Select
          label="Previous School Board"
          value={formData.prev_school_board}
          onChange={(e) => update({ prev_school_board: e.target.value })}
        >
          <option value="">Select board (optional)</option>
          <option value="CBSE">CBSE</option>
          <option value="ICSE">ICSE</option>
          <option value="State Board">State Board</option>
          <option value="Other">Other</option>
        </Select>
        <Input
          label="Transfer Certificate Number"
          value={formData.tc_number}
          onChange={(e) => update({ tc_number: e.target.value })}
          placeholder="Optional"
        />
        <Input
          label="TC Issued Date"
          type="date"
          value={formData.tc_date}
          onChange={(e) => update({ tc_date: e.target.value })}
        />
      </div>
    </div>
  );
}

function Step4({ formData, errors, update }: StepProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Document Uploads</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UploadField
          label="Previous School TC"
          file={formData.prev_tc_file}
          onChange={(f) => update({ prev_tc_file: f })}
          accept=".pdf,image/*"
          note="(if applicable, optional)"
        />
        <UploadField
          label="Student Aadhar Card"
          required
          file={formData.student_aadhar}
          onChange={(f) => update({ student_aadhar: f })}
          accept=".pdf,image/*"
          error={errors.student_aadhar}
        />
        <UploadField
          label="Parent Aadhar Card"
          required
          file={formData.parent_aadhar}
          onChange={(f) => update({ parent_aadhar: f })}
          accept=".pdf,image/*"
          error={errors.parent_aadhar}
        />
        <UploadField
          label="Residence Proof"
          required
          file={formData.residence_proof}
          onChange={(f) => update({ residence_proof: f })}
          accept=".pdf,image/*"
          error={errors.residence_proof}
        />
      </div>
    </div>
  );
}

interface Step5Props {
  formData: FormData;
  credentials: { username: string; password: string } | null;
}

function Step5({ formData, credentials }: Step5Props) {
  const combinedAddress = [
    formData.address_line1,
    formData.address_line2 || null,
    formData.city,
    `${formData.state} - ${formData.pin_code}`,
    formData.country,
  ]
    .filter(Boolean)
    .join(', ');

  const docs: { label: string; file: File | null }[] = [
    { label: 'Previous School TC', file: formData.prev_tc_file },
    { label: 'Student Aadhar Card', file: formData.student_aadhar },
    { label: 'Parent Aadhar Card', file: formData.parent_aadhar },
    { label: 'Residence Proof', file: formData.residence_proof },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Review & Credentials</h3>

      <ReviewCard title="Personal Details">
        <ReviewRow label="Name" value={formData.full_name} />
        <ReviewRow label="Father's Name" value={formData.father_name} />
        <ReviewRow label="Mother's Name" value={formData.mother_name} />
        <ReviewRow label="Email" value={formData.parent_email} />
        <ReviewRow label="Phone" value={formData.phone} />
        {formData.whatsapp && formData.whatsapp !== formData.phone && (
          <ReviewRow label="WhatsApp" value={formData.whatsapp} />
        )}
        <ReviewRow label="Date of Birth" value={formData.date_of_birth} />
        <ReviewRow label="Gender" value={formData.gender} capitalize />
      </ReviewCard>

      <ReviewCard title="Address">
        <ReviewRow label="Address" value={combinedAddress} />
      </ReviewCard>

      <ReviewCard title="Class & School">
        <ReviewRow label="Class" value={formData.class_name} />
        <ReviewRow label="Section" value={formData.section_name} />
        <ReviewRow label="Admission No." value={formData.admission_number} />
        {formData.prev_school_name && (
          <ReviewRow
            label="Previous School"
            value={`${formData.prev_school_name}${formData.prev_school_board ? ` (${formData.prev_school_board})` : ''}`}
          />
        )}
      </ReviewCard>

      <ReviewCard title="Documents">
        <div className="grid grid-cols-2 gap-2">
          {docs.map(({ label, file }) => (
            <div key={label} className="flex items-center gap-2">
              {file ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-500" />
              ) : (
                <span className="text-gray-400">—</span>
              )}
              <span className={`text-sm ${file ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
            </div>
          ))}
        </div>
      </ReviewCard>

      {credentials === null ? (
        <div className="flex items-center justify-center rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent mr-2" />
          <span className="text-sm text-blue-600">Loading credentials…</span>
        </div>
      ) : (
        <CredentialsBox username={credentials.username} password={credentials.password} />
      )}
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function NewAdmissionPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();

  const schoolId = profile?.school_id ?? '';

  const [classes, setClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);

  // Fetch classes on mount
  useEffect(() => {
    if (!schoolId) return;
    setClassesLoading(true);
    fetchClasses(schoolId)
      .then((data) => setClasses(data))
      .catch(() => toast('Failed to load classes', 'error'))
      .finally(() => setClassesLoading(false));
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch school for credential generation
  useEffect(() => {
    if (!schoolId) return;
    fetchSchool(schoolId).then(setSchool).catch(console.error);
  }, [schoolId]);

  // Auto-navigate on success after 3 seconds
  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => navigate('/admin/students'), 3000);
    return () => clearTimeout(timer);
  }, [submitted, navigate]);

  function update(patch: Partial<FormData>) {
    setFormData((prev) => ({ ...prev, ...patch }));
  }

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

    return e;
  }

  function handleNext() {
    const e = validateStep(currentStep);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setErrors({});
    setCurrentStep((s) => s + 1);
  }

  function handleBack() {
    setErrors({});
    setCurrentStep((s) => s - 1);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSaving(true);
    try {
      const address = [
        formData.address_line1,
        formData.address_line2 ? formData.address_line2 : null,
        formData.city,
        `${formData.state} - ${formData.pin_code}`,
        formData.country,
      ]
        .filter(Boolean)
        .join(', ');

      await createStudent({
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
        status: 'active',
        avatar_url: null,
      });

      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add student';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  const parentCreds = school !== null
    ? generateParentCredentials(formData.full_name, formData.admission_number, school.name, formData.date_of_birth)
    : null;
  const credentials = parentCreds
    ? {
        username: parentCreds.username,
        password: parentCreds.password,
      }
    : null;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout title="New Admission">
      <div className="max-w-4xl mx-auto">
        {/* Page header */}
        <div className="flex items-center mb-6">
          <button
            onClick={() => navigate('/admin/students')}
            className="mr-3 rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">New Student Admission</h1>
        </div>

        {classesLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
            {submitted ? (
              // ─── Success Screen ─────────────────────────────────────────────
              <div className="flex flex-col items-center px-8 py-16 text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle className="h-10 w-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Admission Successful!</h2>
                <p className="mt-2 text-gray-500">Student has been successfully enrolled.</p>

                <div className="mt-6 w-full rounded-xl bg-gray-50 p-4 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Student Name</span>
                    <span className="text-sm font-semibold text-gray-900">{formData.full_name}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-gray-500">Admission Number</span>
                    <span className="text-sm font-semibold text-gray-900">{formData.admission_number}</span>
                  </div>
                </div>

                <div className="mt-4 w-full">
                  {credentials !== null && (
                    <CredentialsBox username={credentials.username} password={credentials.password} />
                  )}
                </div>

                <button
                  onClick={() => navigate('/admin/students')}
                  className="mt-6 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  Go to Students
                </button>
              </div>
            ) : (
              <>
                {/* ─── Stepper ─────────────────────────────────────────────── */}
                <div className="border-b border-gray-100 px-6 py-5">
                  <div className="flex items-center">
                    {STEP_LABELS.map((label, idx) => {
                      const step = idx + 1;
                      const isCompleted = step < currentStep;
                      const isActive = step === currentStep;
                      return (
                        <React.Fragment key={step}>
                          <div className="flex flex-col items-center">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                                isCompleted
                                  ? 'bg-emerald-500 text-white'
                                  : isActive
                                  ? 'bg-blue-600 text-white'
                                  : 'border-2 border-gray-200 bg-gray-100 text-gray-400'
                              }`}
                            >
                              {isCompleted ? <CheckCircle className="h-4 w-4" /> : step}
                            </div>
                            <span
                              className={`mt-1 whitespace-nowrap text-xs font-medium ${
                                isCompleted
                                  ? 'text-emerald-600'
                                  : isActive
                                  ? 'text-blue-600'
                                  : 'text-gray-400'
                              }`}
                            >
                              {label}
                            </span>
                          </div>
                          {idx < STEP_LABELS.length - 1 && (
                            <div
                              className={`mb-4 mx-2 h-0.5 flex-1 ${
                                step < currentStep ? 'bg-emerald-400' : 'bg-gray-200'
                              }`}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* ─── Step Content ─────────────────────────────────────────── */}
                <div className="px-6 py-6">
                  {currentStep === 1 && <Step1 formData={formData} errors={errors} update={update} />}
                  {currentStep === 2 && <Step2 formData={formData} errors={errors} update={update} />}
                  {currentStep === 3 && (
                    <Step3 formData={formData} errors={errors} update={update} classes={classes} />
                  )}
                  {currentStep === 4 && <Step4 formData={formData} errors={errors} update={update} />}
                  {currentStep === 5 && (
                    <Step5 formData={formData} credentials={credentials} />
                  )}
                </div>

                {/* ─── Footer ───────────────────────────────────────────────── */}
                <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
                  <div>
                    {currentStep > 1 && (
                      <Button variant="outline" onClick={handleBack}>
                        ← Back
                      </Button>
                    )}
                  </div>
                  <div>
                    {currentStep < 5 ? (
                      <Button onClick={handleNext}>Next →</Button>
                    ) : (
                      <Button loading={saving} onClick={handleSubmit}>
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
