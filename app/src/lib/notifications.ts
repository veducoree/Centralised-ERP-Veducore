import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Safely obtain expo-notifications without crashing in Expo Go on Android (SDK 53+)
type NotificationsModule = typeof import('expo-notifications');
let _mod: NotificationsModule | null | undefined;

function getNotificationsModule(): NotificationsModule | null {
  if (_mod !== undefined) return _mod;

  // Remote push was removed from Expo Go on Android; requiring it throws.
  if (isRunningInExpoGo() && Platform.OS === 'android') {
    _mod = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod: NotificationsModule = require('expo-notifications');
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    _mod = mod;
  } catch (err) {
    console.warn('expo-notifications is not available in current environment:', err);
    _mod = null;
  }
  return _mod;
}

/** Creates Android channels and asks for permission. Returns true if granted. */
export async function setupNotifications(): Promise<boolean> {
  const mod = getNotificationsModule();
  if (!mod) return false;

  try {
    if (Platform.OS === 'android') {
      // Channel ids must match what the push-dispatch edge function sends.
      await mod.setNotificationChannelAsync('default', {
        name: 'School updates',
        importance: mod.AndroidImportance.DEFAULT,
        sound: 'default',
        lightColor: '#7B8CF7',
      });
      await mod.setNotificationChannelAsync('important', {
        name: 'Important & urgent alerts',
        importance: mod.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        lightColor: '#EF4444',
      });
    }

    const { status: existing } = await mod.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await mod.requestPermissionsAsync();
    return status === 'granted';
  } catch (err) {
    console.warn('Setup notifications error:', err);
    return false;
  }
}

let _currentToken: string | null = null;

function getProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/**
 * Gets this device's Expo push token and stores it against the signed-in
 * user so the server can push to them.
 */
export async function registerPushToken(userId: string, schoolId: string | null) {
  const mod = getNotificationsModule();
  if (!mod || Platform.OS === 'web') return;

  const granted = await setupNotifications();
  if (!granted) return;

  const projectId = getProjectId();
  if (!projectId) {
    console.warn('Push disabled: set expo.extra.eas.projectId in app.json (run `eas init`).');
    return;
  }

  try {
    const { data: token } = await mod.getExpoPushTokenAsync({ projectId });
    if (!token) return;
    _currentToken = token;
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        school_id: schoolId,
        token,
        platform: Platform.OS,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );
    if (error) console.warn('Saving push token failed:', error.message);
  } catch (err) {
    console.warn('Push token registration failed:', err);
  }
}

/** Removes this device's token. Call before signing out (needs the session). */
export async function unregisterPushToken() {
  if (!_currentToken) return;
  const token = _currentToken;
  _currentToken = null;
  try {
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // best effort
  }
}

/** Maps a notification's web link / category to an app route. */
export function routeForNotification(
  role: 'teacher' | 'parent',
  data: { link?: string | null; category?: string | null },
): string {
  const link = data.link ?? '';
  if (role === 'parent') {
    if (link.startsWith('/parent/attendance') || data.category === 'attendance') return '/(parent)/attendance';
    if (link.startsWith('/parent/fees') || data.category === 'fee') return '/(parent)/fees';
    if (link.startsWith('/parent/records') || data.category === 'exam') return '/(parent)/records';
    if (link.startsWith('/parent/remarks') || data.category === 'remark') return '/(parent)/remarks';
    if (link.startsWith('/parent/transport') || data.category === 'transport') return '/(parent)/transport';
    if (link.startsWith('/parent/timetable') || data.category === 'timetable') return '/parent-modal/timetable';
    return '/parent-modal/notifications';
  }
  if (link.startsWith('/teacher/schedule') || data.category === 'timetable') return '/teacher-modal/schedule';
  return '/teacher-modal/notifications';
}

/**
 * Subscribes to taps on push notifications. Returns an unsubscribe fn.
 * Also handles the tap that cold-started the app.
 */
export function onNotificationTap(handler: (data: Record<string, unknown>) => void): () => void {
  const mod = getNotificationsModule();
  if (!mod) return () => {};

  mod.getLastNotificationResponseAsync?.()
    .then((res) => { if (res) handler(res.notification.request.content.data ?? {}); })
    .catch(() => {});

  const sub = mod.addNotificationResponseReceivedListener((res) => {
    handler(res.notification.request.content.data ?? {});
  });
  return () => sub.remove();
}

/** Sets the app icon badge count (iOS / supported launchers). */
export async function setBadgeCount(count: number) {
  const mod = getNotificationsModule();
  if (!mod) return;
  try { await mod.setBadgeCountAsync(count); } catch { /* ignore */ }
}
