import React from 'react';
import { View, TouchableOpacity, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padding?: number;
  noShadow?: boolean;
}

export function GlassCard({
  children,
  style,
  onPress,
  padding = SPACING.md,
  noShadow,
}: GlassCardProps) {
  const cardStyle = [styles.card, !noShadow && styles.shadow, style];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        activeOpacity={0.75}>
        <View style={{ padding, width: '100%' }}>{children}</View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle}>
      <View style={{ padding, width: '100%' }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  shadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
});
