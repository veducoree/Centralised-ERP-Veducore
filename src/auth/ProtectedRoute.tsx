import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import type { UserRole } from '@/types';
import { LoadingSpinner } from '@/components/ui/Primitives';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSpinner size="lg" />;

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!profile) {
    return <LoadingSpinner size="lg" />;
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

  return <>{children}</>;
}
