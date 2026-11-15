// Public address of the deployed web app. Links that are copied, shared or
// emailed (school login page, superadmin login, "sign in as school" magic
// links) must point here, never at whatever origin the portal happens to be
// opened from (e.g. http://localhost:5173 during development).
// Override with VITE_PUBLIC_APP_URL if the domain ever changes.
const FALLBACK = 'https://centralised-erp-veducoree.vercel.app';

export const PUBLIC_APP_URL = (
  (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim() || FALLBACK
).replace(/\/+$/, '');

export const appLink = (path: string) => `${PUBLIC_APP_URL}${path.startsWith('/') ? path : `/${path}`}`;
