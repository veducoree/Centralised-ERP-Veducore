import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clearApiCache } from '@/services/api';
import type { Profile, Student, UserRole } from '@/types';

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Children linked to a parent account (populated by ParentDashboard/ParentChild pages). */
  parentChildren?: Student[];
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PROFILE_CACHE_KEY = 'veducore_cached_profile';

function getCachedProfile(): Profile | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function setCachedProfile(profile: Profile | null) {
  try {
    if (profile) {
      sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    } else {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // ignore storage quota errors
  }
}

function clearSupabaseStorageTokens() {
  try {
    for (const storage of [localStorage, sessionStorage]) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && (key.startsWith('sb-') || key === PROFILE_CACHE_KEY)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    }
  } catch {
    // ignore storage errors
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => getCachedProfile());
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);
  const profileInFlightRef = useRef<{ uid: string; promise: Promise<Profile | null> } | null>(null);

  const fetchProfile = useCallback(async (uid: string): Promise<Profile | null> => {
    if (profileInFlightRef.current?.uid === uid) {
      return profileInFlightRef.current.promise;
    }

    const promise = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();

        if (error) {
          console.error('Error fetching profile:', error);
          return null;
        }
        if (data) {
          const p = data as Profile;
          setProfile(p);
          setCachedProfile(p);
          return p;
        }
        return null;
      } catch (err) {
        console.error('Profile fetch exception:', err);
        return null;
      } finally {
        if (profileInFlightRef.current?.uid === uid) {
          profileInFlightRef.current = null;
        }
      }
    })();

    profileInFlightRef.current = { uid, promise };
    return promise;
  }, []);

  useEffect(() => {
    let mounted = true;

    // Initial session check
    supabase.auth
      .getSession()
      .then(({ data: { session: initSession } }) => {
        if (!mounted) return;
        setSession(initSession);
        setUser(initSession?.user ?? null);
        currentUserIdRef.current = initSession?.user?.id ?? null;

        if (initSession?.user) {
          const cached = getCachedProfile();
          if (cached && cached.id === initSession.user.id) {
            setProfile(cached);
            setLoading(false);
            // Refresh silently in background outside current tick
            window.setTimeout(() => {
              if (mounted) fetchProfile(initSession.user.id);
            }, 0);
          } else {
            fetchProfile(initSession.user.id).finally(() => {
              if (mounted) setLoading(false);
            });
          }
        } else {
          setProfile(null);
          setCachedProfile(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('getSession error:', err);
        if (mounted) {
          setProfile(null);
          setCachedProfile(null);
          setLoading(false);
        }
      });

    // IMPORTANT: Keep onAuthStateChange strictly synchronous (do NOT make it async or await
    // Supabase queries inside it), otherwise GoTrueClient._notifyAllSubscribers will hold
    // its internal lock while waiting for getSession() inside fetchProfile(), causing a deadlock!
    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT' || !nextSession?.user) {
        currentUserIdRef.current = null;
        setSession(null);
        setUser(null);
        setProfile(null);
        setCachedProfile(null);
        setLoading(false);
        return;
      }

      const prevUserId = currentUserIdRef.current;
      const nextUserId = nextSession.user.id;
      currentUserIdRef.current = nextUserId;
      setSession(nextSession);
      setUser(nextSession.user);

      // Defer profile fetch outside the GoTrueClient auth lock
      if (prevUserId !== nextUserId || event === 'USER_UPDATED') {
        window.setTimeout(() => {
          if (!mounted) return;
          fetchProfile(nextUserId).finally(() => {
            if (mounted) setLoading(false);
          });
        }, 0);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (identifier: string, password: string) => {
    const raw = identifier.trim();
    const pw = password.trim();
    const emailsToTry = [raw];
    if (!raw.includes('@')) {
      emailsToTry.push(`${raw}@veducore.internal`);
    }

    let lastError: string | null = null;
    for (const email of emailsToTry) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (!error && data?.user) {
        currentUserIdRef.current = data.user.id;
        setSession(data.session);
        setUser(data.user);
        await fetchProfile(data.user.id);
        setLoading(false);
        return { error: null };
      }
      if (error) lastError = error.message;
    }
    return { error: lastError };
  };

  const signOut = async () => {
    // Clear all local state & caches immediately so UI transitions in 0ms without hanging
    currentUserIdRef.current = null;
    clearApiCache();
    setCachedProfile(null);
    setProfile(null);
    setUser(null);
    setSession(null);
    setLoading(false);

    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => window.setTimeout(resolve, 400)),
      ]);
    } catch {
      // ignore signOut errors
    } finally {
      clearSupabaseStorageTokens();
      // Best-effort server token revocation in background
      supabase.auth.signOut().catch(() => {});
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signIn, signOut, refreshProfile, parentChildren: undefined }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function getDashboardPath(role: UserRole): string {
  switch (role) {
    case 'admin':   return '/admin/dashboard';
    case 'teacher': return '/teacher/dashboard';
    case 'parent':  return '/parent/dashboard';
    default:        return '/login';
  }
}
