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
        <View style={[styles.inner, { padding }]}>{children}</View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle}>
      <View style={[styles.inner, { padding }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { width: '100%', borderRadius: RADIUS.lg, overflow: 'hidden' },
  // Same look as the website's cards: white, 20px radius, soft brand shadow.
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
  },
  shadow: {
    shadowColor: '#5B6EE8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
});
