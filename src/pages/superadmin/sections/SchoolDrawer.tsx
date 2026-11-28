import { useCallback, useEffect, useMemo, useState } from 'react';
import { appLink } from '../../../lib/appUrl';
import {
  Activity, AlertTriangle, Bell, Building2, Check, ClipboardCheck, Copy, ExternalLink,
  Eye, EyeOff, GraduationCap, KeyRound, LifeBuoy, LogIn, Mail, MapPin, Phone, Power,
  RefreshCw, Save, ShieldAlert, Sparkles, Trash2, Users, X,
} from 'lucide-react';
import {
  SCHOOL_MODULES, actionLabel, callManageSchools, errMsg, fmtDate, generatePassword,
  timeAgo, type AuditEntry, type Me, type SchoolRecord,
} from '../api';
import {
  Badge, Button, Card, Drawer, ErrorBanner, Field, HEALTH, KV, LoadingBlock, Modal, Tabs,
  cx, inputCls, toast,
} from '../ui';
import { DIGIT_LIMIT_CHOICES } from '../../../lib/codeDigits';
import { SchoolAvatar } from './Schools';

interface Detail {
  school: SchoolRecord;
  adminLastSignIn: string | null;
  adminAccounts: { id: string; name: string; email: string; status: string; isOwner: boolean; createdAt: string }[];
  currentSession: { name: string; start_date: string; end_date: string } | null;
  tickets: { id: string; ticket_number: number; subject: string; status: string; priority: string; last_reply_at: string }[];
  activity: AuditEntry[];
}

type Tab = 'overview' | 'profile' | 'modules' | 'access' | 'danger';

export default function SchoolDrawer({
  schoolId, me, onClose, onChanged, onDeleted,
}: {
  schoolId: string | null; me: Me; onClose: () => void; onChanged: () => void; onDeleted: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const canManage = me.role !== 'support';

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError('');
    try {
      setDetail(await callManageSchools<Detail>({ action: 'school-detail', school_id: schoolId }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    setDetail(null);
    setTab('overview');
    load();
  }, [load]);

  const refresh = () => { load(); onChanged(); };
  const s = detail?.school;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'profile', label: 'Profile' },
    { id: 'modules', label: 'Modules' },
    { id: 'access', label: 'Admin access' },
    ...(canManage ? [{ id: 'danger' as Tab, label: 'Suspend / delete' }] : []),
  ];

  return (
    <Drawer open={!!schoolId} onClose={onClose}>
      <div className="border-b border-slate-200/70 bg-white px-5 pb-3 pt-5 sm:px-7">
        <div className="flex items-start gap-4">
          {s ? <SchoolAvatar school={s} size="lg" /> : <div className="h-14 w-14 rounded-2xl bg-slate-100" />}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-slate-900">{s?.name ?? 'Loading…'}</h2>
            {s && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {s.status === 'Suspended' ? <Badge tone="red" dot>Suspended</Badge> : <Badge tone="green" dot>Active</Badge>}
                {s.health && <Badge tone={HEALTH[s.health].tone}>{HEALTH[s.health].label}</Badge>}
              </div>
            )}
          </div>
          <div className="flex gap-1">
            <button onClick={load} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Reload">
              <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-4"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-7">
        {error && <ErrorBanner message={error} onRetry={load} />}
        {!detail && loading && <LoadingBlock rows={6} />}
        {detail && s && (
          <>
            {tab === 'overview' && <OverviewTab d={detail} />}
            {tab === 'profile' && <ProfileTab s={s} canManage={canManage} onSaved={refresh} />}
            {tab === 'modules' && <ModulesTab s={s} canManage={canManage} onSaved={refresh} />}
            {tab === 'access' && <AccessTab d={detail} canManage={canManage} onSaved={refresh} />}
            {tab === 'danger' && canManage && (
              <DangerTab s={s} isOwner={me.role === 'owner'} onSaved={refresh} onDeleted={() => { onDeleted(); onClose(); }} />
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span className="text-indigo-500">{icon}</span>{label}
      </div>
      <p className="mt-1.5 text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function OverviewTab({ d }: { d: Detail }) {
  const s = d.school;
  return (
    <>
      {s.status === 'Suspended' && (
        <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <ShieldAlert className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Suspended {s.suspendedAt ? `on ${fmtDate(s.suspendedAt)}` : ''}</p>
            <p className="mt-0.5 text-rose-700">{s.suspensionReason ?? 'No reason recorded.'} No one at this school can sign in or see data until it is reactivated.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric icon={<Users className="h-3.5 w-3.5" />} label="Students" value={s.students.toLocaleString('en-IN')} sub={`${s.activeStudents} active`} />
        <Metric icon={<GraduationCap className="h-3.5 w-3.5" />} label="Teachers" value={s.teachers} sub={`${s.classes} classes · ${s.sections} sections`} />
        <Metric icon={<Users className="h-3.5 w-3.5" />} label="Parent accounts" value={s.parents.toLocaleString('en-IN')} />
        <Metric icon={<ClipboardCheck className="h-3.5 w-3.5" />} label="Attendance (30d)" value={s.attendance30d.toLocaleString('en-IN')}
          sub={s.lastAttendance ? `last ${fmtDate(s.lastAttendance)}` : 'never marked'} />
        <Metric icon={<Bell className="h-3.5 w-3.5" />} label="Notifications (30d)" value={s.notifications30d.toLocaleString('en-IN')} />
        <Metric icon={<LogIn className="h-3.5 w-3.5" />} label="Admin last sign-in" value={timeAgo(d.adminLastSignIn)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="School" icon={<Building2 className="h-4 w-4" />}>
          <KV k="Address" v={[s.address, s.city].filter(Boolean).join(', ') || '—'} />
          <KV k="Phone" v={s.contactNumber || '—'} />
          <KV k="Email" v={s.email || '—'} />
          <KV k="Academic year" v={d.currentSession?.name ?? s.academicYear ?? '—'} />
          <KV k="Joined" v={fmtDate(s.createdAt)} />
          <KV k="School ID" v={s.id} mono />
        </Card>

        <Card title="Recent support tickets" icon={<LifeBuoy className="h-4 w-4" />} bodyClassName="p-0">
          {d.tickets.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-400">No tickets from this school.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">#{t.ticket_number} {t.subject}</p>
                    <p className="text-xs text-slate-400">{timeAgo(t.last_reply_at)}</p>
                  </div>
                  <Badge tone={t.status === 'open' ? 'amber' : t.status === 'resolved' || t.status === 'closed' ? 'green' : 'blue'}>
                    {t.status.replace('_', ' ')}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Veducore activity on this school" icon={<Activity className="h-4 w-4" />} bodyClassName="p-0">
        {d.activity.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">No actions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="text-slate-700"><b className="text-slate-900">{a.actor_name}</b> {actionLabel(a.action).toLowerCase()}</span>
                <span className="text-xs text-slate-400">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────────

function ProfileTab({ s, canManage, onSaved }: { s: SchoolRecord; canManage: boolean; onSaved: () => void }) {
  const [f, setF] = useState({
    name: s.name, address: s.address, city: s.city, contactNumber: s.contactNumber, email: s.email, academicYear: s.academicYear,
    employeePrefix: s.employeePrefix ?? '', shortName: s.shortName ?? '',
    admissionDigits: s.admissionDigits ? String(s.admissionDigits) : '', employeeDigits: s.employeeDigits ? String(s.employeeDigits) : '',
  });
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify({
    name: s.name, address: s.address, city: s.city, contactNumber: s.contactNumber, email: s.email, academicYear: s.academicYear,
    employeePrefix: s.employeePrefix ?? '', shortName: s.shortName ?? '',
    admissionDigits: s.admissionDigits ? String(s.admissionDigits) : '', employeeDigits: s.employeeDigits ? String(s.employeeDigits) : '',
  });
  const badShort = !!f.shortName.trim() && !/^[A-Za-z0-9]{2,12}$/.test(f.shortName.trim());
  const badPrefix = (v: string) => !!v.trim() && !/^[A-Za-z0-9/-]{1,12}$/.test(v.trim());
  const prefixInvalid = badPrefix(f.employeePrefix) || badShort;

  async function save() {
    setSaving(true);
    try {
      await callManageSchools({
        action: 'update-school', school_id: s.id,
        fields: { ...f, admissionDigits: f.admissionDigits ? Number(f.admissionDigits) : null, employeeDigits: f.employeeDigits ? Number(f.employeeDigits) : null },
      });
      toast('School profile saved');
      onSaved();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Card title="School profile" subtitle="Shown across the school's admin panel, app and documents. Locked for the school admin — only Veducore can change these.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="School name" required className="sm:col-span-2">
          <input className={inputCls} value={f.name} onChange={set('name')} disabled={!canManage} />
        </Field>
        <Field label="School short name" error={badShort ? '2–12 letters or numbers' : undefined}
          hint="Used in default parent passwords (parentname@shortname). Changing it doesn't change existing parents' passwords.">
          <input className={cx(inputCls, 'font-mono')} value={f.shortName} maxLength={12} disabled={!canManage} placeholder="e.g. GVPS"
            onChange={(e) => setF({ ...f, shortName: e.target.value.replace(/[^A-Za-z0-9]/g, '') })} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <input className={inputCls} value={f.address} onChange={set('address')} disabled={!canManage} />
        </Field>
        <Field label="City"><input className={inputCls} value={f.city} onChange={set('city')} disabled={!canManage} /></Field>
        <Field label="Phone"><input className={inputCls} value={f.contactNumber} onChange={set('contactNumber')} disabled={!canManage} /></Field>
        <Field label="School email" hint="Contact email, not the admin login">
          <input className={inputCls} type="email" value={f.email} onChange={set('email')} disabled={!canManage} />
        </Field>
        <Field label="Academic year label"><input className={inputCls} value={f.academicYear} onChange={set('academicYear')} disabled={!canManage} /></Field>
        <Field label="Employee ID prefix" error={badPrefix(f.employeePrefix) ? 'Only letters, numbers, / or - (max 12)' : undefined}
          hint="For teacher employee IDs. Changing it only affects new teachers.">
          <input className={cx(inputCls, 'font-mono uppercase')} value={f.employeePrefix} maxLength={12} disabled={!canManage} placeholder="e.g. EMP"
            onChange={(e) => setF({ ...f, employeePrefix: e.target.value.toUpperCase().replace(/\s/g, '') })} />
        </Field>
        <Field label="Admission number digits"
          hint="Limits digits in new admission numbers (stops typing mistakes). Existing students keep their numbers.">
          <select className={inputCls} value={f.admissionDigits} onChange={set('admissionDigits')} disabled={!canManage}>
            <option value="">No limit</option>
              {DIGIT_LIMIT_CHOICES.map((n) => <option key={n} value={n}>{n}–{n + 1} digits</option>)}
          </select>
        </Field>
        <Field label="Employee ID digits" hint="Limits digits in new teacher employee IDs (after the prefix).">
          <select className={inputCls} value={f.employeeDigits} onChange={set('employeeDigits')} disabled={!canManage}>
            <option value="">No limit</option>
              {DIGIT_LIMIT_CHOICES.map((n) => <option key={n} value={n}>{n}–{n + 1} digits</option>)}
          </select>
        </Field>
      </div>
      {canManage && (
        <div className="mt-5 flex justify-end">
          <Button onClick={save} loading={saving} disabled={!dirty || !f.name.trim() || prefixInvalid} icon={<Save className="h-4 w-4" />}>Save changes</Button>
        </div>
      )}
    </Card>
  );
}

// ── Modules ──────────────────────────────────────────────────────────────────

function ModulesTab({ s, canManage, onSaved }: { s: SchoolRecord; canManage: boolean; onSaved: () => void }) {
  const [disabled, setDisabled] = useState<string[]>(s.disabledModules);
  const [saving, setSaving] = useState(false);
  const dirty = [...disabled].sort().join() !== [...s.disabledModules].sort().join();
  const groups = useMemo(() => {
    const g: Record<string, typeof SCHOOL_MODULES> = {};
    for (const m of SCHOOL_MODULES) (g[m.group] ??= []).push(m);
    return g;
  }, []);

  async function save() {
    setSaving(true);
    try {
      await callManageSchools({ action: 'set-modules', school_id: s.id, disabled_modules: disabled });
      toast('Modules updated — the school sees the change on their next page load');
      onSaved();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Modules" subtitle="Switched-off modules disappear from this school's admin panel for every staff member, owner included">
      <div className="space-y-5">
        {Object.entries(groups).map(([group, mods]) => (
          <div key={group}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {mods.map((m) => {
                const on = !disabled.includes(m.key);
                return (
                  <button key={m.key} disabled={!canManage}
                    onClick={() => setDisabled(on ? [...disabled, m.key] : disabled.filter((k) => k !== m.key))}
                    className={cx('flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition',
                      on ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-white', !canManage && 'cursor-default')}>
                    <span className={cx('font-medium', on ? 'text-slate-900' : 'text-slate-400 line-through')}>{m.label}</span>
                    <span className={cx('relative h-5 w-9 rounded-full transition', on ? 'bg-indigo-600' : 'bg-slate-300')}>
                      <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', on ? 'left-[18px]' : 'left-0.5')} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {canManage && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{SCHOOL_MODULES.length - disabled.length} of {SCHOOL_MODULES.length} modules on</p>
          <Button onClick={save} loading={saving} disabled={!dirty} icon={<Save className="h-4 w-4" />}>Save modules</Button>
        </div>
      )}
    </Card>
  );
}

// ── Admin access ─────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); }}
      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" aria-label="Copy">
      {done ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function AccessTab({ d, canManage, onSaved }: { d: Detail; canManage: boolean; onSaved: () => void }) {
  const s = d.school;
  const [showPw, setShowPw] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const loginUrl = appLink('/login');

  async function resetPassword() {
    setSaving(true);
    try {
      await callManageSchools({ action: 'update-password', school_id: s.id, new_password: newPw });
      toast('Admin password changed');
      setResetOpen(false);
      setNewPw('');
      onSaved();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function impersonate() {
    setImpersonating(true);
    try {
      const r = await callManageSchools<{ link: string; token_hash?: string }>({
        action: 'impersonate', school_id: s.id, redirect_to: appLink('/admin/dashboard'),
      });
      // Supabase's own action_link redirects to the project's Site URL whenever
      // redirect_to isn't allow-listed (that is how links ended up on
      // localhost:3000). Point at our own page instead, which verifies the
      // one-time token directly. Older function builds don't return token_hash,
      // but the action_link carries the same hashed token as ?token=.
      let tokenHash = r.token_hash;
      if (!tokenHash) {
        try { tokenHash = new URL(r.link).searchParams.get('token') ?? undefined; } catch { /* keep raw link */ }
      }
      setLink(tokenHash ? appLink(`/auth/impersonate?token_hash=${encodeURIComponent(tokenHash)}`) : r.link);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setImpersonating(false);
    }
  }

  const credentials = `School: ${s.name}\nLogin: ${loginUrl}\nEmail: ${s.adminEmail}\nPassword: ${s.adminPassword ?? '(ask Veducore to reset)'}`;

  return (
    <>
      <Card title="Owner login" icon={<KeyRound className="h-4 w-4" />} subtitle="The school's main admin account"
        actions={canManage && s.adminPassword ? (
          <Button size="sm" variant="secondary" icon={<Copy className="h-3.5 w-3.5" />}
            onClick={() => { navigator.clipboard.writeText(credentials); toast('Login details copied'); }}>
            Copy login details
          </Button>
        ) : undefined}>
        <KV k="Name" v={s.adminName || '—'} />
        <KV k="Email" v={<span className="inline-flex items-center gap-1">{s.adminEmail}<CopyBtn text={s.adminEmail} /></span>} />
        {canManage && (
          <KV k="Password" v={s.adminPassword ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs">
              {showPw ? s.adminPassword : '••••••••••'}
              <button onClick={() => setShowPw(!showPw)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <CopyBtn text={s.adminPassword} />
            </span>
          ) : <span className="text-amber-600">Not on record — reset to set one</span>} />
        )}
        <KV k="Last sign-in" v={d.adminLastSignIn ? `${fmtDate(d.adminLastSignIn)} (${timeAgo(d.adminLastSignIn)})` : 'Never'} />
        <KV k="Login page" v={<span className="inline-flex items-center gap-1 text-xs">{loginUrl}<CopyBtn text={loginUrl} /></span>} />

        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => { setNewPw(generatePassword()); setResetOpen(true); }}>
              Reset password
            </Button>
            <Button size="sm" variant="secondary" icon={<LogIn className="h-3.5 w-3.5" />} onClick={impersonate} loading={impersonating}
              disabled={s.status === 'Suspended'} title={s.status === 'Suspended' ? 'Reactivate the school first' : undefined}>
              Sign in as this school
            </Button>
          </div>
        )}
      </Card>

      <Card title="All admin accounts" subtitle="Staff accounts the school created under Staff & Roles" bodyClassName="p-0">
        <ul className="divide-y divide-slate-100">
          {d.adminAccounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{a.name} {a.isOwner && <Badge tone="indigo">Owner</Badge>}</p>
                <p className="truncate text-xs text-slate-500">{a.email}</p>
              </div>
              <Badge tone={a.status === 'active' ? 'green' : 'gray'}>{a.status}</Badge>
            </li>
          ))}
          {d.adminAccounts.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-400">No admin accounts.</li>}
        </ul>
      </Card>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset admin password" size="sm"
        subtitle={`New password for ${s.adminEmail}. Their current sessions keep working until they sign out.`}
        footer={<>
          <Button variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button onClick={resetPassword} loading={saving} disabled={newPw.length < 8}>Set password</Button>
        </>}>
        <Field label="New password" hint="At least 8 characters">
          <div className="flex gap-2">
            <input className={cx(inputCls, 'font-mono')} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            <Button variant="secondary" onClick={() => setNewPw(generatePassword())} icon={<Sparkles className="h-4 w-4" />}>New</Button>
          </div>
        </Field>
      </Modal>

      <Modal open={!!link} onClose={() => setLink(null)} title="Sign in as this school" size="sm"
        subtitle="One-time link, valid for about an hour. This sign-in is recorded in the audit log."
        footer={<>
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => { navigator.clipboard.writeText(link!); toast('Link copied — paste it in a private window'); }}>
            Copy link
          </Button>
          <Button icon={<ExternalLink className="h-4 w-4" />} onClick={() => { window.open(link!, '_blank', 'noopener'); setLink(null); }}>
            Open in new tab
          </Button>
        </>}>
        <div className="space-y-3 text-sm text-slate-600">
          <p>You'll be signed in as <b>{s.adminEmail}</b> with full owner access.</p>
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            Opening it in this browser replaces any school account already signed in here. To keep that, copy the link and open it in a private/incognito window.
          </p>
        </div>
      </Modal>
    </>
  );
}

// ── Suspend / delete ─────────────────────────────────────────────────────────

function DangerTab({ s, isOwner, onSaved, onDeleted }: {
  s: SchoolRecord; isOwner: boolean; onSaved: () => void; onDeleted: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  async function setStatus(status: 'Active' | 'Inactive') {
    setBusy(true);
    try {
      await callManageSchools({ action: 'set-status', school_id: s.id, status, reason });
      toast(status === 'Active' ? 'School reactivated' : 'School paused — everyone has been signed out');
      setReason('');
      onSaved();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      const res = await callManageSchools<{ authUsersDeleted?: number; loginsFailed?: number }>({ action: 'delete', school_id: s.id, confirm_name: confirmName });
      if (res?.loginsFailed) {
        toast(`${s.name} deleted, but ${res.loginsFailed} login(s) could not be removed — see audit log`, 'error');
      } else {
        toast(`${s.name} and all its data deleted (${res?.authUsersDeleted ?? 0} logins removed)`);
      }
      setDeleteOpen(false);
      onDeleted();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {s.status === 'Active' ? (
        <Card title="Suspend school" icon={<Power className="h-4 w-4" />}
          subtitle="Blocks every admin, teacher and parent from signing in or reading data. Nothing is deleted.">
          <Field label="Reason" required hint="Shown to the school on their sign-in screen">
            <textarea className={cx(inputCls, 'min-h-[80px]')} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. School asked to pause the account. Please contact Veducore support." />
          </Field>
          <div className="mt-4 flex justify-end">
            <Button variant="danger" onClick={() => setStatus('Inactive')} loading={busy} disabled={!reason.trim()} icon={<Power className="h-4 w-4" />}>
              Suspend school
            </Button>
          </div>
        </Card>
      ) : (
        <Card title="Reactivate school" icon={<Power className="h-4 w-4" />}
          subtitle={`Suspended ${s.suspendedAt ? fmtDate(s.suspendedAt) : ''}: ${s.suspensionReason ?? 'no reason recorded'}`}>
          <p className="text-sm text-slate-600">Everyone at the school gets access back immediately.</p>
          <div className="mt-4 flex justify-end">
            <Button variant="success" onClick={() => setStatus('Active')} loading={busy} icon={<Power className="h-4 w-4" />}>Reactivate</Button>
          </div>
        </Card>
      )}

      <Card title="Delete school permanently" icon={<Trash2 className="h-4 w-4" />} className="border-rose-200">
        <p className="text-sm text-slate-600">
          Deletes {s.students} students, {s.teachers} teachers, {s.parents} parents, every class, attendance record, exam mark,
          fee and payment record, and all of their logins. <b>This cannot be undone.</b> Suspend instead if you might need the data.
        </p>
        <div className="mt-4 flex justify-end">
          <Button variant="danger" onClick={() => setDeleteOpen(true)} disabled={!isOwner} icon={<Trash2 className="h-4 w-4" />}
            title={isOwner ? undefined : 'Only owners can delete schools'}>
            Delete school
          </Button>
        </div>
        {!isOwner && <p className="mt-2 text-right text-xs text-slate-400">Only Veducore owners can delete schools.</p>}
      </Card>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={`Delete ${s.name}?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={del} loading={busy}
            disabled={confirmName.trim().toLowerCase() !== s.name.trim().toLowerCase()}>
            Delete everything
          </Button>
        </>}>
        <div className="space-y-3">
          <div className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" /> All data and logins for this school are removed for good.
          </div>
          <Field label={`Type "${s.name}" to confirm`}>
            <input className={inputCls} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoFocus />
          </Field>
          <div className="space-y-1 text-xs text-slate-500">
            <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{s.adminEmail}</p>
            {s.contactNumber && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{s.contactNumber}</p>}
            {(s.city || s.address) && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{s.city || s.address}</p>}
          </div>
        </div>
      </Modal>
    </>
  );
}
