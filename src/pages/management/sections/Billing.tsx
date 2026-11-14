import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Pencil, Plus, Printer, RefreshCw, Search, Wallet, XCircle } from 'lucide-react';
import {
  callManageSchools, daysUntil, errMsg, fmtDate, rupees, type Invoice, type Me, type Plan, type SchoolRecord,
} from '../api';
import {
  Badge, Button, Card, EmptyState, ErrorBanner, Field, LoadingBlock, Modal, Stat, SUB_STATUS, Tabs, cx, inputCls, toast,
} from '../ui';

type Tab = 'subscriptions' | 'invoices' | 'plans';

export default function BillingSection({
  me, schools, onOpenSchool, onSchoolsChanged,
}: { me: Me; schools: SchoolRecord[]; onOpenSchool: (id: string) => void; onSchoolsChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('subscriptions');
  const canManage = me.role !== 'support';

  const mrr = schools.reduce((a, s) => a + (s.subscription?.mrr ?? 0), 0);
  const paying = schools.filter((s) => s.subscription && ['active', 'past_due'].includes(s.subscription.status) && s.subscription.amount > 0);
  const pastDue = schools.filter((s) => s.subscription?.status === 'past_due').length;
  const trials = schools.filter((s) => s.subscription?.status === 'trial').length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="emerald" label="Monthly recurring revenue" value={rupees(mrr)} icon={<Wallet className="h-5 w-5" />}
          sub={`${rupees(mrr * 12)} annual run-rate`} />
        <Stat tone="indigo" label="Paying schools" value={paying.length} icon={<CheckCircle2 className="h-5 w-5" />}
          sub={`Avg ${rupees(paying.length ? Math.round(mrr / paying.length) : 0)} / month`} />
        <Stat tone="violet" label="On trial" value={trials} icon={<FileText className="h-5 w-5" />} sub="Convert before the trial ends" />
        <Stat tone="rose" label="Past due" value={pastDue} icon={<XCircle className="h-5 w-5" />} sub="Subscriptions marked past due" />
      </div>

      <Tabs tabs={[
        { id: 'subscriptions', label: 'Subscriptions' },
        { id: 'invoices', label: 'Invoices' },
        { id: 'plans', label: 'Plans & pricing' },
      ]} value={tab} onChange={setTab} />

      {tab === 'subscriptions' && <SubscriptionsTab schools={schools} onOpenSchool={onOpenSchool} />}
      {tab === 'invoices' && <InvoicesTab schools={schools} canManage={canManage} onChanged={onSchoolsChanged} />}
      {tab === 'plans' && <PlansTab canManage={canManage} onChanged={onSchoolsChanged} />}
    </div>
  );
}

// ── Subscriptions ────────────────────────────────────────────────────────────

function SubscriptionsTab({ schools, onOpenSchool }: { schools: SchoolRecord[]; onOpenSchool: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const rows = useMemo(() => schools
    .filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()))
    .filter((s) => status === 'all' || (status === 'none' ? !s.subscription?.planId : s.subscription?.status === status))
    .sort((a, b) => {
      const ea = a.subscription?.status === 'trial' ? a.subscription.trialEndsAt : a.subscription?.currentPeriodEnd;
      const eb = b.subscription?.status === 'trial' ? b.subscription.trialEndsAt : b.subscription?.currentPeriodEnd;
      return String(ea ?? '9999').localeCompare(String(eb ?? '9999'));
    }), [schools, q, status]);

  return (
    <Card bodyClassName="p-0">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={cx(inputCls, 'pl-10')} placeholder="Search school…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={cx(inputCls, 'sm:w-48')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(SUB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          <option value="none">No plan</option>
        </select>
      </div>
      {rows.length === 0 ? <EmptyState icon={<Wallet className="h-5 w-5" />} title="No subscriptions match" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3">School</th><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Students</th><th className="px-3 py-3 text-right">Per cycle</th>
                <th className="px-3 py-3 text-right">MRR</th><th className="px-3 py-3">Ends</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((s) => {
                const sub = s.subscription;
                const end = sub?.status === 'trial' ? sub.trialEndsAt : sub?.currentPeriodEnd;
                const d = daysUntil(end);
                return (
                  <tr key={s.id} onClick={() => onOpenSchool(s.id)} className="cursor-pointer hover:bg-indigo-50/40">
                    <td className="px-5 py-3 font-semibold text-slate-900">{s.name}</td>
                    <td className="px-3 py-3 text-slate-700">{sub?.planName ?? <span className="text-slate-400">No plan</span>}
                      {sub?.billingCycle && sub.planName && <span className="text-xs text-slate-400"> · {sub.billingCycle}</span>}</td>
                    <td className="px-3 py-3">{sub && <Badge tone={SUB_STATUS[sub.status].tone}>{SUB_STATUS[sub.status].label}</Badge>}</td>
                    <td className="px-3 py-3 text-right">
                      {s.students}{sub?.studentLimit ? <span className={cx('text-xs', s.students > sub.studentLimit ? 'font-bold text-rose-600' : 'text-slate-400')}> / {sub.studentLimit}</span> : null}
                    </td>
                    <td className="px-3 py-3 text-right">{sub?.amount ? rupees(sub.amount) : '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold">{sub?.mrr ? rupees(sub.mrr) : '—'}</td>
                    <td className="px-3 py-3">
                      {end ? <span className={cx(d! < 0 ? 'text-rose-600' : d! <= 30 ? 'text-amber-600' : 'text-slate-600')}>{fmtDate(end)}</span> : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Invoices ─────────────────────────────────────────────────────────────────

const INV_TONE = { paid: 'green', issued: 'amber', draft: 'blue', void: 'gray' } as const;

function InvoicesTab({ schools, canManage, onChanged }: { schools: SchoolRecord[]; canManage: boolean; onChanged: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setInvoices((await callManageSchools<{ invoices: Invoice[] }>({ action: 'invoices-list' })).invoices);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function setInvoiceStatus(inv: Invoice, s: Invoice['status']) {
    if (s === 'void' && !window.confirm(`Void ${inv.invoice_number}? It will no longer count as outstanding.`)) return;
    try {
      await callManageSchools({ action: 'invoice-update', invoice_id: inv.id, status: s });
      toast(`${inv.invoice_number} marked ${s}`);
      load();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  const rows = invoices.filter((i) => {
    if (status === 'overdue') return i.status === 'issued' && i.due_date && daysUntil(i.due_date)! < 0;
    return status === 'all' || i.status === status;
  }).filter((i) => !q || `${i.invoice_number} ${i.school_name} ${i.description}`.toLowerCase().includes(q.toLowerCase()));

  const outstanding = invoices.filter((i) => i.status === 'issued').reduce((a, i) => a + i.total_amount, 0);

  return (
    <>
      {error && <ErrorBanner message={error} onRetry={load} />}
      <Card bodyClassName="p-0"
        title="Invoices" subtitle={`${rupees(outstanding)} outstanding`}
        actions={<>
          <Button size="sm" variant="secondary" onClick={load} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>Refresh</Button>
          {canManage && <Button size="sm" onClick={() => setCreating(true)} icon={<Plus className="h-3.5 w-3.5" />}>New invoice</Button>}
        </>}>
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={cx(inputCls, 'pl-10')} placeholder="Invoice number, school…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={cx(inputCls, 'sm:w-44')} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option><option value="issued">Unpaid</option><option value="overdue">Overdue</option>
            <option value="paid">Paid</option><option value="draft">Draft</option><option value="void">Void</option>
          </select>
        </div>
        {loading && !invoices.length ? <div className="p-5"><LoadingBlock /></div> : rows.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No invoices" text="Create an invoice to bill a school for its subscription." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Invoice</th><th className="px-3 py-3">School</th><th className="px-3 py-3">Issued</th>
                  <th className="px-3 py-3">Due</th><th className="px-3 py-3 text-right">Total</th><th className="px-3 py-3">Status</th><th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((i) => {
                  const overdue = i.status === 'issued' && i.due_date && daysUntil(i.due_date)! < 0;
                  return (
                    <tr key={i.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs font-semibold text-slate-900">{i.invoice_number}</p>
                        <p className="max-w-[220px] truncate text-xs text-slate-500">{i.description}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{i.school_name}</td>
                      <td className="px-3 py-3 text-slate-600">{fmtDate(i.issue_date)}</td>
                      <td className={cx('px-3 py-3', overdue ? 'font-semibold text-rose-600' : 'text-slate-600')}>{fmtDate(i.due_date)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">{rupees(i.total_amount)}</td>
                      <td className="px-3 py-3">
                        <Badge tone={overdue ? 'red' : INV_TONE[i.status]}>{overdue ? 'overdue' : i.status}</Badge>
                        {i.paid_at && <p className="mt-0.5 text-[11px] text-slate-400">{fmtDate(i.paid_at)}{i.payment_method ? ` · ${i.payment_method}` : ''}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => printInvoice(i, schools.find((s) => s.id === i.school_id))} icon={<Printer className="h-3.5 w-3.5" />}>Print</Button>
                          {canManage && (i.status === 'issued' || i.status === 'draft') && (
                            <Button size="sm" variant="secondary" onClick={() => setPaying(i)}>Mark paid</Button>
                          )}
                          {canManage && i.status === 'draft' && <Button size="sm" variant="ghost" onClick={() => setInvoiceStatus(i, 'issued')}>Issue</Button>}
                          {canManage && i.status !== 'void' && i.status !== 'paid' && (
                            <Button size="sm" variant="ghost" onClick={() => setInvoiceStatus(i, 'void')}>Void</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && <NewInvoiceModal schools={schools} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); onChanged(); }} />}
      {paying && <MarkPaidModal invoice={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); onChanged(); }} />}
    </>
  );
}

function NewInvoiceModal({ schools, onClose, onCreated }: { schools: SchoolRecord[]; onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({
    school_id: '', description: '', period_start: '', period_end: '', amount: '', apply_gst: true,
    due_date: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10), notes: '', status: 'issued', extend_subscription: true,
  });
  const [saving, setSaving] = useState(false);

  function pickSchool(id: string) {
    const s = schools.find((x) => x.id === id);
    const sub = s?.subscription;
    const start = sub?.currentPeriodEnd
      ? new Date(new Date(sub.currentPeriodEnd + 'T00:00:00').getTime() + 86_400_000)
      : new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + (sub?.billingCycle === 'monthly' ? 1 : sub?.billingCycle === 'quarterly' ? 3 : 12));
    end.setDate(end.getDate() - 1);
    setF((cur) => ({
      ...cur,
      school_id: id,
      amount: sub?.amount ? String(sub.amount / 100) : cur.amount,
      description: sub?.planName ? `Veducore ${sub.planName} plan — ${s!.students} students` : cur.description,
      period_start: start.toISOString().slice(0, 10),
      period_end: end.toISOString().slice(0, 10),
    }));
  }

  const amount = Math.round(Number(f.amount || 0) * 100);
  const tax = f.apply_gst ? Math.round(amount * 0.18) : 0;

  async function save() {
    setSaving(true);
    try {
      await callManageSchools({ action: 'invoice-create', invoice: { ...f, amount } });
      toast('Invoice created');
      onCreated();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New invoice" size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={saving} disabled={!f.school_id || !f.description.trim() || amount <= 0}>Create invoice</Button>
      </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="School" required className="sm:col-span-2">
          <select className={inputCls} value={f.school_id} onChange={(e) => pickSchool(e.target.value)}>
            <option value="">Select a school…</option>
            {[...schools].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Description" required className="sm:col-span-2">
          <input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Veducore Growth plan — 2026-27" />
        </Field>
        <Field label="Period from"><input type="date" className={inputCls} value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} /></Field>
        <Field label="Period to"><input type="date" className={inputCls} value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} /></Field>
        <Field label="Amount before tax (₹)" required>
          <input type="number" min={0} className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <Field label="Due date"><input type="date" className={inputCls} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        <Field label="Notes (printed on invoice)" className="sm:col-span-2">
          <textarea className={cx(inputCls, 'min-h-[60px]')} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Bank details, UPI ID, terms…" />
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.apply_gst} onChange={(e) => setF({ ...f, apply_gst: e.target.checked })} className="rounded" /> Add 18% GST
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.extend_subscription} onChange={(e) => setF({ ...f, extend_subscription: e.target.checked })} className="rounded" />
            Set the school's subscription period to these dates
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.status === 'draft'} onChange={(e) => setF({ ...f, status: e.target.checked ? 'draft' : 'issued' })} className="rounded" />
            Save as draft (not counted as outstanding)
          </label>
        </div>
      </div>
      <div className="mt-5 space-y-1 rounded-2xl bg-slate-50 p-4 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Amount</span><span>{rupees(amount, { decimals: true })}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">GST (18%)</span><span>{rupees(tax, { decimals: true })}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-1 font-bold"><span>Total</span><span>{rupees(amount + tax, { decimals: true })}</span></div>
      </div>
    </Modal>
  );
}

function MarkPaidModal({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ payment_method: 'Bank transfer', payment_reference: '', paid_at: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await callManageSchools({ action: 'invoice-update', invoice_id: invoice.id, status: 'paid', ...f });
      toast(`${invoice.invoice_number} marked paid`);
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Record payment — ${invoice.invoice_number}`} subtitle={`${invoice.school_name} · ${rupees(invoice.total_amount)}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" onClick={save} loading={saving}>Mark paid</Button></>}>
      <div className="space-y-4">
        <Field label="Method">
          <select className={inputCls} value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}>
            {['Bank transfer', 'UPI', 'Cheque', 'Cash', 'Razorpay', 'Other'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Reference / UTR"><input className={inputCls} value={f.payment_reference} onChange={(e) => setF({ ...f, payment_reference: e.target.value })} /></Field>
        <Field label="Received on"><input type="date" className={inputCls} value={f.paid_at} onChange={(e) => setF({ ...f, paid_at: e.target.value })} /></Field>
        <p className="text-xs text-slate-500">A past-due, expired or trial subscription is set back to Active.</p>
      </div>
    </Modal>
  );
}

function esc(v: unknown) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function printInvoice(i: Invoice, school?: SchoolRecord) {
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) { toast('Allow pop-ups to print invoices', 'error'); return; }
  const money = (p: number) => rupees(p, { decimals: true });
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(i.invoice_number)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:40px;font-size:14px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #4f46e5;padding-bottom:20px}
  h1{margin:0;font-size:28px;color:#4f46e5} .muted{color:#64748b} table{width:100%;border-collapse:collapse;margin-top:28px}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;border-bottom:1px solid #e2e8f0;padding:8px 0}
  td{padding:10px 0;border-bottom:1px solid #f1f5f9} .r{text-align:right} .tot td{font-weight:700;font-size:16px;border-top:2px solid #0f172a;border-bottom:0}
  .badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;background:${i.status === 'paid' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'}}
  .notes{margin-top:28px;padding:14px;background:#f8fafc;border-radius:8px;white-space:pre-wrap}
</style></head><body>
<div class="top"><div><h1>Veducore</h1><div class="muted">School ERP platform</div></div>
<div class="r"><div style="font-size:20px;font-weight:700">INVOICE</div><div>${esc(i.invoice_number)}</div><div class="badge">${esc(i.status.toUpperCase())}</div></div></div>
<div style="display:flex;justify-content:space-between;margin-top:24px">
<div><div class="muted" style="font-size:12px">BILL TO</div><div style="font-weight:600;font-size:16px">${esc(school?.name ?? i.school_name)}</div>
<div>${esc([school?.address, school?.city].filter(Boolean).join(', '))}</div><div>${esc(school?.contactNumber ?? '')}</div><div>${esc(school?.adminEmail ?? '')}</div></div>
<div class="r"><div><span class="muted">Issued:</span> ${esc(fmtDate(i.issue_date))}</div>${i.due_date ? `<div><span class="muted">Due:</span> ${esc(fmtDate(i.due_date))}</div>` : ''}
${i.period_start ? `<div><span class="muted">Period:</span> ${esc(fmtDate(i.period_start))} – ${esc(fmtDate(i.period_end))}</div>` : ''}
${i.paid_at ? `<div><span class="muted">Paid:</span> ${esc(fmtDate(i.paid_at))}${i.payment_method ? ' · ' + esc(i.payment_method) : ''}${i.payment_reference ? ' · ' + esc(i.payment_reference) : ''}</div>` : ''}</div></div>
<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>
<tr><td>${esc(i.description)}</td><td class="r">${money(i.amount)}</td></tr>
${i.tax_amount ? `<tr><td class="muted">GST @ 18%</td><td class="r">${money(i.tax_amount)}</td></tr>` : ''}
<tr class="tot"><td>Total</td><td class="r">${money(i.total_amount)}</td></tr></tbody></table>
${i.notes ? `<div class="notes">${esc(i.notes)}</div>` : ''}
<p class="muted" style="margin-top:40px;font-size:12px">Thank you for choosing Veducore.</p>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

// ── Plans ────────────────────────────────────────────────────────────────────

function PlansTab({ canManage, onChanged }: { canManage: boolean; onChanged: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Plan> | null>(null);

  async function load() {
    setLoading(true);
    try {
      setPlans((await callManageSchools<{ plans: Plan[] }>({ action: 'plans-list' })).plans);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  if (loading && !plans.length) return <LoadingBlock />;
  return (
    <>
      <div className="flex justify-between gap-3">
        <p className="text-sm text-slate-500">Price per cycle = base price + price per student × enrolled students. A school's custom price overrides this.</p>
        {canManage && <Button size="sm" onClick={() => setEditing({ billing_cycle: 'yearly', is_active: true, features: [], sort_order: plans.length })}
          icon={<Plus className="h-3.5 w-3.5" />}>New plan</Button>}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => (
          <div key={p.id} className={cx('flex flex-col rounded-3xl border bg-white p-5 shadow-sm', p.is_active ? 'border-slate-100' : 'border-dashed border-slate-300 opacity-70')}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-bold text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">{p.description}</p>
              </div>
              {!p.is_active && <Badge>Hidden</Badge>}
            </div>
            <p className="mt-4 text-2xl font-bold text-slate-900">{rupees(p.price_per_student)}<span className="text-sm font-medium text-slate-500"> /student</span></p>
            <p className="text-xs text-slate-500">+ {rupees(p.base_price)} base · billed {p.billing_cycle}</p>
            <p className="mt-1 text-xs text-slate-500">{p.max_students ? `Up to ${p.max_students} students` : 'Unlimited students'}</p>
            <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-600">
              {p.features.map((f) => <li key={f} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />{f}</li>)}
            </ul>
            {canManage && <Button className="mt-4" size="sm" variant="secondary" onClick={() => setEditing(p)} icon={<Pencil className="h-3.5 w-3.5" />}>Edit</Button>}
          </div>
        ))}
      </div>
      {editing && <PlanModal plan={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChanged(); }} />}
    </>
  );
}

function PlanModal({ plan, onClose, onSaved }: { plan: Partial<Plan>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: plan.name ?? '', description: plan.description ?? '',
    base_price: plan.base_price != null ? String(plan.base_price / 100) : '0',
    price_per_student: plan.price_per_student != null ? String(plan.price_per_student / 100) : '0',
    billing_cycle: plan.billing_cycle ?? 'yearly', max_students: plan.max_students ? String(plan.max_students) : '',
    features: (plan.features ?? []).join('\n'), is_active: plan.is_active !== false, sort_order: plan.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await callManageSchools({
        action: 'plan-save',
        plan: {
          id: plan.id, ...f,
          base_price: Math.round(Number(f.base_price || 0) * 100),
          price_per_student: Math.round(Number(f.price_per_student || 0) * 100),
          features: f.features.split('\n').map((s) => s.trim()).filter(Boolean),
        },
      });
      toast('Plan saved');
      onSaved();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={plan.id ? `Edit ${plan.name}` : 'New plan'}
      subtitle={plan.id ? 'Price changes apply to every school on this plan without a custom price' : undefined}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} disabled={!f.name.trim()}>Save plan</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Billing cycle">
          <select className={inputCls} value={f.billing_cycle} onChange={(e) => setF({ ...f, billing_cycle: e.target.value as Plan['billing_cycle'] })}>
            <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
          </select>
        </Field>
        <Field label="Description" className="sm:col-span-2"><input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Base price per cycle (₹)"><input type="number" min={0} className={inputCls} value={f.base_price} onChange={(e) => setF({ ...f, base_price: e.target.value })} /></Field>
        <Field label="Price per student per cycle (₹)"><input type="number" min={0} className={inputCls} value={f.price_per_student} onChange={(e) => setF({ ...f, price_per_student: e.target.value })} /></Field>
        <Field label="Max students" hint="Empty = unlimited"><input type="number" min={1} className={inputCls} value={f.max_students} onChange={(e) => setF({ ...f, max_students: e.target.value })} /></Field>
        <Field label="Display order"><input type="number" className={inputCls} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} /></Field>
        <Field label="Features (one per line)" className="sm:col-span-2">
          <textarea className={cx(inputCls, 'min-h-[100px]')} value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="rounded" />
          Available for new schools
        </label>
      </div>
    </Modal>
  );
}
