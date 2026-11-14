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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchNotifications,
  fetchAttendance,
} from '@/services/api';
import { GLASS_BG, GLASS, SPACING, RADIUS, formatDate } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { useRouter } from 'expo-router';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileListSkeleton, MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type {
  Parent, ParentStudent, Student, Class, Section, Attendance, AttendanceStatus, Notification,
} from '@/types';

interface ChildInfo {
  student: Student;
  className: string;
  sectionName: string;
}

const STATUS_THEME: Record<AttendanceStatus, { color: string; bg: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  present: { color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Present', icon: 'checkmark-circle' },
  absent: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Absent', icon: 'close-circle' },
  late: { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', label: 'Late', icon: 'time' },
  leave: { color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.15)', label: 'Leave', icon: 'calendar' },
  medical: { color: '#7C3AED', bg: 'rgba(124, 58, 237, 0.15)', label: 'Medical', icon: 'medkit' },
};

export default function ParentAttendance() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [attLoading, setAttLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadUnreadNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const parent = await fetchParentByUserId(user.id);
      let linkedStudentIds: string[] = [];
      if (parent) {
        const links = await fetchParentStudents(parent.id);
        linkedStudentIds = links.map(l => l.student_id);
      }
      const allNotifs = await fetchNotifications(user.id, profile?.school_id);
      const unread = allNotifs.filter(n => {
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
      const childInfos: ChildInfo[] = links.map(link => {
        const student = link.student;
        return {
          student,
          className: student?.class?.name ?? 'Class',
          sectionName: student?.section?.name ?? '',
        };
      });

      setChildren(childInfos);
    } catch (err) {
      console.error('Parent attendance load children error', err);
    }
  }, [user?.id]);

  const loadAttendance = useCallback(async (child: ChildInfo) => {
    setAttLoading(true);
    try {
      const records = await fetchAttendance({
        studentId: child.student.id,
      });
      const sorted = [...records].sort(
        (a, b) => new Date(b.attendance_date).getTime() - new Date(a.attendance_date).getTime(),
      );
      setAttendance(sorted);
    } catch (err) {
      console.error('Parent attendance load records error', err);
    } finally {
      setAttLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadChildren(), loadUnreadNotifications()]).finally(() => setLoading(false));
  }, [loadChildren, loadUnreadNotifications]);

  useEffect(() => {
    if (children.length > 0) {
      loadAttendance(children[selectedIndex]);
    }
  }, [children, selectedIndex, loadAttendance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadChildren(), loadUnreadNotifications()]);
    if (children.length > 0) {
      await loadAttendance(children[selectedIndex]);
    }
    setRefreshing(false);
  }, [loadChildren, loadUnreadNotifications, children, selectedIndex, loadAttendance]);

  const medicalCount = attendance.filter(a => a.status === 'medical').length;
  // Medical leave (ML) counts as present.
  const presentCount = attendance.filter(a => a.status === 'present').length + medicalCount;
  const absentCount = attendance.filter(a => a.status === 'absent').length;
  const lateCount = attendance.filter(a => a.status === 'late').length;
  const leaveCount = attendance.filter(a => a.status === 'leave').length;
  const total = attendance.length;
  const rate = total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 0;

  const filteredAttendance = useMemo(() => {
    if (statusFilter === 'all') return attendance;
    return attendance.filter(a => a.status === statusFilter);
  }, [attendance, statusFilter]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.content}>
          <Header
            title="Attendance"
            showNotificationBell
            notificationCount={unreadCount}
            onNotificationPress={() => router.push('/parent-modal/notifications' as never)}
          />
          <MobileListSkeleton rows={6} />
        </View>
      </View>
    );
  }

  const selectedChild = children[selectedIndex] ?? null;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Header
          title="Attendance"
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
              tintColor="#5B6EE8"
              colors={['#5B6EE8']}
            />
          }>

          {/* Child selector if multiple children */}
          {children.length > 1 && (
            <View style={styles.childSelectSection}>
              <Text style={styles.sectionTitle}>Select Child</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.childChipsScroll}>
                {children.map((child, idx) => {
                  const active = idx === selectedIndex;
                  return (
                    <TouchableOpacity
                      key={child.student.id}
                      onPress={() => setSelectedIndex(idx)}
                      activeOpacity={0.8}
                      style={[styles.childChip, active && styles.childChipActive]}>
                      <Text style={[styles.childChipName, active && styles.childChipNameActive]}>
                        {child.student.full_name}
                      </Text>
                      <Text style={[styles.childChipSub, active && styles.childChipSubActive]}>
                        {child.className} - {child.sectionName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Child Quick Header */}
          {selectedChild && children.length === 1 && (
            <View style={styles.singleChildBanner}>
              <View style={styles.singleChildDot} />
              <Text style={styles.singleChildText}>
                {selectedChild.student.full_name} · {selectedChild.className} - Section {selectedChild.sectionName}
              </Text>
            </View>
          )}

          {/* 4 Summary Stat Cards matching website */}
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: '#059669' }]}>{rate}%</Text>
                <Text style={styles.statLabel}>Attendance</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: '#059669' }]}>{presentCount}</Text>
                <Text style={styles.statLabel}>Present</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: '#DC2626' }]}>{absentCount}</Text>
                <Text style={styles.statLabel}>Absent</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: '#D97706' }]}>{lateCount + leaveCount}</Text>
                <Text style={styles.statLabel}>Late / Leave</Text>
              </View>
            </View>
          </View>

          {/* Filter Pills: All, Present, Absent, Late, Leave */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
            {[
              { id: 'all', label: `All (${attendance.length})` },
              { id: 'present', label: `Present (${presentCount})` },
              { id: 'absent', label: `Absent (${absentCount})` },
              { id: 'late', label: `Late (${lateCount})` },
              { id: 'leave', label: `Leave (${leaveCount})` },
              ...(medicalCount ? [{ id: 'medical', label: `Medical (${medicalCount})` }] : []),
            ].map(f => {
              const active = statusFilter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => setStatusFilter(f.id as typeof statusFilter)}
                  style={[styles.filterPill, active && styles.filterPillActive]}>
                  <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Attendance Records List */}
          {attLoading ? (
            <MobileInlineSkeleton rows={5} />
          ) : filteredAttendance.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="calendar-outline"
                title="No attendance records"
                subtitle="Attendance records will appear here once marked by the class teacher."
              />
            </View>
          ) : (
            <View style={styles.recordsList}>
              {filteredAttendance.map(rec => {
                const status = rec.status as AttendanceStatus;
                const isPresent = status === 'present';
                const isAbsent = status === 'absent';
                const isLate = status === 'late';
                const isMedical = status === 'medical';
                const color = isPresent ? '#059669' : isAbsent ? '#DC2626' : isLate ? '#D97706' : isMedical ? '#7C3AED' : '#2563EB';
                const bgColor = isPresent ? '#ECFDF5' : isAbsent ? '#FEF2F2' : isLate ? '#FFFBEB' : isMedical ? '#F5F3FF' : '#EFF6FF';
                const borderColor = isPresent ? '#A7F3D0' : isAbsent ? '#FECACA' : isLate ? '#FDE68A' : isMedical ? '#DDD6FE' : '#BFDBFE';
                const iconName = isPresent ? 'checkmark-circle' : isAbsent ? 'close-circle' : 'time';

                return (
                  <View key={rec.id} style={styles.recCard}>
                    <View style={styles.recHeaderRow}>
                      <View style={styles.recDateWrap}>
                        <View style={styles.calendarIconCircle}>
                          <Ionicons name="calendar-outline" size={16} color="#5B6EE8" />
                        </View>
                        <Text style={styles.recDateText}>{formatDate(rec.attendance_date)}</Text>
                      </View>

                      <View style={[styles.statusBadge, { backgroundColor: bgColor, borderColor }]}>
                        <Ionicons name={iconName} size={14} color={color} style={{ marginRight: 4 }} />
                        <Text style={[styles.statusBadgeText, { color }]}>
                          {isMedical ? 'ML' : status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {rec.notes ? (
                      <View style={styles.recNotesBox}>
                        <Text style={styles.recNotesLabel}>Teacher Note:</Text>
                        <Text style={styles.recNotesText}>{rec.notes}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5FB' },
  centerContainer: { flex: 1, backgroundColor: '#F4F5FB', alignItems: 'center', justifyContent: 'center' },
  loadingArea: { paddingVertical: 40, alignItems: 'center', gap: 8 },
  loadingText: { color: '#64748B', fontSize: 13 },
  content: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },

  childSelectSection: { marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  childChipsScroll: { flexDirection: 'row', gap: 8 },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  childChipActive: {
    backgroundColor: '#EEF0FD',
    borderColor: '#5B6EE8',
  },
  childChipName: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  childChipNameActive: { color: '#5B6EE8' },
  childChipSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  childChipSubActive: { color: '#4B5DD8' },

  singleChildBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF0FD',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: '#DFE3FC',
  },
  singleChildDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5B6EE8', marginRight: 8 },
  singleChildText: { fontSize: 12, fontWeight: '600', color: '#3B4DC8' },

  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 19, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: '#F1F5F9', height: 28 },

  filterPillsScroll: { flexDirection: 'row', gap: 8, marginVertical: SPACING.sm },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  filterPillActive: {
    backgroundColor: '#5B6EE8',
    borderColor: '#5B6EE8',
  },
  filterPillText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  filterPillTextActive: { color: '#FFFFFF', fontWeight: '700' },

  emptyWrap: { marginTop: 40 },
  recordsList: { gap: 10, marginTop: 4 },
  recCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  recHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recDateWrap: { flexDirection: 'row', alignItems: 'center' },
  calendarIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EEF0FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  recDateText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  recNotesBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recNotesLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '700' },
  recNotesText: { fontSize: 12, color: '#475569', flex: 1 },
});
