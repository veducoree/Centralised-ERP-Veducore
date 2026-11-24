import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, CheckCircle, Info, Plus, RefreshCw, Save, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  fetchFeeHeads, saveFeeHead, deleteFeeHead, saveFeeHeadAmounts, generateSchoolFees, fetchSchool,
  type FeeHeadKind,
} from '@/services/api';
import type { Class } from '@/types';
import { sortByClassOrder } from '@/lib/classOrder';
import { formatCurrency } from '@/lib/utils';

const KIND_LABEL: Record<FeeHeadKind, string> = {
  one_time: 'At admission (once)',
  annual: 'Once a year',
  monthly: 'Every month',
  quarterly: 'Every quarter',
};
const KIND_HINT: Record<FeeHeadKind, string> = {
  one_time: 'Charged only when a new student is admitted',
  annual: 'One due per session',
  monthly: '12 dues, Apr–Mar (from the joining month)',
  quarterly: 'Apr, Jul, Oct, Jan (from the joining quarter)',
};
const PER: Record<FeeHeadKind, string> = { one_time: '', annual: '/yr', monthly: '/mo', quarterly: '/qtr' };

const SUGGESTED: { name: string; kind: FeeHeadKind }[] = [
  { name: 'Admission Fee', kind: 'one_time' },
  { name: 'Annual Charges', kind: 'annual' },
  { name: 'Tuition Fee', kind: 'monthly' },
  { name: 'Exam Fee', kind: 'quarterly' },
];

interface EditHead { id: string; name: string; kind: FeeHeadKind; is_active: boolean; isNew?: boolean }

const cellKey = (headId: string, classId: string) => `${headId}:${classId}`;
let tempId = 0;

export default function FeeHeadsSetup({ schoolId, classes }: { schoolId: string; classes: Class[] }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [heads, setHeads] = useState<EditHead[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [dueDay, setDueDay] = useState(10);
  const [sessionName, setSessionName] = useState('');
  const [genClass, setGenClass] = useState('');
  // First month to create dues for ('' = start of session). Defaults to this month.
  const [genFrom, setGenFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
  const [generating, setGenerating] = useState(false);
  const [confirmGen, setConfirmGen] = useState(false);
  const [lastGen, setLastGen] = useState<string | null>(null);

  const sortedClasses = useMemo(() => sortByClassOrder(classes), [classes]);
  // Months of the session (Apr → Mar) from its name, e.g. "2026-27".
  const sessionMonths = useMemo(() => {
    const y = Number((sessionName.match(/^(\d{4})/) || [])[1]) || new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(y, 3 + i, 1);
      return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, label: d.toLocaleString('en-IN', { month: 'short', year: 'numeric' }) };
    });
  }, [sessionName]);
  const fromLabel = genFrom ? (sessionMonths.find((m) => m.value === genFrom)?.label ?? genFrom) : 'the start of the session';
  const snapshot = (h: EditHead[], c: Record<string, string>, d: string[]) => JSON.stringify({ h, c, d });
  const dirty = snapshot(heads, cells, deleted) !== savedSnapshot;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sch] = await Promise.all([fetchFeeHeads(), fetchSchool(schoolId)]);
      const h: EditHead[] = list.map((x) => ({ id: x.id, name: x.name, kind: x.kind, is_active: x.is_active }));
      const c: Record<string, string> = {};
      for (const x of list) for (const [cls, amt] of Object.entries(x.amounts)) c[cellKey(x.id, cls)] = String(amt);
      setHeads(h);
      setCells(c);
      setDeleted([]);
      setSavedSnapshot(snapshot(h, c, []));
      const s = (sch?.settings ?? {}) as Record<string, unknown>;
      setDueDay(Math.min(Math.max(Number(s.feeDueDay) || 10, 1), 28));
      setSessionName(sch?.academic_year ?? '');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load fee heads', 'error');
    } finally {
      setLoading(false);
    }
  }, [schoolId, toast]);

  useEffect(() => { load(); }, [load]);

  function addHead(name = '', kind: FeeHeadKind = 'monthly') {
    setHeads((cur) => [...cur, { id: `new-${++tempId}`, name, kind, is_active: true, isNew: true }]);
  }

  function removeHead(h: EditHead) {
    setHeads((cur) => cur.filter((x) => x.id !== h.id));
    if (!h.isNew) setDeleted((d) => [...d, h.id]);
    setCells((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => !k.startsWith(`${h.id}:`))));
  }

  /** Copies the first filled amount in a column to every class. */
  function fillColumn(headId: string) {
    const first = sortedClasses.map((c) => cells[cellKey(headId, c.id)]).find((v) => v && Number(v) > 0);
    if (!first) { toast('Enter the amount for one class first', 'error'); return; }
    setCells((cur) => {
      const next = { ...cur };
      for (const c of sortedClasses) next[cellKey(headId, c.id)] = first;
      return next;
    });
  }

  async function save() {
    const names = heads.map((h) => h.name.trim().toLowerCase());
    if (heads.some((h) => !h.name.trim())) { toast('Every fee head needs a name', 'error'); return; }
    if (new Set(names).size !== names.length) { toast('Two fee heads have the same name', 'error'); return; }
    const badCell = Object.values(cells).find((v) => v !== '' && !(Number(v) >= 0));
    if (badCell !== undefined) { toast('Amounts must be numbers', 'error'); return; }

    setSaving(true);
    try {
      for (const id of deleted) await deleteFeeHead(id);
      const idMap: Record<string, string> = {};
      for (const [i, h] of heads.entries()) {
        const saved = await saveFeeHead(schoolId, { id: h.isNew ? undefined : h.id, name: h.name, kind: h.kind, is_active: h.is_active, sort_order: i });
        idMap[h.id] = saved.id;
      }
      const rows: { fee_head_id: string; class_id: string; amount: number }[] = [];
      for (const h of heads) {
        for (const c of sortedClasses) {
          const v = cells[cellKey(h.id, c.id)];
          rows.push({ fee_head_id: idMap[h.id], class_id: c.id, amount: v ? Math.round(Number(v) * 100) / 100 : 0 });
        }
      }
      await saveFeeHeadAmounts(schoolId, rows);
      toast('Fee heads saved', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save fee heads', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function runGenerate() {
    setConfirmGen(false);
    setGenerating(true);
    try {
      const r = await generateSchoolFees(genClass || null, genFrom || null);
      const where = genClass ? sortedClasses.find((c) => c.id === genClass)?.name : 'all classes';
      setLastGen(r.created > 0
        ? `${r.created} new dues created for ${r.students} students (${where}).`
        : `Everything is already up to date for ${r.students} students (${where}).`);
      toast(r.created > 0 ? `${r.created} dues created` : 'Already up to date', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to generate fees', 'error');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading fee heads…
      </div>
    );
  }

  const activeHeads = heads.filter((h) => h.is_active);

  return (
    <div className="space-y-5">
      {/* How it works */}
      <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-slate-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <div className="space-y-1">
          <p><b>1.</b> Add your fee heads and how often each is charged. <b>2.</b> Fill the amount for each class below. <b>3.</b> Save.</p>
          <p className="text-slate-500">
            New admissions get their dues automatically (from the joining month). For students already enrolled, press
            <b> Generate fees</b> once — it never creates the same due twice. Monthly dues fall on day <b>{dueDay}</b>
            {' '}(change it in Settings → Default Monthly Due Date){sessionName ? ` · Session ${sessionName}` : ''}.
          </p>
        </div>
      </div>

      {/* Fee heads */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">Fee heads</p>
          <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => addHead()}>Add fee head</Button>
        </div>

        {heads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center">
            <p className="text-sm text-slate-600">No fee heads yet. Start with the usual ones:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {SUGGESTED.map((s) => (
                <button key={s.name} type="button" onClick={() => addHead(s.name, s.kind)}
                  className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
                  + {s.name} <span className="text-brand-500">· {KIND_LABEL[s.kind]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {heads.map((h) => (
              <div key={h.id} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-slate-100 p-2 sm:grid-cols-[1.3fr_1fr_auto_auto]">
                <input value={h.name} placeholder="e.g. Tuition Fee"
                  onChange={(e) => setHeads((cur) => cur.map((x) => (x.id === h.id ? { ...x, name: e.target.value } : x)))}
                  className="h-10 rounded-[10px] border border-slate-200 px-3 text-sm focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25" />
                <div>
                  <select value={h.kind}
                    onChange={(e) => setHeads((cur) => cur.map((x) => (x.id === h.id ? { ...x, kind: e.target.value as FeeHeadKind } : x)))}
                    className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25">
                    {(Object.keys(KIND_LABEL) as FeeHeadKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                  <p className="mt-0.5 pl-1 text-[11px] text-slate-400">{KIND_HINT[h.kind]}</p>
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 px-1 text-xs text-slate-600">
                  <input type="checkbox" checked={h.is_active}
                    onChange={(e) => setHeads((cur) => cur.map((x) => (x.id === h.id ? { ...x, is_active: e.target.checked } : x)))} className="rounded" />
                  Active
                </label>
                <button type="button" title="Remove fee head" onClick={() => removeHead(h)}
                  className="justify-self-end rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Bus className="h-3.5 w-3.5" /> Transport isn&apos;t a fee head — each bus stop has its own fare in the Transport module, charged only to students using that bus.
        </p>
      </div>

      {/* Class-wise amounts */}
      {activeHeads.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4 sm:px-5">
            <div>
              <p className="text-sm font-semibold text-slate-800">Amount for each class (₹)</p>
              <p className="text-xs text-slate-500">Leave a box empty if that class doesn&apos;t pay that head.</p>
            </div>
          </div>
          {sortedClasses.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Add classes first (Classes page).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <th className="sticky left-0 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Class</th>
                    {activeHeads.map((h) => (
                      <th key={h.id} className="px-3 py-2 text-left align-bottom">
                        <p className="text-xs font-semibold text-slate-700">{h.name || 'Untitled'}</p>
                        <p className="text-[11px] font-normal text-slate-400">{KIND_LABEL[h.kind]}</p>
                        <button type="button" onClick={() => fillColumn(h.id)}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-800">
                          <Wand2 className="h-3 w-3" /> Same for all classes
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedClasses.map((c) => (
                    <tr key={c.id}>
                      <td className="sticky left-0 bg-white px-4 py-2 font-medium text-slate-800">{c.name}</td>
                      {activeHeads.map((h) => (
                        <td key={h.id} className="px-3 py-2">
                          <div className="relative w-32">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                            <input type="number" min="0" step="1" inputMode="decimal"
                              value={cells[cellKey(h.id, c.id)] ?? ''}
                              onChange={(e) => setCells((cur) => ({ ...cur, [cellKey(h.id, c.id)]: e.target.value }))}
                              className="h-9 w-full rounded-lg border border-slate-200 pl-6 pr-2 text-right text-sm focus:border-[#5B6EE8] focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/25"
                              placeholder="—" />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Save bar */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
        <Button icon={<Save className="h-4 w-4" />} onClick={save} loading={saving} disabled={!dirty}>Save fee heads</Button>
      </div>

      {/* Generate */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold text-slate-800">Generate fees for enrolled students</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Creates this session&apos;s dues (annual, monthly, quarterly and bus fares) for students already enrolled.
          Pick the month to start from — earlier months (e.g. collected before you started using Veducore) are skipped.
          Safe to press again — existing dues are never duplicated or changed.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select value={genClass} onChange={(e) => setGenClass(e.target.value)}
            className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm focus:border-[#5B6EE8] focus:outline-none">
            <option value="">All classes</option>
            {sortedClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            from
            <select value={genFrom} onChange={(e) => setGenFrom(e.target.value)}
              className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm focus:border-[#5B6EE8] focus:outline-none">
              <option value="">Start of session (April)</option>
              {sessionMonths.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setConfirmGen(true)} loading={generating} disabled={dirty}>
            Generate fees
          </Button>
          {dirty && <span className="text-xs text-slate-500">Save fee heads first</span>}
        </div>
        {lastGen && <p className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle className="h-4 w-4" /> {lastGen}</p>}
      </div>

      <ConfirmDialog
        open={confirmGen}
        onClose={() => setConfirmGen(false)}
        onConfirm={runGenerate}
        title="Generate fees?"
        message={`This creates the ${sessionName || 'current session'} dues from ${fromLabel} for ${genClass ? sortedClasses.find((c) => c.id === genClass)?.name : 'all classes'} using the amounts above${activeHeads.length ? ` (e.g. ${activeHeads.slice(0, 2).map((h) => `${h.name}${PER[h.kind]}`).join(', ')})` : ''}. Dues that already exist are skipped.`}
        confirmText="Generate"
      />

      {activeHeads.length > 0 && sortedClasses.length > 0 && (
        <p className="text-right text-xs text-slate-400">
          Example — {sortedClasses[0].name} yearly total: {formatCurrency(activeHeads.reduce((sum, h) => {
            const v = Number(cells[cellKey(h.id, sortedClasses[0].id)]) || 0;
            return sum + v * (h.kind === 'monthly' ? 12 : h.kind === 'quarterly' ? 4 : 1);
          }, 0), '₹')}
        </p>
      )}
    </div>
  );
}
