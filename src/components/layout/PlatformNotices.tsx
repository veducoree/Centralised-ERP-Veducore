// Veducore platform notices inside the school app: the suspended-school
// screen, Veducore announcements and subscription renewal reminders.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, LogOut, Megaphone, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { usePermissions } from '@/auth/PermissionsContext';
import { fetchPlatformAnnouncements, type PlatformAnnouncement } from '@/services/platformApi';

export function SchoolSuspendedScreen() {
  const { signOut } = useAuth();
  const { platform } = usePermissions();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-xl font-bold text-gray-900">Access paused</h1>
        <p className="mt-2 text-sm text-gray-600">
          {platform?.school_name ? <b>{platform.school_name}</b> : 'Your school'}'s Veducore account has been suspended.
        </p>
        {platform?.suspension_reason && (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-left text-sm text-red-800">{platform.suspension_reason}</p>
        )}
        <p className="mt-4 text-xs text-gray-500">
          Your data is safe. Please contact your school office or Veducore support to restore access.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}

const TONE = {
  info: { cls: 'border-sky-200 bg-sky-50 text-sky-900', icon: <Info className="h-4 w-4 text-sky-600" /> },
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" /> },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: <AlertTriangle className="h-4 w-4 text-amber-600" /> },
  critical: { cls: 'border-red-200 bg-red-50 text-red-900', icon: <Megaphone className="h-4 w-4 text-red-600" /> },
} as const;

const DISMISS_KEY = 'veducore_dismissed_announcements';

function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]'); } catch { return []; }
}

function daysUntil(d: string | null | undefined) {
  if (!d) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((new Date(d + 'T00:00:00').getTime() - start.getTime()) / 86_400_000);
}

/** Shown at the top of admin pages. */
export function PlatformBanner() {
  const { profile } = useAuth();
  const { platform, owner } = usePermissions();
  const [items, setItems] = useState<PlatformAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    fetchPlatformAnnouncements().then(setItems).catch(() => setItems([]));
  }, [profile?.id, profile?.role]);

  if (profile?.role !== 'admin') return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-50))); } catch { /* ignore */ }
  };

  // Renewal reminder for the school owner only.
  const sub = platform?.subscription_status;
  const end = sub === 'trial' ? platform?.trial_ends_at : platform?.current_period_end;
  const d = daysUntil(end);
  let renewal: { tone: keyof typeof TONE; text: string } | null = null;
  if (owner && sub === 'past_due') renewal = { tone: 'critical', text: 'Your Veducore subscription payment is overdue. Please clear it to avoid interruption.' };
  else if (owner && sub === 'expired') renewal = { tone: 'critical', text: 'Your Veducore subscription has expired. Please renew to keep using Veducore.' };
  else if (owner && d !== null && d <= 15 && (sub === 'trial' || sub === 'active')) {
    renewal = {
      tone: d <= 3 ? 'warning' : 'info',
      text: sub === 'trial'
        ? (d < 0 ? 'Your Veducore trial has ended.' : `Your Veducore trial ends ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}.`) + ' Contact Veducore to choose a plan.'
        : (d < 0 ? 'Your Veducore subscription period has ended.' : `Your Veducore ${platform?.plan_name ?? ''} plan renews ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}.`),
    };
  }

  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (!renewal && !visible.length) return null;

  return (
    <div className="mb-4 space-y-2">
      {renewal && (
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${TONE[renewal.tone].cls}`}>
          {TONE[renewal.tone].icon}
          <span className="flex-1">{renewal.text}</span>
          <Link to="/admin/support" className="whitespace-nowrap text-xs font-semibold underline">Contact Veducore</Link>
        </div>
      )}
      {visible.map((a) => (
        <div key={a.id} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${TONE[a.severity].cls}`}>
          <span className="mt-0.5">{TONE[a.severity].icon}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{a.title}</p>
            <p className="mt-0.5 whitespace-pre-wrap opacity-90">{a.body}</p>
          </div>
          <button onClick={() => dismiss(a.id)} className="rounded-lg p-1 opacity-60 hover:opacity-100" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
