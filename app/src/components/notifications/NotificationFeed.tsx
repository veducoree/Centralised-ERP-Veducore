import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { fetchMyNotifications, markAllNotificationsRead } from '@/services/api';
import { routeForNotification, setBadgeCount } from '@/lib/notifications';
import { useLiveNotifications } from '@/lib/useLiveNotifications';
import { COLORS, SPACING, RADIUS } from '@/lib/utils';
import type { Notification } from '@/types';

type Role = 'parent' | 'teacher';
type FilterKey = 'all' | 'new' | 'attendance' | 'fee' | 'academic' | 'notice';

const ACADEMIC = ['exam', 'homework', 'remark', 'timetable'];

function groupOf(n: Notification): Exclude<FilterKey, 'all' | 'new'> {
  const c = n.category ?? (n.entity_type === 'attendance' ? 'attendance' : 'general');
  if (c === 'attendance') return 'attendance';
  if (c === 'fee') return 'fee';
  if (ACADEMIC.includes(c)) return 'academic';
  return 'notice';
}

type Style = { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; label: string };

const CATEGORY: Record<string, Style> = {
  attendance: { icon: 'calendar', color: '#D97706', bg: '#FEF3C7', label: 'Attendance' },
  fee: { icon: 'wallet', color: '#059669', bg: '#D1FAE5', label: 'Fees' },
  exam: { icon: 'document-text', color: '#7C3AED', bg: '#EDE9FE', label: 'Exam' },
  homework: { icon: 'book', color: '#0284C7', bg: '#E0F2FE', label: 'Homework' },
  remark: { icon: 'chatbubble-ellipses', color: '#475569', bg: '#E2E8F0', label: 'Remark' },
  holiday: { icon: 'sunny', color: '#0D9488', bg: '#CCFBF1', label: 'Holiday' },
  event: { icon: 'sparkles', color: '#DB2777', bg: '#FCE7F3', label: 'Event' },
  transport: { icon: 'bus', color: '#EA580C', bg: '#FFEDD5', label: 'Transport' },
  timetable: { icon: 'time', color: '#0891B2', bg: '#CFFAFE', label: 'Timetable' },
  emergency: { icon: 'alert-circle', color: '#DC2626', bg: '#FEE2E2', label: 'Urgent' },
  announcement: { icon: 'megaphone', color: '#5B6EE8', bg: '#E0E4FC', label: 'Notice' },
};

const BY_TYPE: Record<string, Style> = {
  success: { icon: 'checkmark-circle', color: '#059669', bg: '#D1FAE5', label: 'Update' },
  error: { icon: 'close-circle', color: '#DC2626', bg: '#FEE2E2', label: 'Alert' },
  warning: { icon: 'warning', color: '#D97706', bg: '#FEF3C7', label: 'Reminder' },
  info: { icon: 'information-circle', color: COLORS.primary, bg: '#E0E4FC', label: 'Info' },
};

function styleFor(n: Notification): Style {
  if (n.priority === 'urgent') return CATEGORY.emergency;
  return (n.category && CATEGORY[n.category]) || BY_TYPE[n.type] || BY_TYPE.info;
}

function timeLabel(ts: string) {
  const d = new Date(ts);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ', ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function dayBucket(ts: string): 'Today' | 'Yesterday' | 'Earlier' {
  const d = new Date(ts);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (d >= start) return 'Today';
  start.setDate(start.getDate() - 1);
  if (d >= start) return 'Yesterday';
  return 'Earlier';
}

/**
 * Shared notification inbox for parent and teacher. Opening it counts as
 * viewing: everything is marked read on the server and the badge clears,
 * while items that were unread stay tagged "New" for this visit.
 */
export function NotificationFeed({ role }: { role: Role }) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchMyNotifications(150);
      const unreadIds = list.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length) {
        setFresh(prev => new Set([...prev, ...unreadIds]));
        markAllNotificationsRead().catch(err => console.warn('Mark all read failed:', err));
      }
      setItems(list.map(n => ({ ...n, is_read: true })));
      setBadgeCount(0);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // New notifications appear on their own — no pull-to-refresh needed.
  useLiveNotifications(load);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filters = useMemo(() => {
    const base: { key: FilterKey; label: string }[] = [{ key: 'all', label: 'All' }];
    if (fresh.size) base.push({ key: 'new', label: `New · ${fresh.size}` });
    if (role === 'parent') {
      base.push(
        { key: 'attendance', label: 'Attendance' },
        { key: 'fee', label: 'Fees' },
        { key: 'academic', label: 'Academics' },
        { key: 'notice', label: 'Notices' },
      );
    }
    return base;
  }, [fresh.size, role]);

  const visible = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'new') return items.filter(n => fresh.has(n.id));
    return items.filter(n => groupOf(n) === filter);
  }, [items, filter, fresh]);

  const sections = useMemo(() => {
    const out: { title: string; data: Notification[] }[] = [];
    for (const n of visible) {
      const title = dayBucket(n.created_at);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(n);
      else out.push({ title, data: [n] });
    }
    return out;
  }, [visible]);

  const onPress = (n: Notification) => {
    const route = routeForNotification(role, { link: n.link, category: n.category });
    const self = `/${role}-modal/notifications`;
    if (route !== self) {
      router.push(route as never);
      return;
    }
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
      return next;
    });
  };

  const summary = fresh.size
    ? `${fresh.size} new notification${fresh.size > 1 ? 's' : ''}`
    : 'You’re all caught up';

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Header title="Notifications" showBack onBackPress={() => router.back()} />

      <View style={styles.topBar}>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryIcon, fresh.size ? styles.summaryIconActive : null]}>
            <Ionicons
              name={fresh.size ? 'notifications' : 'checkmark-done'}
              size={14}
              color={fresh.size ? '#FFFFFF' : COLORS.primary}
            />
          </View>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>

        {filters.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {filters.map(f => {
              const active = filter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  activeOpacity={0.8}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <View style={{ padding: SPACING.md }}>
          <MobileInlineSkeleton rows={5} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={visible.length ? styles.list : styles.emptyScroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }>
          {visible.length === 0 ? (
            <EmptyState
              icon="notifications-off-outline"
              title={filter === 'all' ? 'No notifications yet' : 'Nothing here'}
              subtitle={
                filter === 'all'
                  ? 'School updates and alerts will show up here.'
                  : 'No notifications in this category.'
              }
            />
          ) : (
            sections.map(section => (
              <View key={section.title}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionCard}>
                  {section.data.map((n, i) => {
                    const cfg = styleFor(n);
                    const isNew = fresh.has(n.id);
                    const isOpen = expanded.has(n.id);
                    const urgent = n.priority === 'urgent';
                    return (
                      <TouchableOpacity
                        key={n.id}
                        activeOpacity={0.7}
                        onPress={() => onPress(n)}
                        style={[
                          styles.row,
                          i > 0 && styles.rowDivider,
                          isNew && styles.rowNew,
                        ]}>
                        {urgent && <View style={styles.urgentBar} />}
                        <View style={[styles.iconTile, { backgroundColor: cfg.bg }]}>
                          <Ionicons name={cfg.icon} size={19} color={cfg.color} />
                        </View>

                        <View style={styles.body}>
                          <View style={styles.titleRow}>
                            <Text
                              style={[styles.title, isNew && styles.titleNew]}
                              numberOfLines={isOpen ? undefined : 1}>
                              {n.title}
                            </Text>
                            {isNew && (
                              <View style={styles.newPill}>
                                <Text style={styles.newPillText}>NEW</Text>
                              </View>
                            )}
                          </View>

                          {!!n.message && (
                            <Text style={styles.message} numberOfLines={isOpen ? undefined : 2}>
                              {n.message}
                            </Text>
                          )}

                          <View style={styles.meta}>
                            <Text style={[styles.metaLabel, { color: cfg.color }]}>{cfg.label}</Text>
                            <View style={styles.metaDot} />
                            <Text style={styles.metaTime}>{timeLabel(n.created_at)}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },

  topBar: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EAF3',
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
  },
  summaryIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconActive: { backgroundColor: COLORS.primary },
  summaryText: { fontSize: 13, fontWeight: '600', color: COLORS.text, flexShrink: 1 },

  chips: { gap: 8, paddingHorizontal: SPACING.md },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: '#F1F5F9',
  },
  chipActive: { backgroundColor: COLORS.text },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  chipTextActive: { color: '#FFFFFF' },

  emptyScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  list: { paddingHorizontal: SPACING.md, paddingTop: 4 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textDim,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#5B6EE8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  rowNew: { backgroundColor: '#F7F8FF' },
  urgentBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: '#DC2626',
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: '#334155' },
  titleNew: { fontWeight: '700', color: COLORS.text },
  newPill: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newPillText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  message: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19, marginTop: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  metaLabel: { fontSize: 11, fontWeight: '700' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.textDim, marginHorizontal: 6 },
  metaTime: { fontSize: 11, color: COLORS.textDim, flexShrink: 1 },
});
