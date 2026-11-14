import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import {
  fetchParentByUserId, fetchParentStudents, fetchMyNotifications, fetchAttendance, fetchFees,
  fetchStudentRecords, fetchRemarks,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, formatCurrency } from '@/lib/utils';
import { toISODate } from '@/lib/timetable';
import { Avatar } from '@/components/ui/Avatar';
import { GlassCard } from '@/components/ui/GlassCard';
import { MobileDashboardSkeleton, MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import { useTabNavigation } from '@/context/TabNavigationContext';
import type { Student, Notification, Remark, StudentRecord, Attendance } from '@/types';

interface ChildStats {
  attendancePct: number | null;
  todayStatus: Attendance['status'] | null;
  feesDue: number;
  nextDue: string | null;
  overdue: boolean;
  lastResult: { label: string; pct: number } | null;
  lastRemark: Remark | null;
}

const TODAY_STYLE: Record<string, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  present: { label: 'Present today', color: '#15803D', bg: '#E6F8F1', icon: 'checkmark-circle' },
  medical: { label: 'Medical leave (ML)', color: '#6D28D9', bg: '#F5F3FF', icon: 'medkit' },
  late: { label: 'Arrived late', color: '#B45309', bg: '#FEF3E0', icon: 'time' },
  absent: { label: 'Absent today', color: '#C53030', bg: '#FEECEC', icon: 'close-circle' },
};

const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function ParentDashboard() {
  const { user, school } = useAuth();
  const { setActiveTab } = useTabNavigation();
  const router = useRouter();
  const today = toISODate(new Date());

  const [children, setChildren] = useState<Student[]>([]);
  const [selected, setSelected] = useState(0);
  const [stats, setStats] = useState<ChildStats | null>(null);
  const [notices, setNotices] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadBase = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [parent, notifs] = await Promise.all([
        fetchParentByUserId(user.id),
        fetchMyNotifications(30).catch(() => [] as Notification[]),
      ]);
      setNotices(notifs.slice(0, 3));
      setUnread(notifs.filter(n => !n.is_read).length);
      if (!parent) return;
      const links = await fetchParentStudents(parent.id);
      setChildren(links.map(l => l.student).filter(Boolean) as Student[]);
    } catch (err) {
      console.error('Parent dashboard load error', err);
    }
  }, [user?.id]);

  const child = children[selected] ?? null;

  const loadStats = useCallback(async (c: Student) => {
    setStatsLoading(true);
    try {
      const [attendance, fees, records, remarks] = await Promise.all([
        fetchAttendance({ studentId: c.id }).catch(() => [] as Attendance[]),
        fetchFees({ studentId: c.id }).catch(() => []),
        fetchStudentRecords({ studentId: c.id }).catch(() => [] as StudentRecord[]),
        fetchRemarks({ studentId: c.id }).catch(() => [] as Remark[]),
      ]);
      // Present, late and medical (ML) all count as attended.
      const attended = attendance.filter(a => a.status === 'present' || a.status === 'late' || a.status === 'medical').length;
      const pending = fees.filter(f => f.status !== 'paid' && Number(f.amount) > Number(f.paid_amount));
      const due = pending.reduce((s, f) => s + (Number(f.amount) - Number(f.paid_amount)), 0);
      const nextDue = pending.map(f => f.due_date).sort()[0] ?? null;

      // Latest exam: group marks by exam name, most recent first.
      const byExam = new Map<string, { marks: number; max: number; date: string }>();
      records.forEach(r => {
        const e = byExam.get(r.exam_name) ?? { marks: 0, max: 0, date: r.date };
        e.marks += Number(r.marks); e.max += Number(r.max_marks); if (r.date > e.date) e.date = r.date;
        byExam.set(r.exam_name, e);
      });
      const latest = [...byExam.entries()].sort((a, b) => b[1].date.localeCompare(a[1].date))[0];

      const visible = remarks.filter(r => r.visibility !== 'staff_only')
        .sort((a, b) => b.created_at.localeCompare(a.created_at));

      setStats({
        attendancePct: attendance.length ? Math.round((attended / attendance.length) * 100) : null,
        todayStatus: attendance.find(a => a.attendance_date === today)?.status ?? null,
        feesDue: due,
        nextDue,
        overdue: !!nextDue && nextDue < today,
        lastResult: latest && latest[1].max > 0 ? { label: latest[0], pct: Math.round((latest[1].marks / latest[1].max) * 100) } : null,
        lastRemark: visible[0] ?? null,
      });
    } catch (err) {
      console.error('Parent stats load error', err);
    } finally {
      setStatsLoading(false);
    }
  }, [today]);

  useEffect(() => { loadBase().finally(() => setLoading(false)); }, [loadBase]);
  useEffect(() => { if (child) loadStats(child); }, [child, loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBase();
    if (child) await loadStats(child);
    setRefreshing(false);
  }, [loadBase, loadStats, child]);

  const header = (
    <Header
      title={school?.name || 'School'}
      showNotificationBell
      notificationCount={unread}
      onNotificationPress={() => router.push('/parent-modal/notifications' as never)}
      showProfile
      onProfilePress={() => router.push('/parent-modal/profile' as never)}
    />
  );

  const quick = useMemo(() => [
    { label: 'Timetable', icon: 'calendar' as const, tint: '#5B6EE8', bg: '#EEF0FD', onPress: () => router.push('/parent-modal/timetable' as never) },
    { label: 'Remarks', icon: 'chatbubble-ellipses' as const, tint: '#F59E0B', bg: '#FEF3E0', onPress: () => setActiveTab('remarks') },
    { label: 'Transport', icon: 'bus' as const, tint: '#06B6D4', bg: '#E0F7FB', onPress: () => setActiveTab('transport') },
    { label: 'Notices', icon: 'notifications' as const, tint: '#EC4899', bg: '#FDE7F3', onPress: () => router.push('/parent-modal/notifications' as never) },
  ], [router, setActiveTab]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        {header}
        <MobileDashboardSkeleton />
      </View>
    );
  }

  const today_ = stats?.todayStatus ? TODAY_STYLE[stats.todayStatus] : null;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}>

        {children.length === 0 ? (
          <GlassCard padding={SPACING.lg} style={styles.card}>
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={30} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No child is linked to your account yet. Please contact the school office.</Text>
            </View>
          </GlassCard>
        ) : (
          <>
            {/* Child switcher */}
            {children.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcher}>
                {children.map((c, i) => (
                  <TouchableOpacity key={c.id} onPress={() => setSelected(i)} activeOpacity={0.8}
                    style={[styles.switchChip, i === selected && styles.switchChipActive]}
                    accessibilityRole="button" accessibilityState={{ selected: i === selected }}>
                    <Text style={[styles.switchText, i === selected && styles.switchTextActive]}>{c.full_name.split(' ')[0]}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Child hero */}
            {child && (
              <View style={styles.hero}>
                <View style={styles.rowCenter}>
                  <Avatar name={child.full_name} uri={child.avatar_url ?? undefined} size={52} />
                  <View style={styles.flex1}>
                    <Text style={styles.heroName} numberOfLines={1}>{child.full_name}</Text>
                    <Text style={styles.heroMeta}>
                      {child.class?.name ?? 'Class'}{child.section?.name ? ` - ${child.section.name}` : ''}
                      {child.roll_number ? ` · Roll ${child.roll_number}` : ''}
                    </Text>
                  </View>
                </View>
                <View style={[styles.todayPill, { backgroundColor: today_ ? '#FFFFFF' : 'rgba(255,255,255,0.18)' }]}>
                  <Ionicons name={today_?.icon ?? 'ellipse-outline'} size={14} color={today_?.color ?? '#FFFFFF'} />
                  <Text style={[styles.todayText, { color: today_?.color ?? '#FFFFFF' }]}>{today_?.label ?? "Today's attendance not marked yet"}</Text>
                </View>
              </View>
            )}

            {/* Stats */}
            {statsLoading && !stats ? <MobileInlineSkeleton rows={2} /> : (
              <View style={styles.statRow}>
                <TouchableOpacity style={styles.stat} onPress={() => setActiveTab('attendance')} activeOpacity={0.8}>
                  <Text style={styles.statLabel}>Attendance</Text>
                  <Text style={[styles.statValue, stats?.attendancePct != null && stats.attendancePct < 75 && { color: '#DC2626' }]}>
                    {stats?.attendancePct != null ? `${stats.attendancePct}%` : '—'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.stat} onPress={() => setActiveTab('fees')} activeOpacity={0.8}>
                  <Text style={styles.statLabel}>Fees due</Text>
                  <Text style={[styles.statValue, (stats?.feesDue ?? 0) > 0 && { color: stats?.overdue ? '#DC2626' : '#B45309' }]} numberOfLines={1} adjustsFontSizeToFit>
                    {(stats?.feesDue ?? 0) > 0 ? formatCurrency(stats!.feesDue) : 'Nil'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.stat} onPress={() => setActiveTab('records')} activeOpacity={0.8}>
                  <Text style={styles.statLabel}>Last result</Text>
                  <Text style={styles.statValue}>{stats?.lastResult ? `${stats.lastResult.pct}%` : '—'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Fee alert */}
            {stats && stats.feesDue > 0 && (
              <TouchableOpacity activeOpacity={0.85} onPress={() => setActiveTab('fees')}
                style={[styles.alert, { backgroundColor: stats.overdue ? '#FEECEC' : '#FEF3E0' }]}>
                <Ionicons name="wallet" size={18} color={stats.overdue ? '#C53030' : '#B45309'} />
                <Text style={[styles.alertText, { color: stats.overdue ? '#C53030' : '#B45309' }]}>
                  {formatCurrency(stats.feesDue)} {stats.overdue ? `overdue since ${fmtDate(stats.nextDue!)}` : `due by ${fmtDate(stats.nextDue!)}`}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={stats.overdue ? '#C53030' : '#B45309'} />
              </TouchableOpacity>
            )}

            {/* Quick actions */}
            <View style={styles.quickGrid}>
              {quick.map(q => (
                <TouchableOpacity key={q.label} style={styles.quickItem} onPress={q.onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={q.label}>
                  <View style={[styles.quickIcon, { backgroundColor: q.bg }]}>
                    <Ionicons name={q.icon} size={22} color={q.tint} />
                  </View>
                  <Text style={styles.quickLabel}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Latest remark */}
            {stats?.lastRemark && (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Latest remark</Text>
                  <TouchableOpacity onPress={() => setActiveTab('remarks')} hitSlop={8}><Text style={styles.link}>All remarks</Text></TouchableOpacity>
                </View>
                <GlassCard padding={SPACING.md} style={styles.card}>
                  <Text style={styles.remarkText} numberOfLines={3}>"{stats.lastRemark.remark}"</Text>
                  <Text style={styles.remarkMeta}>
                    {(stats.lastRemark as Remark & { teacher?: { full_name?: string } }).teacher?.full_name ?? 'Teacher'} · {new Date(stats.lastRemark.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </Text>
                </GlassCard>
              </>
            )}
          </>
        )}

        {/* Notices */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Notices</Text>
          <TouchableOpacity onPress={() => router.push('/parent-modal/notifications' as never)} hitSlop={8}><Text style={styles.link}>See all</Text></TouchableOpacity>
        </View>
        <GlassCard padding={0} style={styles.card}>
          {notices.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={26} color={COLORS.textLight} />
              <Text style={styles.emptyText}>You're all caught up</Text>
            </View>
          ) : notices.map((n, i) => (
            <TouchableOpacity key={n.id} style={[styles.noticeRow, i > 0 && styles.divider]} activeOpacity={0.7}
              onPress={() => router.push('/parent-modal/notifications' as never)}>
              <View style={[styles.dot, { backgroundColor: n.is_read ? 'transparent' : '#5B6EE8' }]} />
              <View style={styles.flex1}>
                <Text style={styles.noticeTitle} numberOfLines={1}>{n.title}</Text>
                <Text style={styles.noticeBody} numberOfLines={2}>{n.message}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </GlassCard>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  flex1: { flex: 1, minWidth: 0 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  switcher: { gap: 8, paddingBottom: SPACING.sm + 4 },
  switchChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFFFFF' },
  switchChipActive: { backgroundColor: '#5B6EE8' },
  switchText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  switchTextActive: { color: '#FFFFFF' },

  hero: { backgroundColor: '#5B6EE8', borderRadius: RADIUS.lg, padding: SPACING.md + 2, marginBottom: SPACING.md },
  heroName: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  heroMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  todayPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 14 },
  todayText: { flexShrink: 1, fontSize: 12, fontWeight: '700' },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.md },
  stat: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg, paddingVertical: 14, paddingHorizontal: 12,
    shadowColor: '#5B6EE8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 2 },
  statLabel: { fontSize: 12, color: COLORS.textMuted },
  statValue: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 4 },

  alert: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: SPACING.md },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600' },

  card: { marginBottom: SPACING.md },
  quickGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  quickItem: { width: '23%', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg, paddingVertical: 14,
    shadowColor: '#5B6EE8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 2 },
  quickIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm, marginTop: 4 },
  sectionTitle: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  link: { fontSize: 13, fontWeight: '600', color: '#5B6EE8' },

  remarkText: { fontSize: 14, color: COLORS.text, lineHeight: 20, fontStyle: 'italic' },
  remarkMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 8 },

  divider: { borderTopWidth: 1, borderTopColor: '#F1F2F8' },
  noticeRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.md, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  noticeTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  noticeBody: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 17 },

  empty: { alignItems: 'center', paddingVertical: SPACING.lg, gap: 8, paddingHorizontal: SPACING.md },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
});
