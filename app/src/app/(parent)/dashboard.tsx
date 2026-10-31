import React, { useEffect, useState, useCallback } from 'react';
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

import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchNotifications,
  fetchAttendance,
  fetchFees,
  fetchStudentRecords,
  fetchRemarks,
  fetchSchoolTransportData,
} from '@/services/api';
import {
  SPACING,
  RADIUS,
  formatDate,
  formatCurrency,
} from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { MobileDashboardSkeleton, MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import { useTabNavigation } from '@/context/TabNavigationContext';
import type {
  Student,
  Fee,
  StudentRecord,
  Remark,
  StudentTransportAssignment,
} from '@/types';

interface ChildInfo {
  student: Student;
  className: string;
  sectionName: string;
}

interface ChildStats {
  attendanceRate: number;
  presentCount: number;
  pendingFees: number;
  recordsCount: number;
  remarksCount: number;
  recentRecord: StudentRecord | null;
  recentRemark: Remark | null;
  fees: Fee[];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function ParentDashboard() {
  const { user, profile, school } = useAuth();
  const { setActiveTab } = useTabNavigation();
  const router = useRouter();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [stats, setStats] = useState<ChildStats | null>(null);
  const [transportAssignments, setTransportAssignments] = useState<
    Record<string, StudentTransportAssignment>
  >({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadUnreadNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const parent = await fetchParentByUserId(user.id);
      let linkedStudentIds: string[] = [];
      if (parent) {
        const links = await fetchParentStudents(parent.id);
        linkedStudentIds = links.map((l) => l.student_id);
      }
      const allNotifs = await fetchNotifications(user.id, profile?.school_id);
      const unread = allNotifs.filter((n) => {
        if (n.is_read) return false;
        if (n.user_id === user.id) return true;
        if (n.user_id === null) return true;
        if (n.entity_id && linkedStudentIds.includes(n.entity_id)) return true;
        return false;
      });
      setUnreadCount(unread.length);
    } catch (err) {
      console.error('Failed to load unread count:', err);
    }
  }, [user?.id, profile?.school_id]);

  const loadChildren = useCallback(async () => {
    if (!user?.id) return;
    try {
      const parent = await fetchParentByUserId(user.id);
      if (!parent) return;

      const links = await fetchParentStudents(parent.id);
      const childInfos: ChildInfo[] = links.map((link) => {
        const student = link.student;
        return {
          student,
          className: student?.class?.name ?? 'Class',
          sectionName: student?.section?.name ?? '',
        };
      });

      setChildren(childInfos);

      const schoolId = profile?.school_id || childInfos[0]?.student?.school_id;
      if (schoolId) {
        const tData = await fetchSchoolTransportData(schoolId);
        setTransportAssignments(tData.assignments || {});
      }
    } catch (err) {
      console.error('Parent dashboard load children error', err);
    }
  }, [user?.id, profile?.school_id]);

  const loadStats = useCallback(async (child: ChildInfo) => {
    setStatsLoading(true);
    try {
      const [attendance, fees, records, remarks] = await Promise.all([
        fetchAttendance({ studentId: child.student.id }),
        fetchFees({ studentId: child.student.id }),
        fetchStudentRecords({ studentId: child.student.id }),
        fetchRemarks({ studentId: child.student.id }),
      ]);

      const presentCount = attendance.filter((a) => a.status === 'present').length;
      const attendanceRate =
        attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;
      const pendingFees = fees.filter((f) => f.status !== 'paid').length;
      const visibleRemarks = remarks.filter((r) => r.visibility !== 'staff_only');

      const sortedRecords = [...records].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const sortedRemarks = [...visibleRemarks].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setStats({
        attendanceRate,
        presentCount,
        pendingFees,
        recordsCount: records.length,
        remarksCount: visibleRemarks.length,
        recentRecord: sortedRecords[0] ?? null,
        recentRemark: sortedRemarks[0] ?? null,
        fees: fees.slice(0, 3),
      });
    } catch (err) {
      console.error('Parent dashboard load stats error', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadChildren(), loadUnreadNotifications()]).finally(() => setLoading(false));
  }, [loadChildren, loadUnreadNotifications]);

  useEffect(() => {
    if (children.length > 0) {
      loadStats(children[selectedIndex]);
    }
  }, [children, selectedIndex, loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadChildren(), loadUnreadNotifications()]);
    setRefreshing(false);
  }, [loadChildren, loadUnreadNotifications]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <Header
          title={school?.name || 'School'}
          showProfile
          onProfilePress={() => router.push('/parent-modal/profile' as never)}
          showNotificationBell
          notificationCount={unreadCount}
          onNotificationPress={() => router.push('/parent-modal/notifications' as never)}
        />
        <MobileDashboardSkeleton />
      </View>
    );
  }

  const parentName = profile?.full_name || user?.user_metadata?.full_name || 'Parent';
  const selectedChild = children[selectedIndex] ?? null;
  const childTransport = selectedChild
    ? transportAssignments[selectedChild.student.id]
    : undefined;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <Header
        title={school?.name || 'School'}
        showProfile
        onProfilePress={() => router.push('/parent-modal/profile' as never)}
        showNotificationBell
        notificationCount={unreadCount}
        onNotificationPress={() => router.push('/parent-modal/notifications' as never)}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4F46E5"
            colors={['#4F46E5']}
          />
        }
      >
        {/* Clean Greeting Header */}
        <View style={styles.greetingBar}>
          <Text style={styles.greetingSingleLine} numberOfLines={1}>
            {getGreeting()}, <Text style={styles.greetingTitle}>{parentName}</Text>
          </Text>
          <Text style={styles.datePill}>{formatDate(new Date().toISOString())}</Text>
        </View>

        {/* Child selector if multiple children */}
        {children.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.childChipsScroll}
          >
            {children.map((child, idx) => {
              const active = idx === selectedIndex;
              return (
                <TouchableOpacity
                  key={child.student.id}
                  onPress={() => setSelectedIndex(idx)}
                  activeOpacity={0.8}
                  style={[styles.childChip, active && styles.childChipActive]}
                >
                  <Text style={[styles.childChipText, active && styles.childChipTextActive]}>
                    {child.student.full_name}
                  </Text>
                  <Text style={[styles.childChipSub, active && styles.childChipSubActive]}>
                    {child.className} · Sec {child.sectionName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Selected Student Profile Card */}
        {selectedChild && (
          <View style={styles.studentCard}>
            <Avatar
              name={selectedChild.student.full_name}
              uri={selectedChild.student.avatar_url}
              size={52}
              color={selectedChild.student.gender === 'female' ? '#EC4899' : '#4F46E5'}
            />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.studentName} numberOfLines={1}>
                {selectedChild.student.full_name}
              </Text>
              <Text style={styles.studentClass}>
                {selectedChild.className} · Section {selectedChild.sectionName}
              </Text>
              <Text style={styles.studentMeta}>
                Roll No: {selectedChild.student.roll_number || '—'} · Adm:{' '}
                {selectedChild.student.admission_number}
              </Text>
            </View>
            <View style={styles.activePill}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>Active</Text>
            </View>
          </View>
        )}

        {statsLoading ? (
          <MobileInlineSkeleton rows={3} />
        ) : stats ? (
          <>
            {/* Clean 2x2 Quick Navigation Grid */}
            <View style={styles.gridWrap}>
              <View style={styles.gridRow}>
                <TouchableOpacity
                  style={styles.gridCard}
                  onPress={() => setActiveTab('attendance')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="checkbox-outline" size={20} color="#059669" />
                  </View>
                  <Text style={[styles.gridValue, { color: '#059669' }]}>
                    {stats.attendanceRate}%
                  </Text>
                  <Text style={styles.gridLabel}>Attendance</Text>
                  <Text style={styles.gridSub}>{stats.presentCount} days present</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.gridCard}
                  onPress={() => setActiveTab('fees')}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.iconBox,
                      {
                        backgroundColor: stats.pendingFees > 0 ? '#FEF2F2' : '#ECFDF5',
                      },
                    ]}
                  >
                    <Ionicons
                      name="cash-outline"
                      size={20}
                      color={stats.pendingFees > 0 ? '#DC2626' : '#059669'}
                    />
                  </View>
                  <Text
                    style={[
                      styles.gridValue,
                      { color: stats.pendingFees > 0 ? '#DC2626' : '#059669' },
                    ]}
                  >
                    {stats.pendingFees > 0 ? `${stats.pendingFees} Due` : 'Clear'}
                  </Text>
                  <Text style={styles.gridLabel}>School Fees</Text>
                  <Text style={styles.gridSub}>
                    {stats.pendingFees > 0 ? 'Tap to pay online' : 'All paid'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.gridRow}>
                <TouchableOpacity
                  style={styles.gridCard}
                  onPress={() => setActiveTab('records')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="document-text-outline" size={20} color="#2563EB" />
                  </View>
                  <Text style={[styles.gridValue, { color: '#2563EB' }]}>
                    {stats.recordsCount}
                  </Text>
                  <Text style={styles.gridLabel}>Exam Records</Text>
                  <Text style={styles.gridSub}>Marks &amp; grades</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.gridCard}
                  onPress={() => setActiveTab('transport')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="bus-outline" size={20} color="#4F46E5" />
                  </View>
                  <Text
                    style={[styles.gridValue, { color: '#4F46E5', fontSize: 15 }]}
                    numberOfLines={1}
                  >
                    {childTransport ? childTransport.stop_name : 'Apply'}
                  </Text>
                  <Text style={styles.gridLabel}>Transport</Text>
                  <Text style={styles.gridSub} numberOfLines={1}>
                    {childTransport
                      ? formatCurrency(childTransport.amount)
                      : 'Select bus stop'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Recent Result & Teacher Remarks */}
            <View style={styles.recentRow}>
              <TouchableOpacity
                style={styles.recentCard}
                onPress={() => setActiveTab('records')}
                activeOpacity={0.8}
              >
                <View style={styles.recentHeader}>
                  <Text style={styles.recentLabel}>RECENT RESULT</Text>
                  <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                </View>
                {stats.recentRecord ? (
                  <>
                    <Text style={styles.recentMain} numberOfLines={1}>
                      {stats.recentRecord.subject_name}
                    </Text>
                    <Text style={styles.recentSub} numberOfLines={1}>
                      {stats.recentRecord.exam_name}
                    </Text>
                    <View style={styles.scoreRow}>
                      <Text style={styles.scoreVal}>
                        {stats.recentRecord.marks}/{stats.recentRecord.max_marks}
                      </Text>
                      <View style={styles.gradeBadge}>
                        <Text style={styles.gradeText}>
                          Grade {stats.recentRecord.grade}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <Text style={styles.emptyText}>No exam results yet</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.recentCard}
                onPress={() => setActiveTab('remarks')}
                activeOpacity={0.8}
              >
                <View style={styles.recentHeader}>
                  <Text style={styles.recentLabel}>TEACHER REMARKS</Text>
                  <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                </View>
                {stats.recentRemark ? (
                  <>
                    <Text style={styles.remarkPreview} numberOfLines={2}>
                      &ldquo;{stats.recentRemark.remark}&rdquo;
                    </Text>
                    <Text style={styles.recentSub}>
                      {formatDate(stats.recentRemark.created_at)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.emptyText}>
                    {stats.remarksCount > 0
                      ? `${stats.remarksCount} remarks`
                      : 'No remarks yet'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: 12 },

  greetingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  greetingSingleLine: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  greetingTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  datePill: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },

  childChipsScroll: { gap: 8, paddingBottom: 12 },
  childChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  childChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  childChipText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  childChipTextActive: { color: '#4F46E5' },
  childChipSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  childChipSubActive: { color: '#4338CA' },

  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  studentName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  studentClass: { fontSize: 12.5, fontWeight: '600', color: '#475569', marginTop: 2 },
  studentMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  activeText: { fontSize: 11, fontWeight: '700', color: '#065F46' },

  gridWrap: { gap: 10, marginBottom: 14 },
  gridRow: { flexDirection: 'row', gap: 10 },
  gridCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  gridValue: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  gridLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  gridSub: { fontSize: 11, color: '#64748B', marginTop: 1 },

  transportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: 14,
    gap: 12,
  },
  transportIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportBannerTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  transportBannerSub: { fontSize: 11.5, color: '#64748B', marginTop: 2 },
  transportActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
  },
  transportActionText: { fontSize: 11, fontWeight: '800', color: '#2563EB' },

  recentRow: { flexDirection: 'row', gap: 10 },
  recentCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recentLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  recentMain: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  recentSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  scoreVal: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  gradeBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  gradeText: { fontSize: 10, fontWeight: '700', color: '#4F46E5' },
  remarkPreview: { fontSize: 12, color: '#334155', lineHeight: 17, fontWeight: '500' },
  emptyText: { fontSize: 12, color: '#94A3B8', marginTop: 6 },
});
