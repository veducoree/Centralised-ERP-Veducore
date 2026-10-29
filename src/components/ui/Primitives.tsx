import { Search } from 'lucide-react';
import {
  Skeleton,
  TableSkeleton,
  CardGridSkeleton,
  ProfileSkeleton,
  DashboardSkeleton,
  CenteredLoader,
} from '@/components/ui/Skeleton';

export {
  Skeleton,
  TableSkeleton,
  CardGridSkeleton,
  ProfileSkeleton,
  DashboardSkeleton,
  CenteredLoader,
};

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', className }: SearchInputProps) {
  return (
    <div className={`relative min-w-0 ${className || ''}`}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 z-10" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function LoadingSpinner({
  size = 'md',
  fullScreen = false,
  variant = 'table',
}: {
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
  variant?: 'table' | 'cards' | 'profile' | 'dashboard' | 'spinner';
}) {
  if (fullScreen || size === 'lg') {
    return <CenteredLoader size="lg" fullScreen />;
  }

  if (size === 'sm' || variant === 'spinner') {
    return <CenteredLoader size={size} />;
  }

  if (variant === 'dashboard') {
    return <DashboardSkeleton />;
  }

  if (variant === 'cards') {
    return <CardGridSkeleton />;
  }

  if (variant === 'profile') {
    return <ProfileSkeleton />;
  }

  return <TableSkeleton />;
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
      <p className="font-medium text-gray-600">{title}</p>
      {message && <p className="mt-1 text-sm text-gray-400">{message}</p>}
    </div>
  );
}
