import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  createTeacherSchedule, updateTeacherSchedule, deleteTeacherSchedule, subjectsForSection,
} from '@/services/api';
import type { Class, Section, Subject, Teacher, TeacherSchedule, TimetablePeriod } from '@/types';
import { formatTime, getDayName } from '@/lib/utils';
import { sortByClassOrder, sortSections } from '@/lib/classOrder';
import { errorMessage, slotsInPeriod, toInputTime, unplacedSlots } from '@/lib/timetable';
import { TimetableGrid, SlotCard, EmptySlot } from './TimetableGrid';

export interface Allotment {
  teacher_id: string;
  section_id: string;
  subject_id: string;
}

interface ClassTimetableTabProps {
  schoolId: string;
  periods: TimetablePeriod[];
  days: number[];
  schedules: TeacherSchedule[];
  teachers: Teacher[];
  classes: (Class & { sections: Section[] })[];
  subjects: Subject[];
  allotments: Allotment[];
  onChanged: () => void;
  onGoToPeriods: () => void;
}

interface Editing { day: number; period: TimetablePeriod; slot: TeacherSchedule | null }

const overlaps = (s: TeacherSchedule, p: TimetablePeriod) =>
  toInputTime(s.start_time) < toInputTime(p.end_time) && toInputTime(s.end_time) > toInputTime(p.start_time);

export function ClassTimetableTab({
  schoolId, periods, days, schedules, teachers, classes, subjects, allotments, onChanged, onGoToPeriods,
}: ClassTimetableTabProps) {
  const toast = useToast();
  const sortedClasses = useMemo(() => sortByClassOrder(classes), [classes]);
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');

  const sections = useMemo(
    () => sortSections(sortedClasses.find((c) => c.id === classId)?.sections || []),
    [sortedClasses, classId],
  );

  // Default to the first class/section that exists.
  useEffect(() => {
    if (!classId && sortedClasses.length > 0) setClassId(sortedClasses[0].id);
  }, [sortedClasses, classId]);
  useEffect(() => {
    if (sections.length > 0 && !sections.some((s) => s.id === sectionId)) setSectionId(sections[0].id);
    if (sections.length === 0) setSectionId('');
  }, [sections, sectionId]);

  const sectionSlots = useMemo(() => schedules.filter((s) => s.section_id === sectionId), [schedules, sectionId]);
  const sectionSubjects = useMemo(() => subjectsForSection(subjects, sectionId), [subjects, sectionId]);
  const teachingPeriods = periods.filter((p) => !p.is_break);
  const filled = days.reduce((n, d) => n + teachingPeriods.filter((p) => slotsInPeriod(sectionSlots, d, p).length > 0).length, 0);
  const orphans = unplacedSlots(sectionSlots, periods, days);

  // ── Slot editor ────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<Editing | null>(null);
  const [form, setForm] = useState({ subject_id: '', teacher_id: '', room_number: '' });
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState<TeacherSchedule | null>(null);

  const allottedTeacher = (subjectId: string) =>
    allotments.find((a) => a.section_id === sectionId && a.subject_id === subjectId)?.teacher_id || '';

  function openCell(day: number, period: TimetablePeriod) {
    const slot = slotsInPeriod(sectionSlots, day, period)[0] || null;
    setForm({
      subject_id: slot?.subject_id || '',
      teacher_id: slot?.teacher_id || '',
      room_number: slot?.room_number || '',
    });
    setEditing({ day, period, slot });
  }

  /** Where else a teacher is at this day/period (excluding the slot being edited). */
  function busyWith(teacherId: string): TeacherSchedule | undefined {
    if (!editing) return undefined;
    return schedules.find(
      (s) => s.teacher_id === teacherId && s.day_of_week === editing.day && s.id !== editing.slot?.id && overlaps(s, editing.period),
    );
  }

  const teacherOptions = useMemo(() => {
    if (!editing) return [];
    const allotted = form.subject_id ? allottedTeacher(form.subject_id) : '';
    return teachers
      .map((t) => {
        const busy = busyWith(t.id);
        return {
          teacher: t,
          allotted: t.id === allotted,
          busyLabel: busy ? `${busy.class?.name ?? ''}-${busy.section?.name ?? ''}`.replace(/^-|-$/g, '') : '',
        };
      })
      .sort((a, b) => Number(b.allotted) - Number(a.allotted) || Number(!!a.busyLabel) - Number(!!b.busyLabel) || a.teacher.full_name.localeCompare(b.teacher.full_name));
  }, [editing, teachers, form.subject_id, schedules, allotments]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubjectChange(subjectId: string) {
    const allotted = allottedTeacher(subjectId);
    // Pick the allotted teacher when there is one and they are free.
    setForm((f) => ({ ...f, subject_id: subjectId, teacher_id: allotted && !busyWith(allotted) ? allotted : f.teacher_id }));
  }

  async function handleSave() {
    if (!editing) return;
    if (!form.subject_id) { toast('Select a subject', 'error'); return; }
    if (!form.teacher_id) { toast('Select a teacher', 'error'); return; }
    const busy = busyWith(form.teacher_id);
    if (busy) { toast(`Teacher clash: already teaching ${busy.class?.name}-${busy.section?.name} at this time`, 'error'); return; }
    const cls = sortedClasses.find((c) => c.id === classId);
    if (!cls) return;
    setSaving(true);
    try {
      if (editing.slot) {
        await updateTeacherSchedule(editing.slot.id, {
          teacher_id: form.teacher_id,
          subject_id: form.subject_id,
          room_number: form.room_number.trim() || null,
        });
      } else {
        await createTeacherSchedule({
          school_id: schoolId,
          teacher_id: form.teacher_id,
          class_id: cls.id,
          section_id: sectionId,
          subject_id: form.subject_id,
          period_id: editing.period.id,
          day_of_week: editing.day,
          start_time: editing.period.start_time,
          end_time: editing.period.end_time,
          room_number: form.room_number.trim() || null,
        });
      }
      toast('Timetable saved', 'success');
      setEditing(null);
      onChanged();
    } catch (err) {
      toast(errorMessage(err, 'Failed to save'), 'error');
    } finally { setSaving(false); }
  }

  async function handleClear() {
    if (!clearing) return;
    try {
      await deleteTeacherSchedule(clearing.id);
      toast('Class removed from timetable', 'success');
      setEditing(null);
      onChanged();
    } catch (err) { toast(errorMessage(err, 'Failed to remove'), 'error'); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (periods.length === 0) {
    return (
      <Card className="flex flex-col items-center p-10 text-center">
        <Clock className="mb-3 h-10 w-10 text-slate-300" />
        <p className="font-medium text-slate-700">Set up the bell schedule first</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">Add your school&apos;s periods and breaks, then fill each class&apos;s timetable here.</p>
        <Button className="mt-4" onClick={onGoToPeriods}>Set up periods</Button>
      </Card>
    );
  }

  if (sortedClasses.length === 0) {
    return <Card className="p-8 text-center text-sm text-slate-500">No classes yet. Add classes and sections first.</Card>;
  }

  const editingSelectedBusy = form.teacher_id ? busyWith(form.teacher_id) : undefined;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-full sm:w-48">
          <Select label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {sortedClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={sections.length === 0}>
            {sections.length === 0 && <option value="">No sections</option>}
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        {sectionId && (
          <p className="pb-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-800">{filled}</span> of {teachingPeriods.length * days.length} periods filled
            {sectionSubjects.length === 0 && <span className="ml-2 text-amber-600">· No subjects for this section yet</span>}
          </p>
        )}
      </Card>

      {sectionId && (
        <TimetableGrid
          periods={periods}
          days={days}
          renderCell={(day, period) => {
            const slot = slotsInPeriod(sectionSlots, day, period)[0];
            if (!slot) return <EmptySlot onClick={() => openCell(day, period)} />;
            return (
              <SlotCard
                title={slot.subject?.name || 'No subject'}
                subtitle={slot.teacher?.full_name || '—'}
                meta={slot.room_number ? `Room ${slot.room_number}` : undefined}
                onClick={() => openCell(day, period)}
              />
            );
          }}
        />
      )}

      {orphans.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700">
            <AlertTriangle className="h-4 w-4" /> Old entries that do not match any period
          </div>
          <p className="mb-3 text-xs text-slate-500">These were added before the bell schedule. Re-add them in the grid, then remove them here.</p>
          <div className="space-y-2">
            {orphans.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-sm text-slate-700">
                  {getDayName(s.day_of_week)} · {formatTime(s.start_time)}–{formatTime(s.end_time)} · {s.subject?.name || '—'} · {s.teacher?.full_name}
                </p>
                <button onClick={() => setClearing(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove entry">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${getDayName(editing.day)} · ${editing.period.name}` : ''}
        description={editing ? `${formatTime(editing.period.start_time)} – ${formatTime(editing.period.end_time)}` : undefined}
        size="sm"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {editing?.slot && (
                <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setClearing(editing.slot)}>Remove</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={handleSave} loading={saving} disabled={!!editingSelectedBusy}>Save</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Select label="Subject" required value={form.subject_id} onChange={(e) => onSubjectChange(e.target.value)}>
            <option value="">{sectionSubjects.length ? 'Select subject...' : 'No subjects for this section'}</option>
            {sectionSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <div>
            <Select label="Teacher" required value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">Select teacher...</option>
              {teacherOptions.map(({ teacher, allotted, busyLabel }) => (
                <option key={teacher.id} value={teacher.id} disabled={!!busyLabel}>
                  {teacher.full_name}{allotted ? ' (teaches this subject)' : ''}{busyLabel ? ` (busy: ${busyLabel})` : ''}
                </option>
              ))}
            </Select>
            {editingSelectedBusy && (
              <p className="mt-1 text-xs text-red-600">
                Clash: this teacher already teaches {editingSelectedBusy.class?.name}-{editingSelectedBusy.section?.name} at this time.
              </p>
            )}
          </div>
          <Input label="Room" value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} placeholder="Optional, e.g. 101" />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!clearing}
        onClose={() => setClearing(null)}
        onConfirm={handleClear}
        title="Remove class"
        message="Remove this class from the timetable? Substitutions arranged for it are removed too."
        confirmText="Remove"
        variant="danger"
      />
    </div>
  );
}
