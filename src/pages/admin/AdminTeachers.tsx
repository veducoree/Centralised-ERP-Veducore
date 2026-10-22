import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, GraduationCap, Eye, EyeOff, Copy, CheckCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SearchInput, PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeachers, updateTeacher, deleteTeacher, createTeacherAccount, fetchSchool } from '@/services/api';
import type { Teacher, School } from '@/types';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { generateTeacherUsername } from '@/lib/parentUtils';

export default function AdminTeachers() {
  const { profile } = useAuth();
  const toast = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '', username: '', password: '', phone: '', employee_id: '',
    qualification: '', subject: '', date_of_joining: '',
  });
  const [editForm, setEditForm] = useState<Partial<Teacher>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Credentials modal state
  const [credTeacher, setCredTeacher] = useState<Teacher | null>(null);
  const [credVisible, setCredVisible] = useState(false);
  const [credCopied, setCredCopied] = useState(false);

  const [school, setSchool] = useState<School | null>(null);
  // true once the school fetch completes (success or failure); prevents the
  // credentials button staying permanently disabled if the fetch fails.
  const [schoolLoaded, setSchoolLoaded] = useState(false);

  function getUsername(t: Teacher): string {
    if (t.email) return t.email;
    return generateTeacherUsername(t.full_name, school?.name ?? '');
  }

  useEffect(() => {
    if (!profile?.school_id) return;
    fetchSchool(profile.school_id)
      .then(s => { setSchool(s); })
      .catch(console.error)
      .finally(() => setSchoolLoaded(true));
  }, [profile?.school_id]);

  useEffect(() => {
    const generated = generateTeacherUsername(form.full_name, school?.name ?? '');
    setForm(prev => ({ ...prev, username: generated }));
  }, [form.full_name, school]);

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const data = await fetchTeachers(profile.school_id);
      setTeachers(data);
    } catch (err) {
      toast('Failed to load teachers', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalTeachers = teachers.length;
  const totalSubjects = new Set(teachers.filter(t => t.subject).map(t => t.subject)).size;

  const filtered = teachers.filter((t) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      t.full_name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      t.employee_id.toLowerCase().includes(q) ||
      (t.subject ?? '').toLowerCase().includes(q) ||
      getUsername(t).includes(q)
    );
  });

  function openAdd() {
    setForm({
      full_name: '', username: '', password: '', phone: '', employee_id: '',
      qualification: '', subject: '', date_of_joining: new Date().toISOString().split('T')[0],
    });
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(t: Teacher) {
    setEditing(t);
    setEditForm({
      full_name: t.full_name, phone: t.phone, qualification: t.qualification,
      subject: t.subject, date_of_joining: t.date_of_joining, status: t.status,
      password: '',
    });
    setEditModalOpen(true);
  }

  function openCredentials(t: Teacher) {
    setCredTeacher(t);
    setCredVisible(true);
    setCredCopied(false);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = 'Name is required';
    if (!form.username) e.username = 'Name is required to generate username';
    if (!form.employee_id.trim()) e.employee_id = 'Employee ID is required';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 6) e.password = 'Password must be at least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleCreate() {
    if (!validate() || !profile?.school_id) return;
    setSaving(true);
    try {
      const res = await createTeacherAccount({
        email: form.username,   // username IS the login identifier
        password: form.password,
        full_name: form.full_name,
        school_id: profile.school_id,
        phone: form.phone || undefined,
        employee_id: form.employee_id,
        qualification: form.qualification || undefined,
        subject: form.subject || undefined,
        date_of_joining: form.date_of_joining || undefined,
      });
      toast('Teacher account created successfully', 'success');
      setModalOpen(false);

      // Immediately display credentials modal with username and password visible
      const newTeacher: Teacher = {
        id: res?.id || `teacher-${Date.now()}`,
        school_id: profile.school_id,
        user_id: res?.id,
        full_name: form.full_name,
        email: form.username,
        employee_id: form.employee_id,
        phone: form.phone || '',
        qualification: form.qualification || '',
        subject: form.subject || '',
        date_of_joining: form.date_of_joining || '',
        status: 'active',
        password: form.password,
      };
      setCredTeacher(newTeacher);
      setCredVisible(true);
      setCredCopied(false);

      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create teacher';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editing) return;
    const updates: Partial<Teacher> = { ...editForm };
    if (updates.password !== undefined && updates.password !== '') {
      if (updates.password.length < 6) {
        toast('Password must be at least 6 characters', 'error');
        return;
      }
    } else {
      delete updates.password; // keep the existing password
    }
    setSaving(true);
    try {
      await updateTeacher(editing.id, updates);
      toast('Teacher updated successfully', 'success');
      setEditModalOpen(false);
      loadData();
    } catch (err) {
      toast('Failed to update teacher', 'error');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteTeacher(deleteId);
      toast('Teacher deleted successfully', 'success');
      loadData();
    } catch (err) {
      toast('Failed to delete teacher', 'error');
      console.error(err);
    }
  }

  return (
    <DashboardLayout title="Teachers">
      <div className="space-y-6">
        <PageHeader
          title="Teacher Management"
          description="Create and manage teacher accounts"
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={openAdd}>Add Teacher</Button>}
        />

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <Card className="p-4">
            <p className="text-sm font-medium text-gray-500">Total Teachers</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totalTeachers}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm font-medium text-gray-500">Total Subjects</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totalSubjects}</p>
          </Card>
        </div>

        {/* Search bar */}
        <div className="max-w-sm">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, employee ID, subject, or username..." />
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <GraduationCap className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No teachers found</p>
            <p className="mt-1 text-sm text-gray-400">Add your first teacher to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600">Teacher</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Username</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Subject(s)</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Contact</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    {/* Teacher: bold name + gray employee_id below */}
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{t.full_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.employee_id}</p>
                    </td>
                    {/* Username: firstname@school.veducore — shows skeleton until school loads */}
                    <td className="px-4 py-3 font-mono text-sm text-blue-700">
                      {!schoolLoaded
                        ? <span className="inline-block h-3.5 w-32 animate-pulse rounded bg-gray-200" />
                        : getUsername(t)}
                    </td>
                    {/* Subject(s): Badge chip, or — */}
                    <td className="px-4 py-3">
                      {t.subject
                        ? t.subject.split(',').map((s, i) => (
                            <Badge key={i} variant="info" className="mr-1 mb-1">{s.trim()}</Badge>
                          ))
                        : <span className="text-gray-400">—</span>}
                    </td>
                    {/* Contact: phone + email stacked */}
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{t.phone || '—'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t.email}</p>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <button onClick={() => openCredentials(t)} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="View credentials" disabled={!schoolLoaded}>
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEdit(t)} className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteId(t.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete">
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

      {/* Create Teacher Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add New Teacher"
        description="Create a teacher account. The teacher can sign in with these credentials."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Create Account</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Full Name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} error={errors.full_name} />
          <Input label="Employee ID" required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} error={errors.employee_id} />
          <Input
            label="Username"
            required
            value={form.username}
            readOnly
            disabled
            hint="Auto-generated from name"
            error={errors.username}
          />
          <Input label="Password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} hint="Minimum 6 characters" />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">+91</span>
              <input
                type="tel"
                maxLength={10}
                value={form.phone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setForm({ ...form, phone: digits });
                }}
                className="flex-1 rounded-r-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                placeholder="10-digit mobile number"
              />
            </div>
          </div>
          <Input label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" />
          <Input label="Qualification" value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="e.g. M.Sc, B.Ed" />
          <Input label="Date of Joining" type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} />
        </div>
      </Modal>

      {/* Edit Teacher Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Teacher"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} loading={saving}>Save Changes</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Full Name" value={editForm.full_name || ''} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">+91</span>
              <input
                type="tel"
                maxLength={10}
                value={editForm.phone || ''}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setEditForm({ ...editForm, phone: digits });
                }}
                className="flex-1 rounded-r-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                placeholder="10-digit mobile number"
              />
            </div>
          </div>
          <Input label="Subject" value={editForm.subject || ''} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} />
          <Input label="Qualification" value={editForm.qualification || ''} onChange={(e) => setEditForm({ ...editForm, qualification: e.target.value })} />
          <Input label="Date of Joining" type="date" value={editForm.date_of_joining || ''} onChange={(e) => setEditForm({ ...editForm, date_of_joining: e.target.value })} />
          <Input
            label="Password"
            type="password"
            value={editForm.password ?? ''}
            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
            hint="Leave blank to keep the existing password."
          />
          <Select label="Status" value={editForm.status || 'active'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'active' | 'inactive' })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
      </Modal>

      {/* Credentials Modal */}
      <Modal
        open={!!credTeacher}
        onClose={() => setCredTeacher(null)}
        title="Teacher Credentials"
        description={credTeacher ? `${credTeacher.full_name} · ${credTeacher.employee_id}` : ''}
        size="md"
        footer={<Button variant="outline" onClick={() => setCredTeacher(null)}>Close</Button>}
      >
        {credTeacher && (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-blue-100/60">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Username</p>
                  <p className="font-mono text-sm font-semibold text-blue-700">{getUsername(credTeacher)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(getUsername(credTeacher));
                    toast('Username copied', 'success');
                  }}
                  className="rounded-lg p-1.5 bg-white shadow-sm border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-all"
                  title="Copy username"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Password</p>
                  <p className="font-mono text-sm font-semibold text-gray-900 tracking-wide">
                    {credVisible ? (credTeacher.password || '(not stored)') : '••••••••'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCredVisible(v => !v)}
                    className="rounded-lg p-1.5 bg-white shadow-sm border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-all"
                    title={credVisible ? 'Hide' : 'Show'}
                  >
                    {credVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const pw = credTeacher.password ?? '';
                      navigator.clipboard.writeText(pw);
                      setCredCopied(true);
                      toast('Password copied', 'success');
                      setTimeout(() => setCredCopied(false), 1500);
                    }}
                    className="rounded-lg p-1.5 bg-white shadow-sm border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-all"
                    title="Copy password"
                  >
                    {credCopied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full flex items-center justify-center gap-2 border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium shadow-sm"
              onClick={() => {
                const text = `Teacher Login Credentials\nSchool: ${school?.name || 'Veducore School'}\nTeacher: ${credTeacher.full_name}\nUsername: ${getUsername(credTeacher)}\nPassword: ${credTeacher.password || ''}`;
                navigator.clipboard.writeText(text);
                toast('Username & Password copied to clipboard', 'success');
              }}
            >
              <Copy className="h-4 w-4" /> Copy All Credentials
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Teacher"
        message="Are you sure you want to delete this teacher? This will remove their data but not their auth account."
        confirmText="Delete"
        variant="danger"
      />
    </DashboardLayout>
  );
}
