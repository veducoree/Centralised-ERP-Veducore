import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/lib/utils';

type BadgeVariant =
  | 'present'
  | 'absent'
  | 'late'
  | 'paid'
  | 'pending'
  | 'overdue'
  | 'active'
  | 'inactive'
  | 'info'
  | 'warning'
  | 'error'
  | 'success';

const BADGE_COLORS: Record<BadgeVariant, { bg: string; border: string; text: string }> = {
  present:  { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
  absent:   { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
  late:     { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  paid:     { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
  pending:  { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  overdue:  { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
  active:   { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
  inactive: { bg: '#F1F5F9', border: '#E2E8F0', text: '#475569' },
  info:     { bg: '#EEF2FF', border: '#C7D2FE', text: '#3730A3' },
  warning:  { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  error:    { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
  success:  { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
};

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
  size?: 'sm' | 'md';
}

export function Badge({ variant, label, size = 'md' }: BadgeProps) {
  const colors = BADGE_COLORS[variant] ?? BADGE_COLORS.info;
  const text = label ?? variant.charAt(0).toUpperCase() + variant.slice(1);
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.bg, borderColor: colors.border },
        size === 'sm' && styles.sm,
      ]}>
      <Text style={[styles.text, { color: colors.text }, size === 'sm' && styles.smText]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  sm: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  smText: {
    fontSize: 10,
  },
});
