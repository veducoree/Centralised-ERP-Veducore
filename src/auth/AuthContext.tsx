import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => getCachedProfile());
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return;
    }
    if (data) {
      const p = data as Profile;
      setProfile(p);
      setCachedProfile(p);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let initialResolved = false;
    const startTime = Date.now();
    const MIN_LOADER_MS = 1600;

    const finishInitialLoad = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_LOADER_MS - elapsed);
      window.setTimeout(() => {
        if (mounted) {
          setLoading(false);
          initialResolved = true;
        }
      }, remaining);
    };

    // Initial session check
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      if (!mounted) return;
      setSession(initSession);
      setUser(initSession?.user ?? null);
      if (initSession?.user) {
        const cached = getCachedProfile();
        if (cached && cached.id === initSession.user.id) {
          setProfile(cached);
          finishInitialLoad();
          // Refresh silently in background
          fetchProfile(initSession.user.id);
        } else {
          fetchProfile(initSession.user.id).finally(() => {
            finishInitialLoad();
          });
        }
      } else {
        setProfile(null);
        setCachedProfile(null);
        finishInitialLoad();
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;
      // Avoid duplicate fetch during INITIAL_SESSION since getSession() handles it
      if (event === 'INITIAL_SESSION') return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        await fetchProfile(nextSession.user.id);
      } else {
        setProfile(null);
        setCachedProfile(null);
      }
      if (mounted && initialResolved) setLoading(false);
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
        setLoading(true);
        await Promise.all([
          fetchProfile(data.user.id),
          new Promise((resolve) => window.setTimeout(resolve, 1400)),
        ]);
        setLoading(false);
        return { error: null };
      }
      if (error) lastError = error.message;
    }
    return { error: lastError };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setCachedProfile(null);
    setProfile(null);
    setUser(null);
    setSession(null);
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
