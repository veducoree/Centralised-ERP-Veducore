import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UserCog, Plus, ShieldCheck, Crown, Pencil, Trash2, KeyRound, Copy, RefreshCw, Users, Lock,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { PERMISSION_MODULES } from '@/auth/PermissionsContext';
import {
  fetchStaffRoles, saveStaffRole, deleteStaffRole, listSchoolStaff,
  assignStaffRole, setStaffStatus, createStaffAccount,
} from '@/services/api';
import type { StaffRole, StaffMember, PermissionLevel } from '@/types';

const LEVELS: { value: PermissionLevel; label: string }[] = [
  { value: 'none', label: 'No access' },
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
];

const GROUPS = Array.from(new Set(PERMISSION_MODULES.map((m) => m.group)));

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

function summarize(perms: Record<string, PermissionLevel>) {
  const edit = Object.values(perms).filter((v) => v === 'edit').length;
  const view = Object.values(perms).filter((v) => v === 'view').length;
  return `${edit} edit · ${view} view`;
}

export default function AdminStaff() {
  const { profile } = useAuth();
  const toast = useToast();
  const schoolId = profile?.school_id;

  const [tab, setTab] = useState<'staff' | 'roles'>('staff');
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // staff modal
  const [staffModal, setStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState({ full_name: '', login: '', phone: '', password: genPassword(), staff_role_id: '' });
  const [staffErrors, setStaffErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; login: string; password: string } | null>(null);
  const [statusTarget, setStatusTarget] = useState<StaffMember | null>(null);

  // role modal
  const [roleModal, setRoleModal] = useState<{ id?: string; name: string; description: string; permissions: Record<string, PermissionLevel> } | null>(null);
  const [roleErrors, setRoleErrors] = useState<Record<string, string>>({});
  const [savingRole, setSavingRole] = useState(false);
  const [deleteRole, setDeleteRole] = useState<StaffRole | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [r, s] = await Promise.all([fetchStaffRoles(schoolId), listSchoolStaff()]);
      setRoles(r);
      setStaff(s);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load staff', 'error');
    } finally { setLoading(false); }
  }, [schoolId, toast]);

  useEffect(() => { load(); }, [load]);

  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const usage = useMemo(() => {
    const m: Record<string, number> = {};
    staff.forEach((s) => { if (s.staff_role_id) m[s.staff_role_id] = (m[s.staff_role_id] ?? 0) + 1; });
    return m;
  }, [staff]);

  // ─── Staff actions ─────────────────────────────────────────────────────
  function openNewStaff() {
    setStaffForm({ full_name: '', login: '', phone: '', password: genPassword(), staff_role_id: roles[0]?.id ?? '' });
    setStaffErrors({});
    setStaffModal(true);
  }

  async function handleCreateStaff() {
    if (!schoolId) return;
    const e: Record<string, string> = {};
    if (!staffForm.full_name.trim()) e.full_name = 'Name is required';
    const login = staffForm.login.trim().toLowerCase();
    if (!login) e.login = 'Email or username is required';
    else if (!login.includes('@') && !/^[a-z0-9._-]{3,}$/.test(login)) e.login = 'Username: 3+ letters, numbers, dot, dash or underscore';
    if (staffForm.password.length < 8) e.password = 'At least 8 characters';
    if (!staffForm.staff_role_id) e.staff_role_id = 'Choose a role';
    setStaffErrors(e);
    if (Object.keys(e).length) return;

    setCreating(true);
    try {
      const email = login.includes('@') ? login : `${login}@veducore.internal`;
      await createStaffAccount({
        email, password: staffForm.password, full_name: staffForm.full_name.trim(),
        school_id: schoolId, phone: staffForm.phone.trim() || undefined, staff_role_id: staffForm.staff_role_id,
      });
      setStaffModal(false);
      setCreated({ name: staffForm.full_name.trim(), login, password: staffForm.password });
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create staff', 'error');
      load();
    } finally { setCreating(false); }
  }

  async function handleRoleChange(member: StaffMember, roleId: string) {
    try {
      await assignStaffRole(member.id, roleId || null);
      setStaff((prev) => prev.map((s) => (s.id === member.id ? { ...s, staff_role_id: roleId || null } : s)));
      toast(`${member.full_name} is now ${roleId ? roleById[roleId]?.name : 'an Owner'}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to change role', 'error');
    }
  }

  async function handleToggleStatus() {
    if (!statusTarget) return;
    const next = statusTarget.status === 'active' ? 'inactive' : 'active';
    try {
      await setStaffStatus(statusTarget.id, next);
      toast(next === 'active' ? 'Login re-enabled' : 'Login disabled', 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update status', 'error');
    }
  }

  // ─── Role actions ──────────────────────────────────────────────────────
  function openRole(role?: StaffRole) {
    setRoleErrors({});
    setRoleModal(role
      ? { id: role.id, name: role.name, description: role.description ?? '', permissions: { ...role.permissions } }
      : { name: '', description: '', permissions: { dashboard: 'view' } });
  }

  function setAll(level: PermissionLevel) {
    if (!roleModal) return;
    setRoleModal({ ...roleModal, permissions: Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, level])) });
  }

  async function handleSaveRole() {
    if (!schoolId || !roleModal) return;
    if (!roleModal.name.trim()) { setRoleErrors({ name: 'Name is required' }); return; }
    setSavingRole(true);
    try {
      const permissions = Object.fromEntries(Object.entries(roleModal.permissions).filter(([, v]) => v !== 'none'));
      await saveStaffRole({ id: roleModal.id, school_id: schoolId, name: roleModal.name.trim(), description: roleModal.description.trim() || null, permissions });
      toast(roleModal.id ? 'Role updated' : 'Role created', 'success');
      setRoleModal(null);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save role', 'error');
    } finally { setSavingRole(false); }
  }

  async function handleDeleteRole() {
    if (!deleteRole) return;
    try { await deleteStaffRole(deleteRole.id); toast('Role deleted', 'success'); load(); }
    catch (err) { toast(err instanceof Error ? err.message : 'Failed to delete role', 'error'); }
  }

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast('Copied', 'success')).catch(() => {});

  return (
    <DashboardLayout title="Staff & Roles">
      <div className="space-y-6">
        <PageHeader
          title="Staff & Roles"
          description="Give office staff their own login and control which modules each role can see or change."
          action={tab === 'staff'
            ? <Button icon={<Plus className="h-4 w-4" />} onClick={openNewStaff} disabled={!roles.length}>Add staff</Button>
            : <Button icon={<Plus className="h-4 w-4" />} onClick={() => openRole()}>New role</Button>}
        />

        <div className="inline-flex rounded-xl bg-white p-1 shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
          {([['staff', 'Staff', Users], ['roles', 'Roles & permissions', ShieldCheck]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${tab === key ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {loading ? <LoadingSpinner variant="cards" /> : tab === 'staff' ? (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {staff.map((m) => {
                const isMe = m.id === profile?.id;
                const role = m.staff_role_id ? roleById[m.staff_role_id] : null;
                return (
                  <li key={m.id} className={`flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center ${m.status === 'inactive' ? 'opacity-60' : ''}`}>
                    <div className="flex flex-1 items-center gap-3">
                      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${role ? 'bg-brand-50 text-brand-600' : 'bg-amber-50 text-amber-600'}`}>
                        {role ? m.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() : <Crown className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                          {m.full_name}
                          {isMe && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">YOU</span>}
                          {m.status === 'inactive' && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">DISABLED</span>}
                        </p>
                        <p className="truncate text-xs text-slate-500">{m.email.replace('@veducore.internal', '')}{m.phone ? ` · ${m.phone}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isMe ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"><Crown className="h-3.5 w-3.5" /> Owner</span>
                      ) : (
                        <div className="w-48">
                          <Select fieldSize="sm" value={m.staff_role_id ?? ''} onChange={(e) => handleRoleChange(m, e.target.value)} aria-label={`Role for ${m.full_name}`}>
                            <option value="">Owner (full access)</option>
                            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </Select>
                        </div>
                      )}
                      {!isMe && (
                        <Button size="sm" variant={m.status === 'active' ? 'ghost' : 'outline'} icon={<Lock className="h-4 w-4" />} onClick={() => setStatusTarget(m)}>
                          {m.status === 'active' ? 'Disable' : 'Enable'}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
              {staff.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-500">No staff yet</li>}
            </ul>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((r) => (
              <Card key={r.id} className="flex flex-col p-5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><UserCog className="h-4 w-4" /></span>
                    <div>
                      <p className="font-semibold text-slate-900">{r.name}</p>
                      <p className="text-[11px] text-slate-400">{summarize(r.permissions)} · {usage[r.id] ?? 0} staff</p>
                    </div>
                  </div>
                </div>
                {r.description && <p className="mb-3 text-sm text-slate-500">{r.description}</p>}
                <div className="mb-4 flex flex-wrap gap-1">
                  {PERMISSION_MODULES.filter((m) => r.permissions[m.key] && r.permissions[m.key] !== 'none').map((m) => (
                    <span key={m.key} className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${r.permissions[m.key] === 'edit' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {m.label}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex gap-2">
                  <Button size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => openRole(r)}>Edit</Button>
                  {!usage[r.id] && <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteRole(r)}>Delete</Button>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ─── Add staff ─── */}
      <Modal open={staffModal} onClose={() => setStaffModal(false)} title="Add staff login"
        description="They sign in on the same login page and only see the modules their role allows."
        footer={<><Button variant="ghost" onClick={() => setStaffModal(false)}>Cancel</Button><Button loading={creating} onClick={handleCreateStaff}>Create login</Button></>}>
        <div className="space-y-4">
          <Input label="Full name" required value={staffForm.full_name} error={staffErrors.full_name}
            onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email or username" required value={staffForm.login} error={staffErrors.login} placeholder="accounts.rahul"
              onChange={(e) => setStaffForm({ ...staffForm, login: e.target.value })} />
            <Input label="Phone" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input label="Password" required value={staffForm.password} error={staffErrors.password}
                onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} />
              <button type="button" onClick={() => setStaffForm({ ...staffForm, password: genPassword() })}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600"><RefreshCw className="h-3 w-3" /> Generate</button>
            </div>
            <Select label="Role" required value={staffForm.staff_role_id} error={staffErrors.staff_role_id}
              onChange={(e) => setStaffForm({ ...staffForm, staff_role_id: e.target.value })}>
              <option value="">Select role…</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
        </div>
      </Modal>

      {/* ─── Credentials ─── */}
      <Modal open={!!created} onClose={() => setCreated(null)} title="Login created"
        footer={<Button onClick={() => setCreated(null)}>Done</Button>}>
        {created && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Share these with <b>{created.name}</b>. The password won't be shown again.</p>
            {[['Username', created.login], ['Password', created.password]].map(([label, value]) => (
              <div key={label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <KeyRound className="h-4 w-4 text-slate-400" />
                <div className="flex-1"><p className="text-[11px] text-slate-500">{label}</p><p className="font-mono text-sm text-slate-900">{value}</p></div>
                <button onClick={() => copy(value)} aria-label={`Copy ${label}`} className="rounded-lg p-2 text-slate-500 hover:bg-white"><Copy className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ─── Role editor ─── */}
      <Modal open={!!roleModal} onClose={() => setRoleModal(null)} size="lg" title={roleModal?.id ? 'Edit role' : 'New role'}
        footer={<><Button variant="ghost" onClick={() => setRoleModal(null)}>Cancel</Button><Button loading={savingRole} onClick={handleSaveRole}>Save role</Button></>}>
        {roleModal && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Role name" required value={roleModal.name} error={roleErrors.name} placeholder="e.g. Librarian"
                onChange={(e) => setRoleModal({ ...roleModal, name: e.target.value })} />
              <Textarea label="Description" rows={1} value={roleModal.description}
                onChange={(e) => setRoleModal({ ...roleModal, description: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Set all:</span>
              {LEVELS.map((l) => (
                <button key={l.value} type="button" onClick={() => setAll(l.value)} className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50">{l.label}</button>
              ))}
            </div>
            <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
              {GROUPS.map((g) => (
                <div key={g}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g}</p>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {PERMISSION_MODULES.filter((m) => m.group === g).map((m) => {
                      const cur = roleModal.permissions[m.key] ?? 'none';
                      return (
                        <div key={m.key} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-sm text-slate-700">{m.label}</span>
                          <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="radiogroup" aria-label={`${m.label} access`}>
                            {LEVELS.map((l) => (
                              <button key={l.value} type="button" role="radio" aria-checked={cur === l.value}
                                onClick={() => setRoleModal({ ...roleModal, permissions: { ...roleModal.permissions, [m.key]: l.value } })}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                  cur === l.value
                                    ? l.value === 'edit' ? 'bg-emerald-500 text-white' : l.value === 'view' ? 'bg-white text-slate-900 shadow-sm' : 'bg-white text-slate-500 shadow-sm'
                                    : 'text-slate-500'
                                }`}>
                                {l.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">"Edit" is enforced by the database: without it, a staff member can't change that module's data even outside the app. Staff management is always owner-only.</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!statusTarget} onClose={() => setStatusTarget(null)} onConfirm={handleToggleStatus}
        title={statusTarget?.status === 'active' ? 'Disable login?' : 'Enable login?'}
        message={statusTarget?.status === 'active'
          ? `${statusTarget?.full_name} won't be able to sign in until you enable them again.`
          : `${statusTarget?.full_name} will be able to sign in again.`}
        variant={statusTarget?.status === 'active' ? 'danger' : 'default'} />

      <ConfirmDialog open={!!deleteRole} onClose={() => setDeleteRole(null)} onConfirm={handleDeleteRole}
        title="Delete role" message={`Delete the ${deleteRole?.name} role? This cannot be undone.`} />
    </DashboardLayout>
  );
}
