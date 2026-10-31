import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GLASS, SPACING } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { getInitials } from '@/lib/utils';

interface HeaderProps {
  title: string;
  subtitle?: string;
  logoUrl?: string | null;
  showBack?: boolean;
  onBackPress?: () => void;
  showNotificationBell?: boolean;
  onNotificationPress?: () => void;
  notificationCount?: number;
  showProfile?: boolean;
  onProfilePress?: () => void;
  rightAction?: React.ReactNode;
}

export function Header({
  title,
  subtitle,
  logoUrl,
  showBack,
  onBackPress,
  showNotificationBell = false,
  onNotificationPress,
  notificationCount = 0,
  showProfile = false,
  onProfilePress,
  rightAction,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile, school } = useAuth();

  // Safely compute top status bar insets across Android and iOS notch
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0
  );
  const topPadding = topInset + 6;

  const displayName = profile?.full_name || (user?.user_metadata?.full_name as string) || 'User';
  const effectiveLogoUrl = (logoUrl !== undefined ? logoUrl : school?.logo_url)?.trim() || null;
  const [logoLoadError, setLogoLoadError] = useState(false);

  useEffect(() => {
    setLogoLoadError(false);
  }, [effectiveLogoUrl]);

  const showSchoolLogo = Boolean(effectiveLogoUrl && !logoLoadError);
  const displayTitle = !showBack && school?.name ? school.name : title;
  const isLongTitle = displayTitle.length > 20;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <StatusBar style="dark" />
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity
            onPress={() => {
              if (onBackPress) {
                onBackPress();
              } else if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}
            activeOpacity={0.7}
            style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </TouchableOpacity>
        ) : showSchoolLogo ? (
          <View style={styles.logoWrap}>
            <Image
              source={{ uri: effectiveLogoUrl! }}
              style={styles.headerLogo}
              resizeMode="contain"
              onError={() => setLogoLoadError(true)}
            />
          </View>
        ) : null}

        <View style={styles.titleWrap}>
          <Text
            style={[styles.title, isLongTitle && styles.titleCompact]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            ellipsizeMode="tail">
            {displayTitle}
          </Text>
        </View>

        <View style={styles.rightActions}>
          {showNotificationBell && (
            <TouchableOpacity
              onPress={onNotificationPress}
              style={styles.iconCircleBtn}
              activeOpacity={0.75}>
              <Ionicons name="notifications-outline" size={20} color="#0F172A" />
              {notificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {notificationCount > 9 ? '9+' : String(notificationCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {showProfile && (
            <TouchableOpacity
              onPress={onProfilePress}
              style={styles.avatarBtn}
              activeOpacity={0.75}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>
                  {getInitials(displayName)}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {rightAction}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerLogo: {
    width: 30,
    height: 30,
  },
  titleWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
  },
  schoolName: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
    marginTop: 1,
  },
  titleCompact: {
    fontSize: 13.5,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  avatarBtn: {
    padding: 1,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4F46E5',
  },
});
