import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, SHADOW } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: [string, string];
}

export function StatCard({ title, value, subtitle, icon, gradient }: StatCardProps) {
  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, SHADOW.card]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={24} color="rgba(255,255,255,0.9)" />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flex: 1,
    minWidth: 140,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  value:    { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 2 },
  title:    { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  subtitle: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
});
