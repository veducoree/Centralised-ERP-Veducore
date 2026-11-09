import { useNavigate } from 'react-router-dom';
import { Pin, PinOff } from 'lucide-react';
import { DashboardLayout, adminNav } from '@/components/layout/DashboardLayout';
import { useSidebarPref } from '@/context/SidebarPrefContext';
import { cn } from '@/lib/utils';

// ── Color config ──────────────────────────────────────────────────────────────
type TileColor = 'blue' | 'emerald' | 'amber' | 'cyan' | 'red' | 'violet' | 'pink' | 'orange' | 'gray';

const MODULE_COLORS: Record<string, TileColor> = {
  '/admin/dashboard':     'blue',
  '/admin/students':      'blue',
  '/admin/teachers':      'emerald',
  '/admin/parents':       'cyan',
  '/admin/classes':       'amber',
  '/admin/attendance':    'emerald',
  '/admin/fees':          'emerald',
  '/admin/transport':     'amber',
  '/admin/tracking':      'red',
  '/admin/id-cards':      'blue',
  '/admin/documents':     'blue',
  '/admin/holidays':      'pink',
  '/admin/notifications': 'orange',
  '/admin/settings':      'gray',
  '/admin/profile':       'blue',
};

const gradientClasses: Record<TileColor, string> = {
  blue:    'bg-gradient-to-br from-[#5B6EE8] to-[#7B8CF7]',
  emerald: 'bg-gradient-to-br from-[#22C08A] to-[#3DD9A3]',
  amber:   'bg-gradient-to-br from-[#F5A623] to-[#FFC24D]',
  red:     'bg-gradient-to-br from-[#EF4444] to-[#F87171]',
  cyan:    'bg-gradient-to-br from-[#06B6D4] to-[#22D3EE]',
  violet:  'bg-gradient-to-br from-[#8B5CF6] to-[#A78BFA]',
  pink:    'bg-gradient-to-br from-[#EC4899] to-[#F472B6]',
  orange:  'bg-gradient-to-br from-[#F97316] to-[#FB923C]',
  gray:    'bg-gradient-to-br from-[#64748B] to-[#94A3B8]',
};

const circleClasses: Record<TileColor, string> = {
  blue:    'bg-[#EEF0FD]',
  emerald: 'bg-[#E6F8F1]',
  amber:   'bg-[#FEF3E0]',
  red:     'bg-[#FEECEC]',
  cyan:    'bg-[#E0F7FB]',
  violet:  'bg-[#F0EBFE]',
  pink:    'bg-[#FDE7F3]',
  orange:  'bg-[#FEF0E6]',
  gray:    'bg-[#F1F5F9]',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AllModulesPage() {
  const navigate = useNavigate();
  const { isPinned, isFixed, togglePin } = useSidebarPref();

  // Strip "All Modules" itself from the grid
  const modules = adminNav.filter((item) => item.path !== '/admin/all-modules');

  return (
    <DashboardLayout title="All Modules">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {modules.map((item) => {
          const color: TileColor = MODULE_COLORS[item.path] ?? 'blue';
          const pinned = isPinned(item.path);
          const fixed = isFixed(item.path);

          return (
            <div
              key={item.path}
              className={cn(
                'group relative min-h-[120px] w-full overflow-hidden rounded-[20px] bg-white p-5',
                'shadow-[0_4px_20px_rgba(91,110,232,0.08)]',
                'transition-all duration-150',
                'hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(91,110,232,0.14)]',
              )}
            >
              {/* Decorative circle */}
              <div className={cn('absolute -right-10 -top-10 h-28 w-28 rounded-full', circleClasses[color])} />

              {/* Pin/unpin button — top-right, inside card */}
              {!fixed && (
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(item.path); }}
                  title={pinned ? 'Remove from sidebar' : 'Pin to sidebar'}
                  className={cn(
                    'absolute right-3 top-3 z-10 rounded-lg p-1.5 transition-colors',
                    pinned
                      ? 'text-[#5B6EE8] opacity-100'
                      : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-[#5B6EE8]',
                  )}
                >
                  {pinned
                    ? <Pin className="h-3.5 w-3.5 fill-current" />
                    : <PinOff className="h-3.5 w-3.5" />}
                </button>
              )}

              {/* Main clickable area */}
              <button
                onClick={() => navigate(item.path)}
                className="flex h-full w-full flex-col items-start focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B6EE8]/40"
              >
                {/* Icon box */}
                <div className={cn(
                  'relative mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md',
                  '[&_svg]:h-5 [&_svg]:w-5',
                  gradientClasses[color],
                )}>
                  {item.icon}
                </div>

                {/* Module name */}
                <p className="relative text-sm font-semibold leading-snug text-[#0F172A]">
                  {item.label}
                </p>
              </button>
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
