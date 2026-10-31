import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GLASS } from '@/lib/utils';

export interface TabItem {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
}

interface CustomTabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabPress: (name: string) => void;
}

export function CustomTabBar({ tabs, activeTab, onTabPress }: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  // Proper bottom padding: use safe area inset (iPhone home bar) or minimum 10px
  const bottomPad = insets.bottom > 0 ? insets.bottom : 10;

  return (
    <View style={[styles.container, { paddingBottom: bottomPad }]}>
      {tabs.map((tab) => {
        const focused = activeTab === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => onTabPress(tab.name)}
            activeOpacity={0.72}>
            <View style={styles.iconWrap}>
              <Ionicons
                name={focused ? tab.iconFocused : tab.icon}
                size={23}
                color={focused ? '#4F46E5' : '#94A3B8'}
              />
            </View>
            <Text
              style={[styles.label, focused && styles.labelFocused]}
              numberOfLines={1}
              ellipsizeMode="tail">
              {tab.label}
            </Text>
            <View style={styles.dotWrap}>
              <View style={[styles.dot, focused && styles.dotFocused]} />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    position: 'relative',
  },
  iconWrap: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  labelFocused: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  dotWrap: {
    height: 5,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  dotFocused: {
    backgroundColor: '#4F46E5',
  },
});
