import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)]',
        onClick && 'cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(91,110,232,0.14)]',
        className
      )}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: string;
  trendUp?: boolean;
  color?: 'blue' | 'emerald' | 'amber' | 'red' | 'cyan' | 'violet';
}

const tileClasses = {
  blue: 'bg-gradient-to-br from-[#5B6EE8] to-[#7B8CF7]',
  emerald: 'bg-gradient-to-br from-[#22C08A] to-[#3DD9A3]',
  amber: 'bg-gradient-to-br from-[#F5A623] to-[#FFC24D]',
  red: 'bg-gradient-to-br from-[#EF4444] to-[#F87171]',
  cyan: 'bg-gradient-to-br from-[#06B6D4] to-[#22D3EE]',
  violet: 'bg-gradient-to-br from-[#8B5CF6] to-[#A78BFA]',
};

const circleClasses = {
  blue: 'bg-[#EEF0FD]',
  emerald: 'bg-[#E6F8F1]',
  amber: 'bg-[#FEF3E0]',
  red: 'bg-[#FEECEC]',
  cyan: 'bg-[#E0F7FB]',
  violet: 'bg-[#F0EBFE]',
};

export function StatCard({ label, value, icon, trend, trendUp, color = 'blue' }: StatCardProps) {
  return (
    <Card className="relative h-full overflow-hidden p-6">
      <div className={cn('absolute -right-10 -top-10 h-28 w-28 rounded-full', circleClasses[color])} />
      {icon && (
        <div
          className={cn(
            'relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md [&_svg]:h-6 [&_svg]:w-6',
            tileClasses[color]
          )}
        >
          {icon}
        </div>
      )}
      <p className="relative text-2xl font-bold leading-tight text-[#0F172A]">{value}</p>
      <p className="relative mt-1 text-sm text-slate-500">{label}</p>
      {trend && (
        <p className={cn('relative mt-1.5 text-xs font-semibold', trendUp ? 'text-emerald-600' : 'text-slate-400')}>
          {trend}
        </p>
      )}
    </Card>
  );
}