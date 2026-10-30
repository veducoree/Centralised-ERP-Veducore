import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, LogOut } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeacherByUserId, fetchSchool } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { getInitials } from '@/lib/utils';
import { generateTeacherUsername } from '@/lib/parentUtils';
import type { Teacher, School } from '@/types';

export default function ProfilePage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [school, setSchool] = useState<School | null>(null);

  // Fetch school & teacher info
  useEffect(() => {
    if (!profile) return;
    if (profile.school_id) {
      fetchSchool(profile.school_id).then(setSchool).catch(() => {});
    }
    if (profile.role === 'teacher') {
      fetchTeacherByUserId(profile.id).then(setTeacher).catch(() => {});
    }
  }, [profile?.id, profile?.school_id, profile?.role]);

  // Change password modal state
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

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

          {/* Institutional Credentials Grid (Non-editable as requested) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Full Name
              </label>
              <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/75 px-3.5 py-2.5 text-sm font-medium text-gray-900 shadow-sm">
                <span>{profile.full_name}</span>
                <span className="ml-auto text-[11px] font-semibold text-gray-400">Verified</span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Login Identifier (Email / Username)
              </label>
              <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/75 px-3.5 py-2.5 text-sm font-mono text-blue-700 shadow-sm">
                <span className="truncate">{displayUsername}</span>
                <span className="ml-auto text-[11px] font-semibold text-gray-400 flex-shrink-0">Locked</span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Contact Number
              </label>
              <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/75 px-3.5 py-2.5 text-sm font-medium text-gray-900 shadow-sm">
                <span>{profile.phone || school?.contact_number || 'Not Provided'}</span>
                <span className="ml-auto text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                  Verified Contact
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Institutional Role
              </label>
              <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/75 px-3.5 py-2.5 text-sm font-medium text-gray-900 shadow-sm">
                <span>{roleLabel}</span>
                <span className="ml-auto text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                  {school?.name || 'Veducore Platform'}
                </span>
              </div>
            </div>

            {profile.role === 'teacher' && teacher && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Employee ID
                  </label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50/75 px-3.5 py-2.5 text-sm font-mono text-gray-800 shadow-sm">
                    {teacher.employee_id}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Primary Subject
                  </label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50/75 px-3.5 py-2.5 text-sm text-gray-800 shadow-sm">
                    {teacher.subject ?? 'General'}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Academic Qualification
                  </label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50/75 px-3.5 py-2.5 text-sm text-gray-800 shadow-sm">
                    {teacher.qualification ?? 'Certified Faculty'}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Info Banner */}
          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs text-blue-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p>
              Institutional records, mobile numbers, and login credentials are centrally managed by the school administration and cannot be edited directly.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                icon={<KeyRound className="h-4 w-4" />}
                onClick={openPwModal}
                className="bg-white hover:bg-gray-50 shadow-sm"
              >
                Change Password
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<LogOut className="h-4 w-4" />}
                onClick={async () => {
                  await signOut();
                  navigate('/login', { replace: true });
                }}
                className="shadow-sm"
              >
                Sign Out
              </Button>
            </div>
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
