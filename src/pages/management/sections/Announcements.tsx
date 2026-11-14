import { useEffect, useState } from 'react';
import { Megaphone, Plus, Send, Trash2 } from 'lucide-react';
import { callManageSchools, errMsg, fmtDateTime, timeAgo, type Me, type SchoolRecord } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, LoadingBlock, Modal, cx, inputCls, toast, type BadgeTone } from '../ui';

interface Announcement {
  id: string; title: string; body: string; severity: 'info' | 'success' | 'warning' | 'critical';
  target: 'all' | 'selected'; school_ids: string[]; push_audience: string | null;
  starts_at: string; ends_at: string | null; is_active: boolean; created_by_name: string | null; created_at: string;
}

const SEVERITY: Record<Announcement['severity'], { label: string; tone: BadgeTone; bar: string }> = {
  info: { label: 'Info', tone: 'blue', bar: 'bg-sky-500' },
  success: { label: 'Good news', tone: 'green', bar: 'bg-emerald-500' },
  warning: { label: 'Warning', tone: 'amber', bar: 'bg-amber-500' },
  critical: { label: 'Critical', tone: 'red', bar: 'bg-rose-500' },
};

export default function AnnouncementsSection({ me, schools }: { me: Me; schools: SchoolRecord[] }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const canManage = me.role !== 'support';
  const nameOf = (id: string) => schools.find((s) => s.id === id)?.name ?? 'Deleted school';

  async function load() {
    setLoading(true);
    setError('');
    try {
      setItems((await callManageSchools<{ announcements: Announcement[] }>({ action: 'announcements-list' })).announcements);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function update(a: Announcement, patch: { is_active?: boolean; delete?: boolean }) {
    if (patch.delete && !window.confirm(`Delete "${a.title}"?`)) return;
    try {
      await callManageSchools({ action: 'announcement-update', announcement_id: a.id, ...patch });
      toast(patch.delete ? 'Announcement deleted' : patch.is_active ? 'Announcement is live again' : 'Announcement hidden');
      load();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  const live = (a: Announcement) => a.is_active && new Date(a.starts_at) <= new Date() && (!a.ends_at || new Date(a.ends_at) > new Date());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Announcements appear as a banner at the top of each school's admin panel. You can also push them to the school's teachers or parents on the mobile app.
        </p>
        {canManage && <Button onClick={() => setComposing(true)} icon={<Plus className="h-4 w-4" />}>New announcement</Button>}
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading && !items.length ? <LoadingBlock /> : items.length === 0 ? (
        <Card><EmptyState icon={<Megaphone className="h-5 w-5" />} title="No announcements yet" text="Tell schools about new features, maintenance windows or billing changes." /></Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="flex overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <div className={cx('w-1.5 flex-shrink-0', SEVERITY[a.severity].bar)} />
              <div className="flex-1 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900">{a.title}</h3>
                      <Badge tone={SEVERITY[a.severity].tone}>{SEVERITY[a.severity].label}</Badge>
                      {live(a) ? <Badge tone="green" dot>Live</Badge> : <Badge>{a.is_active ? 'Scheduled / ended' : 'Hidden'}</Badge>}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => update(a, { is_active: !a.is_active })}>{a.is_active ? 'Hide' : 'Show'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => update(a, { delete: true })} icon={<Trash2 className="h-3.5 w-3.5" />} aria-label="Delete" />
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  {a.target === 'all' ? 'All schools' : a.school_ids.length <= 3 ? a.school_ids.map(nameOf).join(', ') : `${a.school_ids.length} schools`}
                  {a.push_audience && ` · pushed to ${a.push_audience === 'all' ? 'teachers & parents' : a.push_audience}`}
                  {' · '}{a.ends_at ? `until ${fmtDateTime(a.ends_at)}` : 'no end date'}
                  {' · '}by {a.created_by_name ?? 'Veducore'} {timeAgo(a.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {composing && <Composer schools={schools} onClose={() => setComposing(false)} onSent={() => { setComposing(false); load(); }} />}
    </div>
  );
}

function Composer({ schools, onClose, onSent }: { schools: SchoolRecord[]; onClose: () => void; onSent: () => void }) {
  const [f, setF] = useState({
    title: '', body: '', severity: 'info' as Announcement['severity'], target: 'all' as 'all' | 'selected',
    school_ids: [] as string[], push_audience: '', ends_at: '',
  });
  const [q, setQ] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (f.push_audience && !window.confirm('This also sends a push notification to the selected people at each school. Continue?')) return;
    setSending(true);
    try {
      const r = await callManageSchools<{ pushedSchools: number }>({
        action: 'announcement-create',
        announcement: { ...f, push_audience: f.push_audience || null, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null },
      });
      toast(r.pushedSchools ? `Published and pushed to ${r.pushedSchools} schools` : 'Announcement published');
      onSent();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSending(false);
    }
  }

  const toggle = (id: string) => setF({ ...f, school_ids: f.school_ids.includes(id) ? f.school_ids.filter((x) => x !== id) : [...f.school_ids, id] });
  const list = schools.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal open onClose={onClose} title="New announcement" size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={send} loading={sending} icon={<Send className="h-4 w-4" />}
          disabled={!f.title.trim() || !f.body.trim() || (f.target === 'selected' && !f.school_ids.length)}>Publish</Button>
      </>}>
      <div className="space-y-4">
        <Field label="Title" required><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Scheduled maintenance on Sunday 2–4 AM" /></Field>
        <Field label="Message" required>
          <textarea className={cx(inputCls, 'min-h-[110px]')} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Type">
            <select className={inputCls} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as Announcement['severity'] })}>
              {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Also push to app" hint="Sends through each school's notifications">
            <select className={inputCls} value={f.push_audience} onChange={(e) => setF({ ...f, push_audience: e.target.value })}>
              <option value="">Admins only (banner)</option>
              <option value="teachers">+ Teachers</option>
              <option value="parents">+ Parents</option>
              <option value="all">+ Teachers & parents</option>
            </select>
          </Field>
          <Field label="Hide after" hint="Optional">
            <input type="datetime-local" className={inputCls} value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex gap-2">
            {(['all', 'selected'] as const).map((t) => (
              <button key={t} onClick={() => setF({ ...f, target: t })}
                className={cx('rounded-full px-3.5 py-1.5 text-xs font-semibold', f.target === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600')}>
                {t === 'all' ? `All schools (${schools.length})` : `Selected schools${f.school_ids.length ? ` (${f.school_ids.length})` : ''}`}
              </button>
            ))}
          </div>
          {f.target === 'selected' && (
            <div className="rounded-2xl border border-slate-200">
              <input className="w-full rounded-t-2xl border-b border-slate-100 px-4 py-2.5 text-sm focus:outline-none" placeholder="Search schools…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="max-h-56 overflow-y-auto p-2">
                {list.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={f.school_ids.includes(s.id)} onChange={() => toggle(s.id)} className="rounded" />
                    <span className="flex-1 text-slate-700">{s.name}</span>
                    <span className="text-xs text-slate-400">{s.subscription?.planName ?? ''}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
