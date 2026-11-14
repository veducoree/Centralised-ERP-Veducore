import { useEffect, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, Sparkles, Trash2, UserPlus, Users } from 'lucide-react';
import { callManageSchools, errMsg, fmtDate, generatePassword, timeAgo, type Me, type TeamRole } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, LoadingBlock, Modal, cx, inputCls, toast, type BadgeTone } from '../ui';

interface Member {
  id: string; email: string; full_name: string; role: TeamRole; status: 'active' | 'disabled';
  last_login_at: string | null; created_at: string;
}

export const ROLES: Record<TeamRole, { label: string; tone: BadgeTone; text: string }> = {
  owner: { label: 'Owner', tone: 'indigo', text: 'Everything, including team management and deleting schools' },
  admin: { label: 'Admin', tone: 'blue', text: 'Manage schools, billing, announcements and support — cannot delete schools or manage the team' },
  support: { label: 'Support', tone: 'gray', text: 'Read-only view of schools (no passwords) and full access to the support desk' },
};

export default function TeamSection({ me }: { me: Me }) {
  const [team, setTeam] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Member | null>(null);
  const isOwner = me.role === 'owner';

  async function load() {
    setLoading(true);
    setError('');
    try {
      setTeam((await callManageSchools<{ team: Member[] }>({ action: 'team-list' })).team);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function update(m: Member, patch: Record<string, unknown>) {
    if (patch.remove && !window.confirm(`Remove ${m.full_name}? Their login is deleted.`)) return;
    try {
      await callManageSchools({ action: 'team-update', member_id: m.id, ...patch });
      toast(patch.remove ? 'Member removed' : 'Member updated');
      load();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(Object.keys(ROLES) as TeamRole[]).map((r) => (
          <div key={r} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <Badge tone={ROLES[r].tone}>{ROLES[r].label}</Badge>
            <p className="mt-2 text-xs text-slate-500">{ROLES[r].text}</p>
          </div>
        ))}
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      <Card title="Veducore team" icon={<Users className="h-4 w-4" />} subtitle="People who can sign in to this portal" bodyClassName="p-0"
        actions={isOwner ? <Button size="sm" onClick={() => setAdding(true)} icon={<UserPlus className="h-3.5 w-3.5" />}>Add member</Button> : undefined}>
        {loading && !team.length ? <div className="p-5"><LoadingBlock /></div> : team.length === 0 ? <EmptyState icon={<Users className="h-5 w-5" />} title="No team members" /> : (
          <ul className="divide-y divide-slate-100">
            {team.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
                  {m.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    {m.full_name} {m.id === me.id && <span className="text-xs font-normal text-slate-400">(you)</span>}
                    {m.status === 'disabled' && <Badge tone="red">Disabled</Badge>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{m.email} · last active {timeAgo(m.last_login_at)} · joined {fmtDate(m.created_at)}</p>
                </div>
                {isOwner && m.id !== me.id ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select className={cx(inputCls, 'w-32 py-1.5 text-xs')} value={m.role} onChange={(e) => update(m, { role: e.target.value })}>
                      {(Object.keys(ROLES) as TeamRole[]).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
                    </select>
                    <Button size="sm" variant="secondary" onClick={() => update(m, { status: m.status === 'active' ? 'disabled' : 'active' })}>
                      {m.status === 'active' ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setResetting(m)} icon={<KeyRound className="h-3.5 w-3.5" />} aria-label="Reset password" />
                    <Button size="sm" variant="ghost" onClick={() => update(m, { remove: true })} icon={<Trash2 className="h-3.5 w-3.5 text-rose-500" />} aria-label="Remove" />
                  </div>
                ) : <Badge tone={ROLES[m.role].tone}>{ROLES[m.role].label}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {!isOwner && <p className="flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5" />Only owners can add or change team members.</p>}

      {adding && <AddMemberModal onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
      {resetting && <ResetModal member={resetting} onClose={() => setResetting(null)} onDone={(pw) => { update(resetting, { password: pw }); setResetting(null); }} />}
    </div>
  );
}

function AddMemberModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ full_name: '', email: '', role: 'support' as TeamRole, password: generatePassword() });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await callManageSchools({ action: 'team-add', ...f });
      navigator.clipboard.writeText(`Veducore management portal\n${window.location.origin}/veducore/management\nEmail: ${f.email}\nPassword: ${f.password}`).catch(() => {});
      toast('Member added — login details copied to clipboard');
      onAdded();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Add team member"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={saving} disabled={!f.full_name.trim() || !f.email.includes('@') || f.password.length < 8} icon={<Plus className="h-4 w-4" />}>Add member</Button></>}>
      <div className="space-y-4">
        <Field label="Full name" required><input className={inputCls} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus /></Field>
        <Field label="Email" required hint="Must not already be a school login"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role">
          <select className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as TeamRole })}>
            {(Object.keys(ROLES) as TeamRole[]).map((r) => <option key={r} value={r}>{ROLES[r].label} — {ROLES[r].text}</option>)}
          </select>
        </Field>
        <Field label="Temporary password" hint="They can change it from Account settings">
          <div className="flex gap-2">
            <input className={cx(inputCls, 'font-mono')} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <Button variant="secondary" onClick={() => setF({ ...f, password: generatePassword() })} icon={<Sparkles className="h-4 w-4" />}>New</Button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function ResetModal({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: (pw: string) => void }) {
  const [pw, setPw] = useState(generatePassword());
  return (
    <Modal open onClose={onClose} title={`Reset password for ${member.full_name}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={pw.length < 8} onClick={() => { navigator.clipboard.writeText(pw).catch(() => {}); onDone(pw); }}>Set & copy</Button></>}>
      <Field label="New password">
        <div className="flex gap-2">
          <input className={cx(inputCls, 'font-mono')} value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button variant="secondary" onClick={() => setPw(generatePassword())} icon={<Sparkles className="h-4 w-4" />}>New</Button>
        </div>
      </Field>
    </Modal>
  );
}
