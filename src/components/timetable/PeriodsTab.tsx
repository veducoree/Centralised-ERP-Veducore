import { useState } from 'react';
import { Plus, Pencil, Trash2, Coffee, Wand2, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  createTimetablePeriod, updateTimetablePeriod, deleteTimetablePeriod, saveTimetableDays,
} from '@/services/api';
import type { TeacherSchedule, TimetablePeriod } from '@/types';
import { cn, formatTime, getDayName } from '@/lib/utils';
import { ALL_WEEKDAYS, errorMessage, toInputTime } from '@/lib/timetable';

interface PeriodsTabProps {
  schoolId: string;
  periods: TimetablePeriod[];
  schedules: TeacherSchedule[];
  days: number[];
  onChanged: () => void;
}

interface PeriodForm { name: string; start_time: string; end_time: string; is_break: boolean }

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function PeriodsTab({ schoolId, periods, schedules, days, onChanged }: PeriodsTabProps) {
  const toast = useToast();

  // Working days
  const [selectedDays, setSelectedDays] = useState<number[]>(days);
  const [savingDays, setSavingDays] = useState(false);
  const daysChanged = selectedDays.length !== days.length || selectedDays.some((d) => !days.includes(d));

  // Add / edit
  const [editing, setEditing] = useState<TimetablePeriod | 'new' | null>(null);
  const [form, setForm] = useState<PeriodForm>({ name: '', start_time: '08:00', end_time: '08:40', is_break: false });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TimetablePeriod | null>(null);

  // Generator
  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState({ start: '08:00', length: '40', count: '8', breakAfter: '4', breakLength: '30' });
  const [generating, setGenerating] = useState(false);

  const teachingCount = periods.filter((p) => !p.is_break).length;
  const usage = (periodId: string) => schedules.filter((s) => s.period_id === periodId).length;

  function openNew() {
    const last = periods[periods.length - 1];
    const start = last ? toInputTime(last.end_time) : '08:00';
    setForm({ name: `Period ${teachingCount + 1}`, start_time: start, end_time: addMinutes(start, 40), is_break: false });
    setEditing('new');
  }

  function openEdit(p: TimetablePeriod) {
    setForm({ name: p.name, start_time: toInputTime(p.start_time), end_time: toInputTime(p.end_time), is_break: p.is_break });
    setEditing(p);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('Enter a name', 'error'); return; }
    if (form.end_time <= form.start_time) { toast('End time must be after start time', 'error'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), start_time: form.start_time, end_time: form.end_time, is_break: form.is_break };
      if (editing === 'new') await createTimetablePeriod({ school_id: schoolId, ...payload });
      else if (editing) await updateTimetablePeriod(schoolId, editing.id, payload);
      toast(editing === 'new' ? 'Period added' : 'Period updated', 'success');
      setEditing(null);
      onChanged();
    } catch (err) {
      toast(errorMessage(err, 'Failed to save period'), 'error');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteTimetablePeriod(schoolId, deleting.id);
      toast('Period deleted', 'success');
      onChanged();
    } catch (err) { toast(errorMessage(err, 'Failed to delete'), 'error'); }
  }

  async function handleSaveDays() {
    if (selectedDays.length === 0) { toast('Select at least one working day', 'error'); return; }
    setSavingDays(true);
    try {
      await saveTimetableDays(schoolId, selectedDays);
      toast('Working days saved', 'success');
      onChanged();
    } catch (err) { toast(errorMessage(err, 'Failed to save working days'), 'error'); }
    finally { setSavingDays(false); }
  }

  async function handleGenerate() {
    const length = parseInt(gen.length, 10);
    const count = parseInt(gen.count, 10);
    const breakAfter = parseInt(gen.breakAfter, 10);
    const breakLength = parseInt(gen.breakLength, 10);
    if (!(length > 0 && count > 0 && count <= 15)) { toast('Enter a valid period length and count (max 15)', 'error'); return; }
    setGenerating(true);
    try {
      let t = gen.start;
      for (let i = 1; i <= count; i++) {
        const end = addMinutes(t, length);
        await createTimetablePeriod({ school_id: schoolId, name: `Period ${i}`, start_time: t, end_time: end, is_break: false });
        t = end;
        if (i === breakAfter && breakLength > 0 && i < count) {
          const bEnd = addMinutes(t, breakLength);
          await createTimetablePeriod({ school_id: schoolId, name: 'Lunch Break', start_time: t, end_time: bEnd, is_break: true });
          t = bEnd;
        }
      }
      toast('Bell schedule created', 'success');
      setGenOpen(false);
    } catch (err) {
      toast(errorMessage(err, 'Failed to create periods'), 'error');
    } finally {
      setGenerating(false);
      onChanged();
    }
  }

  return (
    <div className="space-y-6">
      {/* Working days */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Working days</h3>
            <p className="text-xs text-slate-500">Days that appear as columns in every timetable.</p>
          </div>
          <Button size="sm" onClick={handleSaveDays} loading={savingDays} disabled={!daysChanged}>Save days</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {ALL_WEEKDAYS.map((d) => {
            const on = selectedDays.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDays(on ? selectedDays.filter((x) => x !== d) : [...selectedDays, d])}
                className={cn(
                  'rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  on ? 'border-[#5B6EE8] bg-[#EEF0FD] text-[#5B6EE8]' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                )}
              >
                {getDayName(d)}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Periods */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Bell schedule</h3>
            <p className="text-xs text-slate-500">
              {teachingCount} teaching periods. Changing a period&apos;s time moves every class in it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {periods.length === 0 && (
              <Button size="sm" variant="outline" icon={<Wand2 />} onClick={() => setGenOpen(true)}>Quick setup</Button>
            )}
            <Button size="sm" icon={<Plus />} onClick={openNew}>Add period</Button>
          </div>
        </div>

        {periods.length === 0 ? (
          <div className="mt-5 flex flex-col items-center rounded-xl border border-dashed border-slate-200 py-10 text-center">
            <Clock className="mb-2 h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No periods yet</p>
            <p className="mt-1 text-xs text-slate-400">Use Quick setup to create a full day in one step.</p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {periods.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', p.is_break ? 'bg-amber-50 text-amber-600' : 'bg-[#EEF0FD] text-[#5B6EE8]')}>
                  {p.is_break ? <Coffee className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatTime(p.start_time)} – {formatTime(p.end_time)}
                    {!p.is_break && <> · {usage(p.id)} classes</>}
                  </p>
                </div>
                <button onClick={() => openEdit(p)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Edit ${p.name}`}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => setDeleting(p)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${p.name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add period' : 'Edit period'}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={handleSave} loading={saving}>Save</Button></>}
      >
        <div className="space-y-4">
          <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Period 1, Lunch" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            <Input label="End" type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.is_break} onChange={(e) => setForm({ ...form, is_break: e.target.checked })} />
            This is a break (no classes)
          </label>
        </div>
      </Modal>

      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Quick setup"
        description="Creates equal periods with one break in between."
        size="sm"
        footer={<><Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button><Button onClick={handleGenerate} loading={generating}>Create</Button></>}
      >
        <div className="grid grid-cols-2 gap-3">
          <Input label="School starts" type="time" value={gen.start} onChange={(e) => setGen({ ...gen, start: e.target.value })} />
          <Input label="Period length (min)" type="number" min="0" value={gen.length} onChange={(e) => setGen({ ...gen, length: e.target.value })} />
          <Input label="Number of periods" type="number" min="0" value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} />
          <Input label="Break after period" type="number" min="0" value={gen.breakAfter} onChange={(e) => setGen({ ...gen, breakAfter: e.target.value })} />
          <Input label="Break length (min)" type="number" min="0" value={gen.breakLength} onChange={(e) => setGen({ ...gen, breakLength: e.target.value })} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete period"
        message={
          deleting && usage(deleting.id) > 0
            ? `"${deleting.name}" has ${usage(deleting.id)} classes in the timetable. Deleting it also removes those classes.`
            : `Delete "${deleting?.name}"?`
        }
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
