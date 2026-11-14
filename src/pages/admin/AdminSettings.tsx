import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, X, ImageIcon, CreditCard, ShieldCheck,
  Building2, School as SchoolIcon, Bell, CalendarClock,
  Award, CheckCircle2, Contact2, ExternalLink, Clock, Smartphone, AlertTriangle
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchSchool, saveSchoolSettings } from '@/services/api';
import { schoolInitials, schoolBranding } from '@/lib/branding';
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

interface SchoolTimings {
  school_start: string;
  school_end: string;
  saturday_end: string;
  staff_reporting: string;
  late_after_minutes: number;
}

const DEFAULT_TIMINGS: SchoolTimings = {
  school_start: '08:00',
  school_end: '14:00',
  saturday_end: '12:00',
  staff_reporting: '07:45',
  late_after_minutes: 10,
};

const to12 = (t: string) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

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
  const [timings, setTimings] = useState<SchoolTimings>(DEFAULT_TIMINGS);
  const [brandingOn, setBrandingOn] = useState(true);

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
          const st = data.settings as Record<string, unknown>;
          setSettings({
            ...DEFAULT_SETTINGS,
            ...Object.fromEntries(Object.keys(DEFAULT_SETTINGS).filter((k) => k in st).map((k) => [k, st[k]])),
          } as InstitutionalSettings);
          setTimings({ ...DEFAULT_TIMINGS, ...((st.timings as Partial<SchoolTimings>) ?? {}) });
        }
        setBrandingOn(schoolBranding(data).enabled);
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

  const timingError =
    timings.school_end <= timings.school_start ? 'School end time must be after the start time'
    : settings.workingDays === '6' && timings.saturday_end && timings.saturday_end <= timings.school_start ? 'Saturday end time must be after the start time'
    : null;

  async function handleSave() {
    if (!profile?.school_id) return;
    if (timingError) { toast(timingError, 'error'); return; }
    setSaving(true);
    try {
      const fields: Partial<School> = { motto, affiliation_board: affiliationBoard, affiliation_code: affiliationCode };
      if (logoBase64 !== null) fields.logo_url = logoBase64;
      else if (logoPreview === null && school?.logo_url) fields.logo_url = null;

      // Only this page's keys are sent; the server merges them into settings.
      await saveSchoolSettings(profile.school_id, {
        ...settings,
        timings,
        app_branding: { enabled: brandingOn },
      }, fields);
      toast('Settings saved', 'success');
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  const initials = schoolInitials(school?.name);

  return (
    <DashboardLayout title="Settings">
      <div className="space-y-6">
        <PageHeader
          title="School Settings & Institutional Policies"
          description="Configure your academic rules, visual branding, operational schedules, and notification preferences."
        />

        {loading ? (
          <LoadingSpinner variant="profile" />
        ) : (
          <div className="space-y-6">
            {/* ── SECTION 1: OFFICIAL INSTITUTIONAL PROFILE (READ-ONLY) ── */}
            <Card className="p-6 border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Official Institutional Registration Record
                    </h3>
                    <p className="text-xs text-slate-500">
                      Core school identity parameters are managed centrally to protect institutional integrity.
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 border border-brand-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Verified by Veducore Superadmin</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3.5">
                  <span className="block font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    School Name
                  </span>
                  <span className="mt-1 block font-bold text-slate-900 text-sm">
                    {school?.name || 'N/A'}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3.5">
                  <span className="block font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    Registered Official Email
                  </span>
                  <span className="mt-1 block font-mono font-medium text-slate-800 truncate">
                    {school?.email || 'N/A'}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3.5">
                  <span className="block font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    Official Contact Number
                  </span>
                  <span className="mt-1 block font-bold text-slate-900">
                    {school?.contact_number || 'N/A'}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3.5">
                  <span className="block font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    Academic Session
                  </span>
                  <span className="mt-1 block font-bold text-brand-700">
                    {school?.academic_year || '2026-27'}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3.5">
                  <span className="block font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    Currency & Timezone
                  </span>
                  <span className="mt-1 block font-bold text-slate-900">
                    {school?.currency || 'INR'} ({school?.currency_symbol || '₹'}) • {school?.timezone || 'IST (UTC+5:30)'}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3.5">
                  <span className="block font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    Campus Address
                  </span>
                  <span className="mt-1 block font-medium text-slate-800 truncate">
                    {school?.address || 'Main Campus'}
                  </span>
                </div>
              </div>
            </Card>

            {/* ── SECTION 2: SCHOOL BRANDING & CREST ── */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <SchoolIcon className="h-5 w-5 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900">Institutional Branding & Crest</h3>
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-6 p-4 rounded-xl border border-slate-100 bg-slate-50/50 mb-5">
                <div className="relative flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white shadow-sm overflow-hidden">
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
                    <ImageIcon className="h-8 w-8 text-slate-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 mb-0.5">School Crest / Logo</p>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">
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

              <div className="mb-5 rounded-xl border border-slate-100 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Smartphone className="h-4 w-4 text-brand-600" /> School branding in the portals</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      When on, teachers, parents and staff see your logo and a portal name built from your school's initials instead of Veducore — in the browser tab, the web header and the mobile app.
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="peer sr-only" checked={brandingOn} onChange={(e) => setBrandingOn(e.target.checked)} aria-label="Use school branding" />
                    <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400" />
                    <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                  </label>
                </div>
                {brandingOn && (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(['Teacher', 'Parent', 'Admin'] as const).map((role) => (
                      <div key={role} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                          {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-contain p-1" />
                            : <span className="text-sm font-bold text-brand-600">{initials.slice(0, 2) || '?'}</span>}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{initials ? `${initials} ` : ''}{role} Portal</p>
                          <p className="truncate text-[11px] text-slate-400">{school?.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {brandingOn && (
                  <p className="mt-3 text-[11px] text-slate-400">
                    The phone's home-screen icon and app name come from the installed app and stay the same for every school; inside the app the logo and portal name change after login.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <Select label="Affiliation Board" value={affiliationBoard} onChange={(e) => setAffiliationBoard(e.target.value)}>
                    <option value="CBSE">CBSE (Central Board)</option>
                    <option value="ICSE">ICSE / ISC</option>
                    <option value="State Board">State Board</option>
                    <option value="Cambridge">Cambridge Assessment (IGCSE)</option>
                    <option value="IB">International Baccalaureate (IB)</option>
                    <option value="Other">Other Institutional Board</option>
                  </Select>
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
                <CalendarClock className="h-5 w-5 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900">Academic & Working Schedule Policies</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Select label="Weekly Working Days" value={settings.workingDays} onChange={(e) => setSettings({ ...settings, workingDays: e.target.value })}>
                    <option value="6">6 Working Days (Monday – Saturday)</option>
                    <option value="5">5 Working Days (Monday – Friday)</option>
                  </Select>
                  <span className="text-[11px] text-slate-400 mt-1 block">Sets active attendance days across teacher portals.</span>
                </div>

                <div>
                  <Select label="Daily Attendance Cutoff Time" value={settings.attendanceCutoff} onChange={(e) => setSettings({ ...settings, attendanceCutoff: e.target.value })}>
                    <option value="09:00 AM">09:00 AM</option>
                    <option value="09:30 AM">09:30 AM (Standard)</option>
                    <option value="10:00 AM">10:00 AM</option>
                    <option value="10:30 AM">10:30 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                  </Select>
                  <span className="text-[11px] text-slate-400 mt-1 block">Alerts staff if class attendance is unsubmitted.</span>
                </div>

                <div>
                  <Select label="Minimum Passing Marks Threshold" value={String(settings.passingPercentage)} onChange={(e) => setSettings({ ...settings, passingPercentage: Number(e.target.value) })}>
                    <option value="33">33% (National Standard)</option>
                    <option value="35">35%</option>
                    <option value="40">40%</option>
                    <option value="50">50%</option>
                  </Select>
                  <span className="text-[11px] text-slate-400 mt-1 block">Used for automatic student report card status calculations.</span>
                </div>
              </div>
            </Card>

            {/* ── SCHOOL TIMINGS ── */}
            <Card className="p-6">
              <div className="mb-1 flex items-center gap-2">
                <Clock className="h-5 w-5 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900">School Timings</h3>
              </div>
              <p className="mb-4 text-xs text-slate-500">Teachers who mark themselves present after reporting time plus the grace minutes are recorded as late.</p>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <Input label="School starts" type="time" value={timings.school_start} onChange={(e) => setTimings({ ...timings, school_start: e.target.value })} />
                <Input label="School ends" type="time" value={timings.school_end} onChange={(e) => setTimings({ ...timings, school_end: e.target.value })} />
                {settings.workingDays === '6' && (
                  <Input label="Saturday ends" type="time" value={timings.saturday_end} onChange={(e) => setTimings({ ...timings, saturday_end: e.target.value })} />
                )}
                <Input label="Staff reporting" type="time" value={timings.staff_reporting} onChange={(e) => setTimings({ ...timings, staff_reporting: e.target.value })} />
                <Select label="Late after" value={String(timings.late_after_minutes)} onChange={(e) => setTimings({ ...timings, late_after_minutes: Number(e.target.value) })}>
                  {[0, 5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m === 0 ? 'Exactly on time' : `${m} min grace`}</option>)}
                </Select>
              </div>
              {timingError ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> {timingError}</p>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  {to12(timings.school_start)} – {to12(timings.school_end)}{settings.workingDays === '6' && timings.saturday_end ? ` (Sat till ${to12(timings.saturday_end)})` : ''} · staff report by {to12(timings.staff_reporting)}
                </p>
              )}
            </Card>

            {/* ── SECTION 4: FEE BILLING DEFAULTS & AUTOMATED NOTIFICATIONS ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Fee Rules */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-brand-600" />
                  <h3 className="text-sm font-bold text-slate-900">Fee Billing & Collection Rules</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <Select label="Default Monthly Due Date" value={String(settings.feeDueDay)} onChange={(e) => setSettings({ ...settings, feeDueDay: Number(e.target.value) })}>
                      <option value="5">5th of every month</option>
                      <option value="10">10th of every month (Recommended)</option>
                      <option value="15">15th of every month</option>
                      <option value="20">20th of every month</option>
                    </Select>
                  </div>

                  <div>
                    <Select label="Late Fee Grace Period (Days)" value={String(settings.lateGraceDays)} onChange={(e) => setSettings({ ...settings, lateGraceDays: Number(e.target.value) })}>
                      <option value="0">0 Days (Immediate Overdue)</option>
                      <option value="3">3 Days</option>
                      <option value="5">5 Days (Standard)</option>
                      <option value="7">7 Days (1 Week)</option>
                      <option value="10">10 Days</option>
                    </Select>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.autoReceipts}
                      onChange={(e) => setSettings({ ...settings, autoReceipts: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Auto-Generate Printable Receipts</p>
                      <p className="text-[11px] text-slate-400">Instantly generate verifiable payment receipts for parents upon fee submission.</p>
                    </div>
                  </label>
                </div>
              </Card>

              {/* Communication Rules */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-brand-600" />
                  <h3 className="text-sm font-bold text-slate-900">Parent Communication Rules</h3>
                </div>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer select-none p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50/75 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.absenteeAlerts}
                      onChange={(e) => setSettings({ ...settings, absenteeAlerts: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Instant Daily Absentee Notification</p>
                      <p className="text-[11px] text-slate-400">Notify parents via in-app alert when attendance is marked absent by the teacher.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer select-none p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50/75 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.feeReminders}
                      onChange={(e) => setSettings({ ...settings, feeReminders: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Fee Due Reminder Notice</p>
                      <p className="text-[11px] text-slate-400">Send reminder alerts to parents 3 days before monthly fee due dates.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer select-none p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50/75 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.remarksAlerts}
                      onChange={(e) => setSettings({ ...settings, remarksAlerts: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Teacher Remarks Alerts</p>
                      <p className="text-[11px] text-slate-400">Instant parent notification when teachers submit academic/behavioral remarks.</p>
                    </div>
                  </label>
                </div>
              </Card>
            </div>

            {/* ── SECTION 5: INTEGRATED ERP SERVICES SHORTCUTS ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5 flex items-center justify-between border border-slate-200 hover:border-brand-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Online Fee Payment Gateway</h4>
                    <p className="text-[11px] text-slate-400">Razorpay API credentials & direct settlement bank account setup.</p>
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

              <Card className="p-5 flex items-center justify-between border border-slate-200 hover:border-brand-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <Contact2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Student ID Cards</h4>
                    <p className="text-[11px] text-slate-400">Design, generate and print student ID cards.</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/admin/id-cards')}
                  icon={<ExternalLink className="h-3 w-3" />}
                  className="bg-white flex-shrink-0"
                >
                  Open ID Cards
                </Button>
              </Card>
            </div>

            {/* ── SAVE ACTION BAR ── */}
            <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between rounded-xl border-t border-slate-200 bg-white/90 px-1 py-3 backdrop-blur">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Changes apply across your school as soon as you save.</span>
              </div>
              <Button onClick={handleSave} loading={saving} size="md">
                Save Settings
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
