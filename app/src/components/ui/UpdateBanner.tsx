import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import { useOtaUpdates } from '@/lib/useOtaUpdates';

/** Bottom snackbar shown only when a new OTA update is downloaded and ready. */
export function UpdateBanner() {
  const { ready, applying, applyUpdate, dismiss } = useOtaUpdates();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slide, { toValue: ready ? 1 : 0, useNativeDriver: true, friction: 9 }).start();
  }, [ready, slide]);

  if (!ready) return null;

  // Teacher/parent screens have a bottom tab bar; sit just above it.
  const hasTabBar = segments[0] === '(teacher)' || segments[0] === '(parent)';
  const base = insets.bottom > 0 ? insets.bottom : 10;
  const bottom = hasTabBar ? base + 72 : base + 12;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-download-outline" size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>New update available</Text>
          <Text style={styles.sub}>Tap Update to get the latest version.</Text>
        </View>
        <TouchableOpacity
          style={styles.updateBtn}
          onPress={applyUpdate}
          disabled={applying}
          activeOpacity={0.8}
        >
          {applying ? (
            <ActivityIndicator size="small" color="#1E5BD8" />
          ) : (
            <Text style={styles.updateText}>Update</Text>
          )}
        </TouchableOpacity>
        {!applying && (
          <TouchableOpacity onPress={dismiss} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color="#CBD5E1" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#1E5BD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  sub: { color: '#94A3B8', fontSize: 11, marginTop: 1 },
  updateBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    paddingHorizontal: 14,
    height: 32,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateText: { color: '#1E5BD8', fontSize: 13, fontWeight: '700' },
  closeBtn: { padding: 4 },
});
