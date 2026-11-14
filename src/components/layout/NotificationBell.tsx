import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, CalendarCheck, IndianRupee, FileText, BookOpen, MessageSquare,
  CalendarDays, PartyPopper, Bus, Clock, Siren, Megaphone, BellOff, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchMyNotifications, markAllNotificationsRead } from '@/services/api';
import type { Notification } from '@/types';

type IconCfg = { icon: typeof Bell; tint: string; label: string; name: string };

const ICONS: Record<string, IconCfg> = {
  attendance: { icon: CalendarCheck, tint: 'bg-amber-50 text-amber-600', label: 'text-amber-600', name: 'Attendance' },
  fee: { icon: IndianRupee, tint: 'bg-emerald-50 text-emerald-600', label: 'text-emerald-600', name: 'Fees' },
  exam: { icon: FileText, tint: 'bg-violet-50 text-violet-600', label: 'text-violet-600', name: 'Exam' },
  homework: { icon: BookOpen, tint: 'bg-sky-50 text-sky-600', label: 'text-sky-600', name: 'Homework' },
  remark: { icon: MessageSquare, tint: 'bg-slate-100 text-slate-600', label: 'text-slate-600', name: 'Remark' },
  holiday: { icon: CalendarDays, tint: 'bg-teal-50 text-teal-600', label: 'text-teal-600', name: 'Holiday' },
  event: { icon: PartyPopper, tint: 'bg-pink-50 text-pink-600', label: 'text-pink-600', name: 'Event' },
  transport: { icon: Bus, tint: 'bg-orange-50 text-orange-600', label: 'text-orange-600', name: 'Transport' },
  timetable: { icon: Clock, tint: 'bg-cyan-50 text-cyan-600', label: 'text-cyan-600', name: 'Timetable' },
  emergency: { icon: Siren, tint: 'bg-red-50 text-red-600', label: 'text-red-600', name: 'Urgent' },
  announcement: { icon: Megaphone, tint: 'bg-indigo-50 text-indigo-600', label: 'text-indigo-600', name: 'Notice' },
};

const FALLBACK: IconCfg = { icon: Bell, tint: 'bg-slate-100 text-slate-500', label: 'text-slate-500', name: 'Update' };

function dayBucket(ts: string): 'Today' | 'Yesterday' | 'Earlier' {
  const d = new Date(ts);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (d >= start) return 'Today';
  start.setDate(start.getDate() - 1);
  if (d >= start) return 'Yesterday';
  return 'Earlier';
}

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
  const [fresh, setFresh] = useState<Set<string>>(new Set());
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

  // Opening the bell counts as viewing: everything unread is marked read right
  // away (badge clears), but stays tagged "New" while the panel is open.
  function toggle() {
    if (open) { setOpen(false); return; }
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    setFresh(new Set(unreadIds));
    setOpen(true);
    if (unreadIds.length) {
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
      markAllNotificationsRead().catch(() => {});
    }
  }

  // A notification that arrives while the panel is open is viewed instantly.
  useEffect(() => {
    if (!open) return;
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    setFresh((prev) => new Set([...prev, ...unreadIds]));
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    markAllNotificationsRead().catch(() => {});
  }, [open, items]);

  function openItem(n: Notification) {
    if (n.link && n.link.startsWith(`/${role}/`)) {
      setOpen(false);
      navigate(n.link);
    }
  }

  const sections = useMemo(() => {
    const out: { title: string; data: Notification[] }[] = [];
    for (const n of items) {
      const title = dayBucket(n.created_at);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(n);
      else out.push({ title, data: [n] });
    }
    return out;
  }, [items]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className={`relative rounded-xl p-2.5 shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition-colors ${open ? 'bg-[#5B6EE8] text-white' : 'bg-white text-slate-500 hover:text-[#5B6EE8]'}`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,400px)] origin-top-right overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <div>
              <p className="text-[15px] font-semibold text-slate-900">Notifications</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {fresh.size ? `${fresh.size} new since you last checked` : "You're all caught up"}
              </p>
            </div>
            {fresh.size > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                <CheckCheck className="h-3.5 w-3.5" /> Viewed
              </span>
            )}
          </div>

          <div className="max-h-[440px] overflow-y-auto border-t border-slate-100">
            {!loaded ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
                  <BellOff className="h-6 w-6 text-slate-300" />
                </span>
                <p className="text-sm font-medium text-slate-700">No notifications yet</p>
                <p className="mt-0.5 text-xs text-slate-400">School updates and alerts will appear here.</p>
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.title}>
                  <p className="sticky top-0 z-10 bg-white/95 px-4 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 backdrop-blur">
                    {section.title}
                  </p>
                  <ul className="px-2 pb-1">
                    {section.data.map((n) => {
                      const cfg = (n.priority === 'urgent' ? ICONS.emergency : ICONS[n.category ?? '']) ?? FALLBACK;
                      const Icon = cfg.icon;
                      const isNew = fresh.has(n.id);
                      const clickable = !!n.link && n.link.startsWith(`/${role}/`);
                      return (
                        <li key={n.id}>
                          <button
                            onClick={() => openItem(n)}
                            className={`group relative flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${isNew ? 'bg-[#F5F6FF]' : ''} ${clickable ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'}`}
                          >
                            {n.priority === 'urgent' && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-red-500" />}
                            <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${cfg.tint}`}>
                              <Icon className="h-[18px] w-[18px]" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className={`truncate text-[13px] ${isNew ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{n.title}</span>
                                {isNew && <span className="flex-shrink-0 rounded-md bg-[#5B6EE8] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">NEW</span>}
                              </span>
                              {n.message && <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-slate-500">{n.message}</span>}
                              <span className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                                <span className={`font-semibold ${cfg.label}`}>{cfg.name}</span>
                                <span className="h-0.5 w-0.5 rounded-full bg-slate-300" />
                                <span className="text-slate-400">{timeAgo(n.created_at)}</span>
                              </span>
                            </span>
                            {clickable && <ChevronRight className="mt-3 h-4 w-4 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>

          {role === 'admin' && (
            <button
              onClick={() => { setOpen(false); navigate('/admin/notifications'); }}
              className="block w-full border-t border-slate-100 py-3 text-center text-xs font-semibold text-[#5B6EE8] hover:bg-slate-50"
            >
              Open Notification Center
            </button>
          )}
        </div>
      )}
    </div>
  );
}
