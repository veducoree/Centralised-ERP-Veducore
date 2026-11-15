import React, { useRef } from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleSheet,
  View,
  Animated,
  StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'glass';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  /** Text shown next to the spinner while loading (defaults to the label). */
  loadingLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

/** Colours per variant: [idle, pressed] backgrounds, border and text. */
const PALETTE: Record<Exclude<Variant, 'primary'>, { bg: string; bgPressed: string; border: string; borderPressed: string; text: string }> = {
  outline: { bg: '#EEF4FE', bgPressed: '#DCE8FD', border: '#C9DAF8', borderPressed: '#93B4F0', text: '#1E5BD8' },
  glass:   { bg: '#F1F4F8', bgPressed: '#E4E9F0', border: '#E2E7EE', borderPressed: '#CBD3DE', text: '#334155' },
  ghost:   { bg: 'transparent', bgPressed: '#F1F4F8', border: 'transparent', borderPressed: 'transparent', text: '#64748B' },
  danger:  { bg: '#FEF3F2', bgPressed: '#FEE4E2', border: '#FBD0CC', borderPressed: '#F59A92', text: '#D92D20' },
};

const GRADIENT_IDLE = ['#1E5BD8', '#1A4FC4'] as const;
const GRADIENT_PRESSED = ['#1A4FC4', '#143FA3'] as const;
const GRADIENT_DISABLED = ['#CBD5E1', '#94A3B8'] as const;

/** Shrinks slightly while pressed so every button feels responsive. */
function usePressScale(to = 0.965) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }).start();
  return { scale, pressIn, pressOut };
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  loadingLabel,
  disabled,
  style,
  textStyle,
  fullWidth,
}: ButtonProps) {
  const isBlocked = disabled || loading;
  const { scale, pressIn, pressOut } = usePressScale();

  const sizeStyles = {
    sm: { minHeight: 34, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 },
    md: { minHeight: 42, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 12 },
    lg: { minHeight: 50, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14 },
  }[size];
  const textSize = { sm: 13, md: 14, lg: 15 }[size];
  const iconSize = { sm: 15, md: 16, lg: 18 }[size];

  const content = (color: string) => (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={color} size="small" style={styles.icon} />
      ) : icon ? (
        <Ionicons name={icon} size={iconSize} color={color} style={styles.icon} />
      ) : null}
      <Text numberOfLines={1} style={[styles.text, { fontSize: textSize, color }, textStyle]}>
        {loading ? loadingLabel ?? label : label}
      </Text>
    </View>
  );

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && styles.fullWidth, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isBlocked}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!isBlocked, busy: !!loading }}
        style={styles.fill}>
        {({ pressed }) => {
          if (variant === 'primary') {
            // Loading keeps the brand colour (only "disabled" turns grey).
            const colors = disabled && !loading ? GRADIENT_DISABLED : pressed ? GRADIENT_PRESSED : GRADIENT_IDLE;
            return (
              <LinearGradient
                colors={colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.base, styles.primaryShadow, sizeStyles, pressed && styles.primaryShadowPressed, loading && styles.loading]}>
                {content('#FFFFFF')}
              </LinearGradient>
            );
          }
          const p = PALETTE[variant];
          const bordered = variant !== 'ghost';
          return (
            <View
              style={[
                styles.base,
                sizeStyles,
                {
                  backgroundColor: pressed ? p.bgPressed : p.bg,
                  borderColor: pressed ? p.borderPressed : p.border,
                  borderWidth: bordered ? 1 : 0,
                },
                disabled && !loading && styles.disabled,
                loading && styles.loading,
              ]}>
              {content(p.text)}
            </View>
          );
        }}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%' },
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  icon: { marginRight: 7 },
  text: { fontWeight: '700', flexShrink: 1, letterSpacing: 0.1 },
  primaryShadow: {
    shadowColor: '#1A4FC4',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryShadowPressed: { shadowOpacity: 0.12, shadowRadius: 4, elevation: 1 },
  loading: { opacity: 0.92 },
  disabled: { opacity: 0.45 },
  fullWidth: { width: '100%' },
});
