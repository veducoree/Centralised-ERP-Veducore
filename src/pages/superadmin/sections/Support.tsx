import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, LifeBuoy, Lock, Mail, Phone, RefreshCw, Search, Send } from 'lucide-react';
import { callManageSchools, errMsg, fmtDateTime, timeAgo, type Me } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingBlock, cx, inputCls, toast, type BadgeTone } from '../ui';

export interface Ticket {
  id: string; ticket_number: number; school_id: string; school_name: string; raised_by_name: string | null;
  subject: string; category: string; priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  assigned_to: string | null; last_reply_at: string; last_reply_by: 'school' | 'veducore'; created_at: string;
}
interface TicketDetail extends Omit<Ticket, 'school_name'> {
  schools: { name: string; contact_number: string | null; email: string | null } | null;
}
interface Message {
  id: string; author_type: 'school' | 'veducore'; author_name: string | null; body: string; is_internal: boolean; created_at: string;
}

export const TICKET_STATUS: Record<Ticket['status'], { label: string; tone: BadgeTone }> = {
  open: { label: 'Open', tone: 'amber' },
  in_progress: { label: 'In progress', tone: 'blue' },
  waiting: { label: 'Waiting on school', tone: 'violet' },
  resolved: { label: 'Resolved', tone: 'green' },
  closed: { label: 'Closed', tone: 'gray' },
};
export const PRIORITY: Record<Ticket['priority'], BadgeTone> = { low: 'gray', normal: 'blue', high: 'amber', urgent: 'red' };

export default function SupportSection({ me, onOpenSchool }: { me: Me; onOpenSchool: (id: string) => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [team, setTeam] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'active' | 'mine' | 'all' | Ticket['status']>('active');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await callManageSchools<{ tickets: Ticket[]; team: { id: string; full_name: string }[] }>({ action: 'tickets-list' });
      setTickets(r.tickets);
      setTeam(r.team);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => tickets.filter((t) => {
    if (filter === 'active' && !['open', 'in_progress'].includes(t.status)) return false;
    if (filter === 'mine' && t.assigned_to !== me.id) return false;
    if (!['active', 'mine', 'all'].includes(filter) && t.status !== filter) return false;
    if (q && !`#${t.ticket_number} ${t.subject} ${t.school_name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [tickets, filter, q, me.id]);

  const count = (fn: (t: Ticket) => boolean) => tickets.filter(fn).length;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <div className={cx('space-y-3', selected && 'hidden xl:block')}>
        {error && <ErrorBanner message={error} onRetry={load} />}
        <div className="flex flex-wrap gap-1.5">
          {([
            ['active', 'Needs reply', count((t) => ['open', 'in_progress'].includes(t.status))],
            ['mine', 'Assigned to me', count((t) => t.assigned_to === me.id && !['resolved', 'closed'].includes(t.status))],
            ['waiting', 'Waiting', count((t) => t.status === 'waiting')],
            ['resolved', 'Resolved', count((t) => t.status === 'resolved')],
            ['all', 'All', tickets.length],
          ] as const).map(([k, l, n]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={cx('rounded-full px-3 py-1.5 text-xs font-semibold', filter === k ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>
              {l} <span className={filter === k ? 'text-indigo-200' : 'text-slate-400'}>{n}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={cx(inputCls, 'pl-10')} placeholder="Search tickets…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={load} loading={loading} icon={<RefreshCw className="h-4 w-4" />} aria-label="Refresh" />
        </div>
        <Card bodyClassName="p-0">
          {loading && !tickets.length ? <div className="p-4"><LoadingBlock /></div> : rows.length === 0 ? (
            <EmptyState icon={<LifeBuoy className="h-5 w-5" />} title="No tickets here" text="Schools raise tickets from Help & Support in their admin panel." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((t) => (
                <li key={t.id}>
                  <button onClick={() => setSelected(t.id)}
                    className={cx('w-full px-4 py-3.5 text-left hover:bg-slate-50', selected === t.id && 'bg-indigo-50/60')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-400">#{t.ticket_number} · {t.school_name}</span>
                      <span className="text-[11px] text-slate-400">{timeAgo(t.last_reply_at)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                      {t.last_reply_by === 'school' && ['open', 'in_progress'].includes(t.status) && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-indigo-500" />}
                      {t.subject}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge>
                      <Badge tone={PRIORITY[t.priority]}>{t.priority}</Badge>
                      <Badge>{t.category}</Badge>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className={cx(!selected && 'hidden xl:block')}>
        {selected ? (
          <TicketThread key={selected} ticketId={selected} team={team} onBack={() => setSelected(null)} onChanged={load} onOpenSchool={onOpenSchool} />
        ) : (
          <Card><EmptyState icon={<LifeBuoy className="h-5 w-5" />} title="Select a ticket" text="Pick a ticket on the left to read and reply." /></Card>
        )}
      </div>
    </div>
  );
}

function TicketThread({ ticketId, team, onBack, onChanged, onOpenSchool }: {
  ticketId: string; team: { id: string; full_name: string }[]; onBack: () => void; onChanged: () => void; onOpenSchool: (id: string) => void;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const r = await callManageSchools<{ ticket: TicketDetail; messages: Message[] }>({ action: 'ticket-detail', ticket_id: ticketId });
      setTicket(r.ticket);
      setMessages(r.messages);
      setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 50);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }
  useEffect(() => { load(); }, [ticketId]);

  async function send(status?: 'resolved') {
    setSending(true);
    try {
      await callManageSchools({ action: 'ticket-reply', ticket_id: ticketId, body: reply, internal, status });
      setReply('');
      toast(internal ? 'Note added' : status ? 'Replied and resolved' : 'Reply sent — the school admin is notified');
      load();
      onChanged();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSending(false);
    }
  }

  async function patch(p: Record<string, unknown>) {
    try {
      await callManageSchools({ action: 'ticket-update', ticket_id: ticketId, ...p });
      load();
      onChanged();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  if (!ticket) return <Card><LoadingBlock /></Card>;

  return (
    <Card bodyClassName="p-0">
      <div className="border-b border-slate-100 p-5">
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 xl:hidden">
          <ArrowLeft className="h-3.5 w-3.5" /> All tickets
        </button>
        <p className="text-xs font-semibold text-slate-400">#{ticket.ticket_number} · opened {fmtDateTime(ticket.created_at)} by {ticket.raised_by_name ?? 'school admin'}</p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">{ticket.subject}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <button onClick={() => onOpenSchool(ticket.school_id)} className="font-semibold text-indigo-600 hover:underline">{ticket.schools?.name}</button>
          {ticket.schools?.contact_number && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{ticket.schools.contact_number}</span>}
          {ticket.schools?.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{ticket.schools.email}</span>}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select className={inputCls} value={ticket.status} onChange={(e) => patch({ status: e.target.value })}>
            {Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className={inputCls} value={ticket.priority} onChange={(e) => patch({ priority: e.target.value })}>
            {Object.keys(PRIORITY).map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)} priority</option>)}
          </select>
          <select className={inputCls} value={ticket.assigned_to ?? ''} onChange={(e) => patch({ assigned_to: e.target.value || null })}>
            <option value="">Unassigned</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
      </div>

      <div className="max-h-[52vh] space-y-3 overflow-y-auto bg-slate-50/60 p-5">
        {messages.map((m) => (
          <div key={m.id} className={cx('flex', m.author_type === 'veducore' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm',
              m.is_internal ? 'border border-dashed border-amber-300 bg-amber-50 text-amber-900'
                : m.author_type === 'veducore' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-800')}>
              <p className={cx('mb-1 flex items-center gap-1 text-[11px] font-semibold',
                m.is_internal ? 'text-amber-700' : m.author_type === 'veducore' ? 'text-indigo-200' : 'text-slate-400')}>
                {m.is_internal && <Lock className="h-3 w-3" />}
                {m.author_name ?? (m.author_type === 'school' ? 'School' : 'Veducore')} · {fmtDateTime(m.created_at)}
                {m.is_internal && ' · internal note'}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {ticket.status !== 'closed' ? (
        <div className="space-y-2 border-t border-slate-100 p-4">
          <textarea className={cx(inputCls, 'min-h-[90px]', internal && 'border-amber-300 bg-amber-50/50')} value={reply} onChange={(e) => setReply(e.target.value)}
            placeholder={internal ? 'Internal note — only the Veducore team sees this' : 'Write a reply to the school…'} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="rounded" /> Internal note
            </label>
            <div className="flex gap-2">
              {!internal && <Button size="sm" variant="secondary" onClick={() => send('resolved')} loading={sending} disabled={!reply.trim()}>Reply & resolve</Button>}
              <Button size="sm" onClick={() => send()} loading={sending} disabled={!reply.trim()} icon={<Send className="h-3.5 w-3.5" />}>
                {internal ? 'Add note' : 'Send reply'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="border-t border-slate-100 p-4 text-center text-xs text-slate-400">This ticket is closed. Reopen it from the status menu to reply.</p>
      )}
    </Card>
  );
}
