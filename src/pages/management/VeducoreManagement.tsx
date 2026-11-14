// Veducore superadmin portal: auth gate, layout and section routing.
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, BarChart3, Building2, Contact2, CreditCard, Eye, EyeOff, History, LifeBuoy, Loader2, LogOut,
  Megaphone, Menu, Plus, Settings, ShieldCheck, Users, Wallet, X,
} from 'lucide-react';
import veducoreLogo from '@/assets/veducore-logo.png';
import {
  SESSION_EXPIRED_EVENT, callManageSchools, callMgmtAuth, errMsg, mgmtSupabase, type Me, type SchoolRecord,
} from './api';
import { Badge, Toaster, cx, inputCls } from './ui';
import { ROLES } from './sections/Team';
import DashboardSection from './sections/Dashboard';
import SchoolsSection from './sections/Schools';
import SchoolDrawer from './sections/SchoolDrawer';
import AddSchoolSection from './sections/AddSchool';
import BillingSection from './sections/Billing';
import PaymentsSection from './sections/Payments';
import AnnouncementsSection from './sections/Announcements';
import SupportSection from './sections/Support';
import TeamSection from './sections/Team';
import AuditLogSection from './sections/AuditLog';
import SettingsSection from './sections/Settings';
import IdCardsSection from './sections/IdCards';

type Section =
  | 'dashboard' | 'schools' | 'add-school' | 'id-cards' | 'billing' | 'payments'
  | 'announcements' | 'support' | 'team' | 'audit' | 'settings';

const NAV: { group: string; items: { id: Section; label: string; icon: React.ReactNode; managersOnly?: boolean }[] }[] = [
  { group: '', items: [{ id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="h-[18px] w-[18px]" /> }] },
  {
    group: 'Schools', items: [
      { id: 'schools', label: 'All schools', icon: <Building2 className="h-[18px] w-[18px]" /> },
      { id: 'add-school', label: 'Onboard school', icon: <Plus className="h-[18px] w-[18px]" />, managersOnly: true },
      { id: 'id-cards', label: 'ID cards', icon: <Contact2 className="h-[18px] w-[18px]" />, managersOnly: true },
    ],
  },
  {
    group: 'Business', items: [
      { id: 'billing', label: 'Billing & plans', icon: <Wallet className="h-[18px] w-[18px]" /> },
      { id: 'payments', label: 'Online payments', icon: <CreditCard className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    group: 'Engage', items: [
      { id: 'announcements', label: 'Announcements', icon: <Megaphone className="h-[18px] w-[18px]" /> },
      { id: 'support', label: 'Support desk', icon: <LifeBuoy className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    group: 'Admin', items: [
      { id: 'team', label: 'Team & roles', icon: <Users className="h-[18px] w-[18px]" /> },
      { id: 'audit', label: 'Audit log', icon: <History className="h-[18px] w-[18px]" /> },
      { id: 'settings', label: 'Account', icon: <Settings className="h-[18px] w-[18px]" /> },
    ],
  },
];

const TITLES: Record<Section, [string, string]> = {
  dashboard: ['Dashboard', 'Platform health, revenue and growth at a glance'],
  schools: ['Schools', 'Every school on Veducore — open one to manage it'],
  'add-school': ['Onboard a school', 'Create the school, its owner login and plan in one step'],
  'id-cards': ['ID cards', 'Design templates and print student ID card sheets'],
  billing: ['Billing & plans', "Subscriptions, invoices and Veducore's pricing"],
  payments: ['Online payments', 'Parent fee payments across all schools'],
  announcements: ['Announcements', 'Messages to school admins, teachers and parents'],
  support: ['Support desk', 'Tickets raised by school admins'],
  team: ['Team & roles', 'Who can access this portal and what they can do'],
  audit: ['Audit log', 'A record of every change made here'],
  settings: ['Account', 'Your profile and password'],
};

function sectionFromHash(): Section {
  const h = window.location.hash.replace('#', '') as Section;
  return h in TITLES ? h : 'dashboard';
}

export default function VeducoreManagement() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [section, setSectionState] = useState<Section>(sectionFromHash);
  const [navOpen, setNavOpen] = useState(false);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolsError, setSchoolsError] = useState('');
  const [openSchool, setOpenSchool] = useState<string | null>(null);

  const setSection = useCallback((s: Section) => {
    setSectionState(s);
    setNavOpen(false);
    window.history.replaceState(null, '', `#${s}`);
    window.scrollTo({ top: 0 });
  }, []);

  // Restore an existing session.
  useEffect(() => {
    (async () => {
      try {
        localStorage.removeItem('veducore_mgmt_admin'); // pre-2026-11 fake session marker
        const { data } = await mgmtSupabase!.auth.getSession();
        if (data.session) {
          const r = await callManageSchools<{ me: Me }>({ action: 'me' });
          setMe(r.me);
        }
      } catch {
        await mgmtSupabase?.auth.signOut({ scope: 'local' }).catch(() => {});
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const signOut = useCallback(async () => {
    await mgmtSupabase?.auth.signOut({ scope: 'local' }).catch(() => {});
    setMe(null);
    setSchools([]);
    setOpenSchool(null);
  }, []);

  useEffect(() => {
    const h = () => { signOut(); };
    window.addEventListener(SESSION_EXPIRED_EVENT, h);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, h);
  }, [signOut]);

  const loadSchools = useCallback(async () => {
    setSchoolsLoading(true);
    setSchoolsError('');
    try {
      setSchools((await callManageSchools<{ schools: SchoolRecord[] }>({ action: 'list' })).schools);
    } catch (e) {
      setSchoolsError(errMsg(e));
    } finally {
      setSchoolsLoading(false);
    }
  }, []);

  useEffect(() => { if (me) loadSchools(); }, [me, loadSchools]);

  if (booting) return <Splash />;
  if (!me) return <AuthScreen onSignedIn={setMe} />;

  const isManager = me.role !== 'support';
  const current = (!isManager && (section === 'add-school' || section === 'id-cards')) ? 'dashboard' : section;
  const initials = me.full_name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const sidebar = (
    <>
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-6">
        <img src={veducoreLogo} alt="Veducore" className="h-6 w-auto object-contain" />
        <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600">Superadmin</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => isManager || !i.managersOnly);
          if (!items.length) return null;
          return (
            <div key={g.group || 'top'} className="mb-4">
              {g.group && <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{g.group}</p>}
              <ul className="space-y-0.5">
                {items.map((i) => {
                  const active = current === i.id;
                  return (
                    <li key={i.id}>
                      <button onClick={() => setSection(i.id)}
                        className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                          active ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/25' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}>
                        {i.icon}
                        <span className="flex-1 text-left">{i.label}</span>
                        {i.id === 'schools' && schools.length > 0 && (
                          <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold', active ? 'bg-white/25' : 'bg-slate-100 text-slate-500')}>{schools.length}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">{initials}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{me.full_name}</p>
            <p className="text-[11px] text-slate-500">{ROLES[me.role].label}</p>
          </div>
          <button onClick={signOut} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-[#f3f4fb]">
      <aside className="sticky top-0 hidden h-screen w-64 flex-shrink-0 flex-col border-r border-slate-100 bg-white lg:flex">{sidebar}</aside>

      {navOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden" onClick={() => setNavOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40" />
          <aside className="relative flex h-full w-72 flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setNavOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400" aria-label="Close menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/60 bg-[#f3f4fb]/90 px-4 py-3 backdrop-blur sm:px-8 sm:py-4">
          <button onClick={() => setNavOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-white lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{TITLES[current][0]}</h1>
            <p className="hidden truncate text-sm text-slate-500 sm:block">{TITLES[current][1]}</p>
          </div>
          <Badge tone="green" dot className="hidden md:inline-flex">Production</Badge>
        </header>

        <div className="flex-1 px-4 py-6 sm:px-8">
          {current === 'dashboard' && <DashboardSection onOpenSchool={setOpenSchool} onNavigate={setSection} />}
          {current === 'schools' && (
            <SchoolsSection schools={schools} loading={schoolsLoading} error={schoolsError} onReload={loadSchools}
              onOpen={setOpenSchool} onAdd={() => setSection('add-school')} canCreate={isManager} />
          )}
          {current === 'add-school' && (
            <AddSchoolSection onCreated={(id) => { loadSchools(); setSection('schools'); setOpenSchool(id); }} />
          )}
          {current === 'id-cards' && (
            <IdCardsSection schools={schools} onNavigateToSchools={() => setSection('schools')} onTemplateSaved={loadSchools} />
          )}
          {current === 'billing' && <BillingSection me={me} schools={schools} onOpenSchool={setOpenSchool} onSchoolsChanged={loadSchools} />}
          {current === 'payments' && <PaymentsSection />}
          {current === 'announcements' && <AnnouncementsSection me={me} schools={schools} />}
          {current === 'support' && <SupportSection me={me} onOpenSchool={setOpenSchool} />}
          {current === 'team' && <TeamSection me={me} />}
          {current === 'audit' && <AuditLogSection />}
          {current === 'settings' && <SettingsSection me={me} onSignOutEverywhere={signOut} />}
        </div>
      </main>

      <SchoolDrawer schoolId={openSchool} me={me} onClose={() => setOpenSchool(null)} onChanged={loadSchools}
        onDeleted={() => { setSchools((cur) => cur.filter((s) => s.id !== openSchool)); loadSchools(); }} />
      <Toaster />
    </div>
  );
}

// ── Splash & auth ────────────────────────────────────────────────────────────

function Splash() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
      <div className="relative inline-flex items-center justify-center">
        <img src={veducoreLogo} alt="Veducore" draggable={false} className="block h-24 w-auto select-none object-contain opacity-20 grayscale sm:h-28" />
        <img src={veducoreLogo} alt="" aria-hidden="true" draggable={false} className="veducore-fill-logo pointer-events-none absolute inset-0 block h-full w-full select-none object-contain" />
      </div>
    </div>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [mode, setMode] = useState<'checking' | 'setup' | 'login'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    callMgmtAuth({ action: 'check' })
      .then((r) => setMode(r.is_setup_done ? 'login' : 'setup'))
      .catch(() => setMode('login'));
  }, []);

  async function signIn(em: string, pw: string) {
    const { error: authErr } = await mgmtSupabase!.auth.signInWithPassword({ email: em.trim().toLowerCase(), password: pw });
    if (authErr) throw new Error(authErr.message === 'Invalid login credentials' ? 'Wrong email or password' : authErr.message);
    try {
      const r = await callManageSchools<{ me: Me }>({ action: 'me' });
      onSignedIn(r.me);
    } catch (e) {
      await mgmtSupabase!.auth.signOut({ scope: 'local' }).catch(() => {});
      throw e;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'setup') {
      if (password.length < 10) { setError('Use at least 10 characters.'); return; }
      if (password !== confirm) { setError('Passwords do not match.'); return; }
    }
    setLoading(true);
    try {
      if (mode === 'setup') await callMgmtAuth({ action: 'setup', email: email.trim(), password, full_name: fullName.trim() });
      await signIn(email, password);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'checking') return <Splash />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src={veducoreLogo} alt="Veducore" className="mx-auto mb-4 h-10 w-auto object-contain" />
          <h1 className="text-2xl font-bold text-slate-900">Veducore Superadmin</h1>
          <p className="mt-1 text-sm text-slate-500">{mode === 'setup' ? 'Create the first owner account' : 'Sign in to manage every school on Veducore'}</p>
        </div>

        {mode === 'setup' && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-indigo-600" />
            <p className="text-sm">This screen only appears once. Add more people later from <b>Team & roles</b>.</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-100 bg-white p-7 shadow-lg shadow-slate-200/60">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}
          {mode === 'setup' && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Full name</span>
              <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email</span>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode === 'login'} autoComplete="username" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Password</span>
            <div className="relative">
              <input className={cx(inputCls, 'pr-10')} type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Show password">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          {mode === 'setup' && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Confirm password</span>
              <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            </label>
          )}
          <button type="submit" disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'setup' ? 'Create owner & sign in' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">Forgot your password? Ask another Veducore owner to reset it from Team & roles.</p>
      </div>
    </div>
  );
}
