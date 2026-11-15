import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Upload, Download, Calendar, Smile, Sun, ChevronLeft, ChevronRight, Briefcase, Coffee, Settings as SettingsIcon, RotateCcw,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { usePermissions } from '@/auth/PermissionsContext';
import { useSchool } from '@/lib/useSchool';
import { weeklyOffDays } from '@/lib/holidays';
import { fetchHolidays, upsertHolidays, clearHolidayDates } from '@/services/api';
import type { Holiday } from '@/types';

type DayType = 'working' | 'holiday' | 'festival';
type Kind = 'working' | 'weekly_off' | 'holiday' | 'festival';

interface DayInfo {
  date: string;
  dow: number;
  kind: Kind;
  label: string;
  /** True when the day differs from the weekly pattern (a saved entry). */
  custom: boolean;
}

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const todayIso = (() => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); })();

function parseCSV(text: string) {
  const out: { date: string; type: DayType; label: string }[] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [date, type, ...rest] = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) continue;
    const t: DayType = type === 'festival' ? 'festival' : type === 'holiday' ? 'holiday' : 'working';
    out.push({ date, type: t, label: rest.join(',').replace(/^"|"$/g, '') });
  }
  return out;
}

const STYLE: Record<Kind, { cell: string; date: string; text: string }> = {
  working:    { cell: 'bg-white border-slate-100 hover:border-slate-300', date: 'text-slate-800', text: 'text-slate-400' },
  weekly_off: { cell: 'bg-slate-50 border-slate-200 hover:border-slate-300', date: 'text-slate-400', text: 'text-slate-400' },
  holiday:    { cell: 'bg-red-50 border-red-200 hover:border-red-300', date: 'text-red-600', text: 'text-red-500' },
  festival:   { cell: 'bg-amber-50 border-amber-200 hover:border-amber-300', date: 'text-amber-700', text: 'text-amber-600' },
};

export default function AdminHolidays() {
  const { profile } = useAuth();
  const { can } = usePermissions();
  const canEdit = can('holidays', 'edit');
  const toast = useToast();
  const school = useSchool();
  const schoolId = profile?.school_id ?? '';
  const offDays = weeklyOffDays(school);
  const fiveDay = offDays.includes(6);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [rows, setRows] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DayInfo | null>(null);
  const [editType, setEditType] = useState<DayType>('holiday');
  const [editLabel, setEditLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    try {
      setRows(await fetchHolidays(schoolId));
    } catch {
      toast('Could not load holidays', 'error');
    } finally {
      setLoading(false);
    }
  }, [schoolId, toast]);

  useEffect(() => { load(); }, [load]);

  const byDate = useMemo(() => new Map(rows.map((r) => [r.date, r])), [rows]);

  const isWeeklyOff = useCallback((dow: number) => offDays.includes(dow), [offDays]);

  const days: DayInfo[] = useMemo(() => {
    const n = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => {
      const date = iso(year, month, i + 1);
      const dow = new Date(year, month, i + 1).getDay();
      const r = byDate.get(date);
      if (r?.type === 'holiday' || r?.type === 'festival') {
        return { date, dow, kind: r.type, label: r.label || (r.type === 'festival' ? 'Festival' : 'Holiday'), custom: true };
      }
      if (r?.type === 'working') return { date, dow, kind: 'working' as Kind, label: isWeeklyOff(dow) ? 'Working day' : '', custom: isWeeklyOff(dow) };
      return isWeeklyOff(dow)
        ? { date, dow, kind: 'weekly_off' as Kind, label: 'Weekly off', custom: false }
        : { date, dow, kind: 'working' as Kind, label: '', custom: false };
    });
  }, [year, month, byDate, isWeeklyOff]);

  const stats = useMemo(() => ({
    working: days.filter((d) => d.kind === 'working').length,
    weekly: days.filter((d) => d.kind === 'weekly_off').length,
    holiday: days.filter((d) => d.kind === 'holiday').length,
    festival: days.filter((d) => d.kind === 'festival').length,
  }), [days]);

  const listed = days.filter((d) => d.kind === 'holiday' || d.kind === 'festival' || (d.kind === 'working' && d.custom));

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  function openDay(d: DayInfo) {
    if (!canEdit) return;
    setEditing(d);
    setEditType(d.kind === 'festival' ? 'festival' : d.kind === 'holiday' ? 'holiday' : d.kind === 'weekly_off' ? 'working' : 'holiday');
    setEditLabel(d.kind === 'holiday' || d.kind === 'festival' ? d.label : '');
  }

  async function saveDay() {
    if (!editing || !schoolId) return;
    const weekly = isWeeklyOff(editing.dow);
    const label = editLabel.trim();
    if (editType !== 'working' && !label) { toast('Give the holiday a name, e.g. Diwali', 'error'); return; }
    setSaving(true);
    try {
      if (editType === 'working' && !weekly) {
        // A normal weekday back to working: nothing to store.
        await clearHolidayDates(schoolId, [editing.date]);
      } else {
        await upsertHolidays([{ school_id: schoolId, date: editing.date, type: editType, label: editType === 'working' ? null : label }]);
      }
      await load();
      setEditing(null);
      toast('Calendar updated', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function resetDay() {
    if (!editing || !schoolId) return;
    setSaving(true);
    try {
      await clearHolidayDates(schoolId, [editing.date]);
      await load();
      setEditing(null);
      toast('Back to the normal weekly pattern', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not reset', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !schoolId) return;
    setImporting(true);
    try {
      const parsed = parseCSV(await file.text());
      if (!parsed.length) { toast('No valid rows found. Use the sample CSV format.', 'error'); return; }
      // Store only what differs from the weekly pattern (avoids a notification per weekend).
      const upserts: { school_id: string; date: string; type: DayType; label: string | null }[] = [];
      const clears: string[] = [];
      for (const r of parsed) {
        const dow = new Date(`${r.date}T00:00:00`).getDay();
        const weekly = isWeeklyOff(dow);
        const isDefault = (r.type === 'working' && !weekly) || (r.type === 'holiday' && weekly && !r.label.trim()) || (r.type === 'holiday' && weekly && /^(holiday|weekly off|sunday|saturday)$/i.test(r.label.trim()));
        if (isDefault) { if (byDate.has(r.date)) clears.push(r.date); continue; }
        upserts.push({ school_id: schoolId, date: r.date, type: r.type, label: r.type === 'working' ? null : (r.label.trim() || (r.type === 'festival' ? 'Festival' : 'Holiday')) });
      }
      await upsertHolidays(upserts);
      await clearHolidayDates(schoolId, clears);
      await load();
      toast(`Calendar imported · ${upserts.length} special day${upserts.length === 1 ? '' : 's'} saved`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  }

  function downloadSample() {
    const lines = days.map((d) => {
      const type = d.kind === 'weekly_off' ? 'holiday' : d.kind;
      return `${d.date},${type},"${d.kind === 'weekly_off' ? '' : d.label}"`;
    });
    const blob = new Blob([`date,type,label\n${lines.join('\n')}`], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `holidays-${MONTHS[month].toLowerCase()}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const firstDow = days[0]?.dow ?? 0;
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i);

  return (
    <DashboardLayout title="Holidays">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Holiday Calendar</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Click any date to mark a holiday, festival or extra working day. Teachers and parents see it in the app.
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={downloadSample}>Sample CSV</Button>
              <Button variant="outline" icon={<Upload className="h-4 w-4" />} loading={importing} onClick={() => fileRef.current?.click()}>Upload CSV</Button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            </div>
          )}
        </div>

        {/* Working week from Settings */}
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 text-sm">
            <Coffee className="h-4 w-4 text-slate-400" />
            <span className="text-slate-700">
              <b>{fiveDay ? '5-day week' : '6-day week'}</b> · weekly off on {fiveDay ? 'Saturday & Sunday' : 'Sunday'}
            </span>
          </div>
          <Link to="/admin/settings" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
            <SettingsIcon className="h-3.5 w-3.5" /> Change in Settings
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Working days', value: stats.working, icon: <Briefcase className="h-5 w-5 text-emerald-600" />, bg: 'bg-emerald-50' },
            { label: 'Weekly offs', value: stats.weekly, icon: <Coffee className="h-5 w-5 text-slate-500" />, bg: 'bg-slate-100' },
            { label: 'Holidays', value: stats.holiday, icon: <Sun className="h-5 w-5 text-red-500" />, bg: 'bg-red-50' },
            { label: 'Festivals', value: stats.festival, icon: <Smile className="h-5 w-5 text-amber-500" />, bg: 'bg-amber-50' },
          ].map((s) => (
            <Card key={s.label} className="flex items-center gap-3 p-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.bg}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          {/* Calendar */}
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button onClick={() => shiftMonth(-1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
                <h2 className="min-w-[150px] text-center text-base font-bold text-slate-900">{MONTHS[month]} {year}</h2>
                <button onClick={() => shiftMonth(1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
              </div>
              <div className="flex gap-2">
                <div className="w-36">
                  <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </Select>
                </div>
                <div className="w-28">
                  <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </Select>
                </div>
              </div>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-2">
              {DAY_ABBR.map((d, i) => (
                <div key={d} className={`text-center text-xs font-semibold ${offDays.includes(i) ? 'text-slate-400' : 'text-slate-600'}`}>{d}</div>
              ))}
            </div>

            {loading ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading calendar…</div>
            ) : (
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
                {days.map((d) => {
                  const st = STYLE[d.kind];
                  const dayNum = Number(d.date.slice(8));
                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => openDay(d)}
                      disabled={!canEdit}
                      className={`relative flex min-h-[78px] flex-col rounded-xl border p-2 text-left transition-colors ${st.cell} ${d.date === todayIso ? 'ring-2 ring-brand-500 ring-offset-1' : ''} ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <span className={`text-base font-bold leading-none ${st.date}`}>{dayNum}</span>
                      <span className={`mt-0.5 text-[10px] font-medium ${st.text}`}>{DAY_ABBR[d.dow]}</span>
                      {d.label && (
                        <span className={`mt-auto flex items-center gap-0.5 pt-1 text-[10px] font-semibold leading-tight ${d.kind === 'working' ? 'text-emerald-600' : st.text}`}>
                          {d.kind === 'festival' ? <Smile className="h-3 w-3 flex-shrink-0" /> : d.kind === 'holiday' ? <Sun className="h-3 w-3 flex-shrink-0" /> : d.kind === 'working' ? <Briefcase className="h-3 w-3 flex-shrink-0" /> : null}
                          <span className="truncate">{d.label}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-200 bg-white" /> Working day</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-200 bg-slate-50" /> Weekly off</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-red-200 bg-red-50" /> Holiday</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-200 bg-amber-50" /> Festival</span>
            </div>
          </Card>

          {/* This month's special days */}
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Calendar className="h-4 w-4 text-brand-600" /> {MONTHS[month]} special days
            </h3>
            {listed.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No holidays marked this month.</p>
            ) : (
              <ul className="space-y-2">
                {listed.map((d) => (
                  <li key={d.date}>
                    <button type="button" onClick={() => openDay(d)} disabled={!canEdit}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 text-left hover:border-slate-200">
                      <div className={`flex h-10 w-10 flex-shrink-0 flex-col items-center justify-center rounded-lg ${d.kind === 'festival' ? 'bg-amber-50 text-amber-700' : d.kind === 'holiday' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                        <span className="text-sm font-bold leading-none">{Number(d.date.slice(8))}</span>
                        <span className="text-[9px] font-semibold uppercase">{DAY_ABBR[d.dow]}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{d.label}</p>
                        <p className="text-xs capitalize text-slate-400">{d.kind === 'working' ? 'Extra working day' : d.kind}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Edit a day */}
      <Modal open={!!editing} onClose={() => !saving && setEditing(null)} size="sm"
        title={editing ? `${DAY_FULL[editing.dow]}, ${Number(editing.date.slice(8))} ${MONTHS[Number(editing.date.slice(5, 7)) - 1]}` : ''}>
        {editing && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Normally a {isWeeklyOff(editing.dow) ? 'weekly off' : 'working day'}.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['holiday', 'Holiday', <Sun key="h" className="h-4 w-4" />],
                ['festival', 'Festival', <Smile key="f" className="h-4 w-4" />],
                ['working', 'Working', <Briefcase key="w" className="h-4 w-4" />],
              ] as [DayType, string, JSX.Element][]).map(([t, label, icon]) => (
                <button key={t} type="button" onClick={() => setEditType(t)}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-xs font-semibold transition-colors ${editType === t
                    ? t === 'holiday' ? 'border-red-400 bg-red-50 text-red-700' : t === 'festival' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  {icon}{label}
                </button>
              ))}
            </div>
            {editType !== 'working' && (
              <Input label="Name" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder={editType === 'festival' ? 'e.g. Diwali' : 'e.g. Republic Day'} autoFocus />
            )}
            {editType === 'working' && isWeeklyOff(editing.dow) && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">School will be open on this {DAY_FULL[editing.dow]}.</p>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              {editing.custom ? (
                <button type="button" onClick={resetDay} disabled={saving} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to normal
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
                <Button onClick={saveDay} loading={saving}>Save</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
