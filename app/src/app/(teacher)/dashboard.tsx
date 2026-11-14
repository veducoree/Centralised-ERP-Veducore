import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useLiveNotifications } from '@/lib/useLiveNotifications';
import { setBadgeCount } from '@/lib/notifications';
import { StatusBar } from 'expo-status-bar';

import {
  fetchTeacherByUserId, fetchTeacherAssignments, fetchTeacherScheduleByTeacher, fetchSubstitutions,
  fetchMyNotifications, fetchMyAttendanceSections, fetchStudentsBySection, fetchAttendance,
  fetchMyStaffAttendance, markMyAttendance, type StaffAttendanceRow,
} from '@/services/api';
import { COLORS, SPACING, RADIUS } from '@/lib/utils';
import { toISODate } from '@/lib/timetable';
import { GlassCard } from '@/components/ui/GlassCard';
import { MobileDashboardSkeleton } from '@/components/ui/Skeleton';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import { useTabNavigation } from '@/context/TabNavigationContext';
import type { Teacher, TeacherSchedule, TimetableSubstitution, Notification } from '@/types';

const hhmm = (t: string | null | undefined) => (t ?? '').slice(0, 5);
const time12 = (t: string | null | undefined) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

interface ClassStatus { sectionId: string; label: string; students: number; marked: number }

export default function TeacherDashboard() {
  const { user, profile, school, refreshProfile } = useAuth();
  const { setActiveTab } = useTabNavigation();
  const router = useRouter();
  const today = toISODate(new Date());
  const weekday = new Date().getDay();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [slots, setSlots] = useState<TeacherSchedule[]>([]);
  const [duties, setDuties] = useState<TimetableSubstitution[]>([]);
  const [notices, setNotices] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  // Opening the inbox counts as viewing everything: clear the badge right away.
  const openInbox = () => {
    setUnread(0);
    setNotices(prev => prev.map(n => ({ ...n, is_read: true })));
    router.push('/teacher-modal/notifications' as never);
  };

  // Keep the bell badge and latest notices live without a manual refresh.
  // While the inbox is open on top, it owns read-state; skip background refreshes.
  const focusedRef = React.useRef(true);
  const refreshNotices = useCallback(async () => {
    if (!focusedRef.current) return;
    try {
      const notifs = await fetchMyNotifications(30);
      setNotices(notifs.slice(0, 3));
      const count = notifs.filter(n => !n.is_read).length;
      setUnread(count);
      setBadgeCount(count);
    } catch { /* offline */ }
  }, []);
  useLiveNotifications(refreshNotices);
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    refreshNotices();
    return () => { focusedRef.current = false; };
  }, [refreshNotices]));
  const [classCount, setClassCount] = useState(0);
  const [myClass, setMyClass] = useState<ClassStatus | null>(null);
  const [me, setMe] = useState<StaffAttendanceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const t = await fetchTeacherByUserId(user.id, user.email || profile?.email);
      if (!t) return;
      setTeacher(t);
      const [assignments, schedule, subs, notifs, mySections, myRows] = await Promise.all([
        fetchTeacherAssignments(t.id),
        fetchTeacherScheduleByTeacher(t.id).catch(() => [] as TeacherSchedule[]),
        fetchSubstitutions({ substituteTeacherId: t.id, from: today, to: today }).catch(() => [] as TimetableSubstitution[]),
        fetchMyNotifications(30).catch(() => [] as Notification[]),
        fetchMyAttendanceSections().catch(() => []),
        fetchMyStaffAttendance(t.id, today, today).catch(() => [] as StaffAttendanceRow[]),
      ]);
      setClassCount(new Set(assignments.map(a => a.section_id)).size);
      setSlots(schedule.filter(s => s.day_of_week === weekday).sort((a, b) => a.start_time.localeCompare(b.start_time)));
      setDuties(subs);
      setNotices(notifs.slice(0, 3));
      setUnread(notifs.filter(n => !n.is_read).length);
      setMe(myRows[0] ?? null);

      const own = mySections.find(s => s.is_class_teacher) ?? null;
      if (own) {
        const [students, att] = await Promise.all([
          fetchStudentsBySection(own.section_id).catch(() => []),
          fetchAttendance({ sectionId: own.section_id, date: today }).catch(() => []),
        ]);
        setMyClass({ sectionId: own.section_id, label: own.label, students: students.length, marked: att.length });
      } else {
        setMyClass(null);
      }
    } catch (err) {
      console.error('Teacher dashboard load error', err);
    }
  }, [user?.id, user?.email, profile?.email, today, weekday]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), refreshProfile()]);
    setRefreshing(false);
  }, [load, refreshProfile]);

  const markPresent = async () => {
    setMarking(true);
    try {
      const r = await markMyAttendance(false);
      setMe(r);
    } catch (e) {
      Alert.alert('Could not mark', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setMarking(false);
    }
  };

  const now = hhmm(new Date().toTimeString());
  const nowSlotId = useMemo(() => slots.find(s => hhmm(s.start_time) <= now && now < hhmm(s.end_time))?.id, [slots, now]);

  const header = (
    <Header
      title={school?.name || ''}
      logoUrl={school?.logo_url ?? null}
      showNotificationBell
      notificationCount={unread}
      onNotificationPress={() => openInbox()}
      showProfile
      onProfilePress={() => router.push('/teacher-modal/profile' as never)}
    />
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        {header}
        <MobileDashboardSkeleton />
      </View>
    );
  }

  const firstName = (teacher?.full_name || profile?.full_name || '').split(' ')[0];
  const quick = [
    { label: 'Attendance', icon: 'checkbox' as const, tint: '#22C08A', bg: '#E6F8F1', onPress: () => setActiveTab('attendance') },
    { label: 'Marks', icon: 'stats-chart' as const, tint: '#5B6EE8', bg: '#EEF0FD', onPress: () => setActiveTab('marks') },
    { label: 'Remarks', icon: 'chatbubble-ellipses' as const, tint: '#F59E0B', bg: '#FEF3E0', onPress: () => router.push('/teacher-modal/remarks' as never) },
    { label: 'Leave', icon: 'calendar-clear' as const, tint: '#EC4899', bg: '#FDE7F3', onPress: () => router.push('/teacher-modal/my-attendance' as never) },
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}>

        {/* Greeting */}
        <View style={styles.hero}>
          <Text style={styles.heroDate}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Text style={styles.heroTitle}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
          <View style={styles.heroChips}>
            <View style={styles.heroChip}><Ionicons name="book" size={13} color="#FFFFFF" /><Text style={styles.heroChipText}>{classCount} classes</Text></View>
            <View style={styles.heroChip}><Ionicons name="time" size={13} color="#FFFFFF" /><Text style={styles.heroChipText}>{slots.length + duties.length} periods today</Text></View>
          </View>
        </View>

        {/* My attendance */}
        <GlassCard padding={SPACING.md} style={styles.card}>
          <View style={styles.rowCenter}>
            <View style={[styles.iconTile, { backgroundColor: me ? '#E6F8F1' : '#FEF3E0' }]}>
              <Ionicons name={me ? 'checkmark-circle' : 'finger-print'} size={22} color={me ? '#22C08A' : '#F59E0B'} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.cardLabel}>My attendance</Text>
              <Text style={styles.cardValue}>
                {me ? `${me.status === 'late' ? 'Late' : me.status === 'leave' ? 'On leave' : me.status === 'half_day' ? 'Half day' : 'Present'}${me.check_in ? ` · ${time12(me.check_in)}` : ''}` : 'Not marked yet'}
              </Text>
            </View>
            {!me ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={markPresent} disabled={marking} activeOpacity={0.85}>
                {marking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Mark present</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => router.push('/teacher-modal/my-attendance' as never)} hitSlop={8}>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
            )}
          </View>
        </GlassCard>

        {/* Class teacher */}
        {myClass && (
          <GlassCard padding={SPACING.md} style={styles.card} onPress={() => setActiveTab('attendance')}>
            <View style={styles.rowCenter}>
              <View style={[styles.iconTile, { backgroundColor: '#EEF0FD' }]}>
                <Ionicons name="people" size={20} color="#5B6EE8" />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.cardLabel}>Class teacher · {myClass.label}</Text>
                <Text style={styles.cardValue}>
                  {myClass.marked === 0 ? "Today's attendance not taken" : myClass.marked < myClass.students ? `${myClass.marked}/${myClass.students} marked` : 'Attendance done'}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: myClass.marked >= myClass.students && myClass.students > 0 ? '#E6F8F1' : '#FEF3E0' }]}>
                <Text style={[styles.statusPillText, { color: myClass.marked >= myClass.students && myClass.students > 0 ? '#15803D' : '#B45309' }]}>
                  {myClass.marked >= myClass.students && myClass.students > 0 ? 'Done' : 'Take now'}
                </Text>
              </View>
            </View>
          </GlassCard>
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

        {/* Today's classes */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Today's classes</Text>
          <TouchableOpacity onPress={() => router.push('/teacher-modal/schedule' as never)} hitSlop={8}>
            <Text style={styles.link}>Timetable</Text>
          </TouchableOpacity>
        </View>
        <GlassCard padding={0} style={styles.card}>
          {slots.length === 0 && duties.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cafe-outline" size={26} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No classes scheduled today</Text>
            </View>
          ) : (
            <>
              {slots.map((s, i) => {
                const live = s.id === nowSlotId;
                return (
                  <View key={s.id} style={[styles.slotRow, i > 0 && styles.divider, live && styles.slotLive]}>
                    <View style={styles.slotTime}>
                      <Text style={[styles.slotStart, live && { color: '#5B6EE8' }]}>{time12(s.start_time)}</Text>
                      <Text style={styles.slotEnd}>{time12(s.end_time)}</Text>
                    </View>
                    <View style={[styles.slotBar, { backgroundColor: live ? '#5B6EE8' : '#E8EAF3' }]} />
                    <View style={styles.flex1}>
                      <Text style={styles.slotSubject}>{s.subject?.name ?? 'Class'}</Text>
                      <Text style={styles.slotMeta}>{s.class?.name}{s.section?.name ? ` - ${s.section.name}` : ''}{s.room_number ? ` · Room ${s.room_number}` : ''}</Text>
                    </View>
                    {live && <View style={styles.livePill}><Text style={styles.livePillText}>NOW</Text></View>}
                  </View>
                );
              })}
              {duties.map((d, i) => (
                <View key={d.id} style={[styles.slotRow, (slots.length > 0 || i > 0) && styles.divider]}>
                  <View style={styles.slotTime}>
                    <Text style={styles.slotStart}>{time12(d.start_time)}</Text>
                    <Text style={styles.slotEnd}>{time12(d.end_time)}</Text>
                  </View>
                  <View style={[styles.slotBar, { backgroundColor: '#F59E0B' }]} />
                  <View style={styles.flex1}>
                    <Text style={styles.slotSubject}>{d.subject?.name ?? 'Substitution'}</Text>
                    <Text style={styles.slotMeta}>{d.class?.name}{d.section?.name ? ` - ${d.section.name}` : ''} · Substitution</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </GlassCard>

        {/* Notices */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Notices</Text>
          <TouchableOpacity onPress={() => openInbox()} hitSlop={8}>
            <Text style={styles.link}>See all</Text>
          </TouchableOpacity>
        </View>
        <GlassCard padding={0} style={styles.card}>
          {notices.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={26} color={COLORS.textLight} />
              <Text style={styles.emptyText}>You're all caught up</Text>
            </View>
          ) : notices.map((n, i) => (
            <TouchableOpacity key={n.id} style={[styles.noticeRow, i > 0 && styles.divider]} activeOpacity={0.7}
              onPress={() => openInbox()}>
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

  hero: { backgroundColor: '#5B6EE8', borderRadius: RADIUS.lg, padding: SPACING.md + 2, marginBottom: SPACING.md },
  heroDate: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 2 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  heroChipText: { flexShrink: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  card: { marginBottom: SPACING.md },
  iconTile: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 12, color: COLORS.textMuted },
  cardValue: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  primaryBtn: { backgroundColor: '#5B6EE8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minWidth: 110, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 12, fontWeight: '700' },

  quickGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  quickItem: { width: '23%', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg, paddingVertical: 14,
    shadowColor: '#5B6EE8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 2 },
  quickIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm, marginTop: 4 },
  sectionTitle: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  link: { fontSize: 13, fontWeight: '600', color: '#5B6EE8' },

  divider: { borderTopWidth: 1, borderTopColor: '#F1F2F8' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.md, paddingVertical: 12 },
  slotLive: { backgroundColor: '#F8F9FF' },
  slotTime: { width: 64 },
  slotStart: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  slotEnd: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },
  slotBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  slotSubject: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  slotMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  livePill: { backgroundColor: '#5B6EE8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  livePillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },

  noticeRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.md, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  noticeTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  noticeBody: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 17 },

  empty: { alignItems: 'center', paddingVertical: SPACING.lg, gap: 6 },
  emptyText: { fontSize: 13, color: COLORS.textMuted },
});
