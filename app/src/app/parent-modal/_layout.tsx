import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function ParentModalLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F8FAFC' },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}
