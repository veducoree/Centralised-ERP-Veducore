import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Animated, Easing } from 'react-native';
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
import { RefreshScrollView } from '@/components/ui/RefreshScrollView';

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
  attendance:   { icon: 'calendar-outline',            color: '#B7791F', bg: '#FBF3E4', label: 'Attendance' },
  fee:          { icon: 'wallet-outline',              color: '#0E8F6E', bg: '#E7F5EF', label: 'Fees' },
  exam:         { icon: 'document-text-outline',       color: '#2F55C8', bg: '#ECF1FC', label: 'Exam' },
  homework:     { icon: 'book-outline',                color: '#0B7CB8', bg: '#E7F3FA', label: 'Homework' },
  remark:       { icon: 'chatbubble-ellipses-outline', color: '#475569', bg: '#EEF1F5', label: 'Remark' },
  holiday:      { icon: 'sunny-outline',               color: '#0F8A7E', bg: '#E6F4F2', label: 'Holiday' },
  event:        { icon: 'sparkles-outline',            color: '#B8456B', bg: '#FAEEF2', label: 'Event' },
  transport:    { icon: 'bus-outline',                 color: '#C2611A', bg: '#FBF0E6', label: 'Transport' },
  timetable:    { icon: 'time-outline',                color: '#0E7490', bg: '#E6F3F6', label: 'Timetable' },
  emergency:    { icon: 'alert-circle-outline',        color: '#C53030', bg: '#FDECEC', label: 'Urgent' },
  announcement: { icon: 'megaphone-outline',           color: '#1E5BD8', bg: '#EBF2FE', label: 'Notice' },
};

const BY_TYPE: Record<string, Style> = {
  success: { icon: 'checkmark-circle-outline',   color: '#0E8F6E', bg: '#E7F5EF', label: 'Update' },
  error:   { icon: 'close-circle-outline',       color: '#C53030', bg: '#FDECEC', label: 'Alert' },
  warning: { icon: 'warning-outline',            color: '#B7791F', bg: '#FBF3E4', label: 'Reminder' },
  info:    { icon: 'information-circle-outline', color: '#1E5BD8', bg: '#EBF2FE', label: 'Info' },
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
    if (route !== `/${role}-modal/notifications`) {
      router.push(route as never);
      return;
    }
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
      return next;
    });
  };

  const unread = fresh.size;
  const self = `/${role}-modal/notifications`;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Header title="Notifications" showBack onBackPress={() => router.back()} />

      <View style={styles.topBar}>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryTitle}>{unread ? `${unread} unread` : 'All caught up'}</Text>
            <Text style={styles.summarySub}>
              {items.length ? `${items.length} update${items.length > 1 ? 's' : ''} from school` : 'Updates from school appear here'}
            </Text>
          </View>
          <View style={styles.livePill}>
            <LiveDot />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>

        {filters.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {filters.map(f => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && !active && styles.chipPressed]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                </Pressable>
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
        <RefreshScrollView refreshing={refreshing} onRefresh={onRefresh}
          contentContainerStyle={visible.length ? styles.list : styles.emptyScroll}
          showsVerticalScrollIndicator={false}>
          {visible.length === 0 ? (
            <EmptyState
              icon="notifications-off-outline"
              title={filter === 'all' ? 'No notifications yet' : 'Nothing here'}
              subtitle={filter === 'all' ? 'School updates and alerts will show up here.' : 'No notifications in this category.'}
            />
          ) : (
            sections.map((section, si) => (
              <FadeIn key={section.title} delay={si * 60}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.group}>
                  {section.data.map((n, i) => {
                    const route = routeForNotification(role, { link: n.link, category: n.category });
                    return (
                      <NotificationRow
                        key={n.id}
                        n={n}
                        cfg={styleFor(n)}
                        first={i === 0}
                        isNew={fresh.has(n.id)}
                        isOpen={expanded.has(n.id)}
                        opensScreen={route !== self}
                        onPress={() => onPress(n)}
                      />
                    );
                  })}
                </View>
              </FadeIn>
            ))
          )}
          <View style={{ height: 40 }} />
        </RefreshScrollView>
      )}
    </View>
  );
}

function FadeIn({ delay, children }: { delay: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

function LiveDot() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveHalo, {
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
      }]} />
      <View style={styles.liveDot} />
    </View>
  );
}

function NotificationRow({ n, cfg, first, isNew, isOpen, opensScreen, onPress }: {
  n: Notification; cfg: Style; first: boolean; isNew: boolean; isOpen: boolean; opensScreen: boolean; onPress: () => void;
}) {
  const urgent = n.priority === 'urgent';
  const long = (n.message?.length ?? 0) > 110;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {!first && <View style={styles.divider} />}
      <View style={[styles.iconTile, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={19} color={cfg.color} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, isNew && styles.titleNew]} numberOfLines={isOpen ? undefined : 2}>{n.title}</Text>
          <View style={styles.timeWrap}>
            {isNew && <View style={styles.unreadDot} />}
            <Text style={[styles.time, isNew && styles.timeNew]}>{timeLabel(n.created_at)}</Text>
          </View>
        </View>

        {!!n.message && (
          <Text style={styles.message} numberOfLines={isOpen ? undefined : 2}>{n.message}</Text>
        )}

        <View style={styles.meta}>
          <View style={[styles.metaDot, { backgroundColor: cfg.color }]} />
          <Text style={styles.metaLabel}>{cfg.label}</Text>
          {urgent && <Text style={styles.urgent}>  ·  Urgent</Text>}
          <View style={{ flex: 1 }} />
          {opensScreen ? (
            <Ionicons name="chevron-forward" size={15} color={COLORS.textDim} />
          ) : long ? (
            <Text style={styles.more}>{isOpen ? 'Show less' : 'Show more'}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const INK = '#0B1736';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },

  topBar: {
    backgroundColor: '#FFFFFF', paddingTop: 14, paddingBottom: 12, gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D9DEE7',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md },
  summaryTitle: { fontSize: 20, fontWeight: '800', color: INK, letterSpacing: -0.4 },
  summarySub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: RADIUS.full, backgroundColor: '#F1F5F4', borderWidth: 1, borderColor: '#DDEBE5',
  },
  liveText: { fontSize: 11.5, fontWeight: '700', color: '#0E7A5A' },
  liveDotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  liveHalo: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981' },

  chips: { gap: 8, paddingHorizontal: SPACING.md },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE1EA',
  },
  chipActive: { backgroundColor: INK, borderColor: INK },
  chipPressed: { backgroundColor: '#F3F5F9' },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#475569' },
  chipTextActive: { color: '#FFFFFF' },

  emptyScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  list: { paddingHorizontal: SPACING.md, paddingTop: 4 },

  sectionTitle: {
    fontSize: 11.5, fontWeight: '700', color: COLORS.textDim, letterSpacing: 1,
    textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginLeft: 4,
  },
  group: {
    backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#D9DEE7',
    shadowColor: INK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowPressed: { backgroundColor: '#F6F8FB' },
  divider: { position: 'absolute', top: 0, left: 66, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#E3E7EE' },
  iconTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1, fontSize: 14.5, fontWeight: '600', color: '#334155', lineHeight: 20 },
  titleNew: { fontWeight: '700', color: INK },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.primary },
  time: { fontSize: 11.5, color: COLORS.textDim, fontWeight: '500' },
  timeNew: { color: COLORS.primary, fontWeight: '700' },
  message: { fontSize: 13.5, color: '#5B6678', lineHeight: 19.5, marginTop: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 9 },
  metaDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  metaLabel: { fontSize: 11.5, fontWeight: '600', color: '#64748B' },
  urgent: { fontSize: 11.5, fontWeight: '800', color: '#C53030' },
  more: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
});
