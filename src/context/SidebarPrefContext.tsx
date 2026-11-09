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
  admin:   ['/admin/all-modules',   '/admin/profile'],
  teacher: ['/teacher/profile'],
  parent:  ['/parent/profile'],
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
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Then load from DB (authoritative)
    fetchSidebarPreference(profile.id, profile.school_id ?? null)
      .then((pref) => {
        const paths = pref?.ordered_paths ?? null;
        setOrderedPaths(paths);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(paths));
        } catch { /* ignore */ }
        setLoaded(true);
      })
      .catch(() => {
        // DB load failed — stay with cache / default
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

    // Ensure fixed items are always included
    const withFixed = [...validPaths];
    for (const fp of fixedPaths) {
      if (!withFixed.includes(fp)) withFixed.push(fp);
    }

    return withFixed
      .map((p) => allItems.find((i) => i.path === p))
      .filter(Boolean) as NavItem[];
  })();

  const isCustomised = orderedPaths !== null;

  // ── Persist helper (debounced, optimistic) ───────────────────────────────

  const persist = useCallback(
    (nextPaths: string[] | null, previousPaths: string[] | null) => {
      if (!profile?.id) return;
      const cacheKey = CACHE_KEY(profile.id, profile.school_id ?? null);
      try { localStorage.setItem(cacheKey, JSON.stringify(nextPaths)); } catch { /* ignore */ }

      // Debounce DB writes (user might drag multiple times quickly)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveSidebarPreference(
          profile.id,
          profile.school_id ?? null,
          role,
          nextPaths,
        ).catch(() => {
          // Revert on failure
          setOrderedPaths(previousPaths);
          try { localStorage.setItem(cacheKey, JSON.stringify(previousPaths)); } catch { /* ignore */ }
          toastRef.current('Could not save sidebar preferences. Please try again.', 'error');
        });
      }, 600);
    },
    [profile?.id, profile?.school_id, role]   // toast removed — using toastRef
  );

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

  return (
    <SidebarPrefContext.Provider value={{
      pinnedItems, isCustomised, togglePin, reorder,
      reset, allItems, isPinned, isFixed, loaded,
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
