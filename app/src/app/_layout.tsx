import { useEffect } from 'react';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { enableScreens } from 'react-native-screens';
import { setupNotifications, registerPushToken, onNotificationTap, routeForNotification } from '@/lib/notifications';

enableScreens(true);

/** Registers the device for push once signed in and routes notification taps. */
function PushBridge() {
  const router = useRouter();
  const { user, profile, isAuthenticated } = useAuth();
  const role = profile?.role === 'teacher' || profile?.role === 'parent' ? profile.role : null;

  useEffect(() => {
    if (isAuthenticated && user?.id && role) {
      registerPushToken(user.id, profile?.school_id ?? null);
    }
  }, [isAuthenticated, user?.id, role, profile?.school_id]);

  useEffect(() => {
    if (!isAuthenticated || !role) return;
    return onNotificationTap((data) => {
      const route = routeForNotification(role, {
        link: (data.link as string | undefined) ?? null,
        category: (data.category as string | undefined) ?? null,
      });
      router.push(route as never);
    });
  }, [isAuthenticated, role, router]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      (RNStatusBar as any).setTranslucent?.(true);
      (RNStatusBar as any).setBackgroundColor?.('#F4F5FB', false);
      RNStatusBar.setBarStyle('dark-content', false);
    }
    // Initialize notification channels and request device permissions
    setupNotifications();
  }, []);

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#F4F5FB' }}>
      <AuthProvider>
        <PushBridge />
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#F4F5FB' },
            animation: 'fade',
          }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(teacher)" />
          <Stack.Screen name="(parent)" />
          <Stack.Screen
            name="teacher-modal"
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="parent-modal"
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
