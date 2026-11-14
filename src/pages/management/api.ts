// API client for the Veducore management portal.
//
// Superadmins sign in with Supabase Auth on a client of their own
// (separate storage key), so a school login in the same browser is
// never touched. Every call sends the access token; manage-schools
// verifies it against veducore_admins.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const mgmtSupabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storageKey: 'veducore-mgmt-auth',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export class MgmtError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Fired when the server rejects the session, so the shell can sign out. */
export const SESSION_EXPIRED_EVENT = 'veducore-mgmt-session-expired';

export async function callManageSchools<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  if (!mgmtSupabase) throw new MgmtError(500, 'Supabase is not configured');
  const { data } = await mgmtSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new MgmtError(401, 'Not signed in');
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-schools`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  let json: { error?: string; message?: string } & Record<string, unknown> = {};
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || json?.error) {
    if (res.status === 401 || res.status === 403) {
      if (res.status === 401 || /not a Veducore team member|disabled/i.test(json?.error ?? '')) {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
    }
    throw new MgmtError(res.status, json?.error || json?.message || `Request failed (${res.status})`);
  }
  return json as T;
}

export async function callMgmtAuth(body: Record<string, string>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mgmt-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) throw new MgmtError(res.status, json?.error || 'Request failed');
  return json as Record<string, unknown>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type TeamRole = 'owner' | 'admin' | 'support';

export interface Me {
  id: string;
  email: string;
  full_name: string;
  role: TeamRole;
}

export interface Subscription {
  planId: string | null;
  planName: string | null;
  planCode: string | null;
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  priceOverride: number | null;
  studentLimit: number | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  notes: string | null;
  amount: number;
  mrr: number;
}

export type SchoolHealth = 'healthy' | 'at_risk' | 'inactive' | 'setup' | 'suspended';

export interface SchoolRecord {
  id: string;
  name: string;
  address: string;
  city: string;
  contactNumber: string;
  email: string;
  academicYear: string;
  logoUrl: string | null;
  status: 'Active' | 'Suspended';
  suspendedAt: string | null;
  suspensionReason: string | null;
  disabledModules: string[];
  createdAt: string;
  adminUserId: string | null;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string | null;
  students: number;
  activeStudents: number;
  teachers: number;
  parents: number;
  classes: number;
  sections: number;
  attendance30d: number;
  lastAttendance: string | null;
  feesCollected30d: number;
  onlinePaid30d: number;
  onlineVolume30d: number;
  notifications30d: number;
  gateway: { active: boolean; mode: 'live' | 'test'; verifiedAt: string | null } | null;
  subscription: Subscription | null;
  health?: SchoolHealth;
  idCardTemplateUrl?: string | null;
  idCardConfig?: unknown;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  base_price: number;
  price_per_student: number;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly';
  max_students: number | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  school_id: string;
  school_name?: string;
  description: string;
  period_start: string | null;
  period_end: string | null;
  amount: number;
  tax_amount: number;
  total_amount: number;
  status: 'draft' | 'issued' | 'paid' | 'void';
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  school_id: string | null;
  school_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

/** Admin-panel modules a school can be switched off from. */
export const SCHOOL_MODULES: { key: string; label: string; group: string }[] = [
  { key: 'students', label: 'Students', group: 'People' },
  { key: 'admissions', label: 'New Admission', group: 'People' },
  { key: 'parents', label: 'Parents', group: 'People' },
  { key: 'teachers', label: 'Teachers', group: 'People' },
  { key: 'classes', label: 'Classes & Sections', group: 'Academics' },
  { key: 'subjects', label: 'Subjects', group: 'Academics' },
  { key: 'timetable', label: 'Timetable', group: 'Academics' },
  { key: 'attendance', label: 'Attendance', group: 'Academics' },
  { key: 'exams', label: 'Exams & Results', group: 'Academics' },
  { key: 'sessions', label: 'Academic Year', group: 'Academics' },
  { key: 'fees', label: 'Fees & Online Payments', group: 'Finance' },
  { key: 'transport', label: 'Transport', group: 'Operations' },
  { key: 'tracking', label: 'Student Tracking', group: 'Operations' },
  { key: 'id_cards', label: 'ID Cards', group: 'Operations' },
  { key: 'documents', label: 'Documents', group: 'Operations' },
  { key: 'holidays', label: 'Holidays', group: 'General' },
  { key: 'notifications', label: 'Notifications', group: 'General' },
];

// ── Formatting ───────────────────────────────────────────────────────────────

/** paise → "₹1,23,456" */
export function rupees(paise: number | null | undefined, opts: { decimals?: boolean } = {}) {
  const v = Number(paise ?? 0) / 100;
  return '₹' + v.toLocaleString('en-IN', {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  });
}

/** rupees (decimal) → "₹1,23,456" */
export function rupeesFromDecimal(v: number | null | undefined) {
  return '₹' + Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function compactRupees(paise: number) {
  const v = paise / 100;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(v >= 1e8 ? 0 : 1)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)} L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`;
  return `₹${Math.round(v)}`;
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(d: string | null | undefined) {
  if (!d) return 'never';
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(d);
}

export function daysUntil(d: string | null | undefined) {
  if (!d) return null;
  const t = new Date(d.length === 10 ? d + 'T00:00:00' : d).getTime();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((t - start.getTime()) / 86_400_000);
}

export function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars.charAt(b % chars.length)).join('');
}

export function errMsg(err: unknown) {
  return err instanceof Error ? err.message : 'Something went wrong';
}

/** Human label for an audit action like "school.suspended". */
export function actionLabel(action: string) {
  const map: Record<string, string> = {
    'school.created': 'Onboarded school',
    'school.updated': 'Edited school profile',
    'school.suspended': 'Suspended school',
    'school.reactivated': 'Reactivated school',
    'school.deleted': 'Deleted school',
    'school.modules_changed': 'Changed modules',
    'school.admin_password_reset': 'Reset admin password',
    'school.impersonated': 'Signed in as school admin',
    'school.id_card_template_saved': 'Saved ID card template',
    'subscription.updated': 'Updated subscription',
    'plan.created': 'Created plan',
    'plan.updated': 'Updated plan',
    'invoice.created': 'Created invoice',
    'invoice.paid': 'Marked invoice paid',
    'invoice.void': 'Voided invoice',
    'invoice.issued': 'Re-issued invoice',
    'invoice.draft': 'Moved invoice to draft',
    'announcement.created': 'Published announcement',
    'announcement.deleted': 'Deleted announcement',
    'announcement.activated': 'Activated announcement',
    'announcement.deactivated': 'Deactivated announcement',
    'ticket.replied': 'Replied to ticket',
    'ticket.note': 'Added internal note',
    'ticket.updated': 'Updated ticket',
    'team.setup': 'Created the portal',
    'team.added': 'Added team member',
    'team.updated': 'Updated team member',
    'team.removed': 'Removed team member',
  };
  return map[action] ?? action;
}
