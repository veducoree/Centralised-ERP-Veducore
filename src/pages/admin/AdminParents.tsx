import { useEffect, useState, useCallback } from 'react';
import {
  Pencil, Trash2, User, Mail, Phone, MapPin,
  Copy, Eye, EyeOff, CheckCircle, GraduationCap, KeyRound,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SearchInput, PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchParents, updateParent, deleteParent, fetchSchool,
} from '@/services/api';
import type { Parent, School } from '@/types';
import { getInitials } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';

// ─── Main View ───────────────────────────────────────────────────────────────

function AdminParentsView() {
  const { profile } = useAuth();
  const toast = useToast();
  const [parents, setParents] = useState<Parent[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit modal state (Only Phone Number & Address)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editing, setEditing] = useState<Parent | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');

  // Credentials modal state
  const [credModalOpen, setCredModalOpen] = useState(false);
  const [credParent, setCredParent] = useState<Parent | null>(null);
  const [credVisible, setCredVisible] = useState(true);
  const [credCopied, setCredCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [data, schoolData] = await Promise.all([
        fetchParents(profile.school_id),
        fetchSchool(profile.school_id),
      ]);
      setParents(data);
      setSchool(schoolData);
    } catch (err) {
      toast('Failed to load parents', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  function openCredentials(p: Parent) {
    setCredParent(p);
    setCredVisible(true);
    setCredCopied(false);
    setCredModalOpen(true);
  }

  function openEdit(p: Parent) {
    setEditing(p);
    const rawPhone = p.phone || '';
    const digitsOnly = rawPhone.replace(/\D/g, '');
    const cleanPhone = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
    setEditPhone(cleanPhone);
    setEditAddress(p.address || '');
    setEditModalOpen(true);
  }

  async function handleUpdate() {
    if (!editing) return;
    setSaving(true);
    try {
      const formattedPhone = editPhone.trim() ? editPhone.trim() : null;
      const formattedAddress = editAddress.trim() ? editAddress.trim() : null;

      await updateParent(editing.id, {
        phone: formattedPhone,
        address: formattedAddress,
      });

      toast('Parent details updated successfully', 'success');
      setEditModalOpen(false);
      setEditing(null);
      await loadData();
    } catch (err) {
      console.error(err);
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

  const filtered = parents.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone && p.phone.includes(search))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parent Management"
        description="Parent accounts are automatically generated upon student admissions"
      />

      {/* Stat counters */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm font-medium text-gray-500">Total Parents</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{parents.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-gray-500">Active Accounts</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {parents.filter((p) => p.status === 'active').length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-gray-500">Linked Students</p>
          <p className="mt-1 text-2xl font-bold text-cyan-600">
            {parents.reduce((acc, p) => acc + (p.parent_students?.length || 0), 0)}
          </p>
        </Card>
      </div>

      <div className="max-w-sm">
        <SearchInput value={search} onChange={setSearch} placeholder="Search parents by name, email or phone..." />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <User className="h-12 w-12 text-gray-300 mb-3" />
          <p className="font-medium text-gray-600">No parents found</p>
          <p className="mt-1 text-sm text-gray-400">Parent accounts appear automatically when students are enrolled</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-2xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50/70 text-xs font-semibold uppercase tracking-wider text-gray-600">
              <tr>
                <th className="px-4 py-3.5">Parent</th>
                <th className="px-4 py-3.5">Linked Student(s)</th>
                <th className="px-4 py-3.5">Contact & Address</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                  {/* Parent: Avatar + Name + Occupation */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-cyan-100 text-sm font-bold text-cyan-800">
                        {getInitials(p.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{p.full_name}</p>
                        <p className="text-xs text-gray-400 truncate">Parent / Guardian</p>
                      </div>
                    </div>
                  </td>

                  {/* Linked Student(s) */}
                  <td className="px-4 py-3.5">
                    {p.parent_students && p.parent_students.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {p.parent_students.map((ps) => (
                          <span
                            key={ps.id}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100"
                          >
                            <GraduationCap className="h-3 w-3 text-blue-500" />
                            {ps.student?.full_name || 'Student'}
                            {ps.student?.class?.name ? ` (${ps.student.class.name})` : ''}
                            <span className="text-[10px] text-blue-400 capitalize">· {ps.relationship || 'Child'}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No student linked</span>
                    )}
                  </td>

                  {/* Contact: Phone, Email & Address */}
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      {p.phone ? (p.phone.startsWith('+91') ? p.phone : `+91 ${p.phone}`) : '—'}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                      <Mail className="h-3 w-3 text-gray-400 flex-shrink-0" /> {p.email}
                    </p>
                    {p.address && (
                      <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5 max-w-xs truncate" title={p.address}>
                        <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" /> {p.address}
                      </p>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <StatusBadge status={p.status} />
                  </td>

                  {/* Actions: Credentials, Edit (Phone & Address), Delete */}
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-cyan-200 text-cyan-800 bg-cyan-50/60 hover:bg-cyan-100 font-medium"
                        icon={<KeyRound className="h-3.5 w-3.5" />}
                        onClick={() => openCredentials(p)}
                        title="View Login Credentials"
                      >
                        Credentials
                      </Button>
                      <button
                        onClick={() => openEdit(p)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                        title="Edit Phone Number & Address"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(p.id)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Delete Parent"
                      >
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

      {/* Edit Parent Modal: ONLY Phone Number & Address */}
      <Modal
        open={editModalOpen && !!editing}
        onClose={() => {
          setEditModalOpen(false);
          setEditing(null);
        }}
        title="Edit Parent Contact & Address"
        size="md"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditModalOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} loading={saving}>
              Save Changes
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            {/* Readonly info header */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Parent Name</p>
                <p className="text-sm font-semibold text-gray-900">{editing.full_name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 font-medium">Login Username</p>
                <p className="text-xs font-mono text-gray-700">{editing.email}</p>
              </div>
            </div>

            {/* Phone Number Input */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Phone Number
              </label>
              <div className="flex rounded-lg shadow-2xs">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-600 text-sm font-medium select-none">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  value={editPhone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setEditPhone(digits);
                  }}
                  className="flex-1 rounded-r-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="10-digit mobile number"
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Used for SMS/WhatsApp updates and synced as emergency contact for linked student(s).
              </p>
            </div>

            {/* Residential Address Textarea */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Residential Address
              </label>
              <textarea
                rows={3}
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                placeholder="Enter complete residential address..."
              />
              <p className="mt-1 text-xs text-gray-400">
                Directly updates residential address for this parent and linked student records in database.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Credentials Modal */}
      <Modal
        open={credModalOpen && !!credParent}
        onClose={() => {
          setCredModalOpen(false);
          setCredParent(null);
        }}
        title="Parent Login Credentials"
        description={credParent ? `${credParent.full_name} · ${school?.name || 'Veducore School'}` : ''}
        size="md"
        footer={
          <Button
            variant="outline"
            onClick={() => {
              setCredModalOpen(false);
              setCredParent(null);
            }}
          >
            Close
          </Button>
        }
      >
        {credParent && (
          <div className="space-y-4">
            {/* Linked Student(s) Preview */}
            {credParent.parent_students && credParent.parent_students.length > 0 && (
              <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-3">
                <p className="text-xs font-semibold text-blue-900 mb-1.5 flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5 text-blue-600" /> Linked Student(s)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {credParent.parent_students.map((ps) => (
                    <span
                      key={ps.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-blue-200 text-blue-800 text-xs font-medium shadow-2xs"
                    >
                      {ps.student?.full_name || 'Student'} ({ps.relationship || 'Child'})
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50/70 to-blue-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-cyan-100">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Username / Email</p>
                  <p className="font-mono text-sm font-semibold text-cyan-900">{credParent.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(credParent.email);
                    toast('Username copied', 'success');
                  }}
                  className="rounded-lg p-1.5 bg-white shadow-2xs border border-gray-200 text-gray-500 hover:text-cyan-700 hover:border-cyan-300 transition-all"
                  title="Copy username"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Portal Password</p>
                  <p className="font-mono text-sm font-semibold text-gray-900 tracking-wide">
                    {credVisible ? (credParent.password || '(not stored)') : '••••••••'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCredVisible((v) => !v)}
                    className="rounded-lg p-1.5 bg-white shadow-2xs border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-all"
                    title={credVisible ? 'Hide' : 'Show'}
                  >
                    {credVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const pw = credParent.password ?? '';
                      navigator.clipboard.writeText(pw);
                      setCredCopied(true);
                      toast('Password copied', 'success');
                      setTimeout(() => setCredCopied(false), 1500);
                    }}
                    className="rounded-lg p-1.5 bg-white shadow-2xs border border-gray-200 text-gray-500 hover:text-cyan-700 hover:border-cyan-300 transition-all"
                    title="Copy password"
                  >
                    {credCopied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full flex items-center justify-center gap-2 border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium shadow-2xs"
              onClick={() => {
                const students = credParent.parent_students?.map((ps) => ps.student?.full_name).filter(Boolean).join(', ') || 'N/A';
                const text = `Parent Login Credentials\nSchool: ${school?.name || 'Veducore School'}\nParent: ${credParent.full_name}\nStudent: ${students}\nUsername: ${credParent.email}\nPassword: ${credParent.password || ''}\nPortal: Veducore Parent App / Portal`;
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
        title="Delete Parent"
        message="Are you sure you want to delete this parent account?"
        confirmText="Delete"
        variant="danger"
      />
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
