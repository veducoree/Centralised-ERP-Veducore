// Can the signed-in user use the app? Checked on login, on session restore
// and whenever the app comes to the foreground, so a school paused (or a
// login deactivated) is signed out with a clear message on the login
// screen instead of showing an empty dashboard.
import { supabase } from '@/lib/supabase';

export type AccessBlock = 'school_paused' | 'account_inactive';

export interface AccountAccess {
  blocked: AccessBlock | null;
  message: string | null;
}

export function blockedMessage(blocked: AccessBlock, role: string | null | undefined): string {
  if (blocked === 'school_paused') {
    return role === 'admin'
      ? 'This school account has been paused. Please contact the Veducore team to restore access.'
      : 'Your school account has been paused. Please contact your school admin.';
  }
  return role === 'admin'
    ? 'Your account has been deactivated. Please contact your school principal or the Veducore team.'
    : 'Your account has been deactivated. Please contact your school admin.';
}

/** Never blocks on network errors — the database enforces the pause anyway. */
export async function checkAccountAccess(): Promise<AccountAccess> {
  const open: AccountAccess = { blocked: null, message: null };
  try {
    const { data, error } = await supabase.rpc('my_account_access');
    if (!error && data) {
      const d = data as { blocked?: string | null; role?: string | null };
      const blocked = d.blocked === 'school_paused' || d.blocked === 'account_inactive' ? d.blocked : null;
      return { blocked, message: blocked ? blockedMessage(blocked, d.role) : null };
    }
    // Older database without my_account_access: fall back to the school status.
    const { data: platform } = await supabase.rpc('school_platform_status');
    if ((platform as { status?: string } | null)?.status === 'Inactive') {
      return { blocked: 'school_paused', message: blockedMessage('school_paused', 'parent') };
    }
  } catch {
    // offline — data calls are still protected server-side
  }
  return open;
}

// The login screen shows this once after a forced sign-out.
let loginNotice: string | null = null;

export function setLoginNotice(message: string) {
  loginNotice = message;
}

export function takeLoginNotice(): string | null {
  const m = loginNotice;
  loginNotice = null;
  return m;
}
