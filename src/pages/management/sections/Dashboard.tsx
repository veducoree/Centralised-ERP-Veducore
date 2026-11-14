import { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, Building2, CalendarClock, GraduationCap, IndianRupee, LifeBuoy,
  Plus, RefreshCw, TrendingUp, Users, Wallet,
} from 'lucide-react';
import {
  actionLabel, callManageSchools, compactRupees, daysUntil, errMsg, fmtDate, rupees, timeAgo,
  type AuditEntry,
} from '../api';
import { Badge, Button, Card, EmptyState, ErrorBanner, HEALTH, Skeleton, Stat, SUB_STATUS, cx } from '../ui';

interface DashboardData {
  summary: {
    totalSchools: number; activeSchools: number; suspendedSchools: number; trialSchools: number;
    totalStudents: number; totalTeachers: number; totalParents: number;
    mrr: number; collectedThisYear: number; outstandingAmount: number; overdueInvoices: number;
    onlineVolume30d: number; onlinePaid30d: number; openTickets: number;
  };
  growth: { month: string; newSchools: number; newStudents: number; onlineVolume: number }[];
  health: Record<string, number>;
  atRisk: { id: string; name: string; students: number; lastAttendance: string | null; health: 'at_risk' | 'inactive' }[];
  renewals: { id: string; name: string; planName: string | null; status: keyof typeof SUB_STATUS; endsOn: string; amount: number }[];
  planMix: Record<string, number>;
  topSchools: { id: string; name: string; students: number; teachers: number; planName: string | null }[];
  recentActivity: AuditEntry[];
}

export default function DashboardSection({
  onOpenSchool, onNavigate,
}: {
  onOpenSchool: (id: string) => void;
  onNavigate: (section: 'schools' | 'add-school' | 'billing' | 'support' | 'audit') => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await callManageSchools<DashboardData>({ action: 'dashboard' }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => onNavigate('add-school')} icon={<Plus className="h-3.5 w-3.5" />}>
            Onboard school
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}
        </div>
      ) : s && data ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              tone="indigo" label="Schools" icon={<Building2 className="h-5 w-5" />}
              value={s.totalSchools}
              onClick={() => onNavigate('schools')}
              sub={<span>{s.activeSchools} active · {s.trialSchools} on trial · {s.suspendedSchools} suspended</span>}
            />
            <Stat
              tone="cyan" label="Students on platform" icon={<Users className="h-5 w-5" />}
              value={s.totalStudents.toLocaleString('en-IN')}
              sub={<span>{s.totalParents.toLocaleString('en-IN')} parent accounts</span>}
            />
            <Stat
              tone="amber" label="Teachers" icon={<GraduationCap className="h-5 w-5" />}
              value={s.totalTeachers.toLocaleString('en-IN')}
              sub={<span>{s.totalTeachers ? (s.totalStudents / s.totalTeachers).toFixed(1) : '0'} students per teacher</span>}
            />
            <Stat
              tone="emerald" label="Monthly recurring revenue" icon={<TrendingUp className="h-5 w-5" />}
              value={rupees(s.mrr)}
              onClick={() => onNavigate('billing')}
              sub={<span>{rupees(s.mrr * 12)} a year at current plans</span>}
            />
            <Stat
              tone="violet" label="Collected this year" icon={<Wallet className="h-5 w-5" />}
              value={rupees(s.collectedThisYear)}
              onClick={() => onNavigate('billing')}
              sub={<span>Paid Veducore invoices since 1 Jan</span>}
            />
            <Stat
              tone="rose" label="Outstanding invoices" icon={<IndianRupee className="h-5 w-5" />}
              value={rupees(s.outstandingAmount)}
              onClick={() => onNavigate('billing')}
              sub={s.overdueInvoices
                ? <span className="font-semibold text-rose-600">{s.overdueInvoices} overdue</span>
                : <span>Nothing overdue</span>}
            />
            <Stat
              tone="cyan" label="Online fee volume (30 days)" icon={<Activity className="h-5 w-5" />}
              value={rupees(s.onlineVolume30d)}
              sub={<span>{s.onlinePaid30d} successful parent payments</span>}
            />
            <Stat
              tone="amber" label="Open support tickets" icon={<LifeBuoy className="h-5 w-5" />}
              value={s.openTickets}
              onClick={() => onNavigate('support')}
              sub={<span>{s.openTickets ? 'Waiting on Veducore' : 'All caught up'}</span>}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card
              className="xl:col-span-2" title="Growth — last 12 months" icon={<TrendingUp className="h-4 w-4" />}
              subtitle="New schools onboarded and students added each month"
            >
              <GrowthChart data={data.growth} />
            </Card>

            <Card title="School health" icon={<Activity className="h-4 w-4" />} subtitle="Based on how recently attendance was marked">
              <HealthBar health={data.health} total={s.totalSchools} />
              <div className="mt-5 space-y-2">
                {(['healthy', 'at_risk', 'inactive', 'setup', 'suspended'] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className={cx('h-2.5 w-2.5 rounded-full', HEALTH_DOT[k])} />
                      {HEALTH[k].label}
                      <span className="hidden text-xs text-slate-400 sm:inline">— {HEALTH[k].hint}</span>
                    </span>
                    <span className="font-semibold text-slate-900">{data.health[k] ?? 0}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card title="Renewals in the next 30 days" icon={<CalendarClock className="h-4 w-4" />}
              subtitle="Trials ending and subscription periods closing" bodyClassName="p-0">
              {data.renewals.length === 0 ? (
                <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="No renewals due" text="Set subscription end dates from Billing to track renewals here." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.renewals.map((r) => {
                    const d = daysUntil(r.endsOn) ?? 0;
                    return (
                      <li key={r.id}>
                        <button onClick={() => onOpenSchool(r.id)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">{r.name}</p>
                            <p className="text-xs text-slate-500">
                              {r.planName ?? 'No plan'} · <Badge tone={SUB_STATUS[r.status]?.tone ?? 'gray'}>{SUB_STATUS[r.status]?.label ?? r.status}</Badge>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={cx('text-xs font-bold', d < 0 ? 'text-rose-600' : d <= 7 ? 'text-amber-600' : 'text-slate-700')}>
                              {d < 0 ? `${-d}d overdue` : d === 0 ? 'Today' : `in ${d}d`}
                            </p>
                            <p className="text-[11px] text-slate-400">{fmtDate(r.endsOn)}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Needs attention" icon={<AlertTriangle className="h-4 w-4" />}
              subtitle="Schools that stopped marking attendance" bodyClassName="p-0">
              {data.atRisk.length === 0 ? (
                <EmptyState icon={<Activity className="h-5 w-5" />} title="Every school is active" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.atRisk.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => onOpenSchool(r.id)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{r.name}</p>
                          <p className="text-xs text-slate-500">{r.students} students · last attendance {r.lastAttendance ? fmtDate(r.lastAttendance) : 'never'}</p>
                        </div>
                        <Badge tone={HEALTH[r.health].tone}>{HEALTH[r.health].label}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Plan mix" icon={<Wallet className="h-4 w-4" />} subtitle="Schools on each plan">
              <div className="space-y-3">
                {Object.entries(data.planMix).sort((a, b) => b[1] - a[1]).map(([plan, count]) => {
                  const pct = s.totalSchools ? Math.round((count / s.totalSchools) * 100) : 0;
                  return (
                    <div key={plan}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium text-slate-700">{plan}</span>
                        <span className="text-slate-500">{count} · {pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold text-slate-500">Largest schools</p>
                <ul className="space-y-1.5">
                  {data.topSchools.map((t, i) => (
                    <li key={t.id}>
                      <button onClick={() => onOpenSchool(t.id)} className="flex w-full items-center gap-2 text-left text-sm hover:text-indigo-600">
                        <span className="w-4 text-xs text-slate-400">{i + 1}</span>
                        <span className="flex-1 truncate text-slate-700">{t.name}</span>
                        <span className="text-xs font-semibold text-slate-900">{t.students.toLocaleString('en-IN')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>

          <Card
            title="Recent activity" icon={<Activity className="h-4 w-4" />} subtitle="Actions taken by the Veducore team"
            actions={<Button size="sm" variant="ghost" onClick={() => onNavigate('audit')}>View full log</Button>}
            bodyClassName="p-0"
          >
            {data.recentActivity.length === 0 ? (
              <EmptyState icon={<Activity className="h-5 w-5" />} title="No activity yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">
                      {(a.actor_name ?? '?').slice(0, 1).toUpperCase()}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-slate-700">
                      <span className="font-semibold text-slate-900">{a.actor_name ?? 'Someone'}</span>{' '}
                      {actionLabel(a.action).toLowerCase()}
                      {a.school_name && <> · <span className="font-medium">{a.school_name}</span></>}
                    </p>
                    <span className="flex-shrink-0 text-xs text-slate-400">{timeAgo(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

const HEALTH_DOT = {
  healthy: 'bg-emerald-500', at_risk: 'bg-amber-500', inactive: 'bg-rose-500', setup: 'bg-sky-500', suspended: 'bg-slate-400',
} as const;

function HealthBar({ health, total }: { health: Record<string, number>; total: number }) {
  if (!total) return <div className="h-3 rounded-full bg-slate-100" />;
  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
      {(['healthy', 'at_risk', 'inactive', 'setup', 'suspended'] as const).map((k) => {
        const n = health[k] ?? 0;
        if (!n) return null;
        return <div key={k} className={HEALTH_DOT[k]} style={{ width: `${(n / total) * 100}%` }} title={`${HEALTH[k].label}: ${n}`} />;
      })}
    </div>
  );
}

function GrowthChart({ data }: { data: DashboardData['growth'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [metric, setMetric] = useState<'newStudents' | 'newSchools' | 'onlineVolume'>('newStudents');
  const values = data.map((d) => d[metric]);
  const max = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);
  const fmt = (v: number) => (metric === 'onlineVolume' ? compactRupees(v) : v.toLocaleString('en-IN'));
  const label = { newStudents: 'Students added', newSchools: 'Schools onboarded', onlineVolume: 'Online fee volume' }[metric];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-2xl font-bold text-slate-900">{fmt(total)}</p>
          <p className="text-xs text-slate-500">{label} in 12 months</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {([['newStudents', 'Students'], ['newSchools', 'Schools'], ['onlineVolume', 'Fee volume']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMetric(k)}
              className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold', metric === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex h-48 items-end gap-1.5 sm:gap-2.5">
        {data.map((d, i) => {
          const v = d[metric];
          const h = v ? Math.max((v / max) * 100, 4) : 2;
          const m = new Date(d.month + 'T00:00:00');
          return (
            <div key={d.month} className="relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {hover === i && (
                <div className="absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow">
                  {m.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}: {fmt(v)}
                </div>
              )}
              <div className={cx('w-full max-w-[36px] rounded-t-lg transition-colors', hover === i ? 'bg-indigo-600' : 'bg-indigo-400/80')} style={{ height: `${h}%` }} />
              <span className="mt-1.5 text-[10px] font-medium text-slate-400">{m.toLocaleDateString('en-IN', { month: 'short' })}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
