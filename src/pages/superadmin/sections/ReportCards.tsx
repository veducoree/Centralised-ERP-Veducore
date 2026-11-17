// Superadmin → Report cards: pick a school and design its annual report card
// on top of the school's own blank card.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, FileSpreadsheet, Pencil, Plus, Search } from 'lucide-react';
import { errMsg, mgmtSupabase, timeAgo, type SchoolRecord } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingBlock, cx, inputCls } from '../ui';
import ReportCardDesigner from './ReportCardDesigner';

interface TemplateSummary {
  school_id: string;
  updated_at: string;
  background_url: string | null;
  slots: unknown[];
  elements: { kind?: string }[];
}

type Status = 'ready' | 'draft' | 'none';

function statusOf(t: TemplateSummary | undefined): Status {
  if (!t) return 'none';
  const hasTable = (t.elements ?? []).some((e) => e?.kind === 'table');
  return t.background_url && (t.slots ?? []).length && hasTable ? 'ready' : 'draft';
}

const STATUS: Record<Status, { label: string; tone: 'green' | 'amber' | 'gray' }> = {
  ready: { label: 'Ready', tone: 'green' },
  draft: { label: 'Incomplete', tone: 'amber' },
  none: { label: 'Not set up', tone: 'gray' },
};

export default function ReportCardsSection({ schools }: { schools: SchoolRecord[] }) {
  const [templates, setTemplates] = useState<Record<string, TemplateSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!mgmtSupabase) { setError('Supabase is not configured'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data, error: e } = await mgmtSupabase
        .from('report_card_templates').select('school_id, updated_at, background_url, slots, elements');
      if (e) throw e;
      setTemplates(Object.fromEntries(((data ?? []) as TemplateSummary[]).map((t) => [t.school_id, t])));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schools
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.city ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [schools, search]);

  const open = schools.find((s) => s.id === openId);
  if (open) {
    return <ReportCardDesigner school={open} onBack={() => setOpenId(null)} onSaved={load} />;
  }

  const counts = schools.reduce((acc, s) => { acc[statusOf(templates[s.id])]++; return acc; }, { ready: 0, draft: 0, none: 0 } as Record<Status, number>);

  return (
    <div className="space-y-4">
      <Card bodyClassName="flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <FileSpreadsheet className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Each school prints its year-end report card on its own design</p>
          <p className="text-xs text-slate-500">Upload the school's blank card, place the fields on it, and the school fills it from published exam results.</p>
        </div>
        <div className="flex gap-2">
          <Badge tone="green">{counts.ready} ready</Badge>
          <Badge tone="amber">{counts.draft} incomplete</Badge>
          <Badge tone="gray">{counts.none} not set up</Badge>
        </div>
      </Card>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className={cx(inputCls, 'pl-9')} placeholder="Search schools…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? <Card><LoadingBlock rows={5} /></Card> : list.length === 0 ? (
        <Card><EmptyState icon={<Building2 className="h-6 w-6" />} title="No schools found" text="Try a different search." /></Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul className="divide-y divide-slate-100">
            {list.map((s) => {
              const t = templates[s.id];
              const st = statusOf(t);
              return (
                <li key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                    {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-4 w-4 text-slate-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">{[s.city, t ? `updated ${timeAgo(t.updated_at)}` : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  <Badge tone={STATUS[st].tone} dot>{STATUS[st].label}</Badge>
                  <Button variant={t ? 'secondary' : 'primary'} size="sm" icon={t ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} onClick={() => setOpenId(s.id)}>
                    {t ? 'Edit' : 'Set up'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
