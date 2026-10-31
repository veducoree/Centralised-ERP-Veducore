import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Easing,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { SPACING, RADIUS } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const veducoreLogo = require('../../../assets/veducore-logo.png');

interface SkeletonProps {
  width?: number | `${number}%` | 'auto';
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Smooth animated skeleton block for React Native */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: '#CBD5E1',
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * Dead-centered Veducore logo-fill loader (centered from top, bottom, left, right).
 * Displays the Veducore logo with a muted/unfilled silhouette that smoothly fills up with the brand's actual logo colors.
 * Used where Skeleton UI is not shown.
 */
export function VeducoreLoader({
  size = 'lg',
  style,
}: {
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  // veducore-logo.png is 790x316 (2.5 : 1 aspect ratio)
  const logoWidth = size === 'sm' ? 150 : size === 'md' ? 200 : 240;
  const logoHeight = size === 'sm' ? 60 : size === 'md' ? 80 : 96;

  useEffect(() => {
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1800,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  // 0 -> 0.45: enters from right edge of the logo and fills towards left
  // 0.45 -> 0.55: fully filled in original logo colors
  // 0.55 -> 1: continues moving left and exits on left edge
  const maskLeft = progress.interpolate({
    inputRange: [0, 0.45, 0.55, 1],
    outputRange: [logoWidth * 0.94, 0, 0, 0],
  });
  const maskWidth = progress.interpolate({
    inputRange: [0, 0.45, 0.55, 1],
    outputRange: [0, logoWidth, logoWidth, logoWidth * 0.06],
  });

  const innerTranslateX = Animated.multiply(maskLeft, -1);

  return (
    <View style={[styles.centeredLoaderContainer, style]}>
      <View
        style={[
          styles.logoWrapper,
          { width: logoWidth, height: logoHeight },
        ]}
      >
        {/* Base muted/unfilled Veducore logo silhouette */}
        <Image
          source={veducoreLogo}
          resizeMode="contain"
          style={[
            styles.baseLogo,
            {
              width: logoWidth,
              height: logoHeight,
            },
          ]}
        />

        {/* Animated full-color Veducore logo reveal */}
        <Animated.View
          style={[
            styles.fillMask,
            {
              left: maskLeft,
              width: maskWidth,
              height: logoHeight,
            },
          ]}
        >
          <Animated.Image
            source={veducoreLogo}
            resizeMode="contain"
            style={{
              width: logoWidth,
              height: logoHeight,
              transform: [{ translateX: innerTranslateX }],
            }}
          />
        </Animated.View>
      </View>
    </View>
  );
}

/** Pure Skeleton for Mobile Dashboards (Teacher / Parent) — no spinner overlay */
export function MobileDashboardSkeleton() {
  return (
    <View style={styles.skeletonScreenBody}>
      {/* Hero Welcome Banner Skeleton */}
      <View style={styles.cardSkeleton}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={110} height={14} borderRadius={6} />
            <Skeleton width={180} height={22} borderRadius={7} />
            <Skeleton width={140} height={12} borderRadius={6} />
          </View>
          <Skeleton width={52} height={52} borderRadius={26} />
        </View>
      </View>

      {/* 2x2 Stat Cards Grid Skeleton */}
      <View style={styles.statsGridSkeleton}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.statCardSkeleton}>
            <Skeleton width={38} height={38} borderRadius={12} />
            <Skeleton width="55%" height={20} borderRadius={6} style={{ marginTop: 10 }} />
            <Skeleton width="75%" height={12} borderRadius={5} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* Content Card 1 */}
      <View style={styles.cardSkeleton}>
        <Skeleton width={150} height={16} borderRadius={6} style={{ marginBottom: 14 }} />
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.listRowSkeleton}>
              <Skeleton width={42} height={42} borderRadius={12} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="70%" height={14} borderRadius={6} />
                <Skeleton width="45%" height={11} borderRadius={5} />
              </View>
              <Skeleton width={56} height={24} borderRadius={12} />
            </View>
          ))}
        </View>
      </View>

      {/* Content Card 2 */}
      <View style={styles.cardSkeleton}>
        <Skeleton width={130} height={16} borderRadius={6} style={{ marginBottom: 14 }} />
        <View style={{ gap: 10 }}>
          <Skeleton width="100%" height={14} borderRadius={6} />
          <Skeleton width="85%" height={14} borderRadius={6} />
          <Skeleton width="65%" height={14} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

/** Pure Skeleton for Mobile List / Roster / Attendance / Fees / Records / Remarks screens */
export function MobileListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={styles.skeletonScreenBody}>
      {/* Filter / Search Bar Skeleton */}
      <Skeleton width="100%" height={44} borderRadius={14} />

      {/* Pill Filter Row Skeleton */}
      <View style={styles.pillsRow}>
        <Skeleton width={76} height={32} borderRadius={16} />
        <Skeleton width={88} height={32} borderRadius={16} />
        <Skeleton width={80} height={32} borderRadius={16} />
        <Skeleton width={72} height={32} borderRadius={16} />
      </View>

      {/* List Rows Skeleton */}
      <View style={{ gap: 10 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i} style={styles.cardSkeleton}>
            <View style={styles.listRowSkeleton}>
              <Skeleton width={44} height={44} borderRadius={22} />
              <View style={{ flex: 1, gap: 7 }}>
                <Skeleton width="65%" height={15} borderRadius={6} />
                <Skeleton width="42%" height={12} borderRadius={5} />
              </View>
              <Skeleton width={64} height={26} borderRadius={13} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Inline Skeleton for section/child switching inside an already-rendered screen */
export function MobileInlineSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: 10, paddingVertical: SPACING.sm }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.cardSkeleton}>
          <View style={styles.listRowSkeleton}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="62%" height={14} borderRadius={6} />
              <Skeleton width="40%" height={11} borderRadius={5} />
            </View>
            <Skeleton width={58} height={24} borderRadius={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  centeredLoaderContainer: {
    flex: 1,
    width: '100%',
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoWrapper: {
    position: 'relative',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  baseLogo: {
    tintColor: '#CBD5E1',
    opacity: 0.65,
  },
  fillMask: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  skeletonScreenBody: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: 14,
  },
  cardSkeleton: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg || 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statsGridSkeleton: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCardSkeleton: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg || 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  listRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
