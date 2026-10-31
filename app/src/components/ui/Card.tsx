import React from 'react';
import { View, TouchableOpacity, ViewStyle, StyleSheet } from 'react-native';
import { COLORS, SHADOW, RADIUS, SPACING } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  padding?: number;
  noShadow?: boolean;
}

export function Card({ children, style, onPress, padding = SPACING.md, noShadow }: CardProps) {
  const content = (
    <View style={[styles.card, { padding }, noShadow ? {} : SHADOW.card, style]}>
      {children}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
});
