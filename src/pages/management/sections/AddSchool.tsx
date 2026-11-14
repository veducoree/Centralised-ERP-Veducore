import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Copy, Eye, EyeOff, Plus, Sparkles, UserRound, Wallet } from 'lucide-react';
import { callManageSchools, errMsg, generatePassword, rupees, type Plan } from '../api';
import { Button, Card, ErrorBanner, Field, cx, inputCls, toast } from '../ui';

const EMPTY = {
  name: '', address: '', city: '', contact_number: '', academic_year: '2026-27',
  admin_name: '', email: '', admin_password: '', plan_id: '', trial_days: '30',
};

export default function AddSchoolSection({ onCreated }: { onCreated: (schoolId: string) => void }) {
  const [f, setF] = useState(EMPTY);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showPw, setShowPw] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<{ id: string; name: string; email: string; password: string } | null>(null);

  useEffect(() => {
    callManageSchools<{ plans: Plan[] }>({ action: 'plans-list' })
      .then((r) => {
        const active = r.plans.filter((p) => p.is_active);
        setPlans(active);
        const trial = active.find((p) => p.code === 'trial');
        if (trial) setF((cur) => ({ ...cur, plan_id: cur.plan_id || trial.id }));
      })
      .catch(() => {});
  }, []);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const plan = plans.find((p) => p.id === f.plan_id);

  function validate() {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Required';
    if (!f.admin_name.trim()) e.admin_name = 'Required';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = 'Enter a valid email';
    if (f.admin_password.length < 8) e.admin_password = 'At least 8 characters';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const r = await callManageSchools<{ school_id: string }>({ action: 'create-school', ...f, trial_days: Number(f.trial_days) || 30 });
      setDone({ id: r.school_id, name: f.name.trim(), email: f.email.trim().toLowerCase(), password: f.admin_password });
      setF({ ...EMPTY, plan_id: f.plan_id });
      setErrors({});
    } catch (err) {
      setSubmitError(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    const loginUrl = `${window.location.origin}/login`;
    const text = `Welcome to Veducore!\n\nSchool: ${done.name}\nLogin: ${loginUrl}\nEmail: ${done.email}\nPassword: ${done.password}\n\nPlease change the password after your first sign-in.`;
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">{done.name} is live</h2>
            <p className="mt-1 text-sm text-slate-500">Send these login details to the school.</p>
          </div>
          <pre className="mt-5 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 font-mono text-xs text-slate-700">{text}</pre>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => { navigator.clipboard.writeText(text); toast('Copied'); }}>
              Copy message
            </Button>
            <Button variant="secondary" onClick={() => onCreated(done.id)}>Open school</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setDone(null)}>Onboard another</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-5">
      {submitError && <ErrorBanner message={submitError} />}

      <Card title="School details" icon={<Building2 className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="School name" required error={errors.name} className="sm:col-span-2">
            <input className={inputCls} value={f.name} onChange={set('name')} placeholder="e.g. Green Valley Public School" autoFocus />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input className={inputCls} value={f.address} onChange={set('address')} placeholder="Street, area" />
          </Field>
          <Field label="City"><input className={inputCls} value={f.city} onChange={set('city')} placeholder="e.g. Jaipur" /></Field>
          <Field label="Phone"><input className={inputCls} value={f.contact_number} onChange={set('contact_number')} placeholder="+91 98765 43210" /></Field>
          <Field label="Academic year"><input className={inputCls} value={f.academic_year} onChange={set('academic_year')} /></Field>
        </div>
      </Card>

      <Card title="Owner login" icon={<UserRound className="h-4 w-4" />} subtitle="The school's principal or administrator. They can add more staff later.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.admin_name}>
            <input className={inputCls} value={f.admin_name} onChange={set('admin_name')} placeholder="e.g. Ramesh Sharma" />
          </Field>
          <Field label="Login email" required error={errors.email}>
            <input className={inputCls} type="email" value={f.email} onChange={set('email')} placeholder="principal@school.in" />
          </Field>
          <Field label="Password" required error={errors.admin_password} className="sm:col-span-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input className={cx(inputCls, 'pr-10 font-mono')} type={showPw ? 'text' : 'password'} value={f.admin_password} onChange={set('admin_password')} />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button variant="secondary" onClick={() => setF({ ...f, admin_password: generatePassword() })} icon={<Sparkles className="h-4 w-4" />}>
                Generate
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <Card title="Plan" icon={<Wallet className="h-4 w-4" />} subtitle="You can change this any time from the school's Subscription tab">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <button type="button" key={p.id} onClick={() => setF({ ...f, plan_id: p.id })}
              className={cx('rounded-2xl border p-4 text-left transition',
                f.plan_id === p.id ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:border-slate-300')}>
              <p className="font-semibold text-slate-900">{p.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {p.base_price || p.price_per_student
                  ? <>{rupees(p.base_price)} + {rupees(p.price_per_student)}/student · {p.billing_cycle}</>
                  : 'Free'}
              </p>
              {p.max_students && <p className="mt-1 text-[11px] text-slate-400">Up to {p.max_students} students</p>}
            </button>
          ))}
          <button type="button" onClick={() => setF({ ...f, plan_id: '' })}
            className={cx('rounded-2xl border p-4 text-left transition', !f.plan_id ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:border-slate-300')}>
            <p className="font-semibold text-slate-900">Decide later</p>
            <p className="mt-1 text-xs text-slate-500">No plan assigned</p>
          </button>
        </div>
        {plan?.code === 'trial' && (
          <Field label="Trial length (days)" className="mt-4 max-w-[200px]">
            <input className={inputCls} type="number" min={1} max={365} value={f.trial_days} onChange={set('trial_days')} />
          </Field>
        )}
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={submitting} icon={<Plus className="h-4 w-4" />}>Create school & owner login</Button>
      </div>
    </form>
  );
}
