import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS, getInitials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  color?: string;
}

export function Avatar({ name, uri, size = 40, color }: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = color ?? COLORS.primary;
  const fontSize = size * 0.38;

  if (uri) {
    return (
      <View style={[styles.avatarWrap, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.avatarWrap,
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
        },
      ]}>
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
