import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import type { UserRole } from '@/types';
import { LoadingSpinner } from '@/components/ui/Primitives';
import { usePermissions } from '@/auth/PermissionsContext';
import { adminNav } from '@/components/layout/DashboardLayout';
import { blockedMessage, type AccessBlock } from '@/lib/accountAccess';

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
    return <BlockedSignOut block="account_inactive" role={profile.role} />;
  }

  if (!permsLoaded) return <LoadingSpinner size="lg" />;

  // Paused by Veducore: no dashboard — sign out and explain on the login screen.
  if (suspended) return <BlockedSignOut block="school_paused" role={profile.role} />;

  // Staff roles: only modules the role allows.
  if (profile.role === 'admin') {
    if (!canPath(location.pathname)) {
      const fallback = adminNav.find((i) => canPath(i.path))?.path ?? '/admin/profile';
      return <Navigate to={fallback} replace />;
    }
  }

  return <>{children}</>;
}

function BlockedSignOut({ block, role }: { block: AccessBlock; role: UserRole }) {
  const { forceSignOut } = useAuth();
  useEffect(() => {
    void forceSignOut(blockedMessage(block, role));
  }, [block, role, forceSignOut]);
  return <LoadingSpinner size="lg" />;
}
