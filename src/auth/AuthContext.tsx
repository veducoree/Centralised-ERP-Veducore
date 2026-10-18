import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, Student, UserRole } from '@/types';
import { MockAuthContext } from './MockAuthContext';

export interface AuthContextValue {
  session: Session | { access_token: string } | null;
  user: User | { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Children linked to a parent account. Populated in mock mode; empty in real mode. */
  parentChildren?: Student[];
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
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
    if (data) setProfile(data as Profile);
  }, []);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, [fetchProfile]);

  const signIn = async (identifier: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: identifier, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile((user as User).id);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signIn, signOut, refreshProfile, parentChildren: undefined }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth — works in both real (Supabase) and mock mode.
 * In mock mode, App.tsx wraps with MockAuthProvider which supplies MockAuthContext.
 * In real mode, App.tsx wraps with AuthProvider which supplies AuthContext.
 * We check both contexts here so the hook always resolves.
 */
export function useAuth(): AuthContextValue {
  const realCtx = useContext(AuthContext);
  const mockCtx = useContext(MockAuthContext);
  const ctx = realCtx ?? mockCtx;
  if (!ctx) throw new Error('useAuth must be used within AuthProvider or MockAuthProvider');
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
