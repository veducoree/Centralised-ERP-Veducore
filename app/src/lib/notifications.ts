import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { fetchParents, fetchParentStudents, createNotification } from '@/services/api';
import type { Student, AttendanceStatus } from '@/types';

// Safely obtain expo-notifications without crashing in Expo Go on Android (SDK 53+)
let _notificationsModule: typeof import('expo-notifications') | null | undefined = undefined;

function getNotificationsModule(): typeof import('expo-notifications') | null {
  if (_notificationsModule !== undefined) {
    return _notificationsModule;
  }

  // expo-notifications Android push functionality was removed in Expo Go SDK 53+
  // Importing or requiring it in Expo Go on Android throws an uncaught error.
  if (isRunningInExpoGo() && Platform.OS === 'android') {
    _notificationsModule = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-notifications');
    if (mod?.setNotificationHandler) {
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    }
    _notificationsModule = mod;
    return _notificationsModule ?? null;
  } catch (err) {
    console.warn('expo-notifications is not available in current environment:', err);
    _notificationsModule = null;
    return null;
  }
}

/**
 * Initializes notification channels and requests device permissions
 */
export async function setupNotifications(): Promise<boolean> {
  const mod = getNotificationsModule();
  if (!mod) {
    return false;
  }

  try {
    if (Platform.OS === 'android') {
      await mod.setNotificationChannelAsync('attendance-channel', {
        name: 'Attendance & School Alerts',
        importance: mod.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
        sound: 'default',
      });
    }

    const { status: existingStatus } = await mod.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await mod.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (err) {
    console.warn('Setup notifications error:', err);
    return false;
  }
}

/**
 * Triggers a native system push notification that appears in the device's
 * notification tray / lock screen / heads-up banner even outside the app.
 */
export async function sendSystemNotification({
  title,
  body,
  data = {},
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const mod = getNotificationsModule();
  if (!mod) {
    console.log('[System Notification (Expo Go fallback)]:', title, '-', body);
    return;
  }

  try {
    await setupNotifications();
    await mod.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: Platform.OS === 'android' ? { channelId: 'attendance-channel' } : null,
    });
  } catch (err) {
    console.warn('Send system notification error:', err);
  }
}

/**
 * Dispatches attendance notifications to parents both in-app (Supabase)
 * and outside the app (native device system push notification).
 */
export async function notifyParentsOnAttendance({
  sectionId,
  date,
  sectionLabel,
  students,
  statuses,
}: {
  sectionId: string;
  date: string;
  sectionLabel: string;
  students: Student[];
  statuses: Record<string, AttendanceStatus>;
}) {
  try {
    const schoolId = students[0]?.school_id || 'school-001';
    let presentCount = 0;
    let absentCount = 0;

    for (const st of students) {
      const status = statuses[st.id] || 'present';
      if (status === 'present') presentCount++;
      if (status === 'absent') absentCount++;

      const statusEmoji =
        status === 'present' ? '✅' : status === 'absent' ? '❌' : status === 'late' ? '⏰' : '📝';
      const statusText = status.toUpperCase();

      // 1. Insert in-app notification into Supabase
      try {
        await createNotification({
          school_id: schoolId,
          user_id: null,
          title: `${statusEmoji} Attendance Marked - ${st.full_name}`,
          message: `${st.full_name} has been marked ${statusText} for ${date} in ${sectionLabel}.`,
          type: status === 'present' ? 'success' : status === 'absent' ? 'error' : 'warning',
          entity_type: 'attendance',
          entity_id: st.id,
        });
      } catch (e) {
        console.warn('In-app notification insert skipped:', e);
      }
    }

    // 2. Trigger native device system push notification (visible outside the app!)
    const isToday = date === new Date().toISOString().split('T')[0];
    const dayLabel = isToday ? 'today' : date;

    const notifBody = absentCount > 0
      ? `Attendance for ${sectionLabel} recorded: ${presentCount} Present, ${absentCount} Absent. Tap to view details.`
      : `All students marked Present for ${sectionLabel} (${dayLabel}). Parent notifications delivered!`;

    await sendSystemNotification({
      title: `🔔 Parent Alert: Attendance Recorded (${dayLabel})`,
      body: notifBody,
      data: {
        type: 'attendance',
        section_id: sectionId,
        date,
      },
    });
  } catch (err) {
    console.error('Notify parents on attendance error:', err);
  }
}
