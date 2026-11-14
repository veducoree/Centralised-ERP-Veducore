import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function ParentModalLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F4F5FB' },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}
