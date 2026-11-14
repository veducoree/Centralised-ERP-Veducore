import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { onNotificationReceived } from '@/lib/notifications';

/**
 * Calls `onChange` whenever a new notification may have arrived, so screens
 * update without a manual pull-to-refresh:
 *  - Supabase realtime INSERT on `notifications` for this school
 *  - a push notification received while the app is in the foreground
 *  - the app coming back to the foreground
 * Bursts are coalesced into one call.
 */
export function useLiveNotifications(onChange: () => void) {
  const { profile, school } = useAuth();
  const schoolId = school?.id ?? profile?.school_id ?? null;

  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 400);
    };

    const channel = schoolId
      ? supabase
          .channel(`notif-live-${schoolId}-${Math.random().toString(36).slice(2, 8)}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: `school_id=eq.${schoolId}` },
            fire,
          )
          .subscribe()
      : null;

    const offPush = onNotificationReceived(fire);

    let lastState = AppState.currentState;
    const appSub = AppState.addEventListener('change', (next) => {
      if (/inactive|background/.test(String(lastState)) && next === 'active') fire();
      lastState = next;
    });

    return () => {
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
      offPush();
      appSub.remove();
    };
  }, [schoolId]);
}
