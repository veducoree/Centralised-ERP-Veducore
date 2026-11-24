/**
 * Login attempt limiter (per browser).
 *
 * • 5 wrong passwords for one login → locked for 1 min, then 2, 4, 8 … up to 30 min.
 * • 15 wrong passwords on this browser (any logins) within 15 min → locked 5 min,
 *   so someone can't just rotate through mobile numbers.
 * • Counters forget after 30 min without a failure; a correct login clears that login.
 * • Logins are stored only as a hash, never as the typed mobile / username.
 *
 * Supabase Auth also rate-limits sign-ins per IP on the server; this keeps
 * honest-but-forgetful users and casual guessing well below that.
 * Keep the rules in step with app/src/lib/loginThrottle.ts.
 */

const STORAGE_KEY = 'veducore_login_guard';
const PER_LOGIN_FREE = 5;
const BASE_LOCK_MS = 60_000;
const MAX_LOCK_MS = 30 * 60_000;
const FORGET_MS = 30 * 60_000;
const DEVICE_WINDOW_MS = 15 * 60_000;
const DEVICE_MAX_FAILS = 15;
const DEVICE_LOCK_MS = 5 * 60_000;

interface Entry { fails: number; last: number; lockUntil: number }
interface GuardState { ids: Record<string, Entry>; device: number[]; deviceLockUntil: number }

function hashId(scope: string, identifier: string): string {
  // FNV-1a — enough to key a counter without keeping the login itself.
  const s = `${scope}:${identifier.trim().toLowerCase().replace(/\s+/g, '')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function load(): GuardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as GuardState;
      if (s && typeof s === 'object' && s.ids && Array.isArray(s.device)) return s;
    }
  } catch { /* storage blocked — fall through */ }
  return { ids: {}, device: [], deviceLockUntil: 0 };
}

function save(s: GuardState) {
  const now = Date.now();
  for (const [k, e] of Object.entries(s.ids)) {
    if (e.lockUntil < now && now - e.last > FORGET_MS) delete s.ids[k];
  }
  s.device = s.device.filter((t) => now - t < DEVICE_WINDOW_MS);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function waitText(ms: number): string {
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec} sec`;
  const min = Math.ceil(sec / 60);
  return `${min} min`;
}

export function lockMessage(ms: number): string {
  return `Too many failed attempts. For your account's safety, please try again in ${waitText(ms)}.`;
}

/** Milliseconds this login is still locked for (0 = may try now). */
export function loginLockRemaining(scope: string, identifier: string): number {
  const s = load();
  const now = Date.now();
  const e = s.ids[hashId(scope, identifier)];
  return Math.max(0, (e?.lockUntil ?? 0) - now, s.deviceLockUntil - now);
}

/** Record a wrong password. Returns the lock now in force (0 = none yet). */
export function recordLoginFailure(scope: string, identifier: string): number {
  const s = load();
  const now = Date.now();
  const key = hashId(scope, identifier);
  const prev = s.ids[key];
  const e: Entry = prev && now - prev.last <= FORGET_MS ? prev : { fails: 0, last: now, lockUntil: 0 };
  e.fails += 1;
  e.last = now;
  if (e.fails >= PER_LOGIN_FREE) {
    e.lockUntil = now + Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (e.fails - PER_LOGIN_FREE));
  }
  s.ids[key] = e;

  s.device = s.device.filter((t) => now - t < DEVICE_WINDOW_MS);
  s.device.push(now);
  if (s.device.length >= DEVICE_MAX_FAILS) {
    s.deviceLockUntil = now + DEVICE_LOCK_MS;
    s.device = [];
  }
  save(s);
  return Math.max(0, e.lockUntil - now, s.deviceLockUntil - now);
}

/** A correct password clears that login's counter. */
export function recordLoginSuccess(scope: string, identifier: string) {
  const s = load();
  delete s.ids[hashId(scope, identifier)];
  save(s);
}

/** Supabase's own server-side limit (HTTP 429). */
export function isServerRateLimit(message: string | null | undefined): boolean {
  return !!message && /rate limit|too many requests|429/i.test(message);
}

export const SERVER_RATE_LIMIT_MESSAGE =
  'Too many login attempts from this network. Please wait a few minutes and try again.';

/** Only a wrong-credentials answer counts against the limit (not network errors). */
export function isWrongCredentials(message: string | null | undefined): boolean {
  return !!message && /invalid login|invalid credentials|invalid grant|email or password/i.test(message);
}
