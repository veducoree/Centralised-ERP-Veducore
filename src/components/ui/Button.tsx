import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  /** Tooltip text — shown as title attr and aria-label when no children */
  tooltip?: string;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
// primary  = indigo filled (#5B6EE8)
// secondary = white + border
// danger   = red filled
// ghost    = transparent, hover bg
// outline  = white + gray border (alias for secondary, kept for compat)
// radius   = 10px (rounded-[10px])
// height   = sm:36px  md:40px  lg:44px
// icon     = 16px

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:   'bg-[#5B6EE8] text-white hover:bg-[#4B5DD8] active:bg-[#3B4DC8] shadow-sm',
  secondary: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:bg-slate-100',
  danger:    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm',
  ghost:     'text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  outline:   'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:bg-slate-100',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 [&_svg]:h-4 [&_svg]:w-4',
  md: 'h-10 px-4 text-sm gap-2  [&_svg]:h-4 [&_svg]:w-4',
  lg: 'h-11 px-5 text-sm gap-2  [&_svg]:h-4 [&_svg]:w-4',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  tooltip,
  ...props
}: ButtonProps) {
  return (
    <button
      title={tooltip}
      aria-label={!children && tooltip ? tooltip : props['aria-label']}
      className={cn(
        'inline-flex items-center justify-center rounded-[10px] font-medium',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-[#5B6EE8]/30',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
