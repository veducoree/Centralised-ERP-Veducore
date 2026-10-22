import { useState, useEffect } from 'react';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  updateProfile,
  fetchTeacherByUserId,
  fetchSchool,
} from '@/services/api';
import { supabase } from '@/lib/supabase';
import { getInitials } from '@/lib/utils';
import { generateTeacherUsername } from '@/lib/parentUtils';
import type { Teacher, School } from '@/types';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
  });

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [school, setSchool] = useState<School | null>(null);

  // Change password modal state
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  useEffect(() => {
    if (!profile) return;
    if (profile.school_id) {
      fetchSchool(profile.school_id).then(setSchool).catch(() => {});
    }
    if (profile.role === 'teacher') {
      fetchTeacherByUserId(profile.id).then(setTeacher).catch(() => {});
    }
  }, [profile?.id, profile?.school_id, profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep form in sync when profile loads
  useEffect(() => {
    if (profile) {
      setForm({ full_name: profile.full_name || '', phone: profile.phone || '' });
    }
  }, [profile?.full_name, profile?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      await updateProfile(profile.id, { full_name: form.full_name, phone: form.phone });
      toast('Profile updated successfully', 'success');
      refreshProfile();
    } catch {
      toast('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  }

  function openPwModal() {
    setPwForm({ current: '', next: '', confirm: '' });
    setShowCurrent(false);
    setShowNext(false);
    setPwModalOpen(true);
  }

  async function handleChangePassword() {
    if (!profile) return;

    if (!pwForm.current) { toast('Enter your current password', 'error'); return; }
    if (!pwForm.next || pwForm.next.length < 6) { toast('New password must be at least 6 characters', 'error'); return; }
    if (pwForm.next !== pwForm.confirm) { toast('Passwords do not match', 'error'); return; }

    setPwSaving(true);
    try {
      // Re-authenticate with current password first
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: pwForm.current,
      });
      if (signInErr) {
        toast('Current password is incorrect', 'error');
        return;
      }

      // Update password via Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({ password: pwForm.next });
      if (updateErr) throw updateErr;

      toast('Password changed successfully', 'success');
      setPwModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to change password';
      toast(msg, 'error');
    } finally {
      setPwSaving(false);
    }
  }

  /** Get the username/email to display */
  function getDisplayUsername(): string {
    if (!school) return profile?.email ?? '';
    if (profile?.role === 'teacher') {
      return generateTeacherUsername(profile.full_name, school.name);
    }
    return profile?.email ?? '';
  }

  if (!profile) return null;

  const roleLabel = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
  const isTeacherOrParent = profile.role === 'teacher' || profile.role === 'parent';
  const displayUsername = getDisplayUsername();

  return (
    <DashboardLayout title="My Profile">
      <div className="space-y-6">
        <PageHeader title="My Profile" description="Manage your personal information" />

        <Card className="p-6">
          {/* Avatar + name header */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-700 flex-shrink-0">
              {getInitials(profile.full_name)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{profile.full_name}</h2>
              <p className="text-sm font-mono text-blue-700">{displayUsername}</p>
              <span className="mt-1 inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                {roleLabel}
              </span>
            </div>
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Full Name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
            <Input
              label="Email / Username"
              value={displayUsername}
              disabled
              hint="Your login identifier — cannot be changed"
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input label="Role" value={roleLabel} disabled />
            {profile.role === 'teacher' && teacher && (
              <>
                <Input label="Employee ID" value={teacher.employee_id} disabled />
                <Input label="Subject" value={teacher.subject ?? ''} disabled />
                <Input label="Qualification" value={teacher.qualification ?? ''} disabled />
              </>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between">
            {isTeacherOrParent ? (
              <Button
                variant="outline"
                icon={<KeyRound className="h-4 w-4" />}
                onClick={openPwModal}
              >
                Change Password
              </Button>
            ) : (
              <div />
            )}
            <Button onClick={handleSave} loading={saving}>Save Changes</Button>
          </div>
        </Card>
      </div>

      {/* Change Password Modal */}
      <Modal
        open={pwModalOpen}
        onClose={() => setPwModalOpen(false)}
        title="Change Password"
        description="Enter your current password then choose a new one."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPwModalOpen(false)}>Cancel</Button>
            <Button onClick={handleChangePassword} loading={pwSaving}>Update Password</Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Current password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Current Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={pwForm.current}
                onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                placeholder="Enter current password"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              New Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showNext ? 'text' : 'password'}
                value={pwForm.next}
                onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNext(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Confirm New Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="Re-enter new password"
              autoComplete="new-password"
            />
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
