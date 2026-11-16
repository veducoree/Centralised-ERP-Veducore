import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useLiveNotifications } from '@/lib/useLiveNotifications';
import { setBell } from '@/lib/notificationBell';
import { setBadgeCount } from '@/lib/notifications';
import { StatusBar } from 'expo-status-bar';

import {
  fetchTeacherByUserId, fetchTeacherAssignments, fetchTeacherScheduleByTeacher, fetchSubstitutions,
  fetchMyNotifications, fetchMyAttendanceSections, fetchStudentsBySection, fetchAttendance,
  fetchMyStaffAttendance, markMyAttendance, type StaffAttendanceRow,
  fetchHolidays, fetchSchool,
} from '@/services/api';
import { weeklyOffDays, makeOffDay, type HolidayRow } from '@/lib/holidays';
import { COLORS, SPACING, RADIUS, HERO_GRADIENT } from '@/lib/utils';
import { toISODate } from '@/lib/timetable';
import { GlassCard } from '@/components/ui/GlassCard';
import { MobileDashboardSkeleton } from '@/components/ui/Skeleton';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import { useTabNavigation } from '@/context/TabNavigationContext';
import type { Teacher, TeacherSchedule, TimetableSubstitution, Notification } from '@/types';
import { appAlert } from '@/components/ui/AppDialog';
import { RefreshScrollView } from '@/components/ui/RefreshScrollView';
import { Button } from '@/components/ui/Button';

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
  // Share the bell with every tab's header.
  const openInboxRef = React.useRef(openInbox);
  openInboxRef.current = openInbox;
  useEffect(() => { setBell({ unread }); }, [unread]);
  useEffect(() => {
    setBell({ openInbox: () => openInboxRef.current() });
    return () => setBell({ openInbox: null, unread: 0 });
  }, []);
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
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [offDays, setOffDays] = useState<number[]>(weeklyOffDays(school));

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const t = await fetchTeacherByUserId(user.id, user.email || profile?.email);
      if (!t) return;
      setTeacher(t);
      // Fresh settings so a change to the working week shows up immediately.
      Promise.all([fetchHolidays(t.school_id), fetchSchool(t.school_id, true)])
        .then(([h, sch]) => { setHolidays(h); setOffDays(weeklyOffDays(sch)); })
        .catch(() => {});
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
      appAlert('Could not mark', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setMarking(false);
    }
  };

  const offDay = useMemo(() => makeOffDay(holidays, offDays), [holidays, offDays]);
  const todayOff = offDay(today);
  const upcoming = useMemo(() => {
    const until = toISODate(new Date(Date.now() + 60 * 86400000));
    return holidays
      .filter(h => h.type !== 'working' && h.date > today && h.date <= until)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
  }, [holidays, today]);

  const now = hhmm(new Date().toTimeString());
  const nowSlotId = useMemo(() => slots.find(s => hhmm(s.start_time) <= now && now < hhmm(s.end_time))?.id, [slots, now]);

  const header = (
    <Header
      title={school?.name || ''}
      logoUrl={school?.logo_url ?? null}
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
    { label: 'Marks', icon: 'stats-chart' as const, tint: '#1E5BD8', bg: '#EBF2FE', onPress: () => setActiveTab('marks') },
    { label: 'Remarks', icon: 'chatbubble-ellipses' as const, tint: '#F59E0B', bg: '#FEF3E0', onPress: () => router.push('/teacher-modal/remarks' as never) },
    { label: 'Leave', icon: 'calendar-clear' as const, tint: '#EC4899', bg: '#FDE7F3', onPress: () => router.push('/teacher-modal/my-attendance' as never) },
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {header}
      <RefreshScrollView refreshing={refreshing} onRefresh={onRefresh}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Greeting */}
        <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.heroDate}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Text style={styles.heroTitle}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
          <View style={styles.heroChips}>
            <View style={styles.heroChip}><Ionicons name="book" size={13} color="#FFFFFF" /><Text style={styles.heroChipText}>{classCount} classes</Text></View>
            {todayOff ? (
              <View style={[styles.heroChip, styles.heroChipHoliday]}><Ionicons name="sunny" size={13} color="#FDE68A" /><Text style={styles.heroChipText}>Holiday today</Text></View>
            ) : (
              <View style={styles.heroChip}><Ionicons name="time" size={13} color="#FFFFFF" /><Text style={styles.heroChipText}>{slots.length + duties.length} periods today</Text></View>
            )}
          </View>
        </LinearGradient>

        {/* Holiday today */}
        {todayOff && (
          <View style={styles.holidayCard}>
            <View style={styles.holidayIcon}><Ionicons name="sunny" size={22} color="#B45309" /></View>
            <View style={styles.flex1}>
              <Text style={styles.holidayTitle}>
                {['Sunday', 'Saturday'].includes(todayOff) ? `${todayOff} — weekly off` : todayOff}
              </Text>
              <Text style={styles.holidaySub}>School is closed today. No attendance or classes.</Text>
            </View>
          </View>
        )}

        {/* My attendance */}
        {!todayOff && (
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
              <Button label="Mark present" size="sm" loading={marking} loadingLabel="Marking…" onPress={markPresent} />
            ) : (
              <TouchableOpacity onPress={() => router.push('/teacher-modal/my-attendance' as never)} hitSlop={8}>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
            )}
          </View>
        </GlassCard>
        )}

        {/* Class teacher */}
        {myClass && !todayOff && (
          <GlassCard padding={SPACING.md} style={styles.card} onPress={() => setActiveTab('attendance')}>
            <View style={styles.rowCenter}>
              <View style={[styles.iconTile, { backgroundColor: '#EBF2FE' }]}>
                <Ionicons name="people" size={20} color="#1E5BD8" />
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
              <Ionicons name={todayOff ? 'sunny-outline' : 'cafe-outline'} size={26} color={COLORS.textLight} />
              <Text style={styles.emptyText}>{todayOff ? 'Holiday — no classes today' : 'No classes scheduled today'}</Text>
            </View>
          ) : (
            <>
              {slots.map((s, i) => {
                const live = s.id === nowSlotId;
                return (
                  <View key={s.id} style={[styles.slotRow, i > 0 && styles.divider, live && styles.slotLive]}>
                    <View style={styles.slotTime}>
                      <Text style={[styles.slotStart, live && { color: '#1E5BD8' }]}>{time12(s.start_time)}</Text>
                      <Text style={styles.slotEnd}>{time12(s.end_time)}</Text>
                    </View>
                    <View style={[styles.slotBar, { backgroundColor: live ? '#1E5BD8' : '#E5E9F0' }]} />
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

        {/* Upcoming holidays */}
        {upcoming.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Upcoming holidays</Text>
            </View>
            <GlassCard padding={0} style={styles.card}>
              {upcoming.map((h, i) => {
                const d = new Date(`${h.date}T00:00:00`);
                const days = Math.round((d.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
                return (
                  <View key={h.date} style={[styles.holRow, i > 0 && styles.divider]}>
                    <View style={[styles.holDate, h.type === 'festival' && styles.holDateFest]}>
                      <Text style={[styles.holDay, h.type === 'festival' && { color: '#B45309' }]}>{d.getDate()}</Text>
                      <Text style={[styles.holMon, h.type === 'festival' && { color: '#B45309' }]}>{d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</Text>
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.slotSubject}>{h.label || (h.type === 'festival' ? 'Festival' : 'Holiday')}</Text>
                      <Text style={styles.slotMeta}>{d.toLocaleDateString('en-IN', { weekday: 'long' })}</Text>
                    </View>
                    <Text style={styles.holIn}>{days === 1 ? 'Tomorrow' : `in ${days} days`}</Text>
                  </View>
                );
              })}
            </GlassCard>
          </>
        )}

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
              <View style={[styles.dot, { backgroundColor: n.is_read ? 'transparent' : '#1E5BD8' }]} />
              <View style={styles.flex1}>
                <Text style={styles.noticeTitle} numberOfLines={1}>{n.title}</Text>
                <Text style={styles.noticeBody} numberOfLines={2}>{n.message}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </GlassCard>

        <View style={{ height: SPACING.xl }} />
      </RefreshScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  flex1: { flex: 1, minWidth: 0 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  hero: { borderRadius: RADIUS.lg + 4, overflow: 'hidden', padding: SPACING.md + 2, marginBottom: SPACING.md },
  heroDate: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 2 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  heroChipText: { flexShrink: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  card: { marginBottom: SPACING.md },
  iconTile: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 12, color: COLORS.textMuted },
  cardValue: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 12, fontWeight: '700' },

  quickGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  quickItem: { width: '23%', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg, paddingVertical: 14,
    shadowColor: '#1E5BD8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 2 },
  quickIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm, marginTop: 4 },
  sectionTitle: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  link: { fontSize: 13, fontWeight: '600', color: '#1E5BD8' },

  divider: { borderTopWidth: 1, borderTopColor: '#F1F4F8' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.md, paddingVertical: 12 },
  slotLive: { backgroundColor: '#F7F9FC' },
  slotTime: { width: 64 },
  slotStart: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  slotEnd: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },
  slotBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  slotSubject: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  slotMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  heroChipHoliday: { backgroundColor: 'rgba(253,230,138,0.22)' },
  holidayCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, marginBottom: SPACING.md,
    borderRadius: RADIUS.lg, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
  },
  holidayIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  holidayTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  holidaySub: { fontSize: 12.5, color: '#B45309', marginTop: 2 },
  holRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.md, paddingVertical: 12 },
  holDate: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  holDateFest: { backgroundColor: '#FFFBEB' },
  holDay: { fontSize: 16, fontWeight: '800', color: '#C53030', lineHeight: 18 },
  holMon: { fontSize: 9.5, fontWeight: '800', color: '#C53030', letterSpacing: 0.5 },
  holIn: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  livePill: { backgroundColor: '#1E5BD8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  livePillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },

  noticeRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.md, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  noticeTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  noticeBody: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 17 },

  empty: { alignItems: 'center', paddingVertical: SPACING.lg, gap: 6 },
  emptyText: { fontSize: 13, color: COLORS.textMuted },
});
