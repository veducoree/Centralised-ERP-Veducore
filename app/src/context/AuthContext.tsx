import { unregisterPushToken } from '@/lib/notifications';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clearApiCache, fetchSchool, fetchTeacherByUserId, fetchParentByUserId } from '@/services/api';
import type { Profile, School } from '@/types';
import { resetAppIconSafely } from '@/lib/appIcon';
import { AppState } from 'react-native';
import { checkAccountAccess, setLoginNotice } from '@/lib/accountAccess';
import {
  isServerRateLimit, isWrongCredentials, lockMessage, loginLockRemaining,
  recordLoginFailure, recordLoginSuccess, SERVER_RATE_LIMIT_MESSAGE,
} from '@/lib/loginThrottle';

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
  // Sign out + explain on the login screen (paused school / deactivated login).
  const forceLogoutRef = useRef<(message: string) => Promise<void>>(async () => {});
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
        // Never open the app for a paused school / deactivated login.
        const access = await checkAccountAccess();
        if (!isMounted) return;
        if (access.blocked && access.message) {
          await forceLogoutRef.current(access.message);
          return;
        }
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
            // Ignore if signed out / switched user meanwhile (e.g. blocked login).
            if (isMounted && currentUserIdRef.current === nextUserId) {
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
      const raw = identifier.trim().toLowerCase();
      const pw = password.trim();
      // Too many wrong passwords for this login (or on this phone) → wait.
      const lockedFor = await loginLockRemaining('app', raw);
      if (lockedFor > 0) return { error: lockMessage(lockedFor) };
      // Same rules as the web login:
      //  • an email → as typed
      //  • a mobile number → parent login <10 digits>@parent.veducore,
      //    then teacher login <10 digits>@teacher.veducore
      //    (then a numeric staff username, just in case)
      //  • anything else → username@veducore.internal
      let digits = raw.replace(/[^0-9]/g, '');
      if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
      if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
      const isMobile = /^[0-9+\s-]+$/.test(raw) && /^[6-9][0-9]{9}$/.test(digits);
      const emailsToTry = raw.includes('@')
        ? [raw]
        : isMobile
          ? [`${digits}@parent.veducore`, `${digits}@teacher.veducore`, `${raw.replace(/\s+/g, '')}@veducore.internal`]
          : [`${raw.replace(/\s+/g, '')}@veducore.internal`];

      let lastError: string | null = null;
      for (const email of emailsToTry) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: pw,
          });

          if (!error && data?.user) {
            await recordLoginSuccess('app', raw);
            // Paused school / deactivated login: say why, inline, instead
            // of opening an empty app.
            const access = await checkAccountAccess();
            if (access.blocked && access.message) {
              currentUserIdRef.current = null;
              await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
              return { error: access.message };
            }
            currentUserIdRef.current = data.user.id;
            const { profile, school } = await fetchProfileAndSchool(data.user.id, data.user.email, true);
            // The app is for teachers and parents only; anything else would
            // land back on the login screen with no explanation.
            if (!profile || (profile.role !== 'teacher' && profile.role !== 'parent')) {
              currentUserIdRef.current = null;
              await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
              return {
                error: !profile
                  ? 'Your login is not set up yet. Please contact your school admin.'
                  : 'This app is for teachers and parents. Admins please use the web portal.',
              };
            }
            setState({
              session: data.session,
              user: data.user,
              profile,
              school,
              isLoading: false,
              isAuthenticated: true,
            });
            return {};
          }
          if (error) {
            lastError = error.message;
            // Only a wrong-credentials answer is worth trying the next form.
            if (!/invalid|credential/i.test(error.message)) break;
          }
        } catch (err: any) {
          lastError = err?.message || 'Network connection to Supabase failed';
          break;
        }
      }

      if (isServerRateLimit(lastError)) return { error: SERVER_RATE_LIMIT_MESSAGE };
      if (isWrongCredentials(lastError)) {
        const lock = await recordLoginFailure('app', raw);
        if (lock > 0) return { error: lockMessage(lock) };
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
    // Back to the default Veducore launcher icon.
    resetAppIconSafely();
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

  forceLogoutRef.current = async (message: string) => {
    setLoginNotice(message);
    await logout();
  };

  // Re-check whenever the app comes back to the foreground (and every few
  // minutes while open): a school paused meanwhile is signed out.
  const signedInUid = state.isAuthenticated ? state.user?.id ?? null : null;
  useEffect(() => {
    if (!signedInUid) return;
    let busy = false;
    const recheck = async () => {
      if (busy || AppState.currentState !== 'active') return;
      busy = true;
      try {
        const access = await checkAccountAccess();
        if (access.blocked && access.message && currentUserIdRef.current === signedInUid) {
          await forceLogoutRef.current(access.message);
        }
      } finally {
        busy = false;
      }
    };
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void recheck();
    });
    const timer = setInterval(recheck, 5 * 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [signedInUid]);

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
