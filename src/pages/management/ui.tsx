// Shared building blocks for the Veducore management portal.
import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import type { SchoolHealth, Subscription, TeamRole } from './api';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500';

export function Field({
  label, hint, error, required, children, className,
}: {
  label: string; hint?: React.ReactNode; error?: string; required?: boolean;
  children: React.ReactNode; className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span>
        : hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

export function Button({
  variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean; icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',
        BTN[variant], className,
      )}
    >
      {loading ? <Loader2 className={size === 'sm' ? 'h-3.5 w-3.5 animate-spin' : 'h-4 w-4 animate-spin'} /> : icon}
      {children}
    </button>
  );
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

export function Card({
  title, subtitle, actions, children, className, bodyClassName, icon,
}: {
  title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode;
  children: React.ReactNode; className?: string; bodyClassName?: string; icon?: React.ReactNode;
}) {
  return (
    <section className={cx('rounded-3xl border border-slate-100 bg-white shadow-sm shadow-slate-200/60', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {title && (
              <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-900">
                {icon && <span className="text-indigo-600">{icon}</span>}
                {title}
              </h3>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('p-5 sm:p-6', bodyClassName)}>{children}</div>
    </section>
  );
}

const STAT_TONES = {
  indigo: 'from-indigo-500 to-indigo-400 shadow-indigo-500/30',
  cyan: 'from-cyan-500 to-sky-400 shadow-cyan-500/30',
  amber: 'from-amber-500 to-orange-400 shadow-amber-500/30',
  emerald: 'from-emerald-500 to-teal-400 shadow-emerald-500/30',
  rose: 'from-rose-500 to-pink-400 shadow-rose-500/30',
  violet: 'from-violet-500 to-purple-400 shadow-violet-500/30',
} as const;

export function Stat({
  label, value, sub, icon, tone = 'indigo', onClick,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ReactNode;
  tone?: keyof typeof STAT_TONES; onClick?: () => void;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cx(
        'relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 text-left shadow-sm shadow-slate-200/60',
        onClick && 'transition hover:-translate-y-0.5 hover:shadow-md',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <div className={cx('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', STAT_TONES[tone])}>
          {icon}
        </div>
      </div>
      {sub && <div className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">{sub}</div>}
    </Comp>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────────

const BADGE = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
} as const;
export type BadgeTone = keyof typeof BADGE;

export function Badge({ tone = 'gray', children, dot, className }: {
  tone?: BadgeTone; children: React.ReactNode; dot?: boolean; className?: string;
}) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', BADGE[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const SUB_STATUS: Record<Subscription['status'], { label: string; tone: BadgeTone }> = {
  trial: { label: 'Trial', tone: 'violet' },
  active: { label: 'Active', tone: 'green' },
  past_due: { label: 'Past due', tone: 'amber' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
  expired: { label: 'Expired', tone: 'red' },
};

export const ROLES: Record<TeamRole, { label: string; tone: BadgeTone; text: string }> = {
  owner: { label: 'Owner', tone: 'indigo', text: 'Everything, including team management and deleting schools' },
  admin: { label: 'Admin', tone: 'blue', text: 'Manage schools, billing, announcements and support — cannot delete schools or manage the team' },
  support: { label: 'Support', tone: 'gray', text: 'Read-only view of schools (no passwords) and full access to the support desk' },
};

export const HEALTH: Record<SchoolHealth, { label: string; tone: BadgeTone; hint: string }> = {
  healthy: { label: 'Healthy', tone: 'green', hint: 'Attendance marked in the last 3 days' },
  at_risk: { label: 'At risk', tone: 'amber', hint: 'No attendance for 4–14 days' },
  inactive: { label: 'Inactive', tone: 'red', hint: 'No attendance for over 14 days' },
  setup: { label: 'Setting up', tone: 'blue', hint: 'No students added yet' },
  suspended: { label: 'Suspended', tone: 'gray', hint: 'Suspended by Veducore' },
};

// ── Overlays ─────────────────────────────────────────────────────────────────

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md',
}: {
  open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg';
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl',
          size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({
  open, onClose, children, width = 'max-w-3xl',
}: { open: boolean; onClose: () => void; children: React.ReactNode; width?: string }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className={cx('flex h-full w-full flex-col bg-[#f6f7fc] shadow-2xl', width)}>
        {children}
      </div>
    </div>
  );
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, text, action }: {
  icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {text && <p className="mt-1 max-w-sm text-xs text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && <button onClick={onRetry} className="text-xs font-semibold underline">Retry</button>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton-shimmer rounded-xl', className)} />;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────────

type ToastTone = 'success' | 'error' | 'info';
const TOAST_EVENT = 'veducore-mgmt-toast';

export function toast(message: string, tone: ToastTone = 'success') {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; tone: ToastTone }[]>([]);
  useEffect(() => {
    const h = (e: Event) => {
      const { message, tone } = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setItems((cur) => [...cur, { id, message, tone }]);
      window.setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
    };
    window.addEventListener(TOAST_EVENT, h);
    return () => window.removeEventListener(TOAST_EVENT, h);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm shadow-lg',
            t.tone === 'success' && 'border-emerald-200 bg-white text-emerald-800',
            t.tone === 'error' && 'border-rose-200 bg-white text-rose-700',
            t.tone === 'info' && 'border-slate-200 bg-white text-slate-700',
          )}
        >
          {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            : t.tone === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            : <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100/80 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold transition',
            value === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-slate-400">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Small key/value row used in detail panels. */
export function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-50 py-2 text-sm last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className={cx('text-right font-medium text-slate-800', mono && 'font-mono text-xs')}>{v}</span>
    </div>
  );
}
