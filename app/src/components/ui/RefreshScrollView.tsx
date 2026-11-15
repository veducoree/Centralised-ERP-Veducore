/**
 * ScrollView with the app's own animated pull-to-refresh indicator.
 *
 * The platform RefreshControl still handles the gesture (so it feels native),
 * but its spinner is hidden and a clean white bubble with a blue arc is shown:
 *  - iOS: it grows and turns as you pull, then spins while refreshing.
 *  - Android (no overscroll to track): it drops in and spins while refreshing.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated, Easing, Platform, RefreshControl, ScrollViewProps, StyleSheet, View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface Props extends Omit<ScrollViewProps, 'refreshControl'> {
  refreshing: boolean;
  onRefresh: () => void;
  /** Distance from the top of the scroll area where the indicator rests. */
  indicatorTop?: number;
}

const PULL = 90;

export function RefreshScrollView({ refreshing, onRefresh, indicatorTop = 10, style, children, onScroll, ...rest }: Props) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (refreshing) {
      Animated.spring(shown, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
      spin.setValue(0);
      loop.current = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }));
      loop.current.start();
    } else {
      Animated.timing(shown, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
        loop.current?.stop();
        loop.current = null;
      });
    }
  }, [refreshing, shown, spin]);

  // 0 → 1 while pulling down past the top (iOS bounce only).
  const pull = scrollY.interpolate({ inputRange: [-PULL, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const presence = Animated.add(shown, pull).interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const scale = presence.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const translateY = presence.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] });
  // Turns with the pull, then spins continuously while refreshing.
  const rotate = Animated.add(pull.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }), spin)
    .interpolate({ inputRange: [0, 2], outputRange: ['0deg', '720deg'] });

  return (
    <View style={[styles.wrap, style]}>
      <Animated.ScrollView
        {...rest}
        style={styles.fill}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: onScroll as never,
        })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            // Hide the stock spinner; the gesture still works.
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
            progressViewOffset={Platform.OS === 'android' ? -1000 : undefined}
          />
        }>
        {children}
      </Animated.ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[styles.indicatorWrap, { top: indicatorTop, opacity: presence, transform: [{ translateY }, { scale }] }]}>
        <View style={styles.bubble}>
          <Animated.View style={[styles.arcBox, { transform: [{ rotate }] }]}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Circle cx={12} cy={12} r={9} stroke="#E3EAF6" strokeWidth={2.6} fill="none" />
              <Circle
                cx={12} cy={12} r={9}
                stroke="#1E5BD8" strokeWidth={2.6} fill="none" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 9 * 0.3} ${2 * Math.PI * 9}`}
              />
            </Svg>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, flexShrink: 1 },
  fill: { flex: 1 },
  indicatorWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  bubble: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#D9DEE7',
    shadowColor: '#0B1736', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 5,
  },
  arcBox: { width: 22, height: 22 },
});
