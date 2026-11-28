import { useState } from 'react';
import { appLink } from '../../../lib/appUrl';
import { Building2, CheckCircle2, Copy, Eye, EyeOff, Plus, Sparkles, UserRound, Wallet } from 'lucide-react';
import { callManageSchools, errMsg, generatePassword } from '../api';
import { Button, Card, ErrorBanner, Field, cx, inputCls, toast } from '../ui';
import { DIGIT_LIMIT_CHOICES } from '../../../lib/codeDigits';

const EMPTY = {
  name: '', address: '', city: '', contact_number: '', academic_year: '2026-27', employee_prefix: '', short_name: '', admission_digits: '', employee_digits: '',
  admin_name: '', email: '', admin_password: '',
  sub_status: 'trial', trial_days: '30', billing_cycle: 'yearly', price: '',
};

export default function AddSchoolSection({ onCreated }: { onCreated: (schoolId: string) => void }) {
  const [f, setF] = useState(EMPTY);
  const [showPw, setShowPw] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<{ id: string; name: string; email: string; password: string } | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  function validate() {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Required';
    if (!/^[A-Za-z0-9]{2,12}$/.test(f.short_name.trim())) e.short_name = '2–12 letters or numbers, e.g. GVPS';
    if (f.employee_prefix.trim() && !/^[A-Za-z0-9/-]{1,12}$/.test(f.employee_prefix.trim())) {
      e.employee_prefix = 'Only letters, numbers, / or - (max 12)';
    }
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
      const r = await callManageSchools<{ school_id: string }>({
        action: 'create-school', ...f,
        trial_days: Number(f.trial_days) || 30,
        admission_digits: f.admission_digits ? Number(f.admission_digits) : null,
        employee_digits: f.employee_digits ? Number(f.employee_digits) : null,
        price: f.price === '' ? null : Math.round(Number(f.price) * 100),
      });
      setDone({ id: r.school_id, name: f.name.trim(), email: f.email.trim().toLowerCase(), password: f.admin_password });
      setF(EMPTY);
      setErrors({});
    } catch (err) {
      setSubmitError(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    const loginUrl = appLink('/login');
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
          <Field label="School short name" required error={errors.short_name}
            hint={`Used in parent passwords: parentname@${f.short_name.trim().toLowerCase() || 'gvps'}`}>
            <input className={cx(inputCls, 'font-mono')} value={f.short_name} maxLength={12}
              onChange={(e) => setF({ ...f, short_name: e.target.value.replace(/[^A-Za-z0-9]/g, '') })} placeholder="e.g. GVPS" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input className={inputCls} value={f.address} onChange={set('address')} placeholder="Street, area" />
          </Field>
          <Field label="City"><input className={inputCls} value={f.city} onChange={set('city')} placeholder="e.g. Jaipur" /></Field>
          <Field label="Phone"><input className={inputCls} value={f.contact_number} onChange={set('contact_number')} placeholder="+91 98765 43210" /></Field>
          <Field label="Academic year"><input className={inputCls} value={f.academic_year} onChange={set('academic_year')} /></Field>
          <Field label="Employee ID prefix" error={errors.employee_prefix}
            hint={f.employee_prefix.trim()
              ? `Teachers will be numbered like ${f.employee_prefix.trim().toUpperCase()}001`
              : 'Optional. For teacher employee IDs, e.g. EMP.'}>
            <input className={cx(inputCls, 'font-mono uppercase')} value={f.employee_prefix} maxLength={12}
              onChange={(e) => setF({ ...f, employee_prefix: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="e.g. EMP" />
          </Field>
          <Field label="Admission number digits"
            hint={f.admission_digits
              ? `Admission numbers must have ${f.admission_digits}–${Number(f.admission_digits) + 1} digits. Stops typing mistakes; one extra digit is left for growth.`
              : 'Optional. Limits the digits so a typing mistake cannot add an extra one.'}>
            <select className={inputCls} value={f.admission_digits} onChange={set('admission_digits')}>
              <option value="">No limit</option>
              {DIGIT_LIMIT_CHOICES.map((n) => <option key={n} value={n}>{n}–{n + 1} digits</option>)}
            </select>
          </Field>
          <Field label="Employee ID digits"
            hint={f.employee_digits
              ? `Employee IDs must have ${f.employee_digits}–${Number(f.employee_digits) + 1} digits (after the prefix).`
              : 'Optional. Same limit for teacher employee IDs.'}>
            <select className={inputCls} value={f.employee_digits} onChange={set('employee_digits')}>
              <option value="">No limit</option>
              {DIGIT_LIMIT_CHOICES.map((n) => <option key={n} value={n}>{n}–{n + 1} digits</option>)}
            </select>
          </Field>
        </div>
        <p className="mt-4 text-xs text-slate-500">These details are locked for the school admin. Only Veducore can change them later.</p>
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

      <Card title="Subscription" icon={<Wallet className="h-4 w-4" />} subtitle="You can change this any time from the school's Subscription tab">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Start as">
            <select className={inputCls} value={f.sub_status} onChange={set('sub_status')}>
              <option value="trial">Free trial</option>
              <option value="active">Active (paid)</option>
            </select>
          </Field>
          {f.sub_status === 'trial' && (
            <Field label="Trial length (days)">
              <input className={inputCls} type="number" min={1} max={365} value={f.trial_days} onChange={set('trial_days')} />
            </Field>
          )}
          <Field label="Billing cycle">
            <select className={inputCls} value={f.billing_cycle} onChange={set('billing_cycle')}>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
            </select>
          </Field>
          <Field label="Price per cycle (₹)" hint="Optional">
            <input className={inputCls} type="number" min={0} value={f.price} onChange={set('price')} placeholder="0" />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={submitting} icon={<Plus className="h-4 w-4" />}>Create school & owner login</Button>
      </div>
    </form>
  );
}
