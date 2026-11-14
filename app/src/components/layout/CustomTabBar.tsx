import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const bottomPad = insets.bottom > 0 ? insets.bottom : 10;

  return (
    <View style={[styles.container, { paddingBottom: bottomPad }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const focused = activeTab === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => onTabPress(tab.name)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            activeOpacity={0.72}>
            {/* Same active treatment as the website sidebar: tinted pill + brand colour */}
            <View style={[styles.pill, focused && styles.pillFocused]}>
              <Ionicons
                name={focused ? tab.iconFocused : tab.icon}
                size={22}
                color={focused ? '#5B6EE8' : '#94A3B8'}
              />
            </View>
            <Text
              style={[styles.label, focused && styles.labelFocused]}
              numberOfLines={1}
              ellipsizeMode="tail">
              {tab.label}
            </Text>
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
    paddingTop: 8,
    paddingHorizontal: 6,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#5B6EE8',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  pill: {
    width: 52,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  pillFocused: {
    backgroundColor: '#EEF0FD',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  labelFocused: {
    color: '#5B6EE8',
    fontWeight: '700',
  },
});
