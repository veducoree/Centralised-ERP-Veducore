import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { getInitials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  color?: string;
}

export function Avatar({ name, uri, size = 40, color }: AvatarProps) {
  const initials = getInitials(name);
  // Website style: light brand background, dark brand initials.
  const bgColor = color ?? '#DFE3FC';
  const textColor = color ? '#FFFFFF' : '#3B4DC8';
  const fontSize = Math.round(size * 0.36);

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
      <Text style={[styles.initials, { fontSize, color: textColor }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: {
    overflow: 'hidden',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '700',
  },
});
