// Veducore platform notices inside the school app: Veducore announcements.
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Megaphone, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { fetchPlatformAnnouncements, type PlatformAnnouncement } from '@/services/platformApi';

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

/** Shown at the top of admin pages. */
export function PlatformBanner() {
  const { profile } = useAuth();
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

  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (!visible.length) return null;

  return (
    <div className="mb-4 space-y-2">
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
