import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
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

function TabButton({ tab, focused, onPress }: { tab: TabItem; focused: boolean; onPress: () => void }) {
  // Active icon grows slightly (spring) and turns brand colour; no background box.
  const scale = useRef(new Animated.Value(focused ? 1.18 : 1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1.18 : 1,
      friction: 5,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      activeOpacity={0.7}>
      <Animated.View style={[styles.iconWrap, { transform: [{ scale }] }]}>
        <Ionicons
          name={focused ? tab.iconFocused : tab.icon}
          size={23}
          color={focused ? '#1E5BD8' : '#94A3B8'}
        />
      </Animated.View>
      <Text style={[styles.label, focused && styles.labelFocused]} numberOfLines={1} ellipsizeMode="tail">
        {tab.label}
      </Text>
    </TouchableOpacity>
  );
}

// Live height of the bottom tab bar (0 when none is shown), so overlays like
// the update sheet can sit right on top of it.
let tabBarHeight = 0;
const tabBarListeners = new Set<() => void>();
function setTabBarHeight(h: number) {
  if (h === tabBarHeight) return;
  tabBarHeight = h;
  tabBarListeners.forEach((l) => l());
}
export function useTabBarHeight(): number {
  return useSyncExternalStore(
    (l) => { tabBarListeners.add(l); return () => { tabBarListeners.delete(l); }; },
    () => tabBarHeight,
  );
}

export function CustomTabBar({ tabs, activeTab, onTabPress }: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom > 0 ? insets.bottom : 10;
  useEffect(() => () => setTabBarHeight(0), []);

  return (
    <View
      style={[styles.container, { paddingBottom: bottomPad }]}
      accessibilityRole="tablist"
      onLayout={(e) => setTabBarHeight(Math.round(e.nativeEvent.layout.height))}
    >
      {tabs.map((tab) => (
        <TabButton key={tab.name} tab={tab} focused={activeTab === tab.name} onPress={() => onTabPress(tab.name)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingTop: 10,
    paddingHorizontal: 6,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#1E5BD8',
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
  iconWrap: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  labelFocused: {
    color: '#1E5BD8',
    fontWeight: '700',
  },
});
