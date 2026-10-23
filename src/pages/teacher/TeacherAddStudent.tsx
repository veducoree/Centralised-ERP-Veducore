import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Users, UserPlus, Upload } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { BulkStudentUpload } from '@/components/ui/BulkStudentUpload';
import { StudentPhotoUpload } from '@/components/ui/StudentPhotoUpload';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchTeacherByUserId,
  fetchTeacherAssignments,
  fetchStudentsBySection,
  fetchClasses,
  createStudent,
  deleteStudent,
} from '@/services/api';
import type { ClassAssignment, Student, Class, Section } from '@/types';
import { StatusBadge } from '@/components/ui/Badge';
import { generateAdmissionNumber } from '@/lib/utils';

export default function TeacherAddStudent() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [inchargeClasses, setInchargeClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [form, setForm] = useState({
    full_name: '',
    father_name: '',
    mother_name: '',
    admission_number: generateAdmissionNumber(),
    gender: '',
    date_of_birth: '',
    address: '',
  });

  const loadData = useCallback(async () => {
    if (!profile?.id || !profile?.school_id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (t) {
        const a = await fetchTeacherAssignments(t.id);
        setAssignments(a);
        const isIncharge = (ca: any) => Boolean(ca.is_class_teacher || !ca.subject_id);
        const firstIncharge = a.find(isIncharge);
        if (firstIncharge) setSelectedSection(firstIncharge.section_id);

        // Load full classes for incharge sections (needed for bulk CSV)
        const allClasses = await fetchClasses(profile.school_id);
        const inchargeAssignments = a.filter(isIncharge);
        const inchargeClassIds = [...new Set(inchargeAssignments.map((ca) => ca.class_id))];
        const incharge = allClasses.filter((c) => inchargeClassIds.includes(c.id));
        setInchargeClasses(incharge);
      }
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.school_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadStudents = useCallback(async () => {
    if (!selectedSection) return;
    try {
      const s = await fetchStudentsBySection(selectedSection);
      setStudents(s);
    } catch {
      /* handled */
    }
  }, [selectedSection]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  // Only sections where teacher is class incharge
  const uniqueSections = assignments
    .filter((a) => a.is_class_teacher || !a.subject_id)
    .reduce(
      (acc: { id: string; label: string; classId: string }[], a) => {
        if (!acc.find((x) => x.id === a.section_id)) {
          acc.push({
            id: a.section_id,
            label: `${a.class?.name} - ${a.section?.name}`,
            classId: a.class_id,
          });
        }
        return acc;
      },
      []
    );

  const currentSectionInfo = uniqueSections.find((s) => s.id === selectedSection);

  function openModal() {
    setForm({
      full_name: '',
      father_name: '',
      mother_name: '',
      admission_number: generateAdmissionNumber(),
      gender: '',
      date_of_birth: '',
      address: '',
    });
    setModalOpen(true);
  }

  async function handleCreate() {
    if (!profile?.school_id || !currentSectionInfo || !form.full_name.trim()) {
      toast('Please fill required fields', 'error');
      return;
    }
    setSaving(true);
    try {
      await createStudent({
        school_id: profile.school_id,
        admission_number: form.admission_number,
        full_name: form.full_name.trim(),
        father_name: form.father_name.trim() || undefined,
        mother_name: form.mother_name.trim() || undefined,
        class_id: currentSectionInfo.classId,
        section_id: selectedSection,
        gender: form.gender || undefined,
        date_of_birth: form.date_of_birth || undefined,
        address: form.address || undefined,
        status: 'active',
      });
      toast('Student added & Parent account created successfully', 'success');
      setModalOpen(false);
      loadStudents();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add student', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteStudent(deleteId);
      toast('Student removed', 'success');
      loadStudents();
    } catch {
      toast('Failed to remove student', 'error');
    }
  }

  return (
    <DashboardLayout title="Add Student">
      <div className="space-y-6">
        <PageHeader
          title="Add Student"
          description="Add new students to your assigned sections"
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                icon={<Upload className="h-4 w-4" />}
                onClick={() => setBulkModalOpen(true)}
                disabled={inchargeClasses.length === 0}
              >
                Bulk Entry
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800"
                icon={<UserPlus className="h-4 w-4" />}
                onClick={() => navigate('/teacher/new-admission')}
                disabled={assignments.filter((a) => a.is_class_teacher || !a.subject_id).length === 0}
              >
                New Admission
              </Button>
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={openModal}
                disabled={!selectedSection}
              >
                Add Student
              </Button>
            </div>
          }
        />

        {/* Section selector */}
        {uniqueSections.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <Select
              label="Select Section"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
            >
              {uniqueSections.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </div>
        )}

        {loading ? (
          <LoadingSpinner />
        ) : uniqueSections.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <Users className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No class assigned as incharge</p>
            <p className="mt-1 text-sm text-gray-400">Only class teachers can add students here</p>
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <Users className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No students in this section</p>
            <p className="mt-1 text-sm text-gray-400">Click "Add Student" to add students</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600">Photo</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Admission No.</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Father's Name</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Mother's Name</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Gender</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3"><StudentPhotoUpload student={s} onUpdated={loadStudents} /></td>
                    <td className="px-4 py-3 font-medium text-gray-900">{s.admission_number}</td>
                    <td className="px-4 py-3 text-gray-700">{s.full_name}</td>
                    <td className="px-4 py-3 text-gray-700">{s.father_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{s.mother_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{s.gender || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDeleteId(s.id)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add New Student"
        description={`Adding student to ${currentSectionInfo?.label || 'selected section'}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Add Student</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Full Name"
            required
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Student's full name"
          />
          <Input
            label="Father's Name"
            value={form.father_name}
            onChange={(e) => setForm({ ...form, father_name: e.target.value })}
            placeholder="Father's full name"
          />
          <Input
            label="Mother's Name"
            value={form.mother_name}
            onChange={(e) => setForm({ ...form, mother_name: e.target.value })}
            placeholder="Mother's full name"
          />
          <Input
            label="Admission Number"
            required
            value={form.admission_number}
            onChange={(e) => setForm({ ...form, admission_number: e.target.value })}
            placeholder="e.g. ADM20241001"
          />
          <Select
            label="Gender"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="">Select gender...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
          <Input
            label="Date of Birth"
            type="date"
            value={form.date_of_birth}
            onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Input
              label="Address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Student's address (optional)"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Remove Student"
        message="Are you sure you want to remove this student? This action cannot be undone."
        confirmText="Remove"
        variant="danger"
      />

      <BulkStudentUpload
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        schoolId={profile?.school_id ?? ''}
        classes={inchargeClasses}
        onSuccess={loadStudents}
      />
    </DashboardLayout>
  );
}
