// Help & Support: school admins raise tickets with Veducore and follow replies.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, LifeBuoy, Plus, Send } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/utils';
import {
  closeSupportTicket, createSupportTicket, fetchMySupportTickets, fetchSupportMessages, sendSupportMessage,
  type SupportMessage, type SupportTicket, type TicketCategory, type TicketPriority, type TicketStatus,
} from '@/services/platformApi';

const STATUS: Record<TicketStatus, { label: string; cls: string }> = {
  open: { label: 'Waiting for Veducore', cls: 'bg-amber-50 text-amber-700' },
  in_progress: { label: 'Veducore is working on it', cls: 'bg-sky-50 text-sky-700' },
  waiting: { label: 'Veducore replied', cls: 'bg-violet-50 text-violet-700' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-50 text-emerald-700' },
  closed: { label: 'Closed', cls: 'bg-gray-100 text-gray-600' },
};

const CATEGORIES: { id: TicketCategory; label: string }[] = [
  { id: 'general', label: 'General question' },
  { id: 'bug', label: 'Something is not working' },
  { id: 'data', label: 'Data correction / import' },
  { id: 'account', label: 'Logins & access' },
  { id: 'billing', label: 'Billing & subscription' },
  { id: 'feature', label: 'Feature request' },
];

const inputCls = 'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/20';

function when(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function AdminSupport() {
  const { profile } = useAuth();
  const toast = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'new' | string>('list');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTickets(await fetchMySupportTickets());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load tickets', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const selected = tickets.find((t) => t.id === view);

  return (
    <DashboardLayout title="Help & Support">
      <div className="mx-auto max-w-4xl space-y-5">
        {view === 'list' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-500">Ask the Veducore team for help. You'll get a notification when they reply.</p>
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setView('new')}>New request</Button>
            </div>
            <Card className="overflow-hidden">
              {loading ? (
                <p className="p-8 text-center text-sm text-gray-400">Loading…</p>
              ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center p-12 text-center">
                  <LifeBuoy className="h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-sm font-semibold text-gray-700">No requests yet</p>
                  <p className="mt-1 text-xs text-gray-500">Raise a request whenever you need help with Veducore.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {tickets.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => setView(t.id)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-400">#{t.ticket_number} · {when(t.last_reply_at)}</p>
                          <p className="mt-0.5 truncate font-semibold text-gray-900">
                            {t.last_reply_by === 'veducore' && t.status === 'waiting' && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#5B6EE8]" />}
                            {t.subject}
                          </p>
                        </div>
                        <span className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold', STATUS[t.status].cls)}>
                          {STATUS[t.status].label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        {view === 'new' && profile?.school_id && (
          <NewTicket
            onCancel={() => setView('list')}
            onCreate={async (input) => {
              const id = await createSupportTicket({
                ...input, schoolId: profile.school_id!, userId: profile.id, userName: profile.full_name ?? 'School admin',
              });
              toast('Request sent to Veducore', 'success');
              await load();
              setView(id);
            }}
          />
        )}

        {selected && profile && (
          <Thread
            ticket={selected}
            userId={profile.id}
            userName={profile.full_name ?? 'School admin'}
            onBack={() => { setView('list'); load(); }}
            onChanged={load}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function NewTicket({ onCancel, onCreate }: {
  onCancel: () => void;
  onCreate: (i: { subject: string; category: TicketCategory; priority: TicketPriority; body: string }) => Promise<void>;
}) {
  const toast = useToast();
  const [f, setF] = useState({ subject: '', category: 'general' as TicketCategory, priority: 'normal' as TicketPriority, body: '' });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onCreate(f);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not send request', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <button onClick={onCancel} className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-gray-500"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
      <h2 className="text-lg font-bold text-gray-900">New support request</h2>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-gray-600">Subject</span>
          <input className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required maxLength={150}
            placeholder="e.g. Fee receipt shows wrong amount" />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">Topic</span>
            <select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as TicketCategory })}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">How urgent?</span>
            <select className={inputCls} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TicketPriority })}>
              <option value="low">Whenever possible</option>
              <option value="normal">Normal</option>
              <option value="high">Important — affecting daily work</option>
              <option value="urgent">Urgent — school can't operate</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-gray-600">Describe the problem</span>
          <textarea className={cn(inputCls, 'min-h-[140px]')} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required
            placeholder="What happened, which page, which student or class, and what you expected." />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!f.subject.trim() || !f.body.trim()} icon={<Send className="h-4 w-4" />}>Send request</Button>
        </div>
      </form>
    </Card>
  );
}

function Thread({ ticket, userId, userName, onBack, onChanged }: {
  ticket: SupportTicket; userId: string; userName: string; onBack: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setMessages(await fetchSupportMessages(ticket.id));
      setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 50);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load messages', 'error');
    }
  }, [ticket.id, toast]);
  useEffect(() => { load(); }, [load]);

  async function send() {
    setSending(true);
    try {
      await sendSupportMessage(ticket.id, userId, userName, reply);
      setReply('');
      await load();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not send', 'error');
    } finally {
      setSending(false);
    }
  }

  async function close() {
    if (!window.confirm('Close this request? You can raise a new one any time.')) return;
    try {
      await closeSupportTicket(ticket.id);
      toast('Request closed', 'success');
      onBack();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not close', 'error');
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 p-5">
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-gray-500"><ArrowLeft className="h-3.5 w-3.5" /> All requests</button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-400">#{ticket.ticket_number} · opened {when(ticket.created_at)}</p>
            <h2 className="text-lg font-bold text-gray-900">{ticket.subject}</h2>
          </div>
          <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', STATUS[ticket.status].cls)}>{STATUS[ticket.status].label}</span>
        </div>
      </div>
      <div className="max-h-[55vh] space-y-3 overflow-y-auto bg-gray-50/60 p-5">
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.author_type === 'school' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm', m.author_type === 'school' ? 'bg-[#5B6EE8] text-white' : 'bg-white text-gray-800')}>
              <p className={cn('mb-1 text-[11px] font-semibold', m.author_type === 'school' ? 'text-white/70' : 'text-[#5B6EE8]')}>
                {m.author_name ?? (m.author_type === 'school' ? 'You' : 'Veducore')} · {when(m.created_at)}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {ticket.status !== 'closed' ? (
        <div className="space-y-2 border-t border-gray-100 p-4">
          <textarea className={cn(inputCls, 'min-h-[80px]')} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={close}>Close request</Button>
            <Button size="sm" onClick={send} loading={sending} disabled={!reply.trim()} icon={<Send className="h-3.5 w-3.5" />}>Send</Button>
          </div>
        </div>
      ) : (
        <p className="border-t border-gray-100 p-4 text-center text-xs text-gray-400">This request is closed.</p>
      )}
    </Card>
  );
}
