import { useState } from 'react';
import { KeyRound, LogOut, UserRound } from 'lucide-react';
import { errMsg, mgmtSupabase, type Me } from '../api';
import { Badge, Button, Card, Field, KV, ROLES, inputCls, toast } from '../ui';

export default function SettingsSection({ me, onSignOutEverywhere }: { me: Me; onSignOutEverywhere: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!mgmtSupabase) return;
    if (next.length < 10) { toast('Use at least 10 characters', 'error'); return; }
    if (next !== confirm) { toast('Passwords do not match', 'error'); return; }
    setSaving(true);
    try {
      // Confirm the current password before changing it.
      const { error: authErr } = await mgmtSupabase.auth.signInWithPassword({ email: me.email, password: current });
      if (authErr) throw new Error('Current password is wrong');
      const { error } = await mgmtSupabase.auth.updateUser({ password: next });
      if (error) throw error;
      setCurrent(''); setNext(''); setConfirm('');
      toast('Password changed');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function signOutEverywhere() {
    if (!mgmtSupabase || !window.confirm('Sign out of the portal on every device, including this one?')) return;
    await mgmtSupabase.auth.signOut({ scope: 'global' }).catch(() => {});
    onSignOutEverywhere();
  }

  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 lg:grid-cols-2">
      <Card title="Your account" icon={<UserRound className="h-4 w-4" />}>
        <KV k="Name" v={me.full_name} />
        <KV k="Email" v={me.email} />
        <KV k="Role" v={<Badge tone={ROLES[me.role].tone}>{ROLES[me.role].label}</Badge>} />
        <p className="mt-3 text-xs text-slate-500">{ROLES[me.role].text}.</p>
        <Button className="mt-5" variant="secondary" onClick={signOutEverywhere} icon={<LogOut className="h-4 w-4" />}>Sign out on all devices</Button>
      </Card>

      <Card title="Change password" icon={<KeyRound className="h-4 w-4" />}>
        <form onSubmit={changePassword} className="space-y-4">
          <Field label="Current password"><input type="password" className={inputCls} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
          <Field label="New password" hint="At least 10 characters"><input type="password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Confirm new password"><input type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
          <Button type="submit" loading={saving} disabled={!current || !next}>Update password</Button>
        </form>
      </Card>
    </div>
  );
}
