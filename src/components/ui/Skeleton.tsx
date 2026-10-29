import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

/** Base shimmering skeleton block */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'skeleton-shimmer rounded-lg bg-slate-200/70',
        className
      )}
    />
  );
}

/**
 * Dead-centered "Veducore" text-fill loader (centered from top, bottom, left, and right).
 * Displays "Veducore" with a plain/unfilled interior that smoothly fills up with brand gradient.
 * Used wherever skeleton UI is not shown.
 */
export function CenteredLoader({
  size = 'md',
  fullScreen = false,
  label,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
  label?: string;
  className?: string;
}) {
  const textSizes = {
    sm: 'text-xl sm:text-2xl',
    md: 'text-3xl sm:text-4xl',
    lg: 'text-4xl sm:text-5xl',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center select-none',
        fullScreen
          ? 'fixed inset-0 z-50 min-h-screen w-screen bg-gray-50/95 backdrop-blur-xs'
          : 'min-h-[calc(100vh-12rem)] w-full py-12',
        className
      )}
    >
      <div className="relative inline-block">
        {/* Base plain/unfilled Veducore text */}
        <span
          className={cn(
            textSizes[size],
            'block font-extrabold tracking-tight text-gray-200'
          )}
          style={{
            WebkitTextStroke: '1px #cbd5e1',
          }}
        >
          Veducore
        </span>

        {/* Animated black fill moving smoothly from right to left */}
        <span
          aria-hidden="true"
          className={cn(
            textSizes[size],
            'veducore-fill-text pointer-events-none absolute inset-0 block font-extrabold tracking-tight text-gray-950'
          )}
        >
          Veducore
        </span>
      </div>

      {label && (
        <p className="mt-2.5 text-xs font-medium text-gray-400 tracking-wide">
          {label}
        </p>
      )}
    </div>
  );
}

/** Skeleton for a single KPI/Stat card */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs">
      <div className="flex items-center justify-between">
        <div className="space-y-2.5 flex-1">
          <Skeleton className="h-3.5 w-24 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
        <Skeleton className="h-11 w-11 rounded-xl flex-shrink-0" />
      </div>
    </div>
  );
}

/** Skeleton for Dashboards (Admin / Teacher / Parent) — pure skeleton without spinner overlay */
export function DashboardSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      {/* Greeting Banner Skeleton */}
      <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-2xs space-y-2">
        <Skeleton className="h-5 w-56 rounded-md" />
        <Skeleton className="h-3.5 w-72 rounded-md" />
      </div>

      {/* Stat Cards Grid */}
      <div
        className={cn(
          'grid grid-cols-1 gap-4 sm:grid-cols-2',
          cards >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-2'
        )}
      >
        {Array.from({ length: cards }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Charts / Content Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-40 rounded-md" />
            <Skeleton className="h-3.5 w-24 rounded-md" />
          </div>
          <div className="flex items-end gap-4 h-36 pt-4 px-2">
            <Skeleton className="h-[60%] flex-1 rounded-t-md" />
            <Skeleton className="h-[85%] flex-1 rounded-t-md" />
            <Skeleton className="h-[45%] flex-1 rounded-t-md" />
            <Skeleton className="h-[95%] flex-1 rounded-t-md" />
            <Skeleton className="h-[75%] flex-1 rounded-t-md" />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <Skeleton className="h-4 w-36 rounded-md" />
          <div className="flex items-center gap-6 py-2">
            <Skeleton className="h-28 w-28 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-5/6 rounded-md" />
              <Skeleton className="h-4 w-2/3 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Skeleton for Data Tables & List pages — pure skeleton without spinner overlay */
export function TableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 border-b border-gray-200 bg-gray-50/70 px-4 py-3.5">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'col-span-2',
              i === 0 && 'col-span-3',
              i === columns - 1 && 'col-span-3 flex justify-end'
            )}
          >
            <Skeleton className="h-3.5 w-20 rounded-md" />
          </div>
        ))}
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="grid grid-cols-12 items-center gap-4 px-4 py-3.5"
          >
            {Array.from({ length: columns }).map((__, colIdx) => (
              <div
                key={colIdx}
                className={cn(
                  'col-span-2',
                  colIdx === 0 && 'col-span-3 flex items-center gap-3',
                  colIdx === columns - 1 && 'col-span-3 flex justify-end'
                )}
              >
                {colIdx === 0 ? (
                  <>
                    <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-28 rounded-md" />
                      <Skeleton className="h-2.5 w-16 rounded-md" />
                    </div>
                  </>
                ) : colIdx === columns - 1 ? (
                  <Skeleton className="h-7 w-16 rounded-lg" />
                ) : (
                  <Skeleton className="h-3.5 w-20 rounded-md" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for Card Grids (Classes, Schedules, Remarks, Notifications, etc.) — pure skeleton */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 bg-white p-5 space-y-4"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </div>
          </div>
          <div className="space-y-2 pt-1">
            <Skeleton className="h-3 w-full rounded-md" />
            <Skeleton className="h-3 w-4/5 rounded-md" />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for Profile / Detail / Settings pages — pure skeleton */
export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full flex-shrink-0" />
          <div className="space-y-2.5 flex-1">
            <Skeleton className="h-5 w-48 rounded-md" />
            <Skeleton className="h-3.5 w-32 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-3"
          >
            <Skeleton className="h-4 w-36 rounded-md" />
            <div className="space-y-2.5 pt-2">
              <Skeleton className="h-3.5 w-full rounded-md" />
              <Skeleton className="h-3.5 w-5/6 rounded-md" />
              <Skeleton className="h-3.5 w-2/3 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
