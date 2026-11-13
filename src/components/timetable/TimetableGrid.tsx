import type { ReactNode } from 'react';
import { Coffee } from 'lucide-react';
import type { TimetablePeriod } from '@/types';
import { cn, formatTime, getDayName } from '@/lib/utils';
import { SHORT_DAY } from '@/lib/timetable';

interface TimetableGridProps {
  periods: TimetablePeriod[];
  days: number[];
  /** Weekday to highlight (usually today). */
  highlightDay?: number;
  renderCell: (day: number, period: TimetablePeriod) => ReactNode;
}

/**
 * Week grid: periods down the side, working days across the top. Break rows
 * span all days. Scrolls sideways inside its card on narrow screens.
 */
export function TimetableGrid({ periods, days, highlightDay, renderCell }: TimetableGridProps) {
  return (
    <div className="overflow-x-auto rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="sticky left-0 z-10 w-32 bg-white px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Period
            </th>
            {days.map((d) => (
              <th
                key={d}
                className={cn(
                  'px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide',
                  d === highlightDay ? 'text-[#5B6EE8]' : 'text-slate-500',
                )}
              >
                <span className="hidden lg:inline">{getDayName(d)}</span>
                <span className="lg:hidden">{SHORT_DAY[d]}</span>
                {d === highlightDay && <span className="ml-1 rounded-full bg-[#EEF0FD] px-1.5 py-0.5 text-[10px] normal-case">Today</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) =>
            p.is_break ? (
              <tr key={p.id} className="border-b border-slate-100 bg-amber-50/60">
                <td className="sticky left-0 z-10 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-700">{p.name}</p>
                  <p className="text-[11px] text-amber-600/80">{formatTime(p.start_time)} – {formatTime(p.end_time)}</p>
                </td>
                <td colSpan={days.length} className="px-2 py-2 text-center text-xs font-medium text-amber-700">
                  <Coffee className="mr-1.5 inline h-3.5 w-3.5" />
                  {p.name}
                </td>
              </tr>
            ) : (
              <tr key={p.id} className="border-b border-slate-100 last:border-b-0">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top">
                  <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                  <p className="text-[11px] text-slate-400">{formatTime(p.start_time)} – {formatTime(p.end_time)}</p>
                </td>
                {days.map((d) => (
                  <td key={d} className={cn('p-1.5 align-top', d === highlightDay && 'bg-[#F7F8FE]')}>
                    {renderCell(d, p)}
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Standard filled cell: title, subtitle and optional footer line. */
export function SlotCard({
  title, subtitle, meta, tone = 'default', onClick,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  tone?: 'default' | 'substitute' | 'muted';
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'block h-full min-h-[56px] w-full rounded-xl border px-2.5 py-2 text-left transition-colors',
        tone === 'default' && 'border-[#E0E4FB] bg-[#F5F6FE]',
        tone === 'substitute' && 'border-emerald-200 bg-emerald-50',
        tone === 'muted' && 'border-slate-200 bg-slate-50 opacity-70',
        onClick && 'hover:border-[#5B6EE8]',
      )}
    >
      <p className="truncate text-[13px] font-semibold text-slate-800">{title}</p>
      {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      {meta && <div className="mt-0.5 truncate text-[11px] text-slate-400">{meta}</div>}
    </Tag>
  );
}

/** Empty cell; clickable when the viewer can add a class there. */
export function EmptySlot({ onClick, label = 'Free' }: { onClick?: () => void; label?: string }) {
  if (!onClick) {
    return <div className="flex h-full min-h-[56px] items-center justify-center rounded-xl text-xs text-slate-300">{label}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-h-[56px] w-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs font-medium text-slate-400 transition-colors hover:border-[#5B6EE8] hover:bg-[#F5F6FE] hover:text-[#5B6EE8]"
    >
      + Add
    </button>
  );
}
