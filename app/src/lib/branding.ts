import type { School } from '@/types';

type Role = 'admin' | 'teacher' | 'parent';

/** "Green Valley Convent School" → "GVCS". Skips symbols like "&". */
export function schoolInitials(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .split(/[\s\-_.]+/)
    .map((w) => w.replace(/[^A-Za-z0-9ऀ-ॿ]/g, ''))
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 6);
}

const ROLE_PORTAL: Record<Role, string> = { admin: 'Admin Portal', teacher: 'Teacher Portal', parent: 'Parent Portal' };

export function brandingEnabled(school: School | null | undefined): boolean {
  const settings = (school as unknown as { settings?: Record<string, unknown> | null })?.settings;
  const b = settings?.app_branding as { enabled?: boolean } | undefined;
  return b?.enabled !== false;
}

/** "GVCS Teacher Portal", or the school name when branding is off. */
export function portalName(school: School | null | undefined, role: string | null | undefined): string | null {
  if (!school?.name || !role || !(role in ROLE_PORTAL)) return null;
  if (!brandingEnabled(school)) return null;
  const initials = schoolInitials(school.name);
  return initials ? `${initials} ${ROLE_PORTAL[role as Role]}` : ROLE_PORTAL[role as Role];
}
