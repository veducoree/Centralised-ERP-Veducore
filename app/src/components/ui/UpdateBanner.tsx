import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSegments } from 'expo-router';
import { useOtaUpdates } from '@/lib/useOtaUpdates';
import { useTabBarHeight } from '@/components/layout/CustomTabBar';

/**
 * Bottom sheet shown only when a new OTA update is downloaded and ready.
 * It is attached to the bottom edge (or sits right on top of the tab bar on
 * teacher/parent screens) and slides up — no floating pop-up.
 */
export function UpdateBanner() {
  const { ready, applying, applyUpdate, dismiss } = useOtaUpdates();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const tabBarHeight = useTabBarHeight();
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(ready);
  const [height, setHeight] = useState(140);

  useEffect(() => {
    if (ready) setMounted(true);
    Animated.timing(slide, {
      toValue: ready ? 1 : 0,
      duration: ready ? 320 : 220,
      easing: ready ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !ready) setMounted(false);
    });
  }, [ready, slide]);

  if (!mounted) return null;

  // Teacher/parent screens have a bottom tab bar; sit right on top of it.
  const onTabs = (segments[0] === '(teacher)' || segments[0] === '(parent)') && tabBarHeight > 0;
  const bottom = onTabs ? tabBarHeight : 0;
  const padBottom = onTabs ? 14 : Math.max(insets.bottom, 12) + 4;

  return (
    <Animated.View
      pointerEvents="box-none"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={[
        styles.sheet,
        {
          bottom,
          paddingBottom: padBottom,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [height + bottom, 0] }) }],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel="New update available"
    >
      <View style={styles.handle} />

      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="sparkles" size={20} color="#1E5BD8" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>New update available</Text>
          <Text style={styles.sub}>Get the latest features and fixes. Takes a few seconds.</Text>
        </View>
        {!applying && (
          <Pressable onPress={dismiss} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Later">
            <Ionicons name="close" size={18} color="#94A3B8" />
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={applyUpdate}
        disabled={applying}
        style={({ pressed }) => [styles.btnWrap, pressed && { transform: [{ scale: 0.98 }] }]}
        accessibilityRole="button"
        accessibilityLabel="Update now"
      >
        <LinearGradient
          colors={['#1E5BD8', '#1A4FC4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          {applying ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.btnText}>Updating…</Text>
            </>
          ) : (
            <>
              <Ionicons name="arrow-up-circle" size={18} color="#FFFFFF" />
              <Text style={styles.btnText}>Update now</Text>
            </>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 8,
    shadowColor: '#1E5BD8',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EEF4FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  sub: { color: '#64748B', fontSize: 12, marginTop: 2, lineHeight: 16 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F5F7FA',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  btnWrap: { marginTop: 14, borderRadius: 14, overflow: 'hidden' },
  btn: {
    height: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
