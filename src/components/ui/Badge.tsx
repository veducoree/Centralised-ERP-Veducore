import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

// 'color' prop still accepted for transport page backward compat
type BadgeColor = 'blue' | 'green' | 'red' | 'amber' | 'gray' | 'emerald' | 'cyan' | 'violet';

interface BadgeProps {
  variant?: BadgeVariant;
  /** Legacy color prop — maps to variant */
  color?: BadgeColor;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[#EEF0FD] text-[#5B6EE8] ring-[#C7CDFB]',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger:  'bg-red-50 text-red-700 ring-red-200',
  info:    'bg-cyan-50 text-cyan-700 ring-cyan-200',
  neutral: 'bg-slate-100 text-slate-500 ring-slate-200',
};

// Map legacy color → variant
const colorToVariant: Record<BadgeColor, BadgeVariant> = {
  blue:    'default',
  green:   'success',
  emerald: 'success',
  red:     'danger',
  amber:   'warning',
  gray:    'neutral',
  cyan:    'info',
  violet:  'default',
};

export function Badge({ variant, color, children, className }: BadgeProps) {
  const resolved: BadgeVariant =
    variant ?? (color ? colorToVariant[color] : 'default');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        variantClasses[resolved],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    // positive
    active:          'success',
    paid:            'success',
    present:         'success',
    approved:        'success',
    // neutral / in-progress
    pending:         'warning',
    partially_paid:  'info',
    late:            'warning',
    leave:           'info',
    medical:         'info',
    half_day:        'warning',
    cancelled:       'neutral',
    maintenance:     'warning',
    // negative
    inactive:        'neutral',
    stopped:         'neutral',
    overdue:         'danger',
    absent:          'danger',
    rejected:        'danger',
  };
  const label = status === 'medical' ? 'Medical (ML)' : status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge variant={map[status] ?? 'neutral'}>{label}</Badge>;
}
