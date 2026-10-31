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
  fetchParentByUserId,
  fetchParentStudents,
  fetchNotifications,
  markNotificationRead,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, formatDate } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { Notification, Parent, ParentStudent } from '@/types';

type FilterType = 'all' | 'attendance' | 'announcements';

export default function ParentNotificationsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load notifications relevant to the logged-in parent
  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Find linked students for this parent
      const parent = await fetchParentByUserId(user.id);
      let linkedStudentIds: string[] = [];
      if (parent) {
        const links = await fetchParentStudents(parent.id);
        linkedStudentIds = links.map(l => l.student_id);
      }

      const allNotifs = await fetchNotifications(user.id, profile?.school_id);

      // Filter notifications belonging to this parent, school-wide (null), or their children
      const userNotifs = allNotifs.filter(n => {
        if (n.user_id === user.id) return true;
        if (n.user_id === null) return true;
        if (n.entity_id && linkedStudentIds.includes(n.entity_id)) return true;
        return false;
      });

      // Sort newest first
      userNotifs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setNotifications(userNotifs);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, profile?.school_id]);

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
      for (const n of notifications) {
        if (!n.is_read) {
          await markNotificationRead(n.id);
        }
      }
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const filteredList = useMemo(() => {
    if (filter === 'attendance') {
      return notifications.filter(
        n => n.entity_type === 'attendance' || n.title.toLowerCase().includes('attendance')
      );
    }
    if (filter === 'announcements') {
      return notifications.filter(
        n => n.entity_type !== 'attendance' && !n.title.toLowerCase().includes('attendance')
      );
    }
    return notifications;
  }, [notifications, filter]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.is_read).length;
  }, [notifications]);

  const getNotifStyle = (notif: Notification) => {
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
      bg: '#EEF2FF',
      border: '#C7D2FE',
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
          {(['all', 'attendance', 'announcements'] as FilterType[]).map(tabKey => {
            const active = filter === tabKey;
            const label = tabKey === 'all' ? 'All Alerts' : tabKey === 'attendance' ? 'Attendance' : 'School Notices';
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
                  ? 'No attendance alerts yet. You will be notified whenever attendance is marked.'
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
                  onPress={() => markAsRead(notif.id)}>
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
                          {notif.entity_type && (
                            <View style={styles.tagPill}>
                              <Text style={styles.tagText}>{notif.entity_type.toUpperCase()}</Text>
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
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
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
    borderColor: '#C7D2FE',
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
    fontWeight: '800',
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
