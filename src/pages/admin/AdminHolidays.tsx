import { useState, useRef } from 'react';
import { Upload, Download, Calendar, Smile, Sun } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HolidayEntry {
  date: string;        // YYYY-MM-DD
  day: string;         // Mon, Tue …
  type: 'working' | 'holiday' | 'festival';
  label: string;       // "" | "Holiday" | "Diwali" etc.
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function buildMonthEntries(year: number, month: number): HolidayEntry[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1);
    // Format date as YYYY-MM-DD using local time (NOT toISOString which uses UTC)
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    return {
      date: iso,
      day: DAY_FULL[dow],
      type: isWeekend ? 'holiday' : 'working',
      label: isWeekend ? 'Holiday' : '',
    };
  });
}

function parseCSV(text: string): Map<string, { type: HolidayEntry['type']; label: string }> {
  const map = new Map<string, { type: HolidayEntry['type']; label: string }>();
  const lines = text.split('\n').slice(1); // skip header
  for (const line of lines) {
    const [date, type, label] = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    if (!date) continue;
    const t = type === 'festival' ? 'festival' : type === 'holiday' ? 'holiday' : 'working';
    map.set(date, { type: t, label: label || '' });
  }
  return map;
}

function generateSampleCSV(year: number, month: number): string {
  const entries = buildMonthEntries(year, month);
  const rows = entries.map((e) => `${e.date},${e.type},"${e.label}"`);
  return `date,type,label\n${rows.join('\n')}`;
}

// ── Cell component ────────────────────────────────────────────────────────────

function DayCell({ entry, isToday }: { entry: HolidayEntry; isToday: boolean }) {
  const day = parseInt(entry.date.split('-')[2], 10);

  const bg =
    entry.type === 'festival'
      ? 'bg-amber-50 border-amber-200'
      : entry.type === 'holiday'
      ? 'bg-red-50 border-red-200'
      : 'bg-white border-gray-100';

  const dateColor =
    entry.type === 'festival'
      ? 'text-amber-700'
      : entry.type === 'holiday'
      ? 'text-red-500'
      : 'text-gray-800';

  const dayColor =
    entry.type === 'festival'
      ? 'text-amber-500'
      : entry.type === 'holiday'
      ? 'text-red-400'
      : 'text-gray-400';

  const icon =
    entry.type === 'festival' ? (
      <Smile className="h-3 w-3 text-amber-500 flex-shrink-0" />
    ) : entry.type === 'holiday' ? (
      <Sun className="h-3 w-3 text-red-400 flex-shrink-0" />
    ) : null;

  return (
    <div className={`rounded-xl border p-2 flex flex-col min-h-[72px] relative ${bg} ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
      {/* Date number */}
      <span className={`text-base font-bold leading-none ${dateColor}`}>{day}</span>
      {/* Day name */}
      <span className={`text-[10px] font-medium mt-0.5 ${dayColor}`}>{entry.day}</span>
      {/* Label */}
      {entry.label && (
        <div className="flex items-center gap-0.5 mt-auto pt-1">
          {icon}
          <span className={`text-[9px] font-semibold leading-tight ${dateColor} truncate`}>
            {entry.label}
          </span>
        </div>
      )}
      {/* Today dot */}
      {isToday && (
        <div className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminHolidays() {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [overrides, setOverrides] = useState<Map<string, { type: HolidayEntry['type']; label: string }>>(new Map());
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Merge base calendar with CSV overrides
  const base = buildMonthEntries(selectedYear, selectedMonth);
  const entries: HolidayEntry[] = base.map((e) => {
    const ov = overrides.get(e.date);
    return ov ? { ...e, ...ov } : e;
  });

  const workingDays = entries.filter((e) => e.type === 'working').length;
  const holidays = entries.filter((e) => e.type === 'holiday').length;
  const festivals = entries.filter((e) => e.type === 'festival').length;

  // Today's ISO in LOCAL time (not UTC)
  const todayIso = (() => {
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  })();
  const todayEntry = entries.find((e) => e.date === todayIso);
  const fullDayName = new Date().toLocaleDateString('en-IN', { weekday: 'long' });
  const todayMsg =
    todayEntry?.type === 'festival'
      ? `🎉 ${fullDayName} — ${todayEntry.label || 'Festival'}!`
      : todayEntry?.type === 'holiday'
      ? `🌟 ${fullDayName} — ${todayEntry.label ? todayEntry.label : 'Holiday'}`
      : todayEntry
      ? `📅 ${fullDayName} — Working Day`
      : null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      setUploadError('Please upload a .csv file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const parsed = parseCSV(text);
        setOverrides(parsed);
      } catch {
        setUploadError('Could not parse CSV. Check the format and try again.');
      }
    };
    reader.readAsText(file);
    // reset so same file can be re-uploaded
    e.target.value = '';
  }

  function downloadSample() {
    const csv = generateSampleCSV(selectedYear, selectedMonth);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `holidays-${MONTH_NAMES[selectedMonth].toLowerCase()}-${selectedYear}-sample.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const years = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];

  // Build calendar grid with leading empty cells for alignment
  const firstDow = new Date(selectedYear, selectedMonth, 1).getDay();

  return (
    <DashboardLayout title="Holidays">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Monthly Holiday Planner</h2>
            <p className="text-sm text-gray-500 mt-0.5">Upload a CSV to mark holidays and festivals for any month.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Today's message */}
        {todayMsg && selectedYear === today.getFullYear() && selectedMonth === today.getMonth() && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
            {todayMsg}
          </div>
        )}

        {/* Upload + Sample */}
        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 mb-1">Upload Holiday CSV</p>
              <p className="text-xs text-gray-500 mb-3">
                CSV format: <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">date,type,label</code>
                &nbsp;— type can be <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">working</code>,{' '}
                <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">holiday</code>, or{' '}
                <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">festival</code>.
                Label is the name (e.g. "Diwali").
              </p>
              <div className="flex gap-2 flex-wrap">
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                <Button
                  variant="outline"
                  icon={<Upload className="h-4 w-4" />}
                  onClick={() => fileRef.current?.click()}
                >
                  Upload CSV
                </Button>
                <Button
                  variant="outline"
                  icon={<Download className="h-4 w-4" />}
                  onClick={downloadSample}
                >
                  Download Sample CSV
                </Button>
              </div>
              {uploadError && <p className="mt-2 text-sm text-red-500">{uploadError}</p>}
              {overrides.size > 0 && (
                <p className="mt-2 text-xs text-emerald-600 font-medium">
                  ✓ {overrides.size} date overrides applied from CSV
                </p>
              )}
            </div>

            {/* Legend */}
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Legend</p>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <div className="h-3 w-3 rounded bg-white border border-gray-300" />
                Working Day
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <div className="h-3 w-3 rounded bg-red-100 border border-red-200" />
                Holiday
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <div className="h-3 w-3 rounded bg-amber-100 border border-amber-200" />
                Festival
              </div>
            </div>
          </div>
        </Card>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{workingDays}</p>
            <p className="text-xs text-gray-500 mt-0.5">Working Days</p>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{holidays}</p>
            <p className="text-xs text-red-500 mt-0.5">Holidays</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{festivals}</p>
            <p className="text-xs text-amber-500 mt-0.5">Festivals</p>
          </div>
        </div>

        {/* Calendar grid */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">
              {MONTH_NAMES[selectedMonth]} {selectedYear}
            </h3>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {DAY_ABBR.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {/* Leading empty cells */}
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {entries.map((entry) => (
              <DayCell key={entry.date} entry={entry} isToday={entry.date === todayIso} />
            ))}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
