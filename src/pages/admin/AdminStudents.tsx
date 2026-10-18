import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Pencil, Trash2, Users, Upload, UserPlus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { BulkStudentUpload } from '@/components/ui/BulkStudentUpload';
import { SearchInput, PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchStudents, fetchClasses, createStudent, updateStudent, deleteStudent,
} from '@/services/api';
import type { Student, Class, Section } from '@/types';
import { formatDate, validateEmail, getInitials } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';

export default function AdminStudents() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [form, setForm] = useState({
    admission_number: '', full_name: '', father_name: '', date_of_birth: '', gender: 'male',
    class_id: '', section_id: '', address: '', admission_date: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [studentsData, classesData] = await Promise.all([
        fetchStudents(profile.school_id, { search: search || undefined, classId: classFilter || undefined }),
        fetchClasses(profile.school_id),
      ]);
      setStudents(studentsData);
      setClasses(classesData);
    } catch (err) {
      toast('Failed to load students', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, search, classFilter, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const availableSections = classes.find((c) => c.id === form.class_id)?.sections || [];

  function openAdd() {
    setEditing(null);
    setForm({
      admission_number: '', full_name: '', father_name: '', date_of_birth: '', gender: 'male',
      class_id: '', section_id: '', address: '',
      admission_date: new Date().toISOString().split('T')[0],
    });
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(student: Student) {
    setEditing(student);
    setForm({
      admission_number: student.admission_number,
      full_name: student.full_name,
      father_name: student.father_name || '',
      date_of_birth: student.date_of_birth || '',
      gender: student.gender || 'male',
      class_id: student.class_id || '',
      section_id: student.section_id || '',
      address: student.address || '',
      admission_date: student.admission_date || '',
    });
    setErrors({});
    setModalOpen(true);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.admission_number) e.admission_number = 'Admission number is required';
    if (!form.full_name) e.full_name = 'Full name is required';
    if (!form.class_id) e.class_id = 'Class is required';
    if (!form.section_id) e.section_id = 'Section is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate() || !profile?.school_id) return;
    setSaving(true);
    try {
      const data = {
        school_id: profile.school_id,
        admission_number: form.admission_number,
        full_name: form.full_name,
        father_name: form.father_name || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender,
        class_id: form.class_id,
        section_id: form.section_id,
        address: form.address || null,
        admission_date: form.admission_date || null,
      };

      if (editing) {
        await updateStudent(editing.id, data);
        toast('Student updated successfully', 'success');
      } else {
        await createStudent(data);
        toast('Student added successfully', 'success');
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save student';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteStudent(deleteId);
      toast('Student deleted successfully', 'success');
      loadData();
    } catch (err) {
      toast('Failed to delete student', 'error');
      console.error(err);
    }
  }

  return (
    <DashboardLayout title="Students">
      <div className="space-y-6">
        <PageHeader
          title="Student Management"
          description="Add, edit, and manage all students in your school"
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => setBulkModalOpen(true)}>
                Bulk Entry
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800"
                icon={<UserPlus className="h-4 w-4" />}
                onClick={() => navigate('/admin/new-admission')}
              >
                New Admission
              </Button>
              <Button icon={<Plus className="h-4 w-4" />} onClick={openAdd}>Add Student</Button>
            </div>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1 min-w-0">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name or admission number..." />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-[42px] rounded-xl border border-gray-200 bg-white px-3 pr-8 text-sm text-gray-700 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-52 appearance-none bg-no-repeat"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundPosition: 'right 12px center' }}
          >
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <Users className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No students found</p>
            <p className="mt-1 text-sm text-gray-400">Add your first student to get started</p>
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
                  <th className="px-4 py-3 font-semibold text-gray-600">Class</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Section</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-sm font-bold text-blue-700 flex-shrink-0">
                        {s.avatar_url
                          ? <img src={s.avatar_url} alt={s.full_name} className="h-full w-full rounded-full object-cover" />
                          : getInitials(s.full_name)
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{s.admission_number}</td>
                    <td className="px-4 py-3 text-gray-700">{s.full_name}</td>
                    <td className="px-4 py-3 text-gray-700">{s.father_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{s.class?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{s.section?.name || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <button onClick={() => navigate(`/admin/students/${s.id}`)} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="View">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEdit(s)} className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteId(s.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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
        title={editing ? 'Edit Student' : 'Add New Student'}
        description={editing ? 'Update student information' : 'Create a new student record'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Update' : 'Add Student'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Admission Number" required value={form.admission_number} onChange={(e) => setForm({ ...form, admission_number: e.target.value })} error={errors.admission_number} />
          <Input label="Full Name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} error={errors.full_name} />
          <Input label="Father's Name" value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} placeholder="Father's full name" />
          <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          <Select label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
          <Select label="Class" required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value, section_id: '' })} error={errors.class_id}>
            <option value="">Select class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Section" required value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })} error={errors.section_id} disabled={!form.class_id}>
            <option value="">Select section</option>
            {availableSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Admission Date" type="date" value={form.admission_date} onChange={(e) => setForm({ ...form, admission_date: e.target.value })} />
          <div className="sm:col-span-2">
            <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
      </Modal>

      <BulkStudentUpload
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        schoolId={profile?.school_id ?? ''}
        classes={classes}
        onSuccess={loadData}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Student"
        message="Are you sure you want to delete this student? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </DashboardLayout>
  );
}
