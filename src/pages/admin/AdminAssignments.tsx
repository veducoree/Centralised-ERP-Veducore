import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Layers } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchClassAssignments, createClassAssignment, deleteClassAssignment, fetchTeachers, fetchClasses, fetchSubjects } from '@/services/api';
import type { ClassAssignment, Teacher, Class, Section, Subject } from '@/types';

export default function AdminAssignments() {
  const { profile } = useAuth();
  const toast = useToast();
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ teacher_id: '', class_id: '', section_id: '', subject_id: '' });

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [a, t, c, s] = await Promise.all([
        fetchClassAssignments(profile.school_id),
        fetchTeachers(profile.school_id),
        fetchClasses(profile.school_id),
        fetchSubjects(profile.school_id),
      ]);
      setAssignments(a);
      setTeachers(t);
      setClasses(c);
      setSubjects(s);
    } catch { toast('Failed to load assignments', 'error'); }
    finally { setLoading(false); }
  }, [profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const availableSections = classes.find((c) => c.id === form.class_id)?.sections || [];

  async function handleCreate() {
    if (!profile?.school_id || !form.teacher_id || !form.class_id || !form.section_id || !form.subject_id) return;
    setSaving(true);
    try {
      await createClassAssignment({
        school_id: profile.school_id,
        teacher_id: form.teacher_id,
        class_id: form.class_id,
        section_id: form.section_id,
        subject_id: form.subject_id,
      });
      toast('Assignment created', 'success');
      setModalOpen(false);
      setForm({ teacher_id: '', class_id: '', section_id: '', subject_id: '' });
      loadData();
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to create assignment', 'error'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await deleteClassAssignment(deleteId); toast('Assignment removed', 'success'); loadData(); }
    catch { toast('Failed to remove', 'error'); }
  }

  return (
    <DashboardLayout title="Class Assignments">
      <div className="space-y-6">
        <PageHeader title="Class Assignments" description="Assign teachers to classes, sections, and subjects"
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>Add Assignment</Button>} />

        {loading ? (
          <LoadingSpinner />
        ) : assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <Layers className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No assignments found</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600">Teacher</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Class</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Section</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Subject</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.teacher?.full_name}</td>
                    <td className="px-4 py-3 text-gray-700">{a.class?.name}</td>
                    <td className="px-4 py-3 text-gray-700">{a.section?.name}</td>
                    <td className="px-4 py-3 text-gray-700">{a.subject?.name || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDeleteId(a.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Class Assignment" description="Assign a teacher to a class, section, and subject" size="md"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleCreate} loading={saving}>Assign</Button></>}>
        <div className="space-y-4">
          <Select label="Teacher" required value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
            <option value="">Select teacher...</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
          <Select label="Class" required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value, section_id: '' })}>
            <option value="">Select class...</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Section" required value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })} disabled={!form.class_id}>
            <option value="">Select section...</option>
            {availableSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Subject" required value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
            <option value="">Select subject...</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Remove Assignment" message="Are you sure?" confirmText="Remove" variant="danger" />
    </DashboardLayout>
  );
}
