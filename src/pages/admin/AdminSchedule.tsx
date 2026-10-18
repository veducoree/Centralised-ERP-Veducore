import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, CalendarDays } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeacherSchedules, createTeacherSchedule, deleteTeacherSchedule, fetchTeachers, fetchClasses, fetchSubjects } from '@/services/api';
import type { TeacherSchedule, Teacher, Class, Section, Subject } from '@/types';
import { formatTime, getDayName } from '@/lib/utils';

export default function AdminSchedule() {
  const { profile } = useAuth();
  const toast = useToast();
  const [schedules, setSchedules] = useState<TeacherSchedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ teacher_id: '', class_id: '', section_id: '', subject_id: '', day_of_week: '1', start_time: '09:00', end_time: '10:00', room_number: '' });

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [s, t, c, sub] = await Promise.all([
        fetchTeacherSchedules(profile.school_id),
        fetchTeachers(profile.school_id),
        fetchClasses(profile.school_id),
        fetchSubjects(profile.school_id),
      ]);
      setSchedules(s);
      setTeachers(t);
      setClasses(c);
      setSubjects(sub);
    } catch { toast('Failed to load schedules', 'error'); }
    finally { setLoading(false); }
  }, [profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const availableSections = classes.find((c) => c.id === form.class_id)?.sections || [];
  const days = [1, 2, 3, 4, 5];

  const groupedByDay = days.map((day) => ({
    day,
    items: schedules.filter((s) => s.day_of_week === day).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));

  async function handleCreate() {
    if (!profile?.school_id || !form.teacher_id || !form.class_id || !form.section_id) return;
    setSaving(true);
    try {
      await createTeacherSchedule({
        school_id: profile.school_id,
        teacher_id: form.teacher_id,
        class_id: form.class_id,
        section_id: form.section_id,
        subject_id: form.subject_id || undefined,
        day_of_week: parseInt(form.day_of_week, 10),
        start_time: form.start_time,
        end_time: form.end_time,
        room_number: form.room_number || undefined,
      });
      toast('Schedule entry created', 'success');
      setModalOpen(false);
      setForm({ teacher_id: '', class_id: '', section_id: '', subject_id: '', day_of_week: '1', start_time: '09:00', end_time: '10:00', room_number: '' });
      loadData();
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to create schedule', 'error'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await deleteTeacherSchedule(deleteId); toast('Schedule deleted', 'success'); loadData(); }
    catch { toast('Failed to delete', 'error'); }
  }

  return (
    <DashboardLayout title="Teacher Schedule">
      <div className="space-y-6">
        <PageHeader title="Teacher Schedule" description="Manage weekly timetables for teachers"
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>Add Schedule</Button>} />

        {loading ? (
          <LoadingSpinner />
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <CalendarDays className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No schedules found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {groupedByDay.map(({ day, items }) => (
              <Card key={day} className="p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">{getDayName(day)}</h3>
                {items.length === 0 ? (
                  <p className="text-sm text-gray-400">No classes scheduled</p>
                ) : (
                  <div className="space-y-2">
                    {items.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{formatTime(s.start_time)} - {formatTime(s.end_time)}</p>
                          <p className="text-xs text-gray-500">{s.class?.name} - {s.section?.name} &middot; {s.subject?.name || '—'}</p>
                          <p className="text-xs text-gray-400">{s.teacher?.full_name} &middot; Room {s.room_number || '—'}</p>
                        </div>
                        <button onClick={() => setDeleteId(s.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Schedule Entry" size="lg"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleCreate} loading={saving}>Create</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Teacher" required value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
            <option value="">Select teacher...</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
          <Select label="Day" required value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
            {days.map((d) => <option key={d} value={d}>{getDayName(d)}</option>)}
          </Select>
          <Select label="Class" required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value, section_id: '' })}>
            <option value="">Select class...</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Section" required value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })} disabled={!form.class_id}>
            <option value="">Select section...</option>
            {availableSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Subject" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
            <option value="">Select subject...</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Room Number" value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} placeholder="e.g. 101" />
          <Input label="Start Time" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          <Input label="End Time" type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Schedule" message="Are you sure?" confirmText="Delete" variant="danger" />
    </DashboardLayout>
  );
}
