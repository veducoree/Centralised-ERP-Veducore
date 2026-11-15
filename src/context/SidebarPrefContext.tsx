/**
 * SidebarPrefContext
 *
 * Manages per-user sidebar pin preferences.
 * - DB is the source of truth; localStorage is an optional same-session cache.
 * - Optimistic updates: UI changes instantly; DB save is background.
 *   On failure the old state is restored and a toast is shown.
 * - Fixed items (all-modules, profile) are always present and cannot be moved.
 */
import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchSidebarPreference,
  saveSidebarPreference,
  resetSidebarPreference,
} from '@/services/api';
import { adminNav, teacherNav, parentNav, type NavItem } from '@/components/layout/DashboardLayout';
import { useToast } from '@/components/ui/Toast';

// ── Constants ────────────────────────────────────────────────────────────────

/** These paths are always pinned and cannot be removed or reordered away. */
export const FIXED_PATHS: Record<string, string[]> = {
  admin:   ['/admin/dashboard', '/admin/all-modules'],
  teacher: ['/teacher/dashboard'],
  parent:  ['/parent/dashboard'],
};

const CACHE_KEY = (uid: string, sid: string | null) =>
  `veducore_sidebar_pref:${uid}:${sid ?? 'null'}`;

// ── Context shape ─────────────────────────────────────────────────────────────

interface SidebarPrefContextValue {
  /** Ordered list of NavItems currently pinned in the sidebar */
  pinnedItems: NavItem[];
  /** Whether this user has any customisation saved */
  isCustomised: boolean;
  /** Toggle pin state of a module path */
  togglePin: (path: string) => void;
  /** Reorder pinned items (pass new ordered array of paths) */
  reorder: (orderedPaths: string[]) => void;
  /** Reset to role default */
  reset: () => Promise<void>;
  /** Role's full nav list (for AllModules page) */
  allItems: NavItem[];
  /** Is path currently pinned? */
  isPinned: (path: string) => boolean;
  /** Is path a fixed item (cannot be unpinned)? */
  isFixed: (path: string) => boolean;
  /** Preferences loaded from DB */
  loaded: boolean;
  /** Modules of this role that are not pinned (can be added back) */
  hiddenItems: NavItem[];
  /** Saves any pending change right away; resolves true when saved */
  flush: () => Promise<boolean>;
  /** A save is in progress or waiting */
  saving: boolean;
}

const SidebarPrefContext = createContext<SidebarPrefContextValue | undefined>(undefined);

// ── Provider ─────────────────────────────────────────────────────────────────

export function SidebarPrefProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const toast = useToast();
  // Keep toast in a ref so it never forces useCallback/context re-creation
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [orderedPaths, setOrderedPaths] = useState<string[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Change waiting to be written: next value + value to restore on failure. */
  const pendingRef = useRef<{ next: string[] | null; prev: string[] | null } | null>(null);
  /** Bumped on every local edit so a slow initial DB read can't overwrite it. */
  const editVersionRef = useRef(0);

  const role = profile?.role ?? 'admin';
  const allItems: NavItem[] =
    role === 'admin' ? adminNav : role === 'teacher' ? teacherNav : parentNav;

  const fixedPaths = FIXED_PATHS[role] ?? [];

  /** Role default = full nav list paths in order */
  const defaultPaths = allItems.map((i) => i.path);

  // ── Load preference ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.id) return;
    setLoaded(false);

    // Try localStorage cache first for instant render
    const cacheKey = CACHE_KEY(profile.id, profile.school_id ?? null);
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as string[] | null;
        setOrderedPaths(cached);
        setLoaded(true);
      }
    } catch { /* ignore */ }

    // Then load from DB (authoritative) — unless the user already edited meanwhile.
    const versionAtStart = editVersionRef.current;
    fetchSidebarPreference(profile.id, profile.school_id ?? null)
      .then((pref) => {
        if (editVersionRef.current !== versionAtStart || pendingRef.current) return;
        const paths = pref?.ordered_paths ?? null;
        setOrderedPaths(paths);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(paths));
        } catch { /* ignore */ }
        setLoaded(true);
      })
      .catch(() => {
        // DB read failed — keep the cached copy (don't wipe it).
        setLoaded(true);
      });
  }, [profile?.id, profile?.school_id, profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived state ────────────────────────────────────────────────────────

  /**
   * Resolve orderedPaths into actual NavItems, filtering out:
   * - paths that no longer exist in the role's nav
   * - paths whose access was revoked
   * Then append fixed items if missing.
   */
  const pinnedItems: NavItem[] = (() => {
    const validPaths = orderedPaths
      ? orderedPaths.filter((p) => allItems.some((i) => i.path === p))
      : defaultPaths;

    // Ensure fixed items are always present
    const withFixed = [...validPaths];
    for (const fp of fixedPaths) {
      if (!withFixed.includes(fp)) withFixed.push(fp);
    }

    // Fixed items always stay at the top in their defined order
    const fixedOrdered = fixedPaths.filter((p) => withFixed.includes(p));
    const nonFixed = withFixed.filter((p) => !fixedPaths.includes(p));
    const finalPaths = [...fixedOrdered, ...nonFixed];

    return finalPaths
      .map((p) => allItems.find((i) => i.path === p))
      .filter(Boolean) as NavItem[];
  })();

  const isCustomised = orderedPaths !== null;

  // ── Persist helper (debounced, optimistic) ───────────────────────────────

  const writeNow = useCallback(async (): Promise<boolean> => {
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    const job = pendingRef.current;
    if (!job || !profile?.id) return true;
    pendingRef.current = null;
    setSaving(true);
    try {
      await saveSidebarPreference(profile.id, profile.school_id ?? null, role, job.next);
      return true;
    } catch {
      // Revert to what was last saved, and say so.
      setOrderedPaths(job.prev);
      try { localStorage.setItem(CACHE_KEY(profile.id, profile.school_id ?? null), JSON.stringify(job.prev)); } catch { /* ignore */ }
      toastRef.current('Could not save your sidebar. Please try again.', 'error');
      return false;
    } finally {
      setSaving(!!pendingRef.current);
    }
  }, [profile?.id, profile?.school_id, role]);

  const persist = useCallback(
    (nextPaths: string[] | null, previousPaths: string[] | null) => {
      if (!profile?.id) return;
      editVersionRef.current += 1;
      const cacheKey = CACHE_KEY(profile.id, profile.school_id ?? null);
      try { localStorage.setItem(cacheKey, JSON.stringify(nextPaths)); } catch { /* ignore */ }

      // Keep the oldest "previous" so a failed batch reverts to the last saved state.
      pendingRef.current = { next: nextPaths, prev: pendingRef.current ? pendingRef.current.prev : previousPaths };
      setSaving(true);
      // Debounce DB writes (user might drag several times quickly).
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => { void writeNow(); }, 600);
    },
    [profile?.id, profile?.school_id, writeNow]
  );

  // Don't lose a pending change when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void writeNow(); };
    const onUnload = () => { void writeNow(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [writeNow]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const togglePin = useCallback((path: string) => {
    if (fixedPaths.includes(path)) return; // fixed items cannot be toggled

    setOrderedPaths((prev) => {
      const current = prev ?? defaultPaths;
      let next: string[];
      if (current.includes(path)) {
        // Unpin
        next = current.filter((p) => p !== path);
      } else {
        // Pin — insert before fixed items at the end
        const fixed = current.filter((p) => fixedPaths.includes(p));
        const nonFixed = current.filter((p) => !fixedPaths.includes(p));
        next = [...nonFixed, path, ...fixed];
      }
      persist(next, prev ?? null);
      return next;
    });
  }, [defaultPaths, fixedPaths, persist]); // eslint-disable-line react-hooks/exhaustive-deps

  const reorder = useCallback((newOrderedPaths: string[]) => {
    setOrderedPaths((prev) => {
      persist(newOrderedPaths, prev ?? null);
      return newOrderedPaths;
    });
  }, [persist]);

  const reset = useCallback(async () => {
    if (!profile?.id) return;
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    pendingRef.current = null;
    editVersionRef.current += 1;
    const prev = orderedPaths;
    setOrderedPaths(null);
    try {
      const cacheKey = CACHE_KEY(profile.id, profile.school_id ?? null);
      localStorage.setItem(cacheKey, JSON.stringify(null));
      await resetSidebarPreference(profile.id, profile.school_id ?? null);
      toastRef.current('Sidebar reset to default', 'success');
    } catch {
      setOrderedPaths(prev);
      toastRef.current('Could not reset sidebar preferences. Please try again.', 'error');
    }
  }, [profile?.id, profile?.school_id, orderedPaths]);  // toast removed — using toastRef

  const isPinned = useCallback(
    (path: string) => pinnedItems.some((i) => i.path === path),
    [pinnedItems]
  );

  const isFixed = useCallback(
    (path: string) => fixedPaths.includes(path),
    [fixedPaths]
  );

  const hiddenItems = allItems.filter((i) => !pinnedItems.some((p) => p.path === i.path));

  return (
    <SidebarPrefContext.Provider value={{
      pinnedItems, isCustomised, togglePin, reorder,
      reset, allItems, isPinned, isFixed, loaded,
      hiddenItems, flush: writeNow, saving,
    }}>
      {children}
    </SidebarPrefContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSidebarPref() {
  const ctx = useContext(SidebarPrefContext);
  if (!ctx) throw new Error('useSidebarPref must be used inside SidebarPrefProvider');
  return ctx;
}
