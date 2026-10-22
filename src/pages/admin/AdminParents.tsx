import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, User, Mail, Phone, MapPin, Link2, Unlink,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SearchInput, PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchParents, updateParent, deleteParent, createParentAccount,
  fetchStudents, linkParentStudent, fetchParentStudents, unlinkParentStudent,
} from '@/services/api';
import type { Parent, Student, ParentStudent } from '@/types';
import { validateEmail, getInitials } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { StatusBadge } from '@/components/ui/Badge';

// ─── Supabase helper ────────────────────────────────────────────────────────

async function refreshLinks(parentId: string): Promise<ParentStudent[]> {
  const { data } = await supabase
    .from('parent_students')
    .select('*, student:students(*)')
    .eq('parent_id', parentId);
  return (data as ParentStudent[]) || [];
}

// ─── Main View ───────────────────────────────────────────────────────────────

function AdminParentsView() {
  const { profile } = useAuth();
  const toast = useToast();
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editing, setEditing] = useState<Parent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', phone: '', occupation: '', address: '' });
  const [editForm, setEditForm] = useState<Partial<Parent>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Link modal state
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkParent, setLinkParent] = useState<Parent | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkRelationship, setLinkRelationship] = useState('guardian');
  const [currentLinks, setCurrentLinks] = useState<ParentStudent[]>([]);

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const data = await fetchParents(profile.school_id);
      setParents(data);
    } catch (err) {
      toast('Failed to load parents', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = parents.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setForm({ full_name: '', email: '', password: '', phone: '', occupation: '', address: '' });
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(p: Parent) {
    setEditing(p);
    setEditForm({ full_name: p.full_name, phone: p.phone, occupation: p.occupation, address: p.address, status: p.status });
    setEditModalOpen(true);
  }

  async function openLinkModal(p: Parent) {
    setLinkParent(p);
    setLinkStudentId('');
    setLinkRelationship('guardian');
    if (profile?.school_id) {
      const students = await fetchStudents(profile.school_id);
      setAllStudents(students);
      const links = await refreshLinks(p.id);
      setCurrentLinks(links);
    }
    setLinkModalOpen(true);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.full_name) e.full_name = 'Name is required';
    if (!form.email) e.email = 'Email is required';
    else if (!validateEmail(form.email)) e.email = 'Invalid email';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Min 8 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleCreate() {
    if (!validate() || !profile?.school_id) return;
    setSaving(true);
    try {
      await createParentAccount({
        email: form.email, password: form.password, full_name: form.full_name,
        school_id: profile.school_id, phone: form.phone || undefined,
        occupation: form.occupation || undefined, address: form.address || undefined,
      });
      toast('Parent account created successfully', 'success');
      setModalOpen(false);
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create parent';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editing) return;
    setSaving(true);
    try {
      await updateParent(editing.id, editForm);
      toast('Parent updated successfully', 'success');
      setEditModalOpen(false);
      loadData();
    } catch {
      toast('Failed to update parent', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteParent(deleteId);
      toast('Parent deleted successfully', 'success');
      loadData();
    } catch {
      toast('Failed to delete parent', 'error');
    }
  }

  async function handleLink() {
    if (!linkParent || !linkStudentId || !profile?.school_id) return;
    try {
      await linkParentStudent(profile.school_id, linkParent.id, linkStudentId, linkRelationship);
      toast('Student linked successfully', 'success');
      const links = await refreshLinks(linkParent.id);
      setCurrentLinks(links);
      setLinkStudentId('');
    } catch {
      toast('Failed to link student', 'error');
    }
  }

  async function handleUnlink(id: string) {
    try {
      await unlinkParentStudent(id);
      toast('Student unlinked', 'success');
      if (linkParent) {
        const links = await refreshLinks(linkParent.id);
        setCurrentLinks(links);
      }
    } catch {
      toast('Failed to unlink student', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parent Management"
        description="Create parent accounts and link them to students"
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={openAdd}>Add Parent</Button>}
      />

      <div className="max-w-sm">
        <SearchInput value={search} onChange={setSearch} placeholder="Search parents..." />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <User className="h-12 w-12 text-gray-300 mb-3" />
          <p className="font-medium text-gray-600">No parents found</p>
          <p className="mt-1 text-sm text-gray-400">Add a parent account using the button above</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-cyan-100 text-sm font-semibold text-cyan-700">
                  {getInitials(p.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{p.full_name}</h3>
                  <div className="mt-1"><StatusBadge status={p.status} /></div>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-gray-600">
                <p className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 text-gray-400" /> {p.email}</p>
                {p.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" /> {p.phone}</p>}
                {p.occupation && <p className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-gray-400" /> {p.occupation}</p>}
                {p.address && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gray-400" /> {p.address}</p>}
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
                <Button size="sm" variant="outline" icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => openLinkModal(p)}>Link Student</Button>
                <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(p)}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleteId(p.id)} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Parent Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add New Parent" description="Create a parent account that can view their child's information." size="lg"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleCreate} loading={saving}>Create Account</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Full Name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} error={errors.full_name} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
          <Input label="Password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} hint="Min 8 characters" />
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
          <Input label="Occupation" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
          <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
      </Modal>

      {/* Edit Parent Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Parent" size="lg"
        footer={<><Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button><Button onClick={handleUpdate} loading={saving}>Save</Button></>}>
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
          <Input label="Occupation" value={editForm.occupation || ''} onChange={(e) => setEditForm({ ...editForm, occupation: e.target.value })} />
          <Input label="Address" value={editForm.address || ''} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
          <Select label="Status" value={editForm.status || 'active'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'active' | 'inactive' })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
      </Modal>

      {/* Link Student Modal */}
      <Modal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} title="Link Student to Parent" description={linkParent?.full_name} size="md"
        footer={<><Button variant="outline" onClick={() => setLinkModalOpen(false)}>Close</Button></>}>
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <Select label="Select Student" value={linkStudentId} onChange={(e) => setLinkStudentId(e.target.value)} className="flex-1">
              <option value="">Choose student...</option>
              {allStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.admission_number})</option>)}
            </Select>
            <Select label="Relationship" value={linkRelationship} onChange={(e) => setLinkRelationship(e.target.value)} className="w-32">
              <option value="father">Father</option>
              <option value="mother">Mother</option>
              <option value="guardian">Guardian</option>
            </Select>
            <Button onClick={handleLink}>Link</Button>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Currently Linked Students</h4>
            {currentLinks.length === 0 ? (
              <p className="text-sm text-gray-400">No students linked yet</p>
            ) : (
              <div className="space-y-2">
                {currentLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{link.student?.full_name}</p>
                      <p className="text-xs text-gray-400 capitalize">{link.relationship}</p>
                    </div>
                    <button onClick={() => handleUnlink(link.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Unlink className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Parent" message="Are you sure?" confirmText="Delete" variant="danger" />
    </div>
  );
}

// ─── Default Export ──────────────────────────────────────────────────────────

export default function AdminParents() {
  return (
    <DashboardLayout title="Parents">
      <AdminParentsView />
    </DashboardLayout>
  );
}
