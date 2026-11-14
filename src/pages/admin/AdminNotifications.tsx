import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Bell, Send, Trash2, Users, UserRound, GraduationCap, School, LayoutGrid, User,
  Megaphone, CalendarCheck, IndianRupee, FileText, BookOpen, PartyPopper, Bus,
  MessageSquare, CalendarDays, Siren, Sparkles, Smartphone, Eye, BellRing, Clock,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner, SearchInput } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchNotifications, createNotification, deleteNotification, fetchClasses, fetchStudents,
  countNotificationRecipients, fetchNotificationReadCounts, sendFeeReminders,
} from '@/services/api';
import type {
  Notification, Class, Section, Student,
  NotificationAudience, NotificationCategory, NotificationPriority,
} from '@/types';
import { formatDateTime } from '@/lib/utils';

// ─── Config ────────────────────────────────────────────────────────────────

const AUDIENCES: { value: NotificationAudience; label: string; icon: typeof Users; hint: string }[] = [
  { value: 'all', label: 'Everyone', icon: Users, hint: 'All parents and teachers' },
  { value: 'parents', label: 'Parents', icon: UserRound, hint: 'Every parent in the school' },
  { value: 'teachers', label: 'Teachers', icon: GraduationCap, hint: 'All teaching staff' },
  { value: 'class', label: 'Class', icon: School, hint: 'Parents of one class' },
  { value: 'section', label: 'Section', icon: LayoutGrid, hint: 'Parents of one section' },
  { value: 'student', label: 'Student', icon: User, hint: "One student's parents" },
];

const CATEGORIES: { value: NotificationCategory; label: string; icon: typeof Bell; tint: string }[] = [
  { value: 'announcement', label: 'Announcement', icon: Megaphone, tint: 'bg-indigo-50 text-indigo-600' },
  { value: 'event', label: 'Event', icon: PartyPopper, tint: 'bg-pink-50 text-pink-600' },
  { value: 'exam', label: 'Exam', icon: FileText, tint: 'bg-violet-50 text-violet-600' },
  { value: 'homework', label: 'Homework', icon: BookOpen, tint: 'bg-sky-50 text-sky-600' },
  { value: 'fee', label: 'Fees', icon: IndianRupee, tint: 'bg-emerald-50 text-emerald-600' },
  { value: 'attendance', label: 'Attendance', icon: CalendarCheck, tint: 'bg-amber-50 text-amber-600' },
  { value: 'holiday', label: 'Holiday', icon: CalendarDays, tint: 'bg-teal-50 text-teal-600' },
  { value: 'transport', label: 'Transport', icon: Bus, tint: 'bg-orange-50 text-orange-600' },
  { value: 'remark', label: 'Remark', icon: MessageSquare, tint: 'bg-slate-100 text-slate-600' },
  { value: 'timetable', label: 'Timetable', icon: Clock, tint: 'bg-cyan-50 text-cyan-600' },
  { value: 'emergency', label: 'Emergency', icon: Siren, tint: 'bg-red-50 text-red-600' },
  { value: 'general', label: 'General', icon: Bell, tint: 'bg-slate-100 text-slate-600' },
];
const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

const TEMPLATES: { label: string; category: NotificationCategory; priority: NotificationPriority; title: string; message: string }[] = [
  { label: 'PTM reminder', category: 'event', priority: 'normal', title: 'Parent-Teacher Meeting', message: 'Dear Parents, a Parent-Teacher Meeting is scheduled on [date] from [time]. Your presence is requested.' },
  { label: 'Exam schedule', category: 'exam', priority: 'normal', title: 'Exam schedule released', message: 'The schedule for [exam name] has been released. Exams begin on [date]. Please ensure your ward prepares well.' },
  { label: 'School closed', category: 'emergency', priority: 'urgent', title: 'School closed tomorrow', message: 'Due to [reason], the school will remain closed on [date]. Classes will resume on [date].' },
  { label: 'Fee deadline', category: 'fee', priority: 'high', title: 'Fee payment deadline', message: 'This is a reminder that the last date for paying [term] fees is [date]. Late fee applies after the due date.' },
  { label: 'Annual function', category: 'event', priority: 'normal', title: 'Annual Day celebration', message: 'You are cordially invited to our Annual Day on [date] at [time] in the school auditorium.' },
  { label: 'Bus delay', category: 'transport', priority: 'high', title: 'School bus running late', message: 'Bus [number] is running approximately [minutes] minutes late today. We regret the inconvenience.' },
];

const PRIORITIES: { value: NotificationPriority; label: string; cls: string }[] = [
  { value: 'normal', label: 'Normal', cls: 'border-slate-200 text-slate-600' },
  { value: 'high', label: 'Important', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 'urgent', label: 'Urgent', cls: 'border-red-300 bg-red-50 text-red-700' },
];

const AUTO_EVENTS = [
  { icon: CalendarCheck, text: 'Student marked absent, late or on leave' },
  { icon: IndianRupee, text: 'New fee assigned, payment received' },
  { icon: FileText, text: 'Marks published by a teacher' },
  { icon: MessageSquare, text: 'Teacher adds a remark' },
  { icon: CalendarDays, text: 'Holiday declared' },
  { icon: Clock, text: 'Substitution assigned (to the teacher)' },
];

type ClassWithSections = Class & { sections: Section[] };

const emptyForm = {
  audience: 'all' as NotificationAudience,
  class_id: '',
  section_id: '',
  student_id: '',
  category: 'announcement' as NotificationCategory,
  priority: 'normal' as NotificationPriority,
  title: '',
  message: '',
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default function AdminNotifications() {
  const { profile } = useAuth();
  const toast = useToast();
  const schoolId = profile?.school_id;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [recipients, setRecipients] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'manual' | 'auto'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const data = await fetchNotifications(undefined, schoolId, 300);
      setNotifications(data);
      setReadCounts(await fetchNotificationReadCounts(data.map((n) => n.id)).catch(() => ({})));
    } catch { toast('Failed to load notifications', 'error'); }
    finally { setLoading(false); }
  }, [schoolId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!schoolId) return;
    fetchClasses(schoolId).then(setClasses).catch(() => {});
    fetchStudents(schoolId).then((s) => setStudents(s as Student[])).catch(() => {});
  }, [schoolId]);

  // Live recipient count for the current audience selection.
  useEffect(() => {
    if (!schoolId) return;
    const { audience, class_id, section_id, student_id } = form;
    if ((audience === 'class' && !class_id) || (audience === 'section' && !section_id) || (audience === 'student' && !student_id)) {
      setRecipients(null);
      return;
    }
    let cancelled = false;
    countNotificationRecipients({ audience, class_id: class_id || null, section_id: section_id || null, student_id: student_id || null })
      .then((n) => { if (!cancelled) setRecipients(n); })
      .catch(() => { if (!cancelled) setRecipients(null); });
    return () => { cancelled = true; };
  }, [schoolId, form.audience, form.class_id, form.section_id, form.student_id]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const allSections = useMemo(
    () => classes.flatMap((c) => c.sections.map((s) => ({ ...s, label: `${c.name} - ${s.name}` }))),
    [classes],
  );

  const studentOptions = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students
      .filter((s) => !q || s.full_name.toLowerCase().includes(q) || s.admission_number?.toLowerCase().includes(q))
      .slice(0, 50);
  }, [students, studentSearch]);

  function applyTemplate(label: string) {
    const t = TEMPLATES.find((x) => x.label === label);
    if (!t) return;
    setForm((f) => ({ ...f, category: t.category, priority: t.priority, title: t.title, message: t.message }));
    setErrors({});
  }

  function audienceLabel(n: Pick<Notification, 'audience' | 'class_id' | 'section_id' | 'student_id' | 'user_id'>) {
    switch (n.audience) {
      case 'all': return 'Everyone';
      case 'parents': return 'All parents';
      case 'teachers': return 'All teachers';
      case 'class': return `Class ${classes.find((c) => c.id === n.class_id)?.name ?? ''}`.trim();
      case 'section': return allSections.find((s) => s.id === n.section_id)?.label ?? 'Section';
      case 'student': {
        const s = students.find((x) => x.id === n.student_id);
        return s ? `${s.full_name}'s parents` : 'Student parents';
      }
      default: return n.user_id === profile?.id ? 'You' : 'One user';
    }
  }

  async function handleSend() {
    if (!schoolId) return;
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.message.trim()) e.message = 'Message is required';
    if (form.audience === 'class' && !form.class_id) e.class_id = 'Choose a class';
    if (form.audience === 'section' && !form.section_id) e.section_id = 'Choose a section';
    if (form.audience === 'student' && !form.student_id) e.student_id = 'Choose a student';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSending(true);
    try {
      await createNotification({
        school_id: schoolId,
        audience: form.audience,
        class_id: form.audience === 'class' ? form.class_id : null,
        section_id: form.audience === 'section' ? form.section_id : null,
        student_id: form.audience === 'student' ? form.student_id : null,
        category: form.category,
        priority: form.priority,
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.priority === 'urgent' ? 'error' : form.priority === 'high' ? 'warning' : 'info',
      });
      toast(recipients ? `Sent to ${recipients} ${recipients === 1 ? 'person' : 'people'}` : 'Notification sent', 'success');
      setForm(emptyForm);
      setStudentSearch('');
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send notification', 'error');
    } finally { setSending(false); }
  }

  async function handleFeeReminders() {
    if (!schoolId) return;
    setReminding(true);
    try {
      const n = await sendFeeReminders(schoolId);
      toast(n ? `Fee reminders sent for ${n} student${n === 1 ? '' : 's'}` : 'No pending fees need a reminder right now', n ? 'success' : 'info');
      if (n) loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send reminders', 'error');
    } finally { setReminding(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await deleteNotification(deleteId); toast('Notification deleted', 'success'); loadData(); }
    catch { toast('Failed to delete', 'error'); }
  }

  // ─── Derived history + stats ────────────────────────────────────────────
  const isAuto = (n: Notification) => !n.sent_by;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n) => {
      if (filter === 'manual' && isAuto(n)) return false;
      if (filter === 'auto' && !isAuto(n)) return false;
      if (categoryFilter && (n.category ?? 'general') !== categoryFilter) return false;
      if (q && !n.title.toLowerCase().includes(q) && !n.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [notifications, filter, categoryFilter, search]);

  const stats = useMemo(() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const thisMonth = notifications.filter((n) => new Date(n.created_at) >= monthStart);
    const reach = thisMonth.reduce((s, n) => s + (n.recipients_count ?? 0), 0);
    const reads = thisMonth.reduce((s, n) => s + (readCounts[n.id] ?? 0), 0);
    const pushed = thisMonth.reduce((s, n) => s + (n.push_sent_count ?? 0), 0);
    return {
      sent: thisMonth.length,
      reach,
      readRate: reach ? Math.round((reads / reach) * 100) : 0,
      pushed,
    };
  }, [notifications, readCounts]);

  const cat = CATEGORY_MAP[form.category] ?? CATEGORY_MAP.general;
  const CatIcon = cat.icon;

  return (
    <DashboardLayout title="Notifications">
      <div className="space-y-6">
        <PageHeader
          title="Notification Center"
          description="Send announcements to parents and teachers. They arrive in the mobile app as push notifications."
          action={
            <Button variant="outline" icon={<IndianRupee className="h-4 w-4" />} loading={reminding} onClick={handleFeeReminders}>
              Send fee reminders
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Sent this month" value={stats.sent} icon={<Send className="h-5 w-5" />} color="blue" />
          <StatCard label="People reached" value={stats.reach} icon={<Users className="h-5 w-5" />} color="violet" />
          <StatCard label="Read rate" value={`${stats.readRate}%`} icon={<Eye className="h-5 w-5" />} color="emerald" />
          <StatCard label="Push delivered" value={stats.pushed} icon={<Smartphone className="h-5 w-5" />} color="amber" />
        </div>

        {/* ─── Composer ─────────────────────────────────────────────── */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Compose</h2>
                <p className="text-sm text-slate-500">Choose who gets it, then write the message.</p>
              </div>
              <div className="w-full sm:w-56">
                <Select value="" onChange={(e) => applyTemplate(e.target.value)} fieldSize="sm" aria-label="Use a template">
                  <option value="">Use a template…</option>
                  {TEMPLATES.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
                </Select>
              </div>
            </div>

            {/* Audience */}
            <p className="mb-2 text-[13px] font-medium text-slate-700">Send to</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {AUDIENCES.map((a) => {
                const Icon = a.icon;
                const active = form.audience === a.value;
                return (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => set('audience', a.value)}
                    title={a.hint}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition ${
                      active ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {a.label}
                  </button>
                );
              })}
            </div>

            {form.audience === 'class' && (
              <div className="mt-3 max-w-sm">
                <Select label="Class" value={form.class_id} error={errors.class_id} onChange={(e) => set('class_id', e.target.value)}>
                  <option value="">Select class…</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            )}
            {form.audience === 'section' && (
              <div className="mt-3 max-w-sm">
                <Select label="Section" value={form.section_id} error={errors.section_id} onChange={(e) => set('section_id', e.target.value)}>
                  <option value="">Select section…</option>
                  {allSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
              </div>
            )}
            {form.audience === 'student' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input label="Find student" placeholder="Name or admission no." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                <Select label="Student" value={form.student_id} error={errors.student_id} onChange={(e) => set('student_id', e.target.value)}>
                  <option value="">Select student…</option>
                  {studentOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} · {s.admission_number}{s.class?.name ? ` · ${s.class.name}${s.section?.name ? '-' + s.section.name : ''}` : ''}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Users className="h-3.5 w-3.5" />
              {recipients === null
                ? 'Pick a target to see how many people will receive this'
                : recipients === 0
                  ? <span className="text-amber-600">No app users in this audience yet</span>
                  : <span><b className="text-slate-700">{recipients}</b> {recipients === 1 ? 'person' : 'people'} will receive this</span>}
            </div>

            {/* Category */}
            <p className="mb-2 mt-5 text-[13px] font-medium text-slate-700">Category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => !['attendance', 'remark', 'timetable'].includes(c.value)).map((c) => {
                const Icon = c.icon;
                const active = form.category === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set('category', c.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {c.label}
                  </button>
                );
              })}
            </div>

            {/* Priority */}
            <p className="mb-2 mt-5 text-[13px] font-medium text-slate-700">Priority</p>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => set('priority', p.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    form.priority === p.value ? `${p.cls} ring-2 ring-brand-500/30` : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              {form.priority === 'urgent' && (
                <span className="self-center text-xs text-red-600">Urgent ignores muted categories</span>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <Input label="Title" required value={form.title} maxLength={80} error={errors.title}
                placeholder="e.g. Parent-Teacher Meeting on Saturday"
                onChange={(e) => set('title', e.target.value)} />
              <div>
                <Textarea label="Message" required rows={4} value={form.message} maxLength={500} error={errors.message}
                  placeholder="Write the full message parents and teachers will read"
                  onChange={(e) => set('message', e.target.value)} />
                <p className="mt-1 text-right text-[11px] text-slate-400">{form.message.length}/500</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => { setForm(emptyForm); setErrors({}); }}>Clear</Button>
              <Button icon={<Send className="h-4 w-4" />} loading={sending} onClick={handleSend}>Send notification</Button>
            </div>
          </Card>

          {/* Preview + automation info */}
          <div className="space-y-6">
            <Card className="p-5">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Smartphone className="h-3.5 w-3.5" /> Phone preview
              </p>
              <div className="rounded-[28px] bg-gradient-to-b from-slate-800 to-slate-900 p-3">
                <div className="rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md ${cat.tint}`}>
                      <CatIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">VEDUCORE</span>
                    <span className="ml-auto text-[10px] text-slate-400">now</span>
                  </div>
                  <p className="text-[13px] font-semibold leading-snug text-slate-900">
                    {form.priority === 'urgent' && '🚨 '}{form.title || 'Notification title'}
                  </p>
                  <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-slate-600">
                    {form.message || 'Your message will appear here.'}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Sparkles className="h-4 w-4 text-brand-500" /> Sent automatically
              </p>
              <p className="mb-3 text-xs text-slate-500">Parents get these on their child's activity without anyone pressing send.</p>
              <ul className="space-y-2">
                {AUTO_EVENTS.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2 text-xs text-slate-600">
                    <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" /> {text}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        {/* ─── History ──────────────────────────────────────────────── */}
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-base font-semibold text-slate-900">History</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
                {(['all', 'manual', 'auto'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFilter(f)}
                    className={`rounded-md px-3 py-1.5 transition ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                    {f === 'all' ? 'All' : f === 'manual' ? 'Sent by staff' : 'Automatic'}
                  </button>
                ))}
              </div>
              <div className="sm:w-40">
                <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} fieldSize="sm" aria-label="Category">
                  <option value="">All categories</option>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
              </div>
              <SearchInput value={search} onChange={setSearch} placeholder="Search…" className="sm:w-56" />
            </div>
          </div>

          {loading ? (
            <LoadingSpinner variant="cards" />
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-14 text-center">
              <BellRing className="mb-3 h-10 w-10 text-slate-300" />
              <p className="font-medium text-slate-600">No notifications yet</p>
              <p className="text-sm text-slate-400">Anything you send, and automatic alerts, will show up here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((n) => {
                const c = CATEGORY_MAP[n.category ?? 'general'] ?? CATEGORY_MAP.general;
                const Icon = c.icon;
                const reads = readCounts[n.id] ?? 0;
                const total = n.recipients_count ?? 0;
                const pct = total ? Math.min(100, Math.round((reads / total) * 100)) : 0;
                return (
                  <li key={n.id} className="flex items-start gap-3 py-4">
                    <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${c.tint}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{n.title}</h3>
                        {n.priority === 'urgent' && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">URGENT</span>}
                        {n.priority === 'high' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">IMPORTANT</span>}
                        {isAuto(n) && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">AUTO</span>}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {audienceLabel(n)}</span>
                        <span>{formatDateTime(n.created_at)}</span>
                        {total > 0 && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </span>
                            {reads}/{total} read
                          </span>
                        )}
                        {n.push_status === 'sent' && <span className="inline-flex items-center gap-1 text-emerald-600"><Smartphone className="h-3 w-3" /> {n.push_sent_count} pushed</span>}
                        {n.push_status === 'failed' && <span className="text-red-500">Push failed</span>}
                      </div>
                    </div>
                    <button type="button" onClick={() => setDeleteId(n.id)} aria-label="Delete notification"
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete}
        title="Delete notification" message="It will disappear from everyone's app. This cannot be undone." />
    </DashboardLayout>
  );
}
