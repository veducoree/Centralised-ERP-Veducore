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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import {
  fetchSchool,
  fetchTeacherByUserId,
  fetchTeacherAssignments,
  fetchRemarks,
  fetchNotifications,
  fetchStudents,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, formatDate } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { MobileDashboardSkeleton } from '@/components/ui/Skeleton';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import { useTabNavigation } from '@/context/TabNavigationContext';
import type {
  School,
  Teacher,
  ClassAssignment,
  Remark,
  Notification,
} from '@/types';

interface AssignmentItem extends ClassAssignment {
  className?: string;
  sectionName?: string;
  subjectName?: string;
  studentCount?: number;
}

interface RemarkItem extends Remark {
  studentName?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const REMARK_CATEGORY_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  academic: { bg: '#F0F9FF', color: '#0369A1', border: '#BAE6FD' },
  behaviour: { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' },
  attendance: { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
  performance: { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' },
  general: { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
};

const CYCLE_DAYS = [
  { day: 1, label: 'Mon', code: 'Day 1' },
  { day: 2, label: 'Tue', code: 'Day 2' },
  { day: 3, label: 'Wed', code: 'Day 3' },
  { day: 4, label: 'Thu', code: 'Day 4' },
  { day: 5, label: 'Fri', code: 'Day 5' },
  { day: 6, label: 'Sat', code: 'Day 6' },
  { day: 0, label: 'Sun', code: 'Holiday' },
];

export default function TeacherDashboard() {
  const { user, profile, school: authSchool, refreshProfile } = useAuth();
  const { setActiveTab } = useTabNavigation();
  const router = useRouter();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [school, setSchool] = useState<School | null>(authSchool);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [recentRemarks, setRecentRemarks] = useState<RemarkItem[]>([]);
  const [announcements, setAnnouncements] = useState<Notification[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [remarksTotal, setRemarksTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (authSchool) {
      setSchool(authSchool);
    }
  }, [authSchool]);

  // Day Order & Working Day calculation
  const today = new Date();
  const dayOfWeekIndex = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const isSunday = dayOfWeekIndex === 0;
  const isHoliday = isSunday;
  const dayOrderNumber = isHoliday ? null : dayOfWeekIndex; // Day 1 to Day 6
  const weekDayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDateFormatted = today.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const loadData = useCallback(async (forceRefresh = false) => {
    if (!user?.id) return;
    try {
      const foundTeacher = await fetchTeacherByUserId(user.id, user.email || profile?.email);
      const schoolIdToFetch = foundTeacher?.school_id || profile?.school_id;
      if (!foundTeacher) {
        if (schoolIdToFetch) {
          const fallbackSchool = await fetchSchool(schoolIdToFetch, forceRefresh).catch(() => null);
          if (fallbackSchool) setSchool(fallbackSchool);
        }
        return;
      }
      setTeacher(foundTeacher);

      const [classAssignments, remarks, notifications, students, fetchedSchool] = await Promise.all([
        fetchTeacherAssignments(foundTeacher.id),
        fetchRemarks({ teacherId: foundTeacher.id }),
        fetchNotifications(user.id, foundTeacher.school_id),
        fetchStudents(foundTeacher.school_id),
        fetchSchool(foundTeacher.school_id, forceRefresh).catch(() => null),
      ]);

      if (fetchedSchool) {
        setSchool(fetchedSchool);
      }

      // Assignments with details
      const assignmentItems: AssignmentItem[] = classAssignments.map(ca => ({
        ...ca,
        className: (ca as any).class?.name ?? '',
        sectionName: (ca as any).section?.name ?? '',
        subjectName: (ca as any).subject?.name ?? 'General',
        studentCount: students.filter(st => st.section_id === ca.section_id).length,
      }));
      setAssignments(assignmentItems);

      const sectionIds = [...new Set(classAssignments.map(ca => ca.section_id))];
      setStudentCount(students.filter(st => sectionIds.includes(st.section_id)).length);

      // Remarks
      const sortedRemarks = [...remarks].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setRemarksTotal(remarks.length);
      const remarkItems: RemarkItem[] = sortedRemarks.slice(0, 4).map(r => ({
        ...r,
        studentName: (r as any).student?.full_name ?? 'Student',
      }));
      setRecentRemarks(remarkItems);

      // Announcements / Notifications
      setAnnouncements(notifications.slice(0, 3));
      setUnreadNotifs(notifications.filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Teacher dashboard load error', err);
    }
  }, [user?.id, user?.email, profile?.email, profile?.school_id]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(true), refreshProfile()]);
    setRefreshing(false);
  }, [loadData, refreshProfile]);

  const inchargeAssignment = useMemo(() => {
    return assignments.find(
      a => a.is_class_teacher || a.subject_id === null || !(a as any).subject_id
    );
  }, [assignments]);

  const activeSchool = school || authSchool;
  const headerSchoolName = activeSchool?.name || '';
  const headerLogoUrl = activeSchool?.logo_url ?? null;

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.content}>
          <Header
            title={headerSchoolName}
            logoUrl={headerLogoUrl}
            showNotificationBell
            notificationCount={unreadNotifs}
            onNotificationPress={() => router.push('/teacher-modal/notifications' as never)}
            showProfile
            onProfilePress={() => router.push('/teacher-modal/profile' as never)}
          />
          <MobileDashboardSkeleton />
        </View>
      </View>
    );
  }

  const teacherName = teacher?.full_name ?? (user as any)?.user_metadata?.full_name ?? 'Teacher';

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Header
          title={headerSchoolName}
          logoUrl={headerLogoUrl}
          showNotificationBell
          notificationCount={unreadNotifs}
          onNotificationPress={() => router.push('/teacher-modal/notifications' as never)}
          showProfile
          onProfilePress={() => router.push('/teacher-modal/profile' as never)}
        />

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

          {/* Hero Welcome Banner */}
          <GlassCard style={styles.welcomeCard} padding={SPACING.md}>
            <View style={styles.welcomeRow}>
              <View style={styles.welcomeTextBlock}>
                <Text style={styles.welcomeGreeting}>{getGreeting()},</Text>
                <Text style={styles.welcomeName}>{teacherName} 👋</Text>
                <Text style={styles.welcomeSub}>
                  {weekDayName} · {fullDateFormatted}
                </Text>
              </View>
              <View style={styles.welcomeIconCircle}>
                <Ionicons name="school-outline" size={26} color={COLORS.primary} />
              </View>
            </View>

            <View style={styles.welcomeDivider} />

            {/* 3 Main Stat Metrics */}
            <View style={styles.welcomeStatsRow}>
              <View style={styles.welcomeStat}>
                <Text style={styles.welcomeStatVal}>{studentCount}</Text>
                <Text style={styles.welcomeStatLabel}>Assigned Students</Text>
              </View>
              <View style={styles.welcomeStatDivider} />
              <View style={styles.welcomeStat}>
                <Text style={[styles.welcomeStatVal, { color: COLORS.primary }]}>{assignments.length}</Text>
                <Text style={styles.welcomeStatLabel}>Assigned Classes</Text>
              </View>
              <View style={styles.welcomeStatDivider} />
              <View style={styles.welcomeStat}>
                <Text style={styles.welcomeStatVal}>{remarksTotal}</Text>
                <Text style={styles.welcomeStatLabel}>My Remarks</Text>
              </View>
            </View>
          </GlassCard>

          {/* Day Order & Working / Holiday Status Card */}
          <GlassCard style={styles.dayOrderCard} padding={SPACING.md}>
            <View style={styles.dayOrderHeader}>
              <View style={styles.dayOrderInfoBlock}>
                <View style={styles.statusPillsRow}>
                  <View style={[
                    styles.workingBadge,
                    isHoliday ? styles.holidayBadge : styles.workingDayBadge,
                  ]}>
                    <View style={[
                      styles.statusDot,
                      isHoliday ? styles.holidayDot : styles.workingDayDot,
                    ]} />
                    <Text style={[
                      styles.workingBadgeText,
                      isHoliday ? styles.holidayBadgeText : styles.workingDayBadgeText,
                    ]}>
                      {isHoliday ? 'Holiday / Off' : 'Working Day'}
                    </Text>
                  </View>

                  <View style={styles.timingPill}>
                    <Ionicons name="time-outline" size={12} color="#64748B" />
                    <Text style={styles.timingPillText}>08:00 AM – 02:30 PM</Text>
                  </View>
                </View>

                <Text style={styles.dayOrderTitle}>
                  {isHoliday ? 'Weekly Off · Holiday' : `Day Order: Day ${dayOrderNumber}`}
                </Text>
                <Text style={styles.dayOrderDesc}>
                  {isHoliday
                    ? 'No scheduled classes today. Staff prep & planning day.'
                    : `Academic timetable operating on Day ${dayOrderNumber} schedule.`}
                </Text>
              </View>

              <View style={[styles.dayOrderPillBadge, isHoliday && styles.dayOrderPillHoliday]}>
                <Text style={[styles.dayOrderPillNum, isHoliday && styles.dayOrderPillHolidayNum]}>
                  {isHoliday ? 'OFF' : `D${dayOrderNumber}`}
                </Text>
                <Text style={styles.dayOrderPillSub}>
                  {isHoliday ? 'Sunday' : 'Cycle'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.timetableLink}
              onPress={() => router.push('/teacher-modal/schedule' as never)}
              activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
              <Text style={styles.timetableLinkText}>My Timetable & Substitution Duties</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.timetableLink}
              onPress={() => router.push('/teacher-modal/my-attendance' as never)}
              activeOpacity={0.8}>
              <Ionicons name="finger-print-outline" size={16} color={COLORS.primary} />
              <Text style={styles.timetableLinkText}>My Attendance & Leave</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>

            {/* 7-Day Cycle Strip */}
            <View style={styles.cycleStrip}>
              {CYCLE_DAYS.map(item => {
                const isCurrent = item.day === dayOfWeekIndex;
                const isItemSun = item.day === 0;

                return (
                  <View
                    key={item.label}
                    style={[
                      styles.cycleDayItem,
                      isCurrent && (isItemSun ? styles.cycleDayActiveHoliday : styles.cycleDayActive),
                    ]}>
                    <Text
                      style={[
                        styles.cycleDayName,
                        isCurrent && (isItemSun ? styles.cycleDayActiveText : styles.cycleDayActiveText),
                      ]}>
                      {item.label}
                    </Text>
                    <Text
                      style={[
                        styles.cycleDayCode,
                        isCurrent && (isItemSun ? styles.cycleDayActiveSub : styles.cycleDayActiveSub),
                      ]}>
                      {item.code}
                    </Text>
                  </View>
                );
              })}
            </View>
          </GlassCard>

          {/* Daily Attendance Priority Action Card */}
          <GlassCard style={styles.attendanceActionCard} padding={SPACING.md}>
            <View style={styles.attendanceActionRow}>
              <View style={styles.attendanceIconBox}>
                <Ionicons name="checkmark-done-circle" size={26} color="#059669" />
              </View>
              <View style={styles.attendanceActionText}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.attendanceActionTitle}>Daily Attendance</Text>
                  {inchargeAssignment && (
                    <Badge variant="success" label="Incharge" size="sm" />
                  )}
                </View>
                <Text style={styles.attendanceActionSub}>
                  {inchargeAssignment
                    ? `Class Incharge for ${inchargeAssignment.className} – ${inchargeAssignment.sectionName}`
                    : `Record attendance roll-call for assigned classes`}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.markAttendanceBtn}
              onPress={() => setActiveTab('attendance')}
              activeOpacity={0.82}>
              <Ionicons name="checkbox-outline" size={18} color="#FFFFFF" />
              <Text style={styles.markAttendanceBtnText}>
                {inchargeAssignment ? 'Mark Incharge Attendance ›' : 'Take Attendance ›'}
              </Text>
            </TouchableOpacity>
          </GlassCard>

          {/* My Assigned Classes */}
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.sectionTitle}>My Assigned Classes</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{assignments.length}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setActiveTab('my-classes')}>
              <Text style={styles.viewAllLink}>View All ›</Text>
            </TouchableOpacity>
          </View>

          {assignments.length === 0 ? (
            <GlassCard style={styles.emptyCard} padding={SPACING.md}>
              <EmptyState icon="book-outline" title="No classes assigned" />
            </GlassCard>
          ) : (
            <GlassCard padding={0} style={styles.assignCard}>
              {assignments.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setActiveTab('my-classes')}
                  activeOpacity={0.75}
                  style={[
                    styles.assignItem,
                    index < assignments.length - 1 && styles.divider,
                  ]}>
                  <View style={styles.assignIconCircle}>
                    <Ionicons name="book-outline" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.assignDetails}>
                    <Text style={styles.assignClass}>
                      {item.className} – Section {item.sectionName}
                    </Text>
                    <Text style={styles.assignSub}>{item.subjectName}</Text>
                  </View>
                  <View style={styles.assignCount}>
                    <Ionicons name="people-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.assignCountText}>{item.studentCount} students</Text>
                  </View>
                  {item.is_class_teacher && (
                    <Badge variant="success" label="Incharge" size="sm" />
                  )}
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
                </TouchableOpacity>
              ))}
            </GlassCard>
          )}

          {/* Exam Marks & Student Record Direct Actions */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Examinations & Records</Text>
          </View>
          <View style={styles.dualActionsRow}>
            <TouchableOpacity
              style={styles.dualActionCard}
              onPress={() => setActiveTab('marks')}
              activeOpacity={0.8}>
              <View style={[styles.dualActionIcon, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="stats-chart" size={20} color="#4F46E5" />
              </View>
              <Text style={styles.dualActionTitle}>Enter Marks</Text>
              <Text style={styles.dualActionSub}>Record unit test & terminal marks</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dualActionCard}
              onPress={() => setActiveTab('students')}
              activeOpacity={0.8}>
              <View style={[styles.dualActionIcon, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="people" size={20} color="#16A34A" />
              </View>
              <Text style={styles.dualActionTitle}>Student Dossiers</Text>
              <Text style={styles.dualActionSub}>Enrolment, profiles & admissions</Text>
            </TouchableOpacity>
          </View>

          {/* Recent Student Remarks */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Remarks</Text>
            <TouchableOpacity onPress={() => router.push('/teacher-modal/remarks' as never)}>
              <Text style={styles.viewAllLink}>Add / View ({remarksTotal}) ›</Text>
            </TouchableOpacity>
          </View>
          {recentRemarks.length === 0 ? (
            <GlassCard style={styles.emptyCard} padding={SPACING.md}>
              <EmptyState icon="chatbubble-outline" title="No remarks added yet" />
            </GlassCard>
          ) : (
            <View style={styles.remarksList}>
              {recentRemarks.map(item => {
                const catTheme = REMARK_CATEGORY_STYLES[item.category] || REMARK_CATEGORY_STYLES.general;
                return (
                  <GlassCard key={item.id} padding={SPACING.md} style={styles.remarkCard}>
                    <View style={styles.remarkHeader}>
                      <Text style={styles.remarkStudent} numberOfLines={1}>
                        {item.studentName}
                      </Text>
                      <View style={[styles.remarkCatBadge, { backgroundColor: catTheme.bg, borderColor: catTheme.border }]}>
                        <Text style={[styles.remarkCatText, { color: catTheme.color }]}>
                          {item.category.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.remarkText} numberOfLines={2}>
                      {item.remark}
                    </Text>
                    <Text style={styles.remarkDate}>{formatDate(item.created_at)}</Text>
                  </GlassCard>
                );
              })}
            </View>
          )}

          {/* School Announcements & Circulars */}
          {announcements.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>School Notice Board</Text>
                <TouchableOpacity onPress={() => router.push('/teacher-modal/notifications' as never)}>
                  <Text style={styles.viewAllLink}>All Notices ›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.noticesList}>
                {announcements.map(item => (
                  <GlassCard key={item.id} padding={SPACING.md} style={styles.noticeCard}>
                    <View style={styles.noticeRow}>
                      <View style={styles.noticeIconCircle}>
                        <Ionicons name="megaphone-outline" size={18} color="#2563EB" />
                      </View>
                      <View style={styles.noticeContent}>
                        <Text style={styles.noticeTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.noticeMsg} numberOfLines={2}>{item.message}</Text>
                        <Text style={styles.noticeDate}>{formatDate(item.created_at)}</Text>
                      </View>
                    </View>
                  </GlassCard>
                ))}
              </View>
            </>
          )}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timetableLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  timetableLinkText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  container: { flex: 1, backgroundColor: COLORS.canvas },
  centerContainer: { flex: 1, backgroundColor: COLORS.canvas, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },

  welcomeCard: {
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm + 4,
  },
  welcomeRow: { flexDirection: 'row', alignItems: 'center' },
  welcomeTextBlock: { flex: 1 },
  welcomeGreeting: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  welcomeName: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginTop: 2 },
  welcomeSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  welcomeIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeDivider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: SPACING.sm + 2 },
  welcomeStatsRow: { flexDirection: 'row', alignItems: 'center' },
  welcomeStat: { flex: 1, alignItems: 'center' },
  welcomeStatVal: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  welcomeStatLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, textAlign: 'center', fontWeight: '500' },
  welcomeStatDivider: { width: 1, height: 28, backgroundColor: COLORS.borderLight },

  // Day Order & Working Status Card
  dayOrderCard: {
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm + 4,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  dayOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dayOrderInfoBlock: {
    flex: 1,
    paddingRight: 10,
  },
  statusPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  workingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: 5,
  },
  workingDayBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  holidayBadge: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  workingDayDot: {
    backgroundColor: '#059669',
  },
  holidayDot: {
    backgroundColor: '#E11D48',
  },
  workingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  workingDayBadgeText: {
    color: '#065F46',
  },
  holidayBadgeText: {
    color: '#9F1239',
  },
  timingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    gap: 4,
  },
  timingPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  dayOrderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  dayOrderDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  dayOrderPillBadge: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOrderPillHoliday: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  dayOrderPillNum: {
    fontSize: 18,
    fontWeight: '900',
    color: '#4F46E5',
    letterSpacing: -0.5,
  },
  dayOrderPillHolidayNum: {
    color: '#E11D48',
  },
  dayOrderPillSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },

  cycleStrip: {
    flexDirection: 'row',
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cycleDayItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  cycleDayActive: {
    backgroundColor: '#4F46E5',
  },
  cycleDayActiveHoliday: {
    backgroundColor: '#E11D48',
  },
  cycleDayName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  cycleDayCode: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 1,
  },
  cycleDayActiveText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  cycleDayActiveSub: {
    color: '#E0E7FF',
    fontWeight: '700',
  },

  // Attendance Priority Card
  attendanceActionCard: {
    borderRadius: RADIUS.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    marginBottom: SPACING.sm + 4,
    ...SHADOW.sm,
  },
  attendanceActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  attendanceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceActionText: {
    flex: 1,
  },
  attendanceActionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  attendanceActionSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  markAttendanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    gap: 6,
    ...SHADOW.sm,
  },
  markAttendanceBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // Dual Action Cards
  dualActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: SPACING.xs,
  },
  dualActionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    ...SHADOW.sm,
  },
  dualActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dualActionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  dualActionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs + 4,
    marginTop: SPACING.md,
  },
  viewAllLink: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  countPill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  countPillText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  remarksList: { gap: 8 },
  remarkCard: { borderRadius: RADIUS.lg },
  remarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  remarkStudent: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },
  remarkCatBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.sm, borderWidth: 1 },
  remarkCatText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  remarkText: { fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
  remarkDate: { fontSize: 11, color: COLORS.textLight, marginTop: 4 },

  assignCard: { borderRadius: RADIUS.lg },
  assignItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  assignIconCircle: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignDetails: { flex: 1 },
  assignClass: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  assignSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  assignCount: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 6 },
  assignCountText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },

  noticesList: { gap: 8 },
  noticeCard: { borderRadius: RADIUS.lg },
  noticeRow: { flexDirection: 'row', gap: 12 },
  noticeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeContent: { flex: 1 },
  noticeTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  noticeMsg: { fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 16 },
  noticeDate: { fontSize: 10, color: '#94A3B8', marginTop: 4 },

  divider: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  emptyCard: { minHeight: 100, justifyContent: 'center' },
});
