import { useEffect, useState } from 'react';
import { Download, History, RefreshCw, Search } from 'lucide-react';
import { actionLabel, callManageSchools, errMsg, fmtDateTime, type AuditEntry } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingBlock, cx, inputCls, type BadgeTone } from '../ui';

const AREAS: { prefix: string; label: string; tone: BadgeTone }[] = [
  { prefix: 'school.', label: 'Schools', tone: 'indigo' },
  { prefix: 'subscription.', label: 'Subscriptions', tone: 'violet' },
  { prefix: 'invoice.', label: 'Invoices', tone: 'green' },
  { prefix: 'plan.', label: 'Plans', tone: 'violet' },
  { prefix: 'announcement.', label: 'Announcements', tone: 'amber' },
  { prefix: 'ticket.', label: 'Support', tone: 'blue' },
  { prefix: 'team.', label: 'Team', tone: 'gray' },
];

export default function AuditLogSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setEntries((await callManageSchools<{ entries: AuditEntry[] }>({ action: 'audit-log', action_prefix: area || undefined })).entries);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [area]);

  const rows = entries.filter((e) => !q || `${e.actor_name} ${e.actor_email} ${e.school_name} ${actionLabel(e.action)} ${JSON.stringify(e.details)}`
    .toLowerCase().includes(q.toLowerCase()));

  function exportCsv() {
    const lines = [['When', 'Who', 'Email', 'Action', 'School', 'Details'],
      ...rows.map((e) => [e.created_at, e.actor_name, e.actor_email, actionLabel(e.action), e.school_name, JSON.stringify(e.details)])];
    const csv = lines.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `veducore-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onRetry={load} />}
      <Card bodyClassName="p-0" title="Audit log" subtitle="Every change made from this portal, newest first (last 300)"
        actions={<>
          <Button size="sm" variant="secondary" onClick={exportCsv} icon={<Download className="h-3.5 w-3.5" />}>Export</Button>
          <Button size="sm" variant="secondary" onClick={load} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>Refresh</Button>
        </>}>
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={cx(inputCls, 'pl-10')} placeholder="Search person, school, action…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={cx(inputCls, 'sm:w-48')} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">All areas</option>
            {AREAS.map((a) => <option key={a.prefix} value={a.prefix}>{a.label}</option>)}
          </select>
        </div>
        {loading && !entries.length ? <div className="p-5"><LoadingBlock rows={8} /></div> : rows.length === 0 ? (
          <EmptyState icon={<History className="h-5 w-5" />} title="Nothing recorded" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((e) => {
              const a = AREAS.find((x) => e.action.startsWith(x.prefix));
              const details = Object.entries(e.details ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
              return (
                <li key={e.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <span className="w-36 flex-shrink-0 text-xs text-slate-400">{fmtDateTime(e.created_at)}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-slate-700">
                      <b className="text-slate-900">{e.actor_name ?? 'Unknown'}</b> {actionLabel(e.action).toLowerCase()}
                      {e.school_name && <> · <span className="font-medium text-slate-900">{e.school_name}</span></>}
                    </p>
                    {details.length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {details.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}
                      </p>
                    )}
                  </div>
                  {a && <Badge tone={a.tone}>{a.label}</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
