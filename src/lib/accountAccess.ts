// Can the signed-in user enter the app? Asked on login, on session
// restore, and whenever the tab comes back into focus, so a school paused
// (or a login deactivated) by Veducore is signed out with a clear message
// instead of landing on an empty dashboard.
import { supabase } from '@/lib/supabase';

export type AccessBlock = 'school_paused' | 'account_inactive';

export interface AccountAccess {
  blocked: AccessBlock | null;
  role: string | null;
  message: string | null;
}

const LOGIN_NOTICE_KEY = 'veducore_login_notice';

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
  const open: AccountAccess = { blocked: null, role: null, message: null };
  if (!supabase) return open;
  try {
    const { data, error } = await supabase.rpc('my_account_access');
    if (!error && data) {
      const d = data as { blocked?: string | null; role?: string | null };
      const blocked = d.blocked === 'school_paused' || d.blocked === 'account_inactive' ? d.blocked : null;
      return { blocked, role: d.role ?? null, message: blocked ? blockedMessage(blocked, d.role) : null };
    }
    // Older database without my_account_access: fall back to the school status.
    const { data: platform } = await supabase.rpc('school_platform_status');
    if ((platform as { status?: string } | null)?.status === 'Inactive') {
      const { data: s } = await supabase.auth.getSession();
      const { data: p } = await supabase.from('profiles').select('role').eq('id', s.session?.user.id ?? '').maybeSingle();
      const role = (p as { role?: string } | null)?.role ?? null;
      return { blocked: 'school_paused', role, message: blockedMessage('school_paused', role) };
    }
  } catch {
    // offline — let the user in; data calls are still protected server-side
  }
  return open;
}

export function setLoginNotice(message: string) {
  try { sessionStorage.setItem(LOGIN_NOTICE_KEY, message); } catch { /* ignore */ }
}

export function takeLoginNotice(): string | null {
  try {
    const m = sessionStorage.getItem(LOGIN_NOTICE_KEY);
    if (m) sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    return m;
  } catch {
    return null;
  }
}
