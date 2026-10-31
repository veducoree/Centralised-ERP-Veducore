import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '@/components/layout/Header';
import { fetchNotifications, markNotificationRead } from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileListSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { Notification } from '@/types';

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

const NOTIF_CONFIG: Record<
  Notification['type'],
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  info: { icon: 'information-circle-outline', color: '#2563EB', bg: '#EFF6FF' },
  warning: { icon: 'alert-circle-outline', color: '#D97706', bg: '#FEF3C7' },
  success: { icon: 'checkmark-circle-outline', color: '#059669', bg: '#ECFDF5' },
  error: { icon: 'close-circle-outline', color: '#DC2626', bg: '#FEF2F2' },
};

export default function TeacherNotificationsModal() {
  const { user, profile } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const all = await fetchNotifications(user?.id, profile?.school_id);
      const filtered = all.filter(n => !n.user_id || n.user_id === user?.id);
      const sorted = [...filtered].sort((a, b) => {
        if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setNotifications(sorted);
    } catch (err) {
      console.error('Load notifications error', err);
    }
  }, [user?.id, profile?.school_id]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleMarkRead = async (notif: Notification) => {
    if (notif.is_read) return;
    try {
      await markNotificationRead(notif.id);
      setNotifications(prev =>
        prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n)),
      );
    } catch (err) {
      console.error('Mark read error', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const unread = notifications.filter(n => !n.is_read);
      for (const n of unread) {
        await markNotificationRead(n.id);
      }
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Mark all read error', err);
    }
  };

  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);

  const displayedNotifications = useMemo(() => {
    if (filter === 'unread') return notifications.filter(n => !n.is_read);
    return notifications;
  }, [notifications, filter]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <Header title="Notifications" showBack />
          <MobileListSkeleton rows={5} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <Header title="Notifications" showBack />

        {/* Filter bar */}
        <View style={styles.topSection}>
          <View style={styles.filterPillsRow}>
            <TouchableOpacity
              onPress={() => setFilter('all')}
              activeOpacity={0.8}
              style={[
                styles.filterChip,
                filter === 'all' && styles.filterChipActive,
              ]}>
              <Text
                style={[
                  styles.filterChipText,
                  filter === 'all' && styles.filterChipTextActive,
                ]}>
                All ({notifications.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setFilter('unread')}
              activeOpacity={0.8}
              style={[
                styles.filterChip,
                filter === 'unread' && styles.filterChipActive,
              ]}>
              <Text
                style={[
                  styles.filterChipText,
                  filter === 'unread' && styles.filterChipTextActive,
                ]}>
                Unread ({unreadCount})
              </Text>
            </TouchableOpacity>
          </View>

          {unreadCount > 0 && (
            <TouchableOpacity onPress={handleMarkAllRead} activeOpacity={0.8}>
              <Text style={styles.markAllText}>Mark all as read</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }>

          {displayedNotifications.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="notifications-off-outline"
                title="All caught up!"
                subtitle={filter === 'unread' ? 'You have read all pending notifications.' : 'No school announcements or notifications at this time.'}
              />
            </View>
          ) : (
            displayedNotifications.map(notif => {
              const config = NOTIF_CONFIG[notif.type] ?? NOTIF_CONFIG.info;
              return (
                <TouchableOpacity
                  key={notif.id}
                  onPress={() => handleMarkRead(notif)}
                  activeOpacity={0.85}
                  style={[
                    styles.notifCard,
                    !notif.is_read && styles.notifCardUnread,
                    !notif.is_read && { borderLeftColor: config.color },
                  ]}>
                  {/* Type icon */}
                  <View style={[styles.iconCircle, { backgroundColor: config.bg }]}>
                    <Ionicons name={config.icon} size={20} color={config.color} />
                  </View>

                  {/* Content */}
                  <View style={styles.notifContent}>
                    <View style={styles.notifTitleRow}>
                      <Text style={styles.notifTitle} numberOfLines={1}>
                        {notif.title}
                      </Text>
                      {!notif.is_read && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.notifMessage} numberOfLines={3}>
                      {notif.message}
                    </Text>
                    <View style={styles.notifMeta}>
                      <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
                      {notif.is_read ? (
                        <View style={styles.readRow}>
                          <Ionicons name="checkmark-done" size={13} color={COLORS.textDim} />
                          <Text style={styles.readText}>Read</Text>
                        </View>
                      ) : (
                        <Text style={styles.tapToReadText}>Tap to mark read</Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  emptyWrap: {
    marginTop: 48,
    alignItems: 'center',
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 1,
    ...SHADOW.sm,
  },
  notifCardUnread: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 4,
    borderColor: '#E2E8F0',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifContent: {
    flex: 1,
  },
  notifTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    flexShrink: 0,
  },
  notifMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
  },
  notifMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  notifTime: {
    fontSize: 11,
    color: COLORS.textDim,
  },
  readRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  readText: {
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: '500',
  },
  tapToReadText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
