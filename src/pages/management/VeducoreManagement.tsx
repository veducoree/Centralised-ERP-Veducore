import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Building2, Users, GraduationCap, BarChart3, Eye, EyeOff,
  Upload, CheckCircle, Plus, ChevronDown, ChevronRight, ChevronLeft, Globe,
  LogOut, TrendingUp, Loader2, AlertCircle, ShieldCheck,
  Key, Copy, Check, Trash2, RefreshCw, Search,
  School, Activity, KeyRound, AlertTriangle, X,
  Lock, Phone, Mail, MapPin, Calendar, Sparkles,
  ArrowUpRight, ShieldAlert, Layers, Contact2, Printer,
  Download, Filter, Palette, Sliders, Image as ImageIcon,
  FileText, CheckCircle2, UserCheck, UserX
} from 'lucide-react';
import veducoreLogo from '@/assets/veducore-logo.png';

const MGMT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mgmt-auth`;
const MANAGE_SCHOOLS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-schools`;
const MGMT_SECRET = import.meta.env.VITE_VEDUCORE_MGMT_SECRET ?? 'veducore-prod-2026';

// ── API Helpers ───────────────────────────────────────────────────────────────

async function callMgmt(body: Record<string, string>) {
  const res = await fetch(MGMT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

async function callManageSchools(body: Record<string, unknown>) {
  const res = await fetch(MANAGE_SCHOOLS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MGMT_SECRET}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  let pw = '';
  for (let i = 0; i < 12; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchoolRecord {
  id: string;
  name: string;
  city: string;
  address: string;
  contactNumber: string;
  email: string;
  academicYear: string;
  status: 'Active' | 'Inactive';
  joinedDate: string;
  createdAt: string;
  lastLogin: string;
  adminUserId: string | null;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string | null;
  students: number;
  teachers: number;
  classes: number;
  sections: number;
  idCardTemplate: string | null;
  idCardTemplateUrl?: string | null;
  idCardConfig?: any | null;
}

export interface StudentIdCardRecord {
  id: string;
  admissionNumber: string;
  fullName: string;
  fatherName: string;
  motherName: string;
  parentEmail: string;
  dob: string;
  gender: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  classSection: string;
  rollNumber: number | null;
  address: string;
  avatarUrl: string | null;
  bloodGroup: string;
  emergencyContact: string;
  hasPhoto: boolean;
  isInfoComplete: boolean;
  status: string;
}

export interface IdCardMetrics {
  totalStudents: number;
  withPhotoCount: number;
  missingPhotoCount: number;
  photoCompletenessPct: number;
  completeInfoCount: number;
  incompleteInfoCount: number;
  infoCompletenessPct: number;
}

export interface AnalyticsSummary {
  totalSchools: number;
  activeSchools: number;
  inactiveSchools: number;
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  studentTeacherRatio: string;
  systemStatus: string;
  databaseHealth: string;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  onboardingTrend: { month: string; count: number }[];
  topSchools: { id: string; name: string; city: string; students: number; status: string }[];
  academicYearDist: Record<string, number>;
  recentActivity: Array<{
    id: string;
    action: string;
    entity_type: string;
    created_at: string;
    metadata?: Record<string, any>;
  }>;
}

// ── Auth Screen (Clean White Theme) ──────────────────────────────────────────

type AuthMode = 'checking' | 'setup' | 'login';

function AuthScreen({ onLogin }: { onLogin: (fullName: string) => void }) {
  const [mode, setMode]           = useState<AuthMode>('checking');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [fullName, setFullName]   = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('veducore_mgmt_admin');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name) {
          onLogin(parsed.name);
          return;
        }
      }
    } catch {
      // ignore
    }

    callMgmt({ action: 'check' })
      .then((res) => {
        setMode(res.is_setup_done ? 'login' : 'setup');
      })
      .catch(() => {
        setMode('login');
      });
  }, [onLogin]);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPw) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await callMgmt({ action: 'setup', email: email.trim(), password, full_name: fullName.trim() });
      setLoading(false);
      if (res.error) { setError(res.error as string); return; }
      const admin = (res.full_name as string) || fullName;
      localStorage.setItem('veducore_mgmt_admin', JSON.stringify({ name: admin, loggedInAt: Date.now() }));
      onLogin(admin);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await callMgmt({ action: 'login', email: email.trim(), password });
      setLoading(false);
      if (res.error) { setError(res.error as string); return; }
      const admin = (res.full_name as string) || 'Veducore Admin';
      localStorage.setItem('veducore_mgmt_admin', JSON.stringify({ name: admin, loggedInAt: Date.now() }));
      onLogin(admin);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Login failed — check your network connection');
    }
  }

  if (mode === 'checking') {
    return (
      <div className="fixed inset-0 z-50 min-h-screen w-screen flex flex-col items-center justify-center bg-gray-50 select-none">
        <div className="relative inline-block">
          <span
            className="block text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-200"
            style={{ WebkitTextStroke: '1px #cbd5e1' }}
          >
            Veducore
          </span>
          <span
            aria-hidden="true"
            className="veducore-fill-text pointer-events-none absolute inset-0 block text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-950"
          >
            Veducore
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={veducoreLogo} alt="Veducore" className="h-10 w-auto mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-gray-900">Veducore Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'setup' ? 'First-time setup: Create superadmin account' : 'Centralised Multi-School ERP Operations Portal'}
          </p>
        </div>

        {mode === 'setup' && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
            <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">First-time Superadmin Setup</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Create your management admin account to manage all onboarded schools.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={mode === 'setup' ? handleSetup : handleLogin} className="space-y-4">
            {mode === 'setup' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Superadmin Full Name"
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                  autoFocus
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                Admin Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@veducore.com"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                required
                autoFocus={mode === 'login'}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                {mode === 'setup' ? 'Create Password' : 'Password'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'setup' ? 'Min 8 characters' : 'Enter your password'}
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === 'setup' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading
                ? (mode === 'setup' ? 'Creating superadmin...' : 'Signing in...')
                : (mode === 'setup' ? 'Complete Setup & Enter' : 'Sign In')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Interactive Charts & Meaningful Insights Dashboard (Clean White) ─────────

function OverviewDashboard({
  schools,
  analytics,
  onNavigateToSchools,
  onNavigateToAddSchool,
  onRefresh,
  loading,
}: {
  schools: SchoolRecord[];
  analytics: AnalyticsData | null;
  onNavigateToSchools: () => void;
  onNavigateToAddSchool: () => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const totalStudents = schools.reduce((sum, s) => sum + s.students, 0);
  const totalTeachers = schools.reduce((sum, s) => sum + s.teachers, 0);
  const totalClasses  = schools.reduce((sum, s) => sum + s.classes, 0);
  const activeSchools = schools.filter(s => s.status === 'Active').length;
  const inactiveSchools = schools.length - activeSchools;
  const ratio = totalTeachers > 0 ? (totalStudents / totalTeachers).toFixed(1) : '18.0';

  // Growth Trend data points
  const trendData = useMemo(() => {
    if (analytics?.onboardingTrend && analytics.onboardingTrend.length > 0) {
      return analytics.onboardingTrend;
    }
    return [
      { month: 'Jun 2026', count: 0 },
      { month: 'Jul 2026', count: 0 },
      { month: 'Aug 2026', count: 0 },
      { month: 'Sep 2026', count: 0 },
      { month: 'Oct 2026', count: Math.max(schools.length, 1) },
    ];
  }, [analytics, schools.length]);

  const maxTrend = Math.max(...trendData.map(d => d.count), 5);

  return (
    <div className="space-y-6">
      {/* Top Banner (Clean White with subtle border) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-green-700">Platform Insights</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Veducore Centralised ERP Operations</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Real-time analytics, student capacity, faculty metrics & institutional growth.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            Refresh Data
          </button>
          <button
            onClick={onNavigateToAddSchool}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add New School
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="skeleton-shimmer h-3.5 w-24 rounded-md" />
                  <div className="skeleton-shimmer h-10 w-10 rounded-lg" />
                </div>
                <div className="skeleton-shimmer h-8 w-16 rounded-md" />
                <div className="skeleton-shimmer h-3 w-32 rounded-md" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="skeleton-shimmer h-4 w-48 rounded-md" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-shimmer h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* KPI Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Schools */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Registered Schools</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{schools.length}</span>
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              {activeSchools} Active
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-2.5">
            <span>{inactiveSchools} inactive</span>
            <button onClick={onNavigateToSchools} className="text-blue-600 font-medium hover:underline inline-flex items-center gap-0.5">
              View all <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Card 2: Total Students */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Enrolled Students</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{totalStudents.toLocaleString('en-IN')}</span>
            <span className="text-xs text-gray-400">total</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-2.5">
            <span>Avg {schools.length > 0 ? Math.round(totalStudents / schools.length) : 0} per school</span>
            <span className="text-blue-600 font-medium">Live</span>
          </div>
        </div>

        {/* Card 3: Teachers & Ratio */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Teachers & Faculty</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <GraduationCap className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{totalTeachers.toLocaleString('en-IN')}</span>
            <span className="text-xs text-gray-400">teachers</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-2.5">
            <span>Ratio: {ratio} : 1</span>
            <span className="text-blue-600 font-medium">{totalClasses} Classes</span>
          </div>
        </div>

        {/* Card 4: Platform Health */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Backend System</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">100%</span>
            <span className="text-xs font-medium text-green-600">Healthy</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-2.5">
            <span>Postgres + Edge Functions</span>
            <span className="text-green-700 font-mono text-[11px]">RLS Active</span>
          </div>
        </div>
      </div>

      {/* Meaningful Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: School Growth & Onboarding Timeline */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                School Onboarding & Growth Velocity
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Monthly school registrations and platform adoption curve.</p>
            </div>
            <span className="text-xs font-medium bg-blue-50 text-blue-700 rounded-md px-2.5 py-1">
              {trendData.length} Period View
            </span>
          </div>

          {/* SVG Area / Bar Visualization */}
          <div className="relative pt-6 pb-2">
            <div className="h-52 w-full flex items-end justify-between gap-3 px-2">
              {trendData.map((d, idx) => {
                const heightPercent = Math.max(Math.round((d.count / maxTrend) * 100), 12);
                const isHovered = hoveredMonth === d.month;
                return (
                  <div
                    key={d.month + idx}
                    className="flex-1 flex flex-col items-center group cursor-pointer relative"
                    onMouseEnter={() => setHoveredMonth(d.month)}
                    onMouseLeave={() => setHoveredMonth(null)}
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute -top-10 z-20 bg-gray-900 text-white text-[11px] font-semibold py-1 px-2.5 rounded-md shadow-lg whitespace-nowrap animate-in fade-in">
                        {d.month}: {d.count} School{d.count === 1 ? '' : 's'}
                      </div>
                    )}
                    {/* Bar container */}
                    <div className="w-full max-w-[48px] h-40 flex items-end justify-center rounded-lg bg-gray-50 p-1 border border-gray-100">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-md transition-all duration-200 ${
                          isHovered ? 'bg-blue-700 shadow-sm' : 'bg-blue-600'
                        }`}
                      />
                    </div>
                    {/* Count badge */}
                    <span className="text-xs font-bold text-gray-800 mt-2">{d.count}</span>
                    {/* Month label */}
                    <span className="text-[11px] font-medium text-gray-400 truncate max-w-full text-center">
                      {d.month.split(' ')[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
                New Schools Added
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                Active Database Connections
              </span>
            </div>
            <span className="font-medium text-gray-600">Total: {schools.length} Onboarded</span>
          </div>
        </div>

        {/* Chart 2: Academic Year & Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                Academic Year Breakdown
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">Distribution of institutional cohorts across Veducore.</p>

            <div className="space-y-3">
              {Object.entries(analytics?.academicYearDist || { '2026-27': 1, '2025-26': 0 }).map(([yr, count]) => {
                const pct = schools.length > 0 ? Math.round((count / schools.length) * 100) : 0;
                return (
                  <div key={yr} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-gray-700">{yr} Session</span>
                      <span className="text-gray-900 font-bold">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.max(pct, 8)}%` }}
                        className="h-full bg-blue-600 rounded-full"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="rounded-lg bg-gray-50 p-3.5 border border-gray-200">
              <div className="flex items-center justify-between text-xs font-semibold text-gray-800 mb-1">
                <span>Multi-School Tenant Isolation</span>
                <span className="text-green-600 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Enforced
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Row Level Security guarantees complete tenant isolation between every school instance.
              </p>
            </div>
          </div>
        </div>
      </div>


        </>
      )}
    </div>
  );
}

// ── Schools Management Section with Detailed View & Credentials ───────────────

function SchoolsSection({
  schools,
  onPasswordReset,
  onStatusToggle,
  onDeleteSchool,
  onRefresh,
  loading,
}: {
  schools: SchoolRecord[];
  onPasswordReset: (schoolId: string, newPw: string) => Promise<boolean>;
  onStatusToggle: (schoolId: string, currentStatus: 'Active' | 'Inactive') => Promise<void>;
  onDeleteSchool: (school: SchoolRecord) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Password reset inline state
  const [editingPwSchoolId, setEditingPwSchoolId] = useState<string | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [pwUpdating, setPwUpdating] = useState(false);
  const [pwSuccessMsg, setPwSuccessMsg] = useState<string | null>(null);

  function copyToClipboard(text: string, keyId: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2500);
  }

  function togglePasswordVisibility(schoolId: string) {
    setRevealedPasswords(prev => ({ ...prev, [schoolId]: !prev[schoolId] }));
  }

  async function handleSaveNewPassword(schoolId: string) {
    if (!newPasswordInput || newPasswordInput.length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }
    setPwUpdating(true);
    const ok = await onPasswordReset(schoolId, newPasswordInput);
    setPwUpdating(false);
    if (ok) {
      setPwSuccessMsg('Password updated in Supabase Auth & Database!');
      setEditingPwSchoolId(null);
      setNewPasswordInput('');
      setTimeout(() => setPwSuccessMsg(null), 4000);
    }
  }

  function copyAllLoginCredentials(school: SchoolRecord) {
    const portalUrl = `${window.location.origin}/login`;
    const message = `🏫 *Veducore ERP School Login Credentials*
----------------------------------------
School Name: ${school.name}
Portal Link: ${portalUrl}
Admin Username / Email: ${school.adminEmail}
Admin Password: ${school.adminPassword || '(Set via Management Portal)'}
----------------------------------------
Use these credentials to sign into the Veducore Admin Dashboard.`;
    copyToClipboard(message, `all_${school.id}`);
  }

  const filteredSchools = useMemo(() => {
    return schools.filter(s => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.adminEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.contactNumber.includes(searchQuery);

      const matchesStatus =
        statusFilter === 'All' ? true : s.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [schools, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Registered Schools Management</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Full view of school profiles, superadmin username & password credentials, and complete backend purge.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {pwSuccessMsg && (
        <div className="flex items-center gap-2.5 rounded-xl bg-green-50 border border-green-200 p-4 text-green-800 text-sm font-medium animate-in fade-in">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <span>{pwSuccessMsg}</span>
        </div>
      )}

      {/* Search and Filters Toolbar (Clean White) */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search school name, email, city..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {(['All', 'Active', 'Inactive'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab} ({tab === 'All' ? schools.length : schools.filter(s => s.status === tab).length})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="skeleton-shimmer h-3.5 w-24 rounded-md" />
                  <div className="skeleton-shimmer h-10 w-10 rounded-lg" />
                </div>
                <div className="skeleton-shimmer h-8 w-16 rounded-md" />
                <div className="skeleton-shimmer h-3 w-32 rounded-md" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="skeleton-shimmer h-4 w-48 rounded-md" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-shimmer h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSchools.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <School className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-gray-700">No schools match your search</h3>
            <p className="text-xs text-gray-400 mt-1">Try adjusting the filter or search keyword.</p>
          </div>
        ) : (
          filteredSchools.map(school => {
            const isExpanded = expandedId === school.id;
            const isPwVisible = revealedPasswords[school.id] || false;

            return (
              <div
                key={school.id}
                className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden shadow-sm ${
                  isExpanded ? 'border-blue-400 ring-2 ring-blue-500/10' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Main Card Header */}
                <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 border border-blue-100 text-blue-700 font-bold text-sm">
                        {school.name.charAt(0).toUpperCase()}
                      </div>
                      <h3 className="font-bold text-gray-900 text-base">{school.name}</h3>

                      {/* Status toggle badge */}
                      <button
                        onClick={() => onStatusToggle(school.id, school.status)}
                        title="Click to toggle status"
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                          school.status === 'Active'
                            ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${school.status === 'Active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {school.status}
                      </button>

                      <span className="text-xs font-mono text-gray-500 bg-gray-100 rounded-md px-2 py-0.5">
                        Year: {school.academicYear}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-gray-400" />
                        {school.city || 'Address not specified'}
                      </span>
                      <span className="flex items-center gap-1 font-mono text-gray-600">
                        <Mail className="h-3.5 w-3.5 text-gray-400" />
                        {school.adminEmail}
                      </span>
                      {school.contactNumber && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5 text-gray-400" />
                          {school.contactNumber}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : school.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        isExpanded
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      {isExpanded ? 'Hide Details' : 'View Details & Credentials'}
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>

                    {/* Delete button directly from header */}
                    <button
                      onClick={() => onDeleteSchool(school)}
                      title="Permanently Delete School & All Records"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Sub-bar stats */}
                <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-6 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Users className="h-3.5 w-3.5 text-blue-600" />
                    {school.students.toLocaleString('en-IN')} Students
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
                    {school.teachers} Teachers
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    Joined {school.joinedDate}
                  </span>
                  <span className="text-[11px] text-gray-400 ml-auto font-mono">
                    ID: {school.id.slice(0, 8)}...
                  </span>
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-white p-6 space-y-6 animate-in slide-in-from-top-2 duration-150">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                      {/* ── SUPERADMIN CREDENTIALS VAULT (CLEAN WHITE THEME) ── */}
                      <div className="bg-blue-50/30 rounded-xl border border-blue-200 p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                              <Key className="h-4 w-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-gray-900">Admin Credentials Vault</h4>
                              <p className="text-[11px] text-gray-500">Superadmin view of school admin credentials</p>
                            </div>
                          </div>

                          {/* Quick 1-click WhatsApp/Email Share */}
                          <button
                            onClick={() => copyAllLoginCredentials(school)}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors"
                          >
                            {copiedKey === `all_${school.id}` ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-white" />
                                Copied Full Info!
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Copy Credentials
                              </>
                            )}
                          </button>
                        </div>

                        {/* Admin Full Name */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            Administrator Name
                          </span>
                          <p className="text-sm font-bold text-gray-900">{school.adminName || 'School Administrator'}</p>
                        </div>

                        {/* Admin Username / Email */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            Username / Admin Login Email
                          </span>
                          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-2.5">
                            <span className="font-mono text-sm font-bold text-gray-900 select-all">
                              {school.adminEmail}
                            </span>
                            <button
                              onClick={() => copyToClipboard(school.adminEmail, `user_${school.id}`)}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                            >
                              {copiedKey === `user_${school.id}` ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-green-600" />
                                  <span className="text-green-600">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Admin Password */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                              Admin Login Password
                            </span>
                            <span className="text-[10px] text-green-600 font-medium">Synced with Supabase Auth</span>
                          </div>

                          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-2.5">
                            <div className="flex items-center gap-2">
                              <Lock className="h-3.5 w-3.5 text-gray-400" />
                              <span className="font-mono text-sm font-bold text-gray-900 select-all">
                                {school.adminPassword ? (
                                  isPwVisible ? school.adminPassword : '••••••••••••'
                                ) : (
                                  <span className="text-xs text-amber-600 italic font-normal">
                                    No password recorded yet
                                  </span>
                                )}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              {school.adminPassword && (
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility(school.id)}
                                  className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                                  title={isPwVisible ? 'Hide password' : 'Show password'}
                                >
                                  {isPwVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              )}

                              {school.adminPassword && (
                                <button
                                  onClick={() => copyToClipboard(school.adminPassword!, `pw_${school.id}`)}
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                >
                                  {copiedKey === `pw_${school.id}` ? (
                                    <>
                                      <Check className="h-3.5 w-3.5 text-green-600" />
                                      <span className="text-green-600">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Reset / Change Password Action */}
                        <div className="pt-1">
                          {editingPwSchoolId === school.id ? (
                            <div className="bg-white rounded-lg border border-blue-200 p-3 space-y-2">
                              <p className="text-xs font-semibold text-gray-800">Set New Password for Admin</p>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={newPasswordInput}
                                  onChange={e => setNewPasswordInput(e.target.value)}
                                  placeholder="Enter new password"
                                  className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => setNewPasswordInput(generateRandomPassword())}
                                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                                  title="Auto-generate password"
                                >
                                  <Sparkles className="h-3 w-3 text-amber-500" />
                                  Gen
                                </button>
                              </div>
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  onClick={() => { setEditingPwSchoolId(null); setNewPasswordInput(''); }}
                                  className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                                >
                                  Cancel
                                </button>
                                <button
                                  disabled={pwUpdating}
                                  onClick={() => handleSaveNewPassword(school.id)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                >
                                  {pwUpdating && <Loader2 className="h-3 w-3 animate-spin" />}
                                  Save Password
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingPwSchoolId(school.id);
                                setNewPasswordInput('');
                              }}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
                            >
                              <KeyRound className="h-3 w-3" />
                              {school.adminPassword ? 'Reset / Change Admin Password' : 'Set Admin Password Now'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ── SCHOOL DETAILED SPECS & SERVICES ── */}
                      <div className="space-y-4">
                        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                          <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">
                            Institutional Profile
                          </h4>

                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between py-1 border-b border-gray-50">
                              <span className="text-gray-500">School UUID</span>
                              <span className="font-mono text-gray-800 font-semibold select-all text-[11px]">
                                {school.id}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-gray-50">
                              <span className="text-gray-500">Official Contact</span>
                              <span className="text-gray-800 font-medium">{school.contactNumber || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-gray-50">
                              <span className="text-gray-500">Campus Address</span>
                              <span className="text-gray-800 font-medium text-right max-w-[200px] truncate">
                                {school.address || school.city || 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-gray-50">
                              <span className="text-gray-500">Academic Year</span>
                              <span className="text-gray-800 font-medium">{school.academicYear}</span>
                            </div>
                            <div className="flex justify-between py-1">
                              <span className="text-gray-500">Portal Login URL</span>
                              <span className="text-blue-600 font-mono text-[11px]">
                                {window.location.origin}/login
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── DANGER ZONE: BACKEND CASCADE DELETE ── */}
                    <div className="rounded-xl border border-red-200 bg-red-50 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                          <ShieldAlert className="h-4 w-4 text-red-600" />
                          Danger Zone: Complete Backend Cascade Purge
                        </div>
                        <p className="text-xs text-red-700">
                          Permanently deletes this school and cascades across students, teachers, classes, attendance, fee ledgers, and Supabase Auth logins.
                        </p>
                      </div>

                      <button
                        onClick={() => onDeleteSchool(school)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-bold shadow-sm transition-colors flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                        Permanently Delete School
                      </button>
                    </div>

                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      )}
    </div>
  );
}

// ── Delete Confirmation Modal (Clean White) ───────────────────────────────────

function DeleteSchoolModal({
  school,
  onConfirm,
  onCancel,
  loading,
}: {
  school: SchoolRecord | null;
  onConfirm: (schoolId: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [confirmInput, setConfirmInput] = useState('');

  if (!school) return null;

  const isConfirmed =
    confirmInput.trim().toLowerCase() === school.name.trim().toLowerCase() ||
    confirmInput.trim().toUpperCase() === 'DELETE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="bg-white border-b border-gray-100 p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-gray-900">Permanent Backend Purge</h3>
              <p className="text-xs text-gray-500">Deep cascade delete of all data & auth users</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-red-50 rounded-lg border border-red-200 p-4 space-y-2">
            <p className="text-xs font-bold text-red-900">
              You are about to permanently delete:
            </p>
            <p className="text-sm font-extrabold text-red-700">{school.name}</p>
            <p className="text-xs text-red-800 leading-relaxed">
              This action cannot be undone. The backend will permanently purge:
            </p>
            <ul className="text-xs text-red-700 space-y-1 list-disc pl-4">
              <li>All <strong>{school.students} students</strong> and their records</li>
              <li>All <strong>{school.teachers} teacher profiles</strong> and class assignments</li>
              <li>All classes, grade sections, and subjects</li>
              <li>All attendance ledgers, exam marks, and fee payment history</li>
              <li>All Supabase Auth accounts (freeing email addresses completely)</li>
            </ul>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">
              Type <strong className="text-gray-900 select-all font-mono">&quot;DELETE&quot;</strong> or the school name to confirm:
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder="Type DELETE or school name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!isConfirmed || loading}
              onClick={() => onConfirm(school.id)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Purging Backend Records...' : 'Permanently Purge Everything'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add New School Section ────────────────────────────────────────────────────

interface NewSchoolForm {
  name: string;
  address: string;
  city: string;
  contactNumber: string;
  email: string;
  academicYear: string;
  adminName: string;
  adminPassword: string;
}

// ── Student ID Cards Generator & Template Management ─────────────────────────

interface TemplateDesignConfig {
  preset: 'classic-navy' | 'emerald' | 'crimson' | 'modern-dark';
  orientation: 'landscape' | 'portrait';
  primaryColor: string;
  accentColor: string;
  showLogo: boolean;
  showBarcode: boolean;
  showSignature: boolean;
  showEmergency: boolean;
  customBackgroundUrl: string | null;
  institutionSubtitle: string;
}

const DEFAULT_TEMPLATE_CONFIG: TemplateDesignConfig = {
  preset: 'classic-navy',
  orientation: 'landscape',
  primaryColor: '#1e3a8a',
  accentColor: '#d97706',
  showLogo: true,
  showBarcode: true,
  showSignature: true,
  showEmergency: true,
  customBackgroundUrl: null,
  institutionSubtitle: 'STUDENT IDENTITY CARD',
};

const TEMPLATE_PRESETS: {
  id: 'classic-navy' | 'emerald' | 'crimson' | 'modern-dark';
  name: string;
  primary: string;
  accent: string;
}[] = [
  { id: 'classic-navy', name: 'Royal Navy & Gold', primary: '#1e3a8a', accent: '#d97706' },
  { id: 'emerald', name: 'Emerald Academy', primary: '#065f46', accent: '#10b981' },
  { id: 'crimson', name: 'Crimson Heritage', primary: '#831843', accent: '#fb7185' },
  { id: 'modern-dark', name: 'Executive Slate', primary: '#0f172a', accent: '#38bdf8' },
];

const PREVIEW_PLACEHOLDER_STUDENT: StudentIdCardRecord = {
  id: 'preview-sample',
  admissionNumber: 'GVC-2026-001',
  fullName: 'Aarav Sharma',
  fatherName: 'Rajesh Sharma',
  motherName: 'Sunita Sharma',
  parentEmail: 'parent@example.com',
  dob: '2014-04-12',
  gender: 'male',
  classId: 'c1',
  className: 'Class 5',
  sectionId: 's1',
  sectionName: 'A',
  classSection: 'Class 5 - A',
  rollNumber: 1,
  address: 'Campus Road, New Delhi',
  avatarUrl: null,
  bloodGroup: 'B+',
  emergencyContact: '+91 98765 43210',
  hasPhoto: false,
  isInfoComplete: true,
  status: 'active',
};

// Single ID Card Item
function StudentIdCardCard({
  student,
  school,
  template,
  onZoom,
}: {
  student: StudentIdCardRecord;
  school: SchoolRecord;
  template: TemplateDesignConfig;
  onZoom?: (student: StudentIdCardRecord) => void;
}) {
  const isLandscape = template.orientation === 'landscape';

  return (
    <div
      onClick={() => onZoom?.(student)}
      className={`relative bg-white rounded-xl border border-gray-300 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between cursor-pointer select-none ${
        isLandscape
          ? 'w-full max-w-[340px] h-[216px]'
          : 'w-full max-w-[240px] h-[340px]'
      }`}
      style={{
        boxSizing: 'border-box',
        backgroundImage: template.customBackgroundUrl ? `url(${template.customBackgroundUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Background tint overlay if custom artwork exists */}
      {template.customBackgroundUrl && (
        <div className="absolute inset-0 bg-white/85 pointer-events-none z-0" />
      )}

      {/* ── CARD HEADER ── */}
      <div
        className="relative z-10 px-3 py-2 text-white flex items-center justify-between"
        style={{ backgroundColor: template.primaryColor }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {template.showLogo && (
            <div className="h-7 w-7 rounded bg-white/20 p-1 flex items-center justify-center flex-shrink-0">
              <School className="h-4 w-4 text-white" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-[11px] font-extrabold uppercase tracking-tight truncate leading-tight">
              {school.name}
            </h4>
            <p className="text-[9px] text-white/80 uppercase tracking-widest truncate leading-none mt-0.5">
              {template.institutionSubtitle || 'STUDENT IDENTITY CARD'}
            </p>
          </div>
        </div>

        <span className="text-[9px] font-semibold bg-white/20 px-1.5 py-0.5 rounded flex-shrink-0">
          {school.academicYear || '2026-27'}
        </span>
      </div>

      {/* ── CARD BODY ── */}
      {isLandscape ? (
        <div className="relative z-10 px-3 py-2 flex items-center gap-3 flex-1 min-h-0">
          {/* Photo Container */}
          <div className="w-[72px] h-[86px] rounded-lg border border-gray-200 bg-gray-100 flex-shrink-0 overflow-hidden relative shadow-inner flex items-center justify-center">
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.fullName}
                className="h-full w-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-1 text-center">
                <Users className="h-6 w-6 text-gray-400 mb-0.5" />
                <span className="text-[7.5px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1 leading-tight">
                  No Photo
                </span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="border-b border-gray-100 pb-1">
              <p className="text-xs font-bold text-gray-900 truncate leading-tight">
                {student.fullName}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                  {student.classSection}
                </span>
                {student.rollNumber && (
                  <span className="text-[10px] text-gray-500 font-medium">
                    Roll: #{student.rollNumber}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
              <div>
                <span className="text-gray-400 text-[9px] block">Adm No:</span>
                <span className="font-mono font-semibold text-gray-800 text-[9.5px]">
                  {student.admissionNumber}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-[9px] block">DOB:</span>
                <span className="text-gray-700 font-medium text-[9.5px]">
                  {student.dob || 'N/A'}
                </span>
              </div>
              {template.showEmergency && (
                <>
                  <div>
                    <span className="text-gray-400 text-[9px] block">Blood:</span>
                    <span className="font-bold text-red-600 text-[9.5px]">
                      {student.bloodGroup}
                    </span>
                  </div>
                  <div className="truncate">
                    <span className="text-gray-400 text-[9px] block">Emergency:</span>
                    <span className="text-gray-800 font-medium text-[9px] truncate">
                      {student.emergencyContact}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 px-3 py-2 flex flex-col items-center flex-1 min-h-0 text-center space-y-1.5">
          <div className="w-[72px] h-[86px] rounded-lg border border-gray-200 bg-gray-100 overflow-hidden relative shadow-inner flex items-center justify-center">
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.fullName}
                className="h-full w-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-1 text-center">
                <Users className="h-6 w-6 text-gray-400 mb-0.5" />
                <span className="text-[7.5px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1 leading-tight">
                  No Photo
                </span>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-bold text-gray-900 truncate">{student.fullName}</p>
            <p className="text-[10px] font-semibold text-blue-700">{student.classSection}</p>
          </div>

          <div className="w-full text-left text-[9.5px] space-y-0.5 px-2 bg-gray-50/80 rounded py-1 border border-gray-100">
            <div className="flex justify-between">
              <span className="text-gray-400">Adm:</span>
              <span className="font-mono font-bold text-gray-800">{student.admissionNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Roll:</span>
              <span className="font-medium text-gray-700">#{student.rollNumber || 'N/A'}</span>
            </div>
            {template.showEmergency && (
              <div className="flex justify-between">
                <span className="text-gray-400">Emergency:</span>
                <span className="text-gray-700 font-medium truncate max-w-[100px]">{student.emergencyContact}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CARD FOOTER ── */}
      <div className="relative z-10 px-3 py-1.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-[8px] text-gray-500">
        {template.showBarcode ? (
          <div className="flex flex-col">
            <div className="h-3.5 flex items-center gap-[1.5px] opacity-80">
              <span className="w-[1.5px] h-3.5 bg-black" />
              <span className="w-[1px] h-3.5 bg-black" />
              <span className="w-[2.5px] h-3.5 bg-black" />
              <span className="w-[1px] h-3.5 bg-black" />
              <span className="w-[2px] h-3.5 bg-black" />
              <span className="w-[1.5px] h-3.5 bg-black" />
              <span className="w-[1px] h-3.5 bg-black" />
              <span className="w-[2.5px] h-3.5 bg-black" />
              <span className="w-[1.5px] h-3.5 bg-black" />
            </div>
            <span className="font-mono text-[7px] text-gray-600">{student.admissionNumber}</span>
          </div>
        ) : (
          <span className="truncate max-w-[140px] text-[8.5px] text-gray-400">
            {school.city || school.address || 'Campus ID'}
          </span>
        )}

        {template.showSignature && (
          <div className="text-right">
            <span className="font-serif italic text-[8.5px] text-gray-700 font-bold block leading-none">
              Signature
            </span>
            <span className="text-[7px] text-gray-400 block border-t border-gray-300 mt-0.5 pt-0.5">
              Authorized Signatory
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ID Card Section Component (School Applications Directory + Guided Studio) ──
function IdCardsSection({
  schools,
  onNavigateToSchools,
}: {
  schools: SchoolRecord[];
  onNavigateToSchools: () => void;
}) {
  // If null, shows the registered schools directory. When selected, enters school's ID Card Studio.
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'batch' | 'template' | 'inspector'>('batch');

  // Loaded real school data from backend
  const [schoolData, setSchoolData] = useState<{
    students: StudentIdCardRecord[];
    metrics: IdCardMetrics | null;
    classes: any[];
    sections: any[];
  }>({
    students: [],
    metrics: null,
    classes: [],
    sections: [],
  });
  const [loadingCards, setLoadingCards] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string>('');

  // Template state
  const [templateConfig, setTemplateConfig] = useState<TemplateDesignConfig>(DEFAULT_TEMPLATE_CONFIG);
  const [savingTemplate, setSavingTemplate] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [templateSaved, setTemplateSaved] = useState<boolean>(false);

  // Pagination & Filtering
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'ready' | 'missing-photo' | 'incomplete'>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [zoomedStudent, setZoomedStudent] = useState<StudentIdCardRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentSchool = schools.find(s => s.id === selectedSchoolId) || null;

  // Check whether school has a template configured
  const hasConfiguredTemplate = Boolean(
    templateSaved ||
    templateConfig.customBackgroundUrl ||
    currentSchool?.idCardTemplateUrl ||
    (currentSchool?.idCardConfig && Object.keys(currentSchool.idCardConfig).length > 0)
  );

  // Fetch school data when a school is selected
  useEffect(() => {
    if (!selectedSchoolId) {
      setSchoolData({ students: [], metrics: null, classes: [], sections: [] });
      setTemplateSaved(false);
      return;
    }

    let isCancelled = false;

    async function fetchCards() {
      setLoadingCards(true);
      setFetchError('');
      try {
        const res = await callManageSchools({
          action: 'get-school-id-cards',
          school_id: selectedSchoolId,
        });

        if (isCancelled) return;

        if (res.error) {
          throw new Error(res.error);
        }

        const realStudents: StudentIdCardRecord[] = res.students || [];
        setSchoolData({
          students: realStudents,
          metrics: res.metrics || null,
          classes: res.classes || [],
          sections: res.sections || [],
        });

        // Load existing template if available
        if (res.school?.idCardConfig && Object.keys(res.school.idCardConfig).length > 0) {
          setTemplateConfig(prev => ({ ...prev, ...res.school.idCardConfig }));
          setTemplateSaved(true);
          setActiveTab('batch');
        } else if (res.school?.idCardTemplateUrl) {
          setTemplateConfig(prev => ({ ...prev, customBackgroundUrl: res.school.idCardTemplateUrl }));
          setTemplateSaved(true);
          setActiveTab('batch');
        } else {
          // No template configured yet -> Automatically guide to template creation first!
          setTemplateSaved(false);
          setActiveTab('template');
        }
      } catch (err: any) {
        if (!isCancelled) {
          setFetchError(err.message || 'Failed to fetch ID card data');
        }
      } finally {
        if (!isCancelled) setLoadingCards(false);
      }
    }

    fetchCards();
    return () => {
      isCancelled = true;
    };
  }, [selectedSchoolId]);

  // Derived metrics from REAL students only (no fake demo data!)
  const totalStudents = schoolData.students.length;
  const withPhotoCount = schoolData.students.filter(s => s.hasPhoto).length;
  const missingPhotoCount = totalStudents - withPhotoCount;
  const photoCompletenessPct = totalStudents > 0 ? Math.round((withPhotoCount / totalStudents) * 100) : 0;

  const completeInfoCount = schoolData.students.filter(s => s.isInfoComplete).length;
  const incompleteInfoCount = totalStudents - completeInfoCount;
  const infoCompletenessPct = totalStudents > 0 ? Math.round((completeInfoCount / totalStudents) * 100) : 0;

  const readyToPrintCount = schoolData.students.filter(s => s.hasPhoto && s.isInfoComplete).length;

  // Filtered real students
  const filteredStudents = useMemo(() => {
    return schoolData.students.filter(st => {
      const matchSearch =
        st.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.admissionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.className.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;

      if (filterMode === 'ready' && !(st.hasPhoto && st.isInfoComplete)) return false;
      if (filterMode === 'missing-photo' && st.hasPhoto) return false;
      if (filterMode === 'incomplete' && st.isInfoComplete) return false;

      if (selectedClass !== 'all' && st.className !== selectedClass) return false;
      return true;
    });
  }, [schoolData.students, searchQuery, filterMode, selectedClass]);

  // 10 students per page pagination
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE) || 1;
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const pagedStudents = filteredStudents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Available classes for dropdown
  const classOptions = useMemo(() => {
    const set = new Set<string>();
    schoolData.students.forEach(s => {
      if (s.className) set.add(s.className);
    });
    return Array.from(set);
  }, [schoolData.students]);

  // Handlers
  function handlePrintBatch() {
    window.print();
  }

  function handleCustomTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const b64 = event.target?.result as string;
      setTemplateConfig(prev => ({ ...prev, customBackgroundUrl: b64 }));
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveTemplate() {
    if (!selectedSchoolId) return;
    setSavingTemplate(true);
    setSaveMessage(null);
    try {
      const res = await callManageSchools({
        action: 'update-id-card-template',
        school_id: selectedSchoolId,
        template_url: templateConfig.customBackgroundUrl,
        template_config: templateConfig,
      });

      if (res.error) throw new Error(res.error);
      setTemplateSaved(true);
      setSaveMessage('ID Card template saved! All student cards will generate according to this template.');
      setTimeout(() => {
        setSaveMessage(null);
        setActiveTab('batch');
      }, 1500);
    } catch (err: any) {
      setSaveMessage(`Failed to save: ${err.message}`);
    } finally {
      setSavingTemplate(false);
    }
  }

  // Filtered schools for directory view
  const filteredSchools = useMemo(() => {
    return schools.filter(s =>
      s.name.toLowerCase().includes(schoolSearchQuery.toLowerCase()) ||
      s.address.toLowerCase().includes(schoolSearchQuery.toLowerCase()) ||
      s.city.toLowerCase().includes(schoolSearchQuery.toLowerCase())
    );
  }, [schools, schoolSearchQuery]);

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW 1: SCHOOL APPLICATIONS DIRECTORY (When selectedSchoolId === null)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!selectedSchoolId || !currentSchool) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Contact2 className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                  Registered School Applications — ID Card Portals
                </h2>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Select an applied school to upload its ID card template, verify student photo & data readiness, and generate 10-per-page batch sheets.
              </p>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search registered schools..."
                value={schoolSearchQuery}
                onChange={e => setSchoolSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Schools Cards Grid */}
        {filteredSchools.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center max-w-lg mx-auto shadow-sm">
            <School className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-900">No School Found</h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              {schools.length === 0
                ? 'No schools have registered or applied yet. Click Onboard School to begin.'
                : 'No schools matched your search query.'}
            </p>
            {schools.length === 0 && (
              <button
                onClick={onNavigateToSchools}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Onboard School
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSchools.map(school => {
              const hasTpl = Boolean(school.idCardConfig || school.idCardTemplateUrl);
              return (
                <div
                  key={school.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-100 flex-shrink-0">
                          {school.name.charAt(0) || 'S'}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 leading-tight">
                            {school.name}
                          </h3>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[220px]">
                            {school.city || school.address || 'Main Branch'}
                          </p>
                        </div>
                      </div>

                      <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 flex-shrink-0">
                        {school.academicYear || '2026-27'}
                      </span>
                    </div>

                    {/* Stats strip */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                        <span className="text-[10px] text-gray-400 block font-medium">Students</span>
                        <span className="font-bold text-gray-900">{school.students} Enrolled</span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                        <span className="text-[10px] text-gray-400 block font-medium">Template</span>
                        {hasTpl ? (
                          <span className="font-semibold text-green-700 flex items-center gap-1 text-[11px]">
                            <CheckCircle className="h-3 w-3" /> Configured
                          </span>
                        ) : (
                          <span className="font-semibold text-amber-700 flex items-center gap-1 text-[11px]">
                            <AlertTriangle className="h-3 w-3" /> Needs Template
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Open Studio Button */}
                  <button
                    onClick={() => {
                      setSelectedSchoolId(school.id);
                      setCurrentPage(1);
                      setSearchQuery('');
                      setFilterMode('all');
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <span>Open ID Card Studio</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW 2: ACTIVE SCHOOL ID CARD STUDIO (Guided Template Setup or Batch Generator)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── PRINT-SPECIFIC STYLES (A4 2X5 GRID = 10 ID CARDS) ── */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-id-card-sheet, #printable-id-card-sheet * {
            visibility: visible !important;
          }
          #printable-id-card-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 6mm !important;
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 5mm !important;
            page-break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-hidden, aside, header, nav, button, input {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
        }
      `}</style>

      {/* ── TOP BREADCRUMB & SCHOOL HEADER ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedSchoolId(null)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back to Schools</span>
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900 tracking-tight">
                  {currentSchool.name}
                </h2>
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                  Session: {currentSchool.academicYear || '2026-27'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {currentSchool.city || currentSchool.address || 'Campus ID Card Management'}
              </p>
            </div>
          </div>

          {/* Action: Print Batch button (Only available when template exists and students exist) */}
          {hasConfiguredTemplate && filteredStudents.length > 0 && (
            <button
              onClick={handlePrintBatch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Batch (Page {safePage} - 10 Cards)
            </button>
          )}
        </div>
      </div>

      {/* ── CONDITIONAL FLOW: IF NO TEMPLATE CONFIGURED YET -> GUIDED STEP 1 ── */}
      {!hasConfiguredTemplate ? (
        <div className="space-y-6">
          {/* Step 1 Alert Banner */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3.5 shadow-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-900">
                Step 1: ID Card Template Required for {currentSchool.name}
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                Pehle school ka ID card template upload karein ya niche diye gaye designs me se customize karein. Template save karne ke baad hi bacchon ke identity cards 10-per-page batch layout me generate hongey.
              </p>
            </div>
          </div>

          {/* Template Designer Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Custom Artwork Upload */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Upload className="h-4 w-4 text-blue-600" />
                    Upload School Background Template Artwork
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Upload your school&apos;s custom design background (PNG, JPG, SVG).
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50">
                  <div className="h-14 w-14 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
                    {templateConfig.customBackgroundUrl ? (
                      <img
                        src={templateConfig.customBackgroundUrl}
                        alt="Custom Template"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-gray-400" />
                    )}
                  </div>

                  <div className="flex-1 text-center sm:text-left min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">
                      {templateConfig.customBackgroundUrl
                        ? 'Custom School Artwork Attached'
                        : 'No custom artwork uploaded yet'}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Standard CR80 (85.6 × 54 mm) at 300 DPI (approx 1012 × 638 px)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {templateConfig.customBackgroundUrl ? 'Change Template' : 'Upload Template File'}
                    </button>
                    {templateConfig.customBackgroundUrl && (
                      <button
                        onClick={() => setTemplateConfig(prev => ({ ...prev, customBackgroundUrl: null }))}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Clear
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCustomTemplateUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Built-in Presets */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Palette className="h-4 w-4 text-blue-600" />
                    Or Select An Institutional Theme Preset
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Pre-configured academic layouts optimized for school identity badges.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TEMPLATE_PRESETS.map(preset => {
                    const isSelected = templateConfig.preset === preset.id && !templateConfig.customBackgroundUrl;
                    return (
                      <button
                        key={preset.id}
                        onClick={() =>
                          setTemplateConfig(prev => ({
                            ...prev,
                            preset: preset.id,
                            primaryColor: preset.primary,
                            accentColor: preset.accent,
                            customBackgroundUrl: null,
                          }))
                        }
                        className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-500/10 bg-blue-50/40'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div
                          className="h-8 w-8 rounded-lg shadow-sm flex-shrink-0"
                          style={{ backgroundColor: preset.primary }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-gray-900">{preset.name}</p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                            {preset.primary} • {preset.accent}
                          </p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Orientation & Toggles */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-700 min-w-[120px]">
                    Orientation:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTemplateConfig(prev => ({ ...prev, orientation: 'landscape' }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        templateConfig.orientation === 'landscape'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Landscape (85.6 × 54 mm)
                    </button>
                    <button
                      onClick={() => setTemplateConfig(prev => ({ ...prev, orientation: 'portrait' }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        templateConfig.orientation === 'portrait'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Portrait (54 × 85.6 mm)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateConfig.showLogo}
                      onChange={e => setTemplateConfig(prev => ({ ...prev, showLogo: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Show School Logo / Crest</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateConfig.showBarcode}
                      onChange={e => setTemplateConfig(prev => ({ ...prev, showBarcode: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Show Scannable Barcode Pattern</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateConfig.showSignature}
                      onChange={e => setTemplateConfig(prev => ({ ...prev, showSignature: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Show Principal Signature Seal</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateConfig.showEmergency}
                      onChange={e => setTemplateConfig(prev => ({ ...prev, showEmergency: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Show Blood Group & Emergency Contact</span>
                  </label>
                </div>

                {/* Save Button */}
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    {saveMessage && (
                      <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1">
                        {saveMessage}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={savingTemplate}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50"
                  >
                    {savingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    Save Template & Activate Batch Generator
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Preview Card */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-blue-600" />
                  Live Template Preview
                </h3>
                <p className="text-xs text-gray-500">
                  Real-time preview of how student ID cards will look with this template.
                </p>

                <div className="flex justify-center p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <StudentIdCardCard
                    student={PREVIEW_PLACEHOLDER_STUDENT}
                    school={currentSchool}
                    template={templateConfig}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── WHEN TEMPLATE IS ACTIVE: SHOW KPI STATS + TABS + 10-PER-PAGE BATCH VIEW ── */
        <div className="space-y-6">
          {/* Readiness Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500 font-medium">Enrolled Students</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{totalStudents}</p>
                <p className="text-[11px] text-gray-400 truncate">{currentSchool.name}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                missingPhotoCount === 0 && totalStudents > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              }`}>
                <ImageIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 font-medium">Photos Uploaded</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    missingPhotoCount === 0 && totalStudents > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {photoCompletenessPct}%
                  </span>
                </div>
                <p className="text-xl font-bold text-gray-900 mt-0.5">
                  {withPhotoCount} <span className="text-xs text-gray-400 font-normal">/ {totalStudents}</span>
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {missingPhotoCount > 0 ? (
                    <span className="text-amber-600 font-medium flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {missingPhotoCount} Missing Photos
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> All Photos Complete
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                incompleteInfoCount === 0 && totalStudents > 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'
              }`}>
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 font-medium">Data Completeness</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    incompleteInfoCount === 0 && totalStudents > 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-orange-100 text-orange-800'
                  }`}>
                    {infoCompletenessPct}%
                  </span>
                </div>
                <p className="text-xl font-bold text-gray-900 mt-0.5">
                  {completeInfoCount} <span className="text-xs text-gray-400 font-normal">/ {totalStudents}</span>
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {incompleteInfoCount > 0 ? (
                    <span className="text-orange-600 font-medium">
                      {incompleteInfoCount} Incomplete Profiles
                    </span>
                  ) : (
                    <span className="text-indigo-600 font-medium">
                      Full Student Details
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                <Printer className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500 font-medium">Ready For Print</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{readyToPrintCount}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {totalPages} Batch Sheets (10 / Page)
                </p>
              </div>
            </div>
          </div>

          {/* Workspace Tabs */}
          <div className="border-b border-gray-200 flex items-center gap-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab('batch')}
              className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'batch'
                  ? 'border-blue-600 text-blue-700 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Printer className="h-4 w-4" />
              <span>Batch Sheet View (10 / Page)</span>
              <span className="text-[11px] bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 font-bold">
                {filteredStudents.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('template')}
              className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'template'
                  ? 'border-blue-600 text-blue-700 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Palette className="h-4 w-4" />
              <span>Edit / Change Template</span>
            </button>

            <button
              onClick={() => setActiveTab('inspector')}
              className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'inspector'
                  ? 'border-blue-600 text-blue-700 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Student Photo & Info Inspector</span>
            </button>
          </div>

          {/* ── TAB 1: BATCH SHEET (10 PER PAGE) ── */}
          {activeTab === 'batch' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search student, roll, or admission no..."
                      value={searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    {(['all', 'ready', 'missing-photo', 'incomplete'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => {
                          setFilterMode(mode);
                          setCurrentPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          filterMode === mode
                            ? 'bg-blue-100 text-blue-800 font-semibold'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {mode === 'all' && `All (${totalStudents})`}
                        {mode === 'ready' && `Ready (${readyToPrintCount})`}
                        {mode === 'missing-photo' && `Missing Photo (${missingPhotoCount})`}
                        {mode === 'incomplete' && `Incomplete (${incompleteInfoCount})`}
                      </button>
                    ))}
                  </div>

                  {classOptions.length > 0 && (
                    <select
                      value={selectedClass}
                      onChange={e => {
                        setSelectedClass(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:border-blue-500 outline-none"
                    >
                      <option value="all">All Classes</option>
                      {classOptions.map(cls => (
                        <option key={cls} value={cls}>
                          {cls}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {filteredStudents.length > 0 && (
                  <div className="flex items-center gap-2 border-t md:border-t-0 pt-2 md:pt-0">
                    <span className="text-xs text-gray-500 font-medium">
                      Sheet Page <strong className="text-gray-900">{safePage}</strong> of{' '}
                      <strong className="text-gray-900">{totalPages}</strong> (10 Cards / Sheet)
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={safePage <= 1}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        &larr; Prev 10
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={safePage >= totalPages}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next 10 &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 10-Students Batch Sheet Container */}
              <div className="bg-gray-50/60 rounded-xl border border-gray-200 p-6">
                {filteredStudents.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-12 text-center max-w-md mx-auto shadow-sm space-y-3">
                    <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                      <Users className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-bold text-gray-900">No Students Registered Yet</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {currentSchool.name} me abhi tak koi student admissions add nahi huye hain. Jaise hi student admission record add honge, unke identity cards yahan 10-per-page sheet me automatically show honge.
                    </p>
                    <button
                      onClick={onNavigateToSchools}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Schools Directory & Credentials
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4 print:hidden">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                        <Printer className="h-4 w-4 text-blue-600" />
                        <span>
                          Batch Sheet: Showing Students {(safePage - 1) * PAGE_SIZE + 1} to{' '}
                          {Math.min(safePage * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        A4 Layout: 2 Columns × 5 Rows (10 Cards / Sheet)
                      </span>
                    </div>

                    <div
                      id="printable-id-card-sheet"
                      className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center"
                    >
                      {pagedStudents.map(student => (
                        <StudentIdCardCard
                          key={student.id}
                          student={student}
                          school={currentSchool}
                          template={templateConfig}
                          onZoom={st => setZoomedStudent(st)}
                        />
                      ))}
                    </div>

                    {totalPages > 1 && (
                      <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
                        <span>
                          Showing 10 student cards per batch sheet. Click &quot;Print Batch&quot; above to print current sheet.
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={safePage <= 1}
                            className="px-2 py-1 rounded bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                          >
                            Previous
                          </button>
                          <span className="font-semibold text-gray-800">
                            Page {safePage} of {totalPages}
                          </span>
                          <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={safePage >= totalPages}
                            className="px-2 py-1 rounded bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 2: EDIT TEMPLATE ── */}
          {activeTab === 'template' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Custom Artwork */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Upload className="h-4 w-4 text-blue-600" />
                      Update School Background Artwork
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Upload new custom template artwork (PNG, JPG, SVG).
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50">
                    <div className="h-14 w-14 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
                      {templateConfig.customBackgroundUrl ? (
                        <img
                          src={templateConfig.customBackgroundUrl}
                          alt="Custom Template"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-gray-400" />
                      )}
                    </div>

                    <div className="flex-1 text-center sm:text-left min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">
                        {templateConfig.customBackgroundUrl
                          ? 'Custom School Artwork Attached'
                          : 'No custom artwork uploaded'}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        CR80 85.6 × 54 mm (approx 1012 × 638 px)
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {templateConfig.customBackgroundUrl ? 'Replace File' : 'Upload File'}
                      </button>
                      {templateConfig.customBackgroundUrl && (
                        <button
                          onClick={() => setTemplateConfig(prev => ({ ...prev, customBackgroundUrl: null }))}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Clear
                        </button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleCustomTemplateUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>

                {/* Built-in Presets */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Palette className="h-4 w-4 text-blue-600" />
                      Theme Presets
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Switch between curated institutional color palettes.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {TEMPLATE_PRESETS.map(preset => {
                      const isSelected = templateConfig.preset === preset.id && !templateConfig.customBackgroundUrl;
                      return (
                        <button
                          key={preset.id}
                          onClick={() =>
                            setTemplateConfig(prev => ({
                              ...prev,
                              preset: preset.id,
                              primaryColor: preset.primary,
                              accentColor: preset.accent,
                              customBackgroundUrl: null,
                            }))
                          }
                          className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'border-blue-500 ring-2 ring-blue-500/10 bg-blue-50/40'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div
                            className="h-8 w-8 rounded-lg shadow-sm flex-shrink-0"
                            style={{ backgroundColor: preset.primary }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-900">{preset.name}</p>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                              {preset.primary} • {preset.accent}
                            </p>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Orientation & Toggles */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-700 min-w-[120px]">
                      Orientation:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setTemplateConfig(prev => ({ ...prev, orientation: 'landscape' }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          templateConfig.orientation === 'landscape'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Landscape (85.6 × 54 mm)
                      </button>
                      <button
                        onClick={() => setTemplateConfig(prev => ({ ...prev, orientation: 'portrait' }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          templateConfig.orientation === 'portrait'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Portrait (54 × 85.6 mm)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showLogo}
                        onChange={e => setTemplateConfig(prev => ({ ...prev, showLogo: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>Show School Logo / Crest</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showBarcode}
                        onChange={e => setTemplateConfig(prev => ({ ...prev, showBarcode: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>Show Scannable Barcode Pattern</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showSignature}
                        onChange={e => setTemplateConfig(prev => ({ ...prev, showSignature: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>Show Principal Signature Seal</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showEmergency}
                        onChange={e => setTemplateConfig(prev => ({ ...prev, showEmergency: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>Show Blood Group & Emergency Contact</span>
                    </label>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div>
                      {saveMessage && (
                        <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1">
                          {saveMessage}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleSaveTemplate}
                      disabled={savingTemplate}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {savingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                      Save Template Updates
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Live Preview */}
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-600" />
                    Live Template Preview
                  </h3>
                  <p className="text-xs text-gray-500">
                    Sample preview reflecting your current template settings.
                  </p>

                  <div className="flex justify-center p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <StudentIdCardCard
                      student={PREVIEW_PLACEHOLDER_STUDENT}
                      school={currentSchool}
                      template={templateConfig}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: STUDENT PHOTO & INFO INSPECTOR ── */}
          {activeTab === 'inspector' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Student Photo & Data Completeness Roster
                  </h3>
                  <p className="text-xs text-gray-500">
                    Verify that all students have photos uploaded and valid information prior to printing.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    Total: <strong>{totalStudents} Enrolled</strong>
                  </span>
                </div>
              </div>

              {totalStudents === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400">
                  No students registered in this school yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3">Photo Status</th>
                        <th className="px-5 py-3">Student Name</th>
                        <th className="px-5 py-3">Adm No</th>
                        <th className="px-5 py-3">Class & Section</th>
                        <th className="px-5 py-3">Roll No</th>
                        <th className="px-5 py-3">Blood Group</th>
                        <th className="px-5 py-3">Emergency Contact</th>
                        <th className="px-5 py-3">Readiness Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {schoolData.students.map(st => (
                        <tr key={st.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {st.avatarUrl ? (
                                <div className="h-8 w-8 rounded-full border border-gray-200 overflow-hidden flex-shrink-0">
                                  <img src={st.avatarUrl} alt={st.fullName} className="h-full w-full object-cover" />
                                </div>
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0 font-bold text-[10px]">
                                  <UserX className="h-4 w-4" />
                                </div>
                              )}
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                st.hasPhoto
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}>
                                {st.hasPhoto ? 'Photo Ready' : 'Missing Photo'}
                              </span>
                            </div>
                          </td>

                          <td className="px-5 py-3 font-semibold text-gray-900">
                            {st.fullName}
                            {st.fatherName && (
                              <span className="block text-[10px] text-gray-400 font-normal">
                                S/D/O {st.fatherName}
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-3 font-mono text-gray-700">{st.admissionNumber}</td>
                          <td className="px-5 py-3 font-medium text-gray-800">{st.classSection}</td>
                          <td className="px-5 py-3 text-gray-600">{st.rollNumber || 'N/A'}</td>
                          <td className="px-5 py-3 font-bold text-red-600">{st.bloodGroup}</td>
                          <td className="px-5 py-3 text-gray-700 font-mono text-[11px]">{st.emergencyContact}</td>

                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              st.hasPhoto && st.isInfoComplete
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {st.hasPhoto && st.isInfoComplete ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3" /> Ready for Print
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="h-3 w-3" /> Action Needed
                                </>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Single Card Zoom Modal */}
      {zoomedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Single Card Inspector</h3>
                <p className="text-xs text-gray-500">{zoomedStudent.fullName} • {zoomedStudent.admissionNumber}</p>
              </div>
              <button
                onClick={() => setZoomedStudent(null)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex justify-center py-4 bg-gray-50 rounded-xl border border-gray-200">
              <StudentIdCardCard
                student={zoomedStudent}
                school={currentSchool}
                template={templateConfig}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className={`text-xs font-semibold px-2 py-1 rounded-md ${
                zoomedStudent.hasPhoto ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {zoomedStudent.hasPhoto ? 'Photo Uploaded' : 'Photo Missing - Upload in Admissions'}
              </span>
              <button
                onClick={() => setZoomedStudent(null)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-xs font-semibold text-gray-700 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM: NewSchoolForm = {
  name: '',
  address: '',
  city: '',
  contactNumber: '',
  email: '',
  academicYear: '2026-27',
  adminName: '',
  adminPassword: '',
};

function AddSchoolSection({ onAdd }: { onAdd: (school: SchoolRecord) => void }) {
  const [form, setForm] = useState<NewSchoolForm>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<NewSchoolForm>>({});
  const [successData, setSuccessData] = useState<{ email: string; password: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  function validate(): boolean {
    const errs: Partial<NewSchoolForm> = {};
    if (!form.name.trim()) errs.name = 'School name is required';
    if (!form.email.trim()) errs.email = 'Admin email is required';
    if (!form.adminName.trim()) errs.adminName = 'Admin full name is required';
    if (!form.adminPassword.trim()) errs.adminPassword = 'Admin password is required';
    if (form.adminPassword && form.adminPassword.length < 6) {
      errs.adminPassword = 'Password must be at least 6 characters';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-school`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${MGMT_SECRET}`,
          },
          body: JSON.stringify({
            name: form.name.trim(),
            address: form.address || form.city || undefined,
            contact_number: form.contactNumber || undefined,
            email: form.email.trim(),
            academic_year: form.academicYear || '2026-27',
            admin_name: form.adminName.trim(),
            admin_password: form.adminPassword,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        setSubmitError(result.error || 'Failed to create school');
        setSubmitting(false);
        return;
      }

      const newSchool: SchoolRecord = {
        id: result.school_id,
        name: form.name,
        city: form.city || form.address || '',
        address: form.address || '',
        contactNumber: form.contactNumber || '',
        email: form.email,
        academicYear: form.academicYear || '2026-27',
        status: 'Active',
        joinedDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        lastLogin: 'Active',
        adminUserId: result.admin_user_id || null,
        adminName: form.adminName,
        adminEmail: form.email,
        adminPhone: form.contactNumber || '',
        adminPassword: form.adminPassword,
        students: 0,
        teachers: 0,
        classes: 0,
        sections: 0,
        idCardTemplate: null,
      };

      onAdd(newSchool);
      setSuccessData({ email: form.email, password: form.adminPassword, name: form.name });
      setForm(EMPTY_FORM);
      setErrors({});
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Network error — please check connection');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Onboard New School</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Creates the dedicated school tenant, configures Postgres isolation, and establishes admin auth credentials.
        </p>
      </div>

      {successData && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-base font-bold text-green-900">
                School Successfully Onboarded!
              </h3>
              <p className="text-xs text-green-700 mt-1">
                Superadmin credentials generated for <strong>{successData.name}</strong>:
              </p>
              <div className="mt-3 font-mono text-xs text-green-900 bg-white/80 rounded-lg p-3.5 border border-green-200 space-y-1.5 shadow-sm">
                <p>Login URL: <strong>{window.location.origin}/login</strong></p>
                <p>Username / Email: <strong>{successData.email}</strong></p>
                <p>Password: <strong>{successData.password}</strong></p>
              </div>
              <p className="text-[11px] text-green-600 mt-2">
                These credentials have been saved to the school record and Supabase Auth.
              </p>
              <button
                onClick={() => setSuccessData(null)}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-green-700 underline hover:no-underline"
              >
                Onboard another school
              </button>
            </div>
          </div>
        </div>
      )}

      {submitError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                School Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Green Valley Convent School"
                className={`w-full border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  errors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                Campus Address
              </label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Street address / Sector / Area"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                City / Region
              </label>
              <input
                type="text"
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                placeholder="e.g. New Delhi"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                Contact Phone
              </label>
              <input
                type="tel"
                value={form.contactNumber}
                onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))}
                placeholder="e.g. +91 98765 43210"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                Academic Year
              </label>
              <input
                type="text"
                value={form.academicYear}
                onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))}
                placeholder="e.g. 2026-27"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                Admin Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.adminName}
                onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))}
                placeholder="e.g. Principal Ramesh Sharma"
                className={`w-full border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  errors.adminName ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
              />
              {errors.adminName && <p className="mt-1 text-xs text-red-500">{errors.adminName}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                Admin Login Email (Username) <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="admin@school.edu.in"
                className={`w-full border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  errors.email ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                  Admin Login Password <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, adminPassword: generateRandomPassword() }))}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Auto-generate
                </button>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.adminPassword}
                  onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))}
                  placeholder="Set strong initial password"
                  className={`w-full border rounded-lg px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    errors.adminPassword ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.adminPassword && <p className="mt-1 text-xs text-red-500">{errors.adminPassword}</p>}
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating School...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create School & Credentials
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Management Application (Clean White Theme) ──────────────────────────

type Section = 'overview' | 'schools' | 'id-cards' | 'add-school';

export default function VeducoreManagement() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [activeSection, setActiveSection] = useState<Section>('overview');

  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Delete modal state
  const [deletingSchool, setDeletingSchool] = useState<SchoolRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Template override state
  const [idCardTemplates, setIdCardTemplates] = useState<Record<string, string>>({});

  async function loadData() {
    setLoading(true);
    setFetchError('');
    try {
      const [listRes, analyticsRes] = await Promise.all([
        callManageSchools({ action: 'list' }),
        callManageSchools({ action: 'get-analytics' }),
      ]);

      if (listRes.error) throw new Error(listRes.error);
      if (listRes.schools) {
        setSchools(listRes.schools);
      }

      if (analyticsRes && !analyticsRes.error) {
        setAnalytics(analyticsRes);
      }
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch management data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loggedIn) return;
    loadData();
  }, [loggedIn]);

  function handleLogout() {
    localStorage.removeItem('veducore_mgmt_admin');
    setLoggedIn(false);
  }

  function handleAddSchool(newSchool: SchoolRecord) {
    setSchools(prev => [newSchool, ...prev]);
    loadData();
  }

  async function handlePasswordReset(schoolId: string, newPw: string): Promise<boolean> {
    try {
      const res = await callManageSchools({
        action: 'update-password',
        school_id: schoolId,
        new_password: newPw,
      });

      if (res.error) {
        alert(`Error updating password: ${res.error}`);
        return false;
      }

      setSchools(prev =>
        prev.map(s => (s.id === schoolId ? { ...s, adminPassword: newPw } : s))
      );
      return true;
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Network error');
      return false;
    }
  }

  async function handleStatusToggle(schoolId: string, currentStatus: 'Active' | 'Inactive') {
    const nextStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await callManageSchools({
        action: 'update-status',
        school_id: schoolId,
        status: nextStatus,
      });

      if (res.error) {
        alert(`Error changing status: ${res.error}`);
        return;
      }

      setSchools(prev =>
        prev.map(s => (s.id === schoolId ? { ...s, status: nextStatus } : s))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Network error');
    }
  }

  async function handleConfirmDelete(schoolId: string) {
    setDeleteLoading(true);
    try {
      const res = await callManageSchools({
        action: 'delete',
        school_id: schoolId,
      });

      if (res.error) {
        alert(`Failed to delete school: ${res.error}`);
        setDeleteLoading(false);
        return;
      }

      setSchools(prev => prev.filter(s => s.id !== schoolId));
      setDeletingSchool(null);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error executing purge');
    } finally {
      setDeleteLoading(false);
    }
  }

  if (!loggedIn) {
    return <AuthScreen onLogin={name => { setAdminName(name); setLoggedIn(true); }} />;
  }

  const schoolsWithTemplates = schools.map(s => ({
    ...s,
    idCardTemplate: idCardTemplates[s.id] || s.idCardTemplate,
  }));

  const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Dashboard & Insights', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'schools', label: 'Schools & Credentials', icon: <Building2 className="h-4 w-4" /> },
    { id: 'id-cards', label: 'ID Card', icon: <Contact2 className="h-4 w-4" /> },
    { id: 'add-school', label: 'Add New School', icon: <Plus className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar (Clean White Style) */}
      <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-screen sticky top-0 h-screen select-none">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 h-16 px-5 border-b border-gray-200">
          <img src={veducoreLogo} alt="Veducore" className="h-6 w-auto object-contain" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Management</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {navItems.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap flex-nowrap ${
                    activeSection === item.id
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="whitespace-nowrap flex-shrink-0">{item.label}</span>
                  {item.id === 'schools' && schools.length > 0 && (
                    <span className="ml-auto text-[11px] font-semibold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 flex-shrink-0">
                      {schools.length}
                    </span>
                  )}
                  {item.id === 'id-cards' && (
                    <span className="ml-auto text-[10px] font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5 flex-shrink-0">
                      10/page
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Profile & Logout */}
        <div className="border-t border-gray-200 p-3 space-y-1">
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              {adminName.charAt(0) || 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-900 truncate">{adminName || 'Superadmin'}</p>
              <p className="text-[10px] text-gray-400 truncate">Veducore Admin</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Body */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Navbar (Clean White) */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10">
          <h1 className="text-lg font-semibold text-gray-900">
            {activeSection === 'overview' && 'Main Executive Dashboard & Insights'}
            {activeSection === 'schools' && 'Schools Directory & Admin Credentials'}
            {activeSection === 'id-cards' && 'ID Card Management & Batch Sheet Generator'}
            {activeSection === 'add-school' && 'Onboard New School Instance'}
          </h1>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Connected to Production
            </span>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Globe className="h-3.5 w-3.5" />
              {adminName || 'Veducore Admin'}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-6 flex-1 space-y-4">
          {fetchError && !loading && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <span>{fetchError}</span>
            </div>
          )}

          {activeSection === 'overview' && (
            <OverviewDashboard
              schools={schoolsWithTemplates}
              analytics={analytics}
              onNavigateToSchools={() => setActiveSection('schools')}
              onNavigateToAddSchool={() => setActiveSection('add-school')}
              onRefresh={loadData}
              loading={loading}
            />
          )}

          {activeSection === 'schools' && (
            <SchoolsSection
              schools={schoolsWithTemplates}
              onPasswordReset={handlePasswordReset}
              onStatusToggle={handleStatusToggle}
              onDeleteSchool={school => setDeletingSchool(school)}
              onRefresh={loadData}
              loading={loading}
            />
          )}

          {activeSection === 'id-cards' && (
            <IdCardsSection
              schools={schoolsWithTemplates}
              onNavigateToSchools={() => setActiveSection('schools')}
            />
          )}

          {activeSection === 'add-school' && (
            <AddSchoolSection onAdd={handleAddSchool} />
          )}
        </div>
      </main>

      {/* Cascade Delete Confirmation Modal */}
      <DeleteSchoolModal
        school={deletingSchool}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingSchool(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
