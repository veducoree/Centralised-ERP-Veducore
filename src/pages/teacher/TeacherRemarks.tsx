import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Megaphone } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeacherByUserId, fetchTeacherAssignments, fetchStudentsBySection, fetchRemarks, createRemark, deleteRemark } from '@/services/api';
import type { Teacher, ClassAssignment, Student, Remark } from '@/types';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

export default function TeacherRemarks() {
  const { profile } = useAuth();
  const toast = useToast();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ student_id: '', category: 'academic', remark: '', visibility: 'public' });

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (t) {
        setTeacher(t);
        const a = await fetchTeacherAssignments(t.id);
        setAssignments(a);
        if (a.length > 0) setSelectedSection(a[0].section_id);
        const r = await fetchRemarks({ teacherId: t.id });
        setRemarks(r);
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadSectionData = useCallback(async () => {
    if (!selectedSection) return;
    try {
      const s = await fetchStudentsBySection(selectedSection);
      setStudents(s);
    } catch { /* handled */ }
  }, [selectedSection]);

  useEffect(() => { loadSectionData(); }, [loadSectionData]);

  const uniqueSections = assignments.reduce((acc: { id: string; label: string }[], a) => {
    if (!acc.find((x) => x.id === a.section_id)) {
      acc.push({ id: a.section_id, label: `${a.class?.name} - ${a.section?.name}` });
    }
    return acc;
  }, []);

  async function handleCreate() {
    if (!teacher || !profile?.school_id || !form.student_id || !form.remark) return;
    setSaving(true);
    try {
      await createRemark({
        school_id: profile.school_id,
        student_id: form.student_id,
        teacher_id: teacher.id,
        category: form.category,
        remark: form.remark,
        visibility: form.visibility,
      });
      toast('Remark added', 'success');
      setModalOpen(false);
      setForm({ student_id: '', category: 'academic', remark: '', visibility: 'public' });
      loadData();
    } catch { toast('Failed to add remark', 'error'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await deleteRemark(deleteId); toast('Remark deleted', 'success'); loadData(); }
    catch { toast('Failed to delete', 'error'); }
  }

  return (
    <DashboardLayout title="Remarks">
      <div className="space-y-6">
        <PageHeader title="Student Remarks" description="Add remarks about your students"
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setForm({ student_id: '', category: 'academic', remark: '', visibility: 'public' }); setModalOpen(true); }}>Add Remark</Button>} />

        <Card className="p-4">
          <Select label="Filter by Section" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
            {uniqueSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Card>

        {loading ? (
          <LoadingSpinner variant="cards" />
        ) : remarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <Megaphone className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No remarks yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {remarks.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <Megaphone className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900">{r.student?.full_name || '—'}</h3>
                      <Badge variant="info">{r.category}</Badge>
                      {r.visibility === 'parents_only' && <Badge variant="warning">Parents Only</Badge>}
                      {r.visibility === 'staff_only' && <Badge variant="neutral">Staff Only</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{r.remark}</p>
                    <p className="mt-1 text-xs text-gray-400">{formatDate(r.created_at)}</p>
                  </div>
                  <button onClick={() => setDeleteId(r.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Remark" size="md"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleCreate} loading={saving}>Add Remark</Button></>}>
        <div className="space-y-4">
          <Select label="Student" required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
            <option value="">Select student...</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="academic">Academic</option>
            <option value="behaviour">Behaviour</option>
            <option value="attendance">Attendance</option>
            <option value="performance">Performance</option>
            <option value="general">General</option>
          </Select>
          <Textarea label="Remark" required rows={3} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          <Select label="Visibility" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
            <option value="public">Public (visible to parents)</option>
            <option value="parents_only">Parents Only</option>
            <option value="staff_only">Staff Only</option>
          </Select>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Remark" message="Are you sure?" confirmText="Delete" variant="danger" />
    </DashboardLayout>
  );
}
