import { useEffect } from 'react';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/context/AuthContext';
import { enableScreens } from 'react-native-screens';
import { setupNotifications } from '@/lib/notifications';

enableScreens(true);

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      (RNStatusBar as any).setTranslucent?.(true);
      (RNStatusBar as any).setBackgroundColor?.('#F8FAFC', false);
      RNStatusBar.setBarStyle('dark-content', false);
    }
    // Initialize notification channels and request device permissions
    setupNotifications();
  }, []);

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#F8FAFC' },
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
