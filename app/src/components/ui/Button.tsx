import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GLASS, RADIUS, SPACING } from '@/lib/utils';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  style,
  textStyle,
  fullWidth,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const sizeStyles = {
    // Compact, website-like sizes (≈32 / 40 / 44px tall).
    sm: { minHeight: 32, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 },
    md: { minHeight: 40, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 12 },
    lg: { minHeight: 44, paddingVertical: 11, paddingHorizontal: 20, borderRadius: 12 },
  }[size];

  const textSizes = { sm: 13, md: 14, lg: 14 }[size];
  const iconSizes = { sm: 15, md: 16, lg: 17 }[size];

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.82}
        style={[fullWidth && styles.fullWidth, style]}>
        <LinearGradient
          colors={
            isDisabled
              ? ['#CBD5E1', '#94A3B8']
              : ['#5B6EE8', '#4B5DD8']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradientBtn, sizeStyles]}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <View style={styles.contentRow}>
              {icon && (
                <Ionicons
                  name={icon}
                  size={iconSizes}
                  color="#FFFFFF"
                  style={styles.iconStyle}
                />
              )}
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  styles.primaryText, styles.labelShrink,
                  { fontSize: textSizes },
                  textStyle,
                ]}>
                {label}
              </Text>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (variant === 'glass') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.78}
        style={[
          styles.glassBtn,
          sizeStyles,
          isDisabled && styles.disabledBtn,
          fullWidth && styles.fullWidth,
          style,
        ]}>
        {loading ? (
          <ActivityIndicator color={COLORS.primary} size="small" />
        ) : (
          <View style={styles.contentRow}>
            {icon && (
              <Ionicons
                name={icon}
                size={iconSizes}
                color={COLORS.primary}
                style={styles.iconStyle}
              />
            )}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[
                styles.glassText, styles.labelShrink,
                { fontSize: textSizes },
                textStyle,
              ]}>
              {label}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  const outlineStyle = variant === 'outline' ? styles.outline : {};
  const ghostStyle = variant === 'ghost' ? styles.ghost : {};
  const dangerStyle = variant === 'danger' ? styles.danger : {};

  const textColor =
    variant === 'outline'
      ? COLORS.primary
      : variant === 'danger'
      ? COLORS.error
      : variant === 'ghost'
      ? COLORS.textMuted
      : COLORS.text;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.baseBtn,
        sizeStyles,
        outlineStyle,
        ghostStyle,
        dangerStyle,
        isDisabled && styles.disabledBtn,
        fullWidth && styles.fullWidth,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon && (
            <Ionicons
              name={icon}
              size={iconSizes}
              color={textColor}
              style={styles.iconStyle}
            />
          )}
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[
              styles.baseText, styles.labelShrink,
              { fontSize: textSizes, color: textColor },
              textStyle,
            ]}>
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Keeps long labels inside the button instead of overflowing it.
  labelShrink: { flexShrink: 1 },
  gradientBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#5B6EE8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  iconStyle: {
    marginRight: 6,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '600',
  },
  glassBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  glassText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  baseBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  baseText: {
    fontWeight: '600',
  },
  outline: {
    borderWidth: 1.5,
    borderColor: '#5B6EE8',
    backgroundColor: '#EEF0FD',
  },
  ghost: {},
  danger: {
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  disabledBtn: {
    opacity: 0.45,
  },
  fullWidth: {
    width: '100%',
  },
});
