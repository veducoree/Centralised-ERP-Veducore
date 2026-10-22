import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, X, ImageIcon, CreditCard, ShieldCheck,
  Building2, School as SchoolIcon, Bell, CalendarClock,
  Award, CheckCircle2, Contact2, ExternalLink
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchSchool, updateSchool } from '@/services/api';
import type { School } from '@/types';

interface InstitutionalSettings {
  workingDays: string;
  attendanceCutoff: string;
  passingPercentage: number;
  feeDueDay: number;
  lateGraceDays: number;
  absenteeAlerts: boolean;
  feeReminders: boolean;
  autoReceipts: boolean;
  remarksAlerts: boolean;
}

const DEFAULT_SETTINGS: InstitutionalSettings = {
  workingDays: '6',
  attendanceCutoff: '09:30 AM',
  passingPercentage: 33,
  feeDueDay: 10,
  lateGraceDays: 5,
  absenteeAlerts: true,
  feeReminders: true,
  autoReceipts: true,
  remarksAlerts: true,
};

export default function AdminSettings() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  // Editable actual institutional settings
  const [motto, setMotto] = useState('');
  const [affiliationBoard, setAffiliationBoard] = useState('CBSE');
  const [affiliationCode, setAffiliationCode] = useState('');
  const [settings, setSettings] = useState<InstitutionalSettings>(DEFAULT_SETTINGS);

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const data = await fetchSchool(profile.school_id);
      if (data) {
        setSchool(data);
        setMotto(data.motto || '');
        setAffiliationBoard(data.affiliation_board || 'CBSE');
        setAffiliationCode(data.affiliation_code || '');
        if (data.settings && typeof data.settings === 'object') {
          setSettings(prev => ({ ...prev, ...data.settings }));
        }
        setLogoPreview(data.logo_url || null);
        setLogoBase64(null);
      }
    } catch {
      toast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast('Image size must be under 2MB', 'error');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast('Please select an image file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLogoPreview(result);
      setLogoBase64(result);
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogoPreview(null);
    setLogoBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSave() {
    if (!profile?.school_id) return;
    setSaving(true);
    try {
      const updates: Partial<School> = {
        motto,
        affiliation_board: affiliationBoard,
        affiliation_code: affiliationCode,
        settings,
      };

      if (logoBase64 !== null) {
        updates.logo_url = logoBase64;
      } else if (logoPreview === null && school?.logo_url) {
        updates.logo_url = null;
      }

      await updateSchool(profile.school_id, updates);
      toast('Institutional settings saved successfully', 'success');
      loadData();
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardLayout title="Settings">
      <div className="space-y-6">
        <PageHeader
          title="School Settings & Institutional Policies"
          description="Configure your academic rules, visual branding, operational schedules, and notification preferences."
        />

        {loading ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-6">
            {/* ── SECTION 1: OFFICIAL INSTITUTIONAL PROFILE (READ-ONLY) ── */}
            <Card className="p-6 border border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      Official Institutional Registration Record
                    </h3>
                    <p className="text-xs text-gray-500">
                      Core school identity parameters are managed centrally to protect institutional integrity.
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Verified by Veducore Superadmin</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                <div className="rounded-xl border border-gray-100 bg-gray-50/75 p-3.5">
                  <span className="block font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    School Name
                  </span>
                  <span className="mt-1 block font-bold text-gray-900 text-sm">
                    {school?.name || 'N/A'}
                  </span>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50/75 p-3.5">
                  <span className="block font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    Registered Official Email
                  </span>
                  <span className="mt-1 block font-mono font-medium text-gray-800 truncate">
                    {school?.email || 'N/A'}
                  </span>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50/75 p-3.5">
                  <span className="block font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    Official Contact Number
                  </span>
                  <span className="mt-1 block font-bold text-gray-900">
                    {school?.contact_number || 'N/A'}
                  </span>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50/75 p-3.5">
                  <span className="block font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    Academic Session
                  </span>
                  <span className="mt-1 block font-bold text-blue-700">
                    {school?.academic_year || '2026-27'}
                  </span>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50/75 p-3.5">
                  <span className="block font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    Currency & Timezone
                  </span>
                  <span className="mt-1 block font-bold text-gray-900">
                    {school?.currency || 'INR'} ({school?.currency_symbol || '₹'}) • {school?.timezone || 'IST (UTC+5:30)'}
                  </span>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50/75 p-3.5">
                  <span className="block font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    Campus Address
                  </span>
                  <span className="mt-1 block font-medium text-gray-800 truncate">
                    {school?.address || 'Main Campus'}
                  </span>
                </div>
              </div>
            </Card>

            {/* ── SECTION 2: SCHOOL BRANDING & CREST ── */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <SchoolIcon className="h-5 w-5 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Institutional Branding & Crest</h3>
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-6 p-4 rounded-xl border border-gray-100 bg-gray-50/50 mb-5">
                <div className="relative flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white shadow-sm overflow-hidden">
                  {logoPreview ? (
                    <>
                      <img
                        src={logoPreview}
                        alt="School logo"
                        className="h-full w-full object-contain p-2"
                      />
                      <button
                        type="button"
                        onClick={removeLogo}
                        className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white hover:bg-red-600 transition-colors shadow"
                        title="Remove Logo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <ImageIcon className="h-8 w-8 text-gray-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">School Crest / Logo</p>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                    Appears on student ID cards, printable fee receipts, report cards, and top navigation header. Recommended transparent PNG or SVG format (max 2MB).
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Upload className="h-3.5 w-3.5" />}
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-white"
                  >
                    {logoPreview ? 'Change School Crest' : 'Upload School Crest'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Affiliation Board
                  </label>
                  <select
                    value={affiliationBoard}
                    onChange={(e) => setAffiliationBoard(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="CBSE">CBSE (Central Board)</option>
                    <option value="ICSE">ICSE / ISC</option>
                    <option value="State Board">State Board</option>
                    <option value="Cambridge">Cambridge Assessment (IGCSE)</option>
                    <option value="IB">International Baccalaureate (IB)</option>
                    <option value="Other">Other Institutional Board</option>
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <Input
                    label="Affiliation / Registration Code"
                    placeholder="e.g. CBSE-2026-DEL-041"
                    value={affiliationCode}
                    onChange={(e) => setAffiliationCode(e.target.value)}
                  />
                </div>

                <div className="sm:col-span-1">
                  <Input
                    label="School Motto / Tagline"
                    placeholder="e.g. Knowledge, Integrity & Excellence"
                    value={motto}
                    onChange={(e) => setMotto(e.target.value)}
                  />
                </div>
              </div>
            </Card>

            {/* ── SECTION 3: ACADEMIC & WORKING SCHEDULE POLICIES ── */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <CalendarClock className="h-5 w-5 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Academic & Working Schedule Policies</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Weekly Working Days
                  </label>
                  <select
                    value={settings.workingDays}
                    onChange={(e) => setSettings({ ...settings, workingDays: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="6">6 Working Days (Monday – Saturday)</option>
                    <option value="5">5 Working Days (Monday – Friday)</option>
                  </select>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Sets active attendance days across teacher portals.
                  </span>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Daily Attendance Cutoff Time
                  </label>
                  <select
                    value={settings.attendanceCutoff}
                    onChange={(e) => setSettings({ ...settings, attendanceCutoff: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="09:00 AM">09:00 AM</option>
                    <option value="09:30 AM">09:30 AM (Standard)</option>
                    <option value="10:00 AM">10:00 AM</option>
                    <option value="10:30 AM">10:30 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                  </select>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Alerts staff if class attendance is unsubmitted.
                  </span>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Minimum Passing Marks Threshold
                  </label>
                  <select
                    value={settings.passingPercentage}
                    onChange={(e) => setSettings({ ...settings, passingPercentage: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value={33}>33% (National Standard)</option>
                    <option value={35}>35%</option>
                    <option value={40}>40%</option>
                    <option value={50}>50%</option>
                  </select>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Used for automatic student report card status calculations.
                  </span>
                </div>
              </div>
            </Card>

            {/* ── SECTION 4: FEE BILLING DEFAULTS & AUTOMATED NOTIFICATIONS ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Fee Rules */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-blue-600" />
                  <h3 className="text-sm font-bold text-gray-900">Fee Billing & Collection Rules</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                      Default Monthly Due Date
                    </label>
                    <select
                      value={settings.feeDueDay}
                      onChange={(e) => setSettings({ ...settings, feeDueDay: Number(e.target.value) })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    >
                      <option value={5}>5th of every month</option>
                      <option value={10}>10th of every month (Recommended)</option>
                      <option value={15}>15th of every month</option>
                      <option value={20}>20th of every month</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                      Late Fee Grace Period (Days)
                    </label>
                    <select
                      value={settings.lateGraceDays}
                      onChange={(e) => setSettings({ ...settings, lateGraceDays: Number(e.target.value) })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    >
                      <option value={0}>0 Days (Immediate Overdue)</option>
                      <option value={3}>3 Days</option>
                      <option value={5}>5 Days (Standard)</option>
                      <option value={7}>7 Days (1 Week)</option>
                      <option value={10}>10 Days</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.autoReceipts}
                      onChange={(e) => setSettings({ ...settings, autoReceipts: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="text-xs font-semibold text-gray-800">Auto-Generate Printable Receipts</p>
                      <p className="text-[11px] text-gray-400">Instantly generate verifiable payment receipts for parents upon fee submission.</p>
                    </div>
                  </label>
                </div>
              </Card>

              {/* Communication Rules */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-blue-600" />
                  <h3 className="text-sm font-bold text-gray-900">Parent Communication Rules</h3>
                </div>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer select-none p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50/75 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.absenteeAlerts}
                      onChange={(e) => setSettings({ ...settings, absenteeAlerts: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-gray-800">Instant Daily Absentee Notification</p>
                      <p className="text-[11px] text-gray-400">Notify parents via in-app alert when attendance is marked absent by the teacher.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer select-none p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50/75 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.feeReminders}
                      onChange={(e) => setSettings({ ...settings, feeReminders: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-gray-800">Fee Due Reminder Notice</p>
                      <p className="text-[11px] text-gray-400">Send reminder alerts to parents 3 days before monthly fee due dates.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer select-none p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50/75 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.remarksAlerts}
                      onChange={(e) => setSettings({ ...settings, remarksAlerts: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-gray-800">Teacher Remarks Alerts</p>
                      <p className="text-[11px] text-gray-400">Instant parent notification when teachers submit academic/behavioral remarks.</p>
                    </div>
                  </label>
                </div>
              </Card>
            </div>

            {/* ── SECTION 5: INTEGRATED ERP SERVICES SHORTCUTS ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5 flex items-center justify-between border border-gray-200 hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">Online Fee Payment Gateway</h4>
                    <p className="text-[11px] text-gray-400">Razorpay API credentials & direct settlement bank account setup.</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/admin/fees')}
                  icon={<ExternalLink className="h-3 w-3" />}
                  className="bg-white flex-shrink-0"
                >
                  Configure
                </Button>
              </Card>

              <Card className="p-5 flex items-center justify-between border border-gray-200 hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <Contact2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">Student ID Cards</h4>
                    <p className="text-[11px] text-gray-400">Submit requests for student ID card generation & printing.</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/admin/id-cards')}
                  icon={<ExternalLink className="h-3 w-3" />}
                  className="bg-white flex-shrink-0"
                >
                  Request ID Cards
                </Button>
              </Card>
            </div>

            {/* ── SAVE ACTION BAR ── */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>All institutional configuration changes apply instantly across your school.</span>
              </div>
              <Button onClick={handleSave} loading={saving} size="md">
                Save Institutional Settings
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
