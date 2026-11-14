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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import {
  fetchMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/services/api';
import { routeForNotification, setBadgeCount } from '@/lib/notifications';
import { COLORS, SPACING, RADIUS, SHADOW, formatDate } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { Notification } from '@/types';

type FilterType = 'all' | 'attendance' | 'fee' | 'academic' | 'notice';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'fee', label: 'Fees' },
  { key: 'academic', label: 'Academics' },
  { key: 'notice', label: 'School Notices' },
];

const ACADEMIC = ['exam', 'homework', 'remark', 'timetable'];

function filterGroup(n: Notification): FilterType {
  const c = n.category ?? (n.entity_type === 'attendance' ? 'attendance' : 'general');
  if (c === 'attendance') return 'attendance';
  if (c === 'fee') return 'fee';
  if (ACADEMIC.includes(c)) return 'academic';
  return 'notice';
}

const CATEGORY_STYLE: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; border: string }> = {
  attendance: { icon: 'calendar', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  fee: { icon: 'wallet', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  exam: { icon: 'document-text', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  homework: { icon: 'book', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
  remark: { icon: 'chatbubble-ellipses', color: '#475569', bg: '#F1F5F9', border: '#E2E8F0' },
  holiday: { icon: 'sunny', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
  event: { icon: 'sparkles', color: '#DB2777', bg: '#FDF2F8', border: '#FBCFE8' },
  transport: { icon: 'bus', color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
  timetable: { icon: 'time', color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
  emergency: { icon: 'alert-circle', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  announcement: { icon: 'megaphone', color: '#5B6EE8', bg: '#EEF0FD', border: '#C7CDFB' },
};

export default function ParentNotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // RLS returns exactly what this parent should see: school-wide notices,
  // notices for their children's class/section, and child-specific alerts.
  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const list = await fetchMyNotifications(150);
      setNotifications(list);
      setBadgeCount(list.filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const markAsRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setBadgeCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const filteredList = useMemo(
    () => (filter === 'all' ? notifications : notifications.filter(n => filterGroup(n) === filter)),
    [notifications, filter],
  );

  const openNotification = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id);
    const route = routeForNotification('parent', { link: notif.link, category: notif.category });
    if (route !== '/parent-modal/notifications') router.push(route as never);
  };

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.is_read).length;
  }, [notifications]);

  const getNotifStyle = (notif: Notification) => {
    if (notif.priority === 'urgent') return CATEGORY_STYLE.emergency;
    const byCategory = notif.category ? CATEGORY_STYLE[notif.category] : undefined;
    if (byCategory) return byCategory;
    if (notif.type === 'success' || notif.title.includes('✅')) {
      return {
        icon: 'checkmark-circle' as const,
        color: '#059669',
        bg: '#ECFDF5',
        border: '#A7F3D0',
      };
    }
    if (notif.type === 'error' || notif.title.includes('❌')) {
      return {
        icon: 'close-circle' as const,
        color: '#DC2626',
        bg: '#FEF2F2',
        border: '#FECACA',
      };
    }
    if (notif.type === 'warning' || notif.title.includes('⏰')) {
      return {
        icon: 'warning' as const,
        color: '#D97706',
        bg: '#FFFBEB',
        border: '#FDE68A',
      };
    }
    return {
      icon: 'information-circle' as const,
      color: COLORS.primary,
      bg: '#EEF0FD',
      border: '#C7CDFB',
    };
  };

  const formatNotifTime = (timestamp: string) => {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatDate(timestamp);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Header
          title="Notifications"
          showBack
          onBackPress={() => router.back()}
        />

        {/* Top Action Bar with Unread Summary and Mark All Read */}
        <View style={styles.actionBar}>
          <View style={styles.unreadCountPill}>
            <Ionicons name="notifications" size={14} color={COLORS.primary} style={{ marginRight: 5 }} />
            <Text style={styles.unreadCountText}>
              {unreadCount > 0 ? `${unreadCount} Unread` : 'All caught up'}
            </Text>
          </View>

          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllAsRead} style={styles.markAllBtn}>
              <Ionicons name="checkmark-done" size={15} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips */}
        <View style={styles.filterChipsRow}>
          {FILTERS.map(({ key: tabKey, label }) => {
            const active = filter === tabKey;
            return (
              <TouchableOpacity
                key={tabKey}
                onPress={() => setFilter(tabKey)}
                style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Notifications List */}
        {loading ? (
          <View style={{ paddingHorizontal: SPACING.md }}>
            <MobileInlineSkeleton rows={5} />
          </View>
        ) : filteredList.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyScroll}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
              />
            }>
            <EmptyState
              icon="notifications-off-outline"
              title="No notifications"
              subtitle={
                filter === 'attendance'
                  ? 'No attendance alerts. You will be notified if your child is absent or late.'
                  : 'You have no notifications in this category.'
              }
            />
          </ScrollView>
        ) : (
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
            {filteredList.map(notif => {
              const cfg = getNotifStyle(notif);
              return (
                <TouchableOpacity
                  key={notif.id}
                  activeOpacity={0.8}
                  onPress={() => openNotification(notif)}>
                  <GlassCard
                    style={[
                      styles.notifCard,
                      !notif.is_read && styles.notifCardUnread,
                    ]}
                    padding={SPACING.md}>
                    <View style={styles.notifRow}>
                      <View style={[styles.iconCircle, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                        <Ionicons name={cfg.icon} size={20} color={cfg.color} />
                      </View>

                      <View style={styles.notifBody}>
                        <View style={styles.titleRow}>
                          <Text style={[styles.notifTitle, !notif.is_read && styles.notifTitleUnread]} numberOfLines={1}>
                            {notif.title}
                          </Text>
                          {!notif.is_read && <View style={styles.unreadDot} />}
                        </View>

                        <Text style={styles.notifMessage}>
                          {notif.message}
                        </Text>

                        <View style={styles.metaRow}>
                          <Ionicons name="time-outline" size={12} color={COLORS.textMuted} style={{ marginRight: 4 }} />
                          <Text style={styles.notifTime}>
                            {formatNotifTime(notif.created_at)}
                          </Text>
                          {(notif.category || notif.entity_type) && (
                            <View style={styles.tagPill}>
                              <Text style={styles.tagText}>{(notif.category || notif.entity_type || '').toUpperCase()}</Text>
                            </View>
                          )}
                          {notif.priority === 'urgent' && (
                            <View style={[styles.tagPill, { backgroundColor: '#FEE2E2' }]}>
                              <Text style={[styles.tagText, { color: '#B91C1C' }]}>URGENT</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  content: { flex: 1 },
  centerLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyScroll: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },

  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  unreadCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF0FD',
    borderWidth: 1,
    borderColor: '#C7CDFB',
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  unreadCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },

  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
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

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    gap: 10,
    paddingTop: 4,
  },

  notifCard: {
    borderRadius: RADIUS.lg,
  },
  notifCardUnread: {
    borderColor: '#C7CDFB',
    backgroundColor: '#F8FAFF',
  },
  notifRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  notifBody: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  notifTitleUnread: {
    fontWeight: '700',
    color: COLORS.text,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: 6,
  },
  notifMessage: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 19,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginRight: 10,
  },
  tagPill: {
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
});
