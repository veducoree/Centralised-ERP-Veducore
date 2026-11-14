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
    sm: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS.sm },
    md: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: RADIUS.md },
    lg: { paddingVertical: 15, paddingHorizontal: 28, borderRadius: RADIUS.lg },
  }[size];

  const textSizes = { sm: 13, md: 15, lg: 16 }[size];
  const iconSizes = { sm: 16, md: 18, lg: 20 }[size];

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
                style={[
                  styles.primaryText,
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
              style={[
                styles.glassText,
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
            style={[
              styles.baseText,
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
  },
  iconStyle: {
    marginRight: 8,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.3,
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
    fontWeight: '700',
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
