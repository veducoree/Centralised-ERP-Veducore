import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import type { UserRole } from '@/types';
import { LoadingSpinner } from '@/components/ui/Primitives';
import { usePermissions } from '@/auth/PermissionsContext';
import { adminNav } from '@/components/layout/DashboardLayout';
import { SchoolSuspendedScreen } from '@/components/layout/PlatformNotices';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth();
  const { loaded: permsLoaded, canPath, suspended } = usePermissions();
  const location = useLocation();

  if (loading) return <LoadingSpinner size="lg" />;

  if (!session || !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(profile.role)) {
    const dash = profile.role === 'admin' ? '/admin/dashboard'
      : profile.role === 'teacher' ? '/teacher/dashboard'
      : '/parent/dashboard';
    return <Navigate to={dash} replace />;
  }

  if (profile.status === 'inactive') {
    return <Navigate to="/login" replace />;
  }

  if (!permsLoaded) return <LoadingSpinner size="lg" />;

  // Suspended by Veducore: the database already hides the school's data.
  if (suspended) return <SchoolSuspendedScreen />;

  // Staff roles: only modules the role allows.
  if (profile.role === 'admin') {
    if (!canPath(location.pathname)) {
      const fallback = adminNav.find((i) => canPath(i.path))?.path ?? '/admin/profile';
      return <Navigate to={fallback} replace />;
    }
  }

  return <>{children}</>;
}
