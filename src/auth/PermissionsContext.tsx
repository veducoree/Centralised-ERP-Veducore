import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchMyPermissions } from '@/services/api';
import type { MyPermissions, PermissionLevel } from '@/types';

/** Admin modules a staff role can be granted, in display order. */
export const PERMISSION_MODULES: { key: string; label: string; group: string }[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'General' },
  { key: 'notifications', label: 'Notifications', group: 'General' },
  { key: 'holidays', label: 'Holidays', group: 'General' },
  { key: 'students', label: 'Students', group: 'People' },
  { key: 'admissions', label: 'New Admission', group: 'People' },
  { key: 'parents', label: 'Parents', group: 'People' },
  { key: 'teachers', label: 'Teachers', group: 'People' },
  { key: 'classes', label: 'Classes & Sections', group: 'Academics' },
  { key: 'subjects', label: 'Subjects', group: 'Academics' },
  { key: 'timetable', label: 'Timetable', group: 'Academics' },
  { key: 'attendance', label: 'Attendance', group: 'Academics' },
  { key: 'exams', label: 'Exams & Marks', group: 'Academics' },
  { key: 'sessions', label: 'Academic Year', group: 'Academics' },
  { key: 'fees', label: 'Fees', group: 'Finance' },
  { key: 'transport', label: 'Transport', group: 'Operations' },
  { key: 'tracking', label: 'Student Tracking', group: 'Operations' },
  { key: 'id_cards', label: 'ID Cards', group: 'Operations' },
  { key: 'documents', label: 'Documents', group: 'Operations' },
  { key: 'settings', label: 'School Settings', group: 'Administration' },
];

/** Route → module. Paths not listed are open to every admin. */
const PATH_MODULES: [prefix: string, module: string][] = [
  ['/admin/dashboard', 'dashboard'],
  ['/admin/new-admission', 'admissions'],
  ['/admin/students', 'students'],
  ['/admin/promotion', 'students'],
  ['/admin/teachers', 'teachers'],
  ['/admin/parents', 'parents'],
  ['/admin/classes', 'classes'],
  ['/admin/subjects', 'subjects'],
  ['/admin/timetable', 'timetable'],
  ['/admin/attendance', 'attendance'],
  ['/admin/exams', 'exams'],
  ['/admin/fees', 'fees'],
  ['/admin/transport', 'transport'],
  ['/admin/tracking', 'tracking'],
  ['/admin/id-cards', 'id_cards'],
  ['/admin/documents', 'documents'],
  ['/admin/holidays', 'holidays'],
  ['/admin/sessions', 'sessions'],
  ['/admin/notifications', 'notifications'],
  ['/admin/settings', 'settings'],
  ['/admin/staff', 'staff'], // owner only
];

export function moduleForPath(path: string): string | null {
  const hit = PATH_MODULES.find(([p]) => path === p || path.startsWith(p + '/'));
  return hit ? hit[1] : null;
}

interface PermissionsValue {
  loaded: boolean;
  owner: boolean;
  roleName: string | null;
  can: (module: string, level?: Exclude<PermissionLevel, 'none'>) => boolean;
  canPath: (path: string) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [perms, setPerms] = useState<MyPermissions | null>(null);
  const isAdmin = profile?.role === 'admin';

  const refresh = useCallback(async () => {
    if (!isAdmin) { setPerms({}); return; }
    try {
      setPerms(await fetchMyPermissions());
    } catch {
      // If the lookup fails, fall back to no module access rather than full access.
      setPerms({ owner: false, modules: {} });
    }
  }, [isAdmin]);

  useEffect(() => {
    setPerms(null);
    if (profile?.id) refresh();
  }, [profile?.id, refresh]);

  const value = useMemo<PermissionsValue>(() => {
    const owner = !!perms?.owner;
    const modules = perms?.modules ?? {};
    const can: PermissionsValue['can'] = (module, level = 'view') => {
      if (!isAdmin) return false;
      if (owner) return true;
      if (module === 'staff') return false;
      const l = modules[module];
      return l === 'edit' || (level === 'view' && l === 'view');
    };
    return {
      loaded: !isAdmin || perms !== null,
      owner,
      roleName: owner ? 'Owner' : perms?.role ?? null,
      can,
      canPath: (path) => {
        const m = moduleForPath(path);
        return m === null || can(m, 'view');
      },
      refresh,
    };
  }, [perms, isAdmin, refresh]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used inside PermissionsProvider');
  return ctx;
}
