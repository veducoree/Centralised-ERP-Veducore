import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { VeducoreLoader } from '@/components/ui/Skeleton';

export default function Index() {
  const { isLoading, isAuthenticated, profile, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const role = profile?.role ?? (user?.user_metadata?.role as string);
    if (!isAuthenticated) {
      router.replace('/login');
    } else if (role === 'teacher') {
      router.replace('/(teacher)/dashboard');
    } else if (role === 'parent') {
      router.replace('/(parent)/dashboard');
    } else {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, profile, user, router]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={['#FFFFFF', '#F8FAFC', '#F1F5F9']}
        style={StyleSheet.absoluteFill}
      />
      <VeducoreLoader size="lg" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  logoImage: {
    width: 240,
    height: 68,
  },
});
