import { useMemo, useState } from 'react';
import { Building2, ChevronRight, Download, Plus, RefreshCw, Search } from 'lucide-react';
import { type SchoolHealth, type SchoolRecord } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBanner, HEALTH, LoadingBlock, cx, inputCls } from '../ui';

type StatusFilter = 'all' | 'Active' | 'Suspended';
type SortKey = 'newest' | 'name' | 'students';

export default function SchoolsSection({
  schools, loading, error, onReload, onOpen, onAdd, canCreate,
}: {
  schools: SchoolRecord[]; loading: boolean; error: string;
  onReload: () => void; onOpen: (id: string) => void; onAdd: () => void; canCreate: boolean;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [health, setHealth] = useState<SchoolHealth | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('newest');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = schools.filter((s) => {
      if (needle && ![s.name, s.adminEmail, s.city, s.address, s.contactNumber, s.adminName]
        .some((v) => (v ?? '').toLowerCase().includes(needle))) return false;
      if (status === 'Active' && s.status !== 'Active') return false;
      if (status === 'Suspended' && s.status !== 'Suspended') return false;
      if (health !== 'all' && s.health !== health) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'students') return b.students - a.students;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }, [schools, q, status, health, sort]);

  const counts = {
    all: schools.length,
    Active: schools.filter((s) => s.status === 'Active').length,
    Suspended: schools.filter((s) => s.status === 'Suspended').length,
  };

  function exportCsv() {
    const rows = [
      ['School', 'City', 'Status', 'Students', 'Teachers', 'Parents',
        'Admin', 'Admin email', 'Phone', 'Health', 'Last attendance', 'Joined'],
      ...filtered.map((s) => [
        s.name, s.city || s.address, s.status, s.students, s.teachers, s.parents, s.adminName, s.adminEmail, s.contactNumber,
        s.health ? HEALTH[s.health].label : '', s.lastAttendance ?? '', s.createdAt?.slice(0, 10) ?? '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `veducore-schools-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {error && <ErrorBanner message={error} onRetry={onReload} />}

      <div className="flex flex-wrap items-center gap-2">
        {([
          ['all', 'All'], ['Active', 'Active'], ['Suspended', 'Suspended'],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)}
            className={cx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
              status === k ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}>
            {l} <span className={status === k ? 'text-indigo-200' : 'text-slate-400'}>{counts[k]}</span>
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportCsv} icon={<Download className="h-3.5 w-3.5" />}>Export CSV</Button>
          <Button variant="secondary" size="sm" onClick={onReload} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>Refresh</Button>
          {canCreate && <Button size="sm" onClick={onAdd} icon={<Plus className="h-3.5 w-3.5" />}>Onboard school</Button>}
        </div>
      </div>

      <Card bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by school, admin, email, city or phone…"
              className={cx(inputCls, 'pl-10')} />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:w-[320px]">
            <select value={health} onChange={(e) => setHealth(e.target.value as SchoolHealth | 'all')} className={inputCls}>
              <option value="all">Any health</option>
              {Object.entries(HEALTH).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={inputCls}>
              <option value="newest">Newest first</option>
              <option value="name">Name A–Z</option>
              <option value="students">Most students</option>
            </select>
          </div>
        </div>

        {loading && !schools.length ? (
          <div className="p-5"><LoadingBlock rows={6} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Building2 className="h-5 w-5" />}
            title={schools.length ? 'No schools match these filters' : 'No schools yet'}
            text={schools.length ? 'Clear the search or pick a different filter.' : 'Onboard the first school to get started.'}
            action={!schools.length && canCreate ? <Button size="sm" onClick={onAdd} icon={<Plus className="h-3.5 w-3.5" />}>Onboard school</Button> : undefined} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3">School</th>
                    <th className="px-3 py-3 text-right">Students</th>
                    <th className="px-3 py-3 text-right">Teachers</th>
                    <th className="px-3 py-3">Health</th>
                    <th className="px-3 py-3">Joined</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((s) => {
                    return (
                      <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer hover:bg-indigo-50/40">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <SchoolAvatar school={s} />
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 truncate font-semibold text-slate-900">
                                {s.name}
                                {s.status === 'Suspended' && <Badge tone="red">Suspended</Badge>}
                              </p>
                              <p className="truncate text-xs text-slate-500">{s.city || s.address || '—'} · {s.adminEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-800">{s.students.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-3 text-right text-slate-600">{s.teachers}</td>
                        <td className="px-3 py-3">
                          {s.health && <Badge tone={HEALTH[s.health].tone} dot>{HEALTH[s.health].label}</Badge>}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td className="px-3 py-3 text-slate-300"><ChevronRight className="h-4 w-4" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 lg:hidden">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button onClick={() => onOpen(s.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                    <SchoolAvatar school={s} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{s.name}</p>
                      <p className="truncate text-xs text-slate-500">{s.students} students</p>
                      <div className="mt-1 flex gap-1.5">
                        {s.status === 'Suspended' && <Badge tone="red">Suspended</Badge>}
                        {s.health && <Badge tone={HEALTH[s.health].tone}>{HEALTH[s.health].label}</Badge>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
              Showing {filtered.length} of {schools.length} schools
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

export function SchoolAvatar({ school, size = 'md' }: { school: Pick<SchoolRecord, 'name' | 'logoUrl'>; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-14 w-14 text-lg rounded-2xl' : 'h-10 w-10 text-sm rounded-xl';
  if (school.logoUrl) {
    return <img src={school.logoUrl} alt="" className={cx(cls, 'flex-shrink-0 border border-slate-100 bg-white object-contain p-1')} />;
  }
  return (
    <div className={cx(cls, 'flex flex-shrink-0 items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-500 font-bold text-white')}>
      {school.name.trim().charAt(0).toUpperCase()}
    </div>
  );
}
