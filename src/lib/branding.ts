import type { School, UserRole } from '@/types';

/** "Green Valley Convent School" → "GVCS". Skips symbols like "&". */
export function schoolInitials(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .split(/[\s\-_.]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 6);
}

const ROLE_PORTAL: Record<UserRole, string> = {
  admin: 'Admin Portal',
  teacher: 'Teacher Portal',
  parent: 'Parent Portal',
};

export interface SchoolBranding {
  /** Show the school's logo and initials-based name instead of Veducore. */
  enabled: boolean;
}

export function schoolBranding(school: School | null | undefined): SchoolBranding {
  const b = (school?.settings as Record<string, unknown> | null | undefined)?.app_branding as Partial<SchoolBranding> | undefined;
  return { enabled: b?.enabled !== false };
}

/** "GVCS Teacher Portal" (or "Veducore" when branding is off / no school). */
export function portalName(school: School | null | undefined, role: UserRole | null | undefined): string {
  if (!school?.name || !role || !schoolBranding(school).enabled) return 'Veducore';
  const initials = schoolInitials(school.name);
  return initials ? `${initials} ${ROLE_PORTAL[role]}` : ROLE_PORTAL[role];
}
