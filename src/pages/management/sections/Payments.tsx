import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, RefreshCw, Search, ShieldCheck, Wallet } from 'lucide-react';
import { callManageSchools, errMsg, fmtDate, fmtDateTime, rupees } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingBlock, Stat, Tabs, cx, inputCls } from '../ui';

interface Payment {
  id: string; school_id: string; school_name: string; student_name: string; admission_number: string;
  fee_amount: number; convenience_fee: number; gst_amount: number; total_amount: number;
  status: 'created' | 'processing' | 'paid' | 'failed' | 'expired'; channel: string; refund_status: string;
  receipt_number: string | null; created_at: string; paid_at: string | null; error: string | null;
}
interface Gateway { school_id: string; school_name: string; active: boolean; mode: 'live' | 'test'; key_hint: string; verified_at: string | null; updated_at: string }

const STATUS_TONE = { paid: 'green', failed: 'red', expired: 'gray', created: 'blue', processing: 'amber' } as const;

export default function PaymentsSection() {
  const [data, setData] = useState<{ payments: Payment[]; gateways: Gateway[]; schoolsWithoutGateway: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'payments' | 'gateways'>('payments');
  const [status, setStatus] = useState('all');
  const [school, setSchool] = useState('all');
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await callManageSchools({ action: 'payments-overview' }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const payments = data?.payments ?? [];
  const paid = payments.filter((p) => p.status === 'paid');
  const attempted = payments.filter((p) => p.status !== 'created');
  const successRate = attempted.length ? Math.round((paid.length / attempted.length) * 100) : 0;
  const schoolOptions = useMemo(() => Array.from(new Map(payments.map((p) => [p.school_id, p.school_name]))), [payments]);

  const rows = payments.filter((p) =>
    (status === 'all' || p.status === status) &&
    (school === 'all' || p.school_id === school) &&
    (!q || `${p.student_name} ${p.admission_number} ${p.receipt_number ?? ''} ${p.school_name}`.toLowerCase().includes(q.toLowerCase())));

  const bySchool = useMemo(() => {
    const m = new Map<string, { name: string; volume: number; count: number }>();
    for (const p of paid) {
      const cur = m.get(p.school_id) ?? { name: p.school_name, volume: 0, count: 0 };
      cur.volume += p.total_amount;
      cur.count++;
      m.set(p.school_id, cur);
    }
    return [...m.values()].sort((a, b) => b.volume - a.volume).slice(0, 6);
  }, [paid]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Parent fee payments made through each school's own Razorpay account, last 90 days. Read-only.</p>
        <Button size="sm" variant="secondary" onClick={load} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>Refresh</Button>
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading && !data ? <LoadingBlock rows={6} /> : data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat tone="emerald" label="Collected (90 days)" value={rupees(paid.reduce((a, p) => a + p.total_amount, 0))} icon={<Wallet className="h-5 w-5" />}
              sub={`${paid.length} payments · fees ${rupees(paid.reduce((a, p) => a + p.fee_amount, 0))}`} />
            <Stat tone="indigo" label="Success rate" value={`${successRate}%`} icon={<CheckCircle2 className="h-5 w-5" />}
              sub={`${payments.filter((p) => p.status === 'failed').length} failed attempts`} />
            <Stat tone="cyan" label="Schools accepting online" value={data.gateways.filter((g) => g.active).length} icon={<ShieldCheck className="h-5 w-5" />}
              sub={`${data.gateways.filter((g) => g.active && g.mode === 'live').length} live · ${data.schoolsWithoutGateway} not set up`} />
            <Stat tone="amber" label="Refunds" value={payments.filter((p) => p.refund_status && p.refund_status !== 'none').length} icon={<CreditCard className="h-5 w-5" />}
              sub="Payments with a refund in progress or done" />
          </div>

          {bySchool.length > 0 && (
            <Card title="Top schools by online collection">
              <div className="space-y-2.5">
                {bySchool.map((b) => (
                  <div key={b.name}>
                    <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-slate-700">{b.name}</span><span className="text-slate-500">{rupees(b.volume)} · {b.count}</span></div>
                    <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(b.volume / bySchool[0].volume) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Tabs tabs={[{ id: 'payments', label: 'Transactions', count: payments.length }, { id: 'gateways', label: 'Gateways', count: data.gateways.length }]} value={tab} onChange={setTab} />

          {tab === 'payments' ? (
            <Card bodyClassName="p-0">
              <div className="flex flex-col gap-2 border-b border-slate-100 p-4 md:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className={cx(inputCls, 'pl-10')} placeholder="Student, admission no., receipt…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <select className={cx(inputCls, 'md:w-56')} value={school} onChange={(e) => setSchool(e.target.value)}>
                  <option value="all">All schools</option>
                  {schoolOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select className={cx(inputCls, 'md:w-40')} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">Any status</option>
                  {Object.keys(STATUS_TONE).map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              {rows.length === 0 ? <EmptyState icon={<CreditCard className="h-5 w-5" />} title="No payments" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <th className="px-5 py-3">When</th><th className="px-3 py-3">School</th><th className="px-3 py-3">Student</th>
                        <th className="px-3 py-3 text-right">Fee</th><th className="px-3 py-3 text-right">Conv. + GST</th>
                        <th className="px-3 py-3 text-right">Total</th><th className="px-3 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rows.slice(0, 300).map((p) => (
                        <tr key={p.id}>
                          <td className="px-5 py-2.5 text-slate-600">{fmtDateTime(p.paid_at ?? p.created_at)}</td>
                          <td className="px-3 py-2.5 text-slate-700">{p.school_name}</td>
                          <td className="px-3 py-2.5"><p className="text-slate-800">{p.student_name}</p><p className="text-xs text-slate-400">{p.admission_number}{p.receipt_number ? ` · ${p.receipt_number}` : ''}</p></td>
                          <td className="px-3 py-2.5 text-right">{rupees(p.fee_amount, { decimals: true })}</td>
                          <td className="px-3 py-2.5 text-right text-slate-500">{rupees(p.convenience_fee + p.gst_amount, { decimals: true })}</td>
                          <td className="px-3 py-2.5 text-right font-semibold">{rupees(p.total_amount, { decimals: true })}</td>
                          <td className="px-3 py-2.5">
                            <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                            {p.refund_status && p.refund_status !== 'none' && <Badge tone="violet" className="ml-1">refund {p.refund_status}</Badge>}
                            {p.error && <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-rose-500" title={p.error}>{p.error}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 300 && <p className="px-5 py-3 text-xs text-slate-400">Showing 300 of {rows.length}. Narrow the filters to see more.</p>}
                </div>
              )}
            </Card>
          ) : (
            <Card bodyClassName="p-0">
              {data.gateways.length === 0 ? <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No school has set up Razorpay yet" text="Schools add their keys under Settings → Online payments." /> : (
                <ul className="divide-y divide-slate-100">
                  {data.gateways.map((g) => (
                    <li key={g.school_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                      <div>
                        <p className="font-semibold text-slate-800">{g.school_name}</p>
                        <p className="font-mono text-xs text-slate-400">{g.key_hint} · updated {fmtDate(g.updated_at)}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge tone={g.mode === 'live' ? 'green' : 'amber'}>{g.mode}</Badge>
                        {g.active ? <Badge tone="green" dot>On</Badge> : <Badge>Off</Badge>}
                        {g.verified_at ? <Badge tone="indigo">verified</Badge> : <Badge tone="amber"><AlertTriangle className="h-3 w-3" />unverified</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
