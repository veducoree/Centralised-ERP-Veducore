import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, CalendarCheck, IndianRupee, FileText, BookOpen, MessageSquare,
  CalendarDays, PartyPopper, Bus, Clock, Siren, Megaphone, BellOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchMyNotifications, markNotificationRead, markAllNotificationsRead } from '@/services/api';
import type { Notification } from '@/types';

const ICONS: Record<string, { icon: typeof Bell; tint: string }> = {
  attendance: { icon: CalendarCheck, tint: 'bg-amber-50 text-amber-600' },
  fee: { icon: IndianRupee, tint: 'bg-emerald-50 text-emerald-600' },
  exam: { icon: FileText, tint: 'bg-violet-50 text-violet-600' },
  homework: { icon: BookOpen, tint: 'bg-sky-50 text-sky-600' },
  remark: { icon: MessageSquare, tint: 'bg-slate-100 text-slate-600' },
  holiday: { icon: CalendarDays, tint: 'bg-teal-50 text-teal-600' },
  event: { icon: PartyPopper, tint: 'bg-pink-50 text-pink-600' },
  transport: { icon: Bus, tint: 'bg-orange-50 text-orange-600' },
  timetable: { icon: Clock, tint: 'bg-cyan-50 text-cyan-600' },
  emergency: { icon: Siren, tint: 'bg-red-50 text-red-600' },
  announcement: { icon: Megaphone, tint: 'bg-indigo-50 text-indigo-600' },
};

function timeAgo(ts: string) {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Navbar bell with a live dropdown of the user's own notifications. */
export function NotificationBell({ role, schoolId }: { role?: string; schoolId?: string | null }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchMyNotifications(30));
    } catch { /* offline or migration not applied yet */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live updates: refetch when a notification for this school is inserted.
  useEffect(() => {
    if (!schoolId) return;
    const channel = supabase
      .channel(`notif-bell-${schoolId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `school_id=eq.${schoolId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [schoolId, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const unread = items.filter((n) => !n.is_read).length;

  async function openItem(n: Notification) {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.link && n.link.startsWith(`/${role}/`)) {
      setOpen(false);
      navigate(n.link);
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    markAllNotificationsRead().catch(() => {});
  }

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-xl bg-white p-2.5 text-slate-500 shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition-colors hover:text-[#5B6EE8]"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.14)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {!loaded ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <BellOff className="mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">You're all caught up</p>
                <p className="text-xs text-slate-400">New notices will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {items.map((n) => {
                  const cfg = (n.priority === 'urgent' ? ICONS.emergency : ICONS[n.category ?? '']) ?? { icon: Bell, tint: 'bg-slate-100 text-slate-500' };
                  const Icon = cfg.icon;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => openItem(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${n.is_read ? '' : 'bg-brand-50/40'}`}
                      >
                        <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${cfg.tint}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={`truncate text-[13px] ${n.is_read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                            {!n.is_read && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{n.message}</span>
                          <span className="mt-1 block text-[11px] text-slate-400">{timeAgo(n.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {role === 'admin' && (
            <button
              onClick={() => { setOpen(false); navigate('/admin/notifications'); }}
              className="block w-full border-t border-slate-100 py-2.5 text-center text-xs font-medium text-brand-600 hover:bg-slate-50"
            >
              Open Notification Center
            </button>
          )}
        </div>
      )}
    </div>
  );
}
