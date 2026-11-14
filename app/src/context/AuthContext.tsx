import { unregisterPushToken } from '@/lib/notifications';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clearApiCache, fetchSchool, fetchTeacherByUserId, fetchParentByUserId } from '@/services/api';
import type { Profile, School } from '@/types';

const PROFILE_CACHE_KEY = 'veducore_mobile_profile_cache';
const SCHOOL_CACHE_KEY = 'veducore_mobile_school_cache';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  school: School | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    school: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const currentUserIdRef = useRef<string | null>(null);
  const profileInFlightRef = useRef<{ uid: string; promise: Promise<{ profile: Profile | null; school: School | null }> } | null>(null);

  const fetchProfileAndSchool = useCallback(async (uid: string, email?: string, forceSchoolRefresh = false): Promise<{ profile: Profile | null; school: School | null }> => {
    if (!forceSchoolRefresh && profileInFlightRef.current?.uid === uid) {
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
          console.error('Error fetching profile from Supabase:', error.message);
          return { profile: null, school: null };
        }

        const profile = (data as Profile | null) ?? null;
        if (profile) {
          AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)).catch(() => {});
        }

        let schoolId = profile?.school_id || null;
        if (!schoolId && profile?.role === 'teacher') {
          const teacher = await fetchTeacherByUserId(uid, email || profile.email).catch(() => null);
          schoolId = teacher?.school_id || null;
        } else if (!schoolId && profile?.role === 'parent') {
          const parent = await fetchParentByUserId(uid).catch(() => null);
          schoolId = parent?.school_id || null;
        }

        let school: School | null = null;
        if (schoolId) {
          school = await fetchSchool(schoolId, forceSchoolRefresh).catch(() => null);
          if (school) {
            AsyncStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify(school)).catch(() => {});
          }
        }

        return { profile, school };
      } catch (err: any) {
        console.error('Profile fetch exception:', err?.message || err);
        return { profile: null, school: null };
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
    let isMounted = true;

    // Restore existing session on mount with cached profile & school fast-path
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        console.error('getSession error:', error.message);
      }
      if (session?.user && isMounted) {
        currentUserIdRef.current = session.user.id;
        try {
          const [cachedProfileRaw, cachedSchoolRaw] = await Promise.all([
            AsyncStorage.getItem(PROFILE_CACHE_KEY),
            AsyncStorage.getItem(SCHOOL_CACHE_KEY),
          ]);
          const cachedProfile = cachedProfileRaw ? (JSON.parse(cachedProfileRaw) as Profile) : null;
          const cachedSchool = cachedSchoolRaw ? (JSON.parse(cachedSchoolRaw) as School) : null;
          if (cachedProfile && cachedProfile.id === session.user.id && isMounted) {
            setState({
              session,
              user: session.user,
              profile: cachedProfile,
              school: cachedSchool && (!cachedProfile.school_id || cachedSchool.id === cachedProfile.school_id) ? cachedSchool : null,
              isLoading: false,
              isAuthenticated: true,
            });
            // Refresh silently in background outside current tick
            setTimeout(() => {
              if (!isMounted) return;
              fetchProfileAndSchool(session.user.id, session.user.email).then(({ profile: freshProfile, school: freshSchool }) => {
                if (freshProfile && isMounted) {
                  setState((s) => ({
                    ...s,
                    profile: freshProfile,
                    school: freshSchool ?? s.school,
                  }));
                }
              });
            }, 0);
            return;
          }
        } catch {}

        const { profile, school } = await fetchProfileAndSchool(session.user.id, session.user.email);
        if (isMounted) {
          setState({
            session,
            user: session.user,
            profile,
            school,
            isLoading: false,
            isAuthenticated: !!profile,
          });
        }
      } else if (isMounted) {
        currentUserIdRef.current = null;
        AsyncStorage.multiRemove([PROFILE_CACHE_KEY, SCHOOL_CACHE_KEY]).catch(() => {});
        setState(s => ({ ...s, isLoading: false }));
      }
    }).catch(err => {
      console.error('getSession failed:', err);
      if (isMounted) {
        setState(s => ({ ...s, isLoading: false }));
      }
    });

    // IMPORTANT: Keep onAuthStateChange strictly synchronous (do NOT make it async or await
    // Supabase queries inside it) so GoTrueClient never deadlocks on its internal lock!
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        currentUserIdRef.current = null;
        AsyncStorage.multiRemove([PROFILE_CACHE_KEY, SCHOOL_CACHE_KEY]).catch(() => {});
        setState({
          session: null,
          user: null,
          profile: null,
          school: null,
          isLoading: false,
          isAuthenticated: false,
        });
        return;
      }

      const prevUserId = currentUserIdRef.current;
      const nextUserId = session.user.id;
      currentUserIdRef.current = nextUserId;

      if (prevUserId !== nextUserId || event === 'USER_UPDATED') {
        setTimeout(() => {
          if (!isMounted) return;
          fetchProfileAndSchool(nextUserId, session.user.email).then(({ profile, school }) => {
            if (isMounted) {
              setState({
                session,
                user: session.user,
                profile,
                school,
                isLoading: false,
                isAuthenticated: !!profile,
              });
            }
          });
        }, 0);
      } else {
        setState((s) => ({
          ...s,
          session,
          user: session.user,
        }));
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchProfileAndSchool]);

  const login = useCallback(
    async (identifier: string, password: string): Promise<{ error?: string }> => {
      const raw = identifier.trim();
      const pw = password.trim();
      const emailsToTry = [raw];
      if (!raw.includes('@')) {
        emailsToTry.push(`${raw}@veducore.internal`);
      }

      let lastError: string | null = null;
      for (const email of emailsToTry) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: pw,
          });

          if (!error && data?.user) {
            currentUserIdRef.current = data.user.id;
            const { profile, school } = await fetchProfileAndSchool(data.user.id, data.user.email, true);
            setState({
              session: data.session,
              user: data.user,
              profile,
              school,
              isLoading: false,
              isAuthenticated: !!profile,
            });
            return {};
          }
          if (error) {
            lastError = error.message;
          }
        } catch (err: any) {
          lastError = err?.message || 'Network connection to Supabase failed';
        }
      }

      return { error: lastError || 'Invalid email or password' };
    },
    [fetchProfileAndSchool]
  );

  const logout = useCallback(async () => {
    // Stop pushes to this device; needs the session, so do it first.
    await Promise.race([unregisterPushToken(), new Promise((r) => setTimeout(r, 800))]);
    currentUserIdRef.current = null;
    clearApiCache();
    setState({
      session: null,
      user: null,
      profile: null,
      school: null,
      isLoading: false,
      isAuthenticated: false,
    });

    try {
      await AsyncStorage.multiRemove([PROFILE_CACHE_KEY, SCHOOL_CACHE_KEY]);
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 400)),
      ]);
      supabase.auth.signOut().catch(() => {});
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!state.user) return;
    const { profile, school } = await fetchProfileAndSchool(state.user.id, state.user.email, true);
    setState(s => ({ ...s, profile, school: school ?? s.school }));
  }, [state.user, fetchProfileAndSchool]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
