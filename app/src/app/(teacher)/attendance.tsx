import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import {
  fetchTeacherByUserId,
  fetchTeacherAssignments,
  fetchStudentsBySection,
  fetchAttendance,
  upsertAttendance,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, formatDate } from '@/lib/utils';
import { notifyParentsOnAttendance } from '@/lib/notifications';
import { GlassCard } from '@/components/ui/GlassCard';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileListSkeleton, MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type {
  ClassAssignment,
  Student,
  Attendance,
  AttendanceStatus,
} from '@/types';

interface SectionOption {
  sectionId: string;
  label: string;
}

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; border: string }
> = {
  present: {
    label: 'Present',
    icon: 'checkmark-circle',
    color: '#047857',
    bg: '#ECFDF5',
    border: '#10B981',
  },
  absent: {
    label: 'Absent',
    icon: 'close-circle',
    color: '#B91C1C',
    bg: '#FEF2F2',
    border: '#EF4444',
  },
  late: {
    label: 'Late',
    icon: 'time',
    color: '#B45309',
    bg: '#FFFBEB',
    border: '#F59E0B',
  },
  leave: {
    label: 'Leave',
    icon: 'calendar',
    color: '#0E7490',
    bg: '#ECFEFF',
    border: '#06B6D4',
  },
};

export default function TeacherAttendance() {
  const { user: _user } = useAuth();

  const [sections, setSections] = useState<SectionOption[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<Student[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [existingAttendance, setExistingAttendance] = useState<Attendance[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Date constants
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  // Compute 24-hour editability status
  const editStatus = useMemo(() => {
    if (selectedDate > todayStr) {
      return {
        isEditable: false,
        badgeText: 'Future Date',
        badgeColor: '#B91C1C',
        badgeBg: '#FEF2F2',
        icon: 'close-circle' as const,
        message: 'Attendance cannot be marked for future dates.',
      };
    }

    if (selectedDate === todayStr) {
      return {
        isEditable: true,
        badgeText: '● Live Today',
        badgeColor: '#047857',
        badgeBg: '#ECFDF5',
        icon: 'radio-button-on' as const,
        message: "Today's Attendance: Live marking & editing open.",
      };
    }

    if (selectedDate === yesterdayStr) {
      const timestamps = existingAttendance
        .map(a => (a.markedAt ? new Date(a.markedAt).getTime() : 0))
        .filter(t => t > 0);

      if (timestamps.length > 0) {
        const latestMarked = Math.max(...timestamps);
        const elapsedMs = Date.now() - latestMarked;
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

        if (elapsedMs <= TWENTY_FOUR_HOURS) {
          const remainingHours = Math.max(1, Math.ceil((TWENTY_FOUR_HOURS - elapsedMs) / (1000 * 60 * 60)));
          return {
            isEditable: true,
            badgeText: `● 24h Window (${remainingHours}h left)`,
            badgeColor: '#B45309',
            badgeBg: '#FFFBEB',
            icon: 'time' as const,
            message: `24-hour edit window active (${remainingHours}h remaining to modify yesterday's attendance).`,
          };
        } else {
          return {
            isEditable: false,
            badgeText: '🔒 Window Expired',
            badgeColor: '#B91C1C',
            badgeBg: '#FEF2F2',
            icon: 'lock-closed' as const,
            message: "Locked: 24-hour edit window for yesterday's attendance has expired.",
          };
        }
      } else {
        return {
          isEditable: true,
          badgeText: '● 24h Window Open',
          badgeColor: '#B45309',
          badgeBg: '#FFFBEB',
          icon: 'time-outline' as const,
          message: "Yesterday's attendance can be marked within this 24-hour window.",
        };
      }
    }

    // Dates older than yesterday
    return {
      isEditable: false,
      badgeText: '🔒 Historical (View Only)',
      badgeColor: '#64748B',
      badgeBg: '#F1F5F9',
      icon: 'lock-closed' as const,
      message: 'Historical Record: Attendance older than 24 hours cannot be modified.',
    };
  }, [selectedDate, todayStr, yesterdayStr, existingAttendance]);

  const { user } = useAuth();

  // Load sections assigned to this teacher
  const loadSections = useCallback(async () => {
    if (!user?.id) return;
    try {
      const teacher = await fetchTeacherByUserId(user.id);
      if (!teacher) return;

      const classAssignments = await fetchTeacherAssignments(teacher.id);

      const seen = new Set<string>();
      const opts: SectionOption[] = [];

      for (const ca of classAssignments) {
        if (!seen.has(ca.section_id)) {
          seen.add(ca.section_id);
          const cls = (ca as any).class;
          const sec = (ca as any).section;
          opts.push({
            sectionId: ca.section_id,
            label: `${cls?.name ?? 'Class'} - ${sec?.name ?? 'Section'}`,
          });
        }
      }

      setSections(opts);
      if (opts.length > 0 && !selectedSectionId) {
        setSelectedSectionId(opts[0].sectionId);
      }
    } catch (err) {
      console.error('Attendance load sections error', err);
    }
  }, [user?.id, selectedSectionId]);

  // Load students and existing attendance for selected section + date
  const loadAttendanceData = useCallback(async (sectionId: string, date: string) => {
    if (!sectionId) return;
    setStudentsLoading(true);
    try {
      const [secStudents, existingAttendanceData] = await Promise.all([
        fetchStudentsBySection(sectionId),
        fetchAttendance({ sectionId, date }),
      ]);

      setStudents(secStudents);
      setExistingAttendance(existingAttendanceData);

      const statusMap: Record<string, AttendanceStatus> = {};
      secStudents.forEach(st => {
        const found = existingAttendanceData.find(a => a.student_id === st.id);
        statusMap[st.id] = (found?.status as AttendanceStatus) || 'present';
      });
      setStatuses(statusMap);
    } catch (err) {
      console.error('Attendance load data error', err);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSections().finally(() => setLoading(false));
  }, [loadSections]);

  useEffect(() => {
    if (selectedSectionId) {
      loadAttendanceData(selectedSectionId, selectedDate);
    }
  }, [selectedSectionId, selectedDate, loadAttendanceData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSections();
    if (selectedSectionId) {
      await loadAttendanceData(selectedSectionId, selectedDate);
    }
    setRefreshing(false);
  }, [loadSections, selectedSectionId, selectedDate, loadAttendanceData]);

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    if (!editStatus.isEditable) {
      Alert.alert('Attendance Locked', editStatus.message);
      return;
    }
    setStatuses(prev => ({ ...prev, [studentId]: status }));
  };

  const markAll = (status: AttendanceStatus) => {
    if (!editStatus.isEditable) {
      Alert.alert('Attendance Locked', editStatus.message);
      return;
    }
    const all: Record<string, AttendanceStatus> = {};
    students.forEach(s => {
      all[s.id] = status;
    });
    setStatuses(all);
  };

  const handleSave = async () => {
    if (!selectedSectionId || students.length === 0) return;

    if (!editStatus.isEditable) {
      Alert.alert('Attendance Locked', editStatus.message);
      return;
    }

    setSaving(true);
    setSaveSuccess(false);
    try {
      const teacher = user?.id ? await fetchTeacherByUserId(user.id) : null;
      const schoolId = teacher?.school_id || students[0]?.school_id || 'school-001';

      const recordsToUpsert = students.map(st => ({
        school_id: schoolId,
        student_id: st.id,
        section_id: selectedSectionId,
        teacher_id: teacher?.id,
        attendance_date: selectedDate,
        status: statuses[st.id] || 'present',
        notes: null,
      }));

      await upsertAttendance(recordsToUpsert);

      // Notify parents both in-app and native system push notification outside the app!
      const activeSection = sections.find(s => s.sectionId === selectedSectionId);
      const sectionLabel = activeSection?.label || 'Class';

      await notifyParentsOnAttendance({
        sectionId: selectedSectionId,
        date: selectedDate,
        sectionLabel,
        students,
        statuses,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      Alert.alert(
        'Attendance Saved ✅',
        `Attendance for ${selectedDate} (${sectionLabel}) has been saved.\n\nNotifications dispatched to parents in-app and via phone alerts.`
      );

      await loadAttendanceData(selectedSectionId, selectedDate);
    } catch (err) {
      console.error('Error saving attendance:', err);
      Alert.alert('Error', 'Failed to save attendance. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Date shifting helpers - prevents navigating beyond today
  const changeDateByDays = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    const nextDate = d.toISOString().split('T')[0];
    if (nextDate > todayStr) {
      Alert.alert('Future Attendance Restricted', 'Attendance cannot be marked or viewed for future dates.');
      return;
    }
    setSelectedDate(nextDate);
  };

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      s =>
        s.full_name.toLowerCase().includes(q) ||
        s.admission_number.toLowerCase().includes(q)
    );
  }, [students, search]);

  const stats = useMemo(() => {
    let p = 0;
    let a = 0;
    let l = 0;
    let lv = 0;
    students.forEach(s => {
      const st = statuses[s.id] || 'present';
      if (st === 'present') p++;
      else if (st === 'absent') a++;
      else if (st === 'late') l++;
      else if (st === 'leave') lv++;
    });
    return { present: p, absent: a, late: l, leave: lv, total: students.length };
  }, [students, statuses]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.content}>
          <Header title="Student Attendance" />
          <MobileListSkeleton rows={6} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Header title="Student Attendance" />

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

          {/* Section Picker Carousel */}
          <Text style={styles.sectionHeaderTitle}>Select Class / Section</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sectionChipsScroll}>
            {sections.map(s => {
              const active = s.sectionId === selectedSectionId;
              return (
                <TouchableOpacity
                  key={s.sectionId}
                  onPress={() => setSelectedSectionId(s.sectionId)}
                  style={[styles.sectionChip, active && styles.sectionChipActive]}>
                  <Text style={[styles.sectionChipText, active && styles.sectionChipTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Date Selector Row with 24h Window Badge */}
          <GlassCard style={styles.dateCard} padding={SPACING.sm}>
            <View style={styles.dateRow}>
              <TouchableOpacity
                onPress={() => changeDateByDays(-1)}
                style={styles.dateArrowBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
              </TouchableOpacity>

              <View style={styles.dateCenterWrap}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
                <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
                <View style={[styles.statusBadgePill, { backgroundColor: editStatus.badgeBg }]}>
                  <Text style={[styles.statusBadgeText, { color: editStatus.badgeColor }]}>
                    {editStatus.badgeText}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => changeDateByDays(1)}
                disabled={selectedDate >= todayStr}
                style={[
                  styles.dateArrowBtn,
                  selectedDate >= todayStr && styles.dateArrowBtnDisabled,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={selectedDate >= todayStr ? '#CBD5E1' : COLORS.primary}
                />
              </TouchableOpacity>
            </View>
          </GlassCard>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search student by name or admission no..."
                placeholderTextColor={COLORS.textLight}
                value={search}
                onChangeText={setSearch}
                clearButtonMode="while-editing"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Quick Mark All Buttons or Locked Notice */}
          {editStatus.isEditable ? (
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                onPress={() => markAll('present')}
                activeOpacity={0.7}
                style={[styles.quickBtn, styles.quickBtnPresent]}>
                <Ionicons name="checkmark-done" size={15} color="#047857" style={{ marginRight: 4 }} />
                <Text style={[styles.quickBtnText, { color: '#047857' }]}>Mark All Present</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => markAll('absent')}
                activeOpacity={0.7}
                style={[styles.quickBtn, styles.quickBtnAbsent]}>
                <Ionicons name="close-circle-outline" size={15} color="#B91C1C" style={{ marginRight: 4 }} />
                <Text style={[styles.quickBtnText, { color: '#B91C1C' }]}>Mark All Absent</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.lockedNoticeCard}>
              <Ionicons name={editStatus.icon} size={16} color={editStatus.badgeColor} style={{ marginRight: 8 }} />
              <Text style={[styles.lockedNoticeText, { color: editStatus.badgeColor }]}>
                {editStatus.message}
              </Text>
            </View>
          )}

          {/* Summary Pills Row */}
          <GlassCard style={styles.statsCard} padding={SPACING.sm}>
            <View style={styles.statsRow}>
              <View style={styles.statPill}>
                <Text style={[styles.statVal, { color: '#047857' }]}>{stats.present}</Text>
                <Text style={styles.statLabel}>Present</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statPill}>
                <Text style={[styles.statVal, { color: '#B91C1C' }]}>{stats.absent}</Text>
                <Text style={styles.statLabel}>Absent</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statPill}>
                <Text style={[styles.statVal, { color: '#B45309' }]}>{stats.late}</Text>
                <Text style={styles.statLabel}>Late</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statPill}>
                <Text style={[styles.statVal, { color: '#0E7490' }]}>{stats.leave}</Text>
                <Text style={styles.statLabel}>Leave</Text>
              </View>
            </View>
          </GlassCard>

          {/* Student Attendance List */}
          {studentsLoading ? (
            <MobileInlineSkeleton rows={5} />
          ) : filteredStudents.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="checkbox-outline"
                title="No students found"
                subtitle={search ? 'No students match your search.' : 'No students in this section.'}
              />
            </View>
          ) : (
            <View style={styles.studentsContainer}>
              {filteredStudents.map((student, idx) => {
                const currentStatus = statuses[student.id] || 'present';
                return (
                  <GlassCard key={student.id} style={styles.studentCard} padding={SPACING.sm + 2}>
                    <View style={styles.studentTopRow}>
                      <View style={styles.indexCircle}>
                        <Text style={styles.indexText}>{idx + 1}</Text>
                      </View>
                      <Avatar
                        name={student.full_name}
                        uri={student.avatar_url}
                        size={38}
                        color={student.gender === 'female' ? '#EC4899' : COLORS.primary}
                      />
                      <View style={styles.studentMeta}>
                        <Text style={styles.studentName} numberOfLines={1}>{student.full_name}</Text>
                        <Text style={styles.studentSubtitle}>
                          Adm No: #{student.admission_number}
                        </Text>
                      </View>
                    </View>

                    {/* 4 Status Toggle Buttons */}
                    <View style={styles.statusButtonsRow}>
                      {(['present', 'absent', 'late', 'leave'] as AttendanceStatus[]).map(stKey => {
                        const isSelected = currentStatus === stKey;
                        const cfg = STATUS_CONFIG[stKey];
                        return (
                          <TouchableOpacity
                            key={stKey}
                            disabled={!editStatus.isEditable}
                            onPress={() => setStatus(student.id, stKey)}
                            activeOpacity={0.7}
                            style={[
                              styles.statusBtn,
                              isSelected && {
                                backgroundColor: cfg.bg,
                                borderColor: cfg.border,
                              },
                              !editStatus.isEditable && !isSelected && {
                                opacity: 0.4,
                              },
                              !editStatus.isEditable && isSelected && {
                                opacity: 0.95,
                              },
                            ]}>
                            <Ionicons
                              name={isSelected ? cfg.icon : `${cfg.icon}-outline` as keyof typeof Ionicons.glyphMap}
                              size={15}
                              color={isSelected ? cfg.color : COLORS.textMuted}
                              style={{ marginRight: 4 }}
                            />
                            <Text
                              style={[
                                styles.statusBtnText,
                                isSelected && { color: cfg.color, fontWeight: '800' },
                              ]}>
                              {cfg.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </GlassCard>
                );
              })}
            </View>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>

        {/* Floating Bottom Bar: Save Button if editable, Locked Banner if outside 24h */}
        {students.length > 0 && (
          <View style={styles.floatingBottomBar}>
            {editStatus.isEditable ? (
              <Button
                label={
                  saving
                    ? 'Saving & Notifying Parents...'
                    : saveSuccess
                    ? 'Attendance Saved & Dispatched!'
                    : 'Save & Submit Attendance'
                }
                icon="save-outline"
                variant={saveSuccess ? 'glass' : 'primary'}
                loading={saving}
                fullWidth
                onPress={handleSave}
              />
            ) : (
              <View style={styles.lockedBottomBar}>
                <Ionicons name="lock-closed" size={18} color="#64748B" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lockedBottomTitle}>Attendance Locked (Read Only)</Text>
                  <Text style={styles.lockedBottomSubtitle}>
                    Edits are only permitted within 24 hours of recording.
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  centerContainer: { flex: 1, backgroundColor: COLORS.canvas, alignItems: 'center', justifyContent: 'center' },
  loadingArea: { alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs },

  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  sectionChipsScroll: { flexDirection: 'row', gap: 8, marginBottom: SPACING.sm },
  sectionChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  sectionChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  sectionChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  sectionChipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  dateCard: { marginBottom: SPACING.sm, borderRadius: RADIUS.lg },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  dateArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCenterWrap: { flexDirection: 'row', alignItems: 'center' },
  dateText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  statusBadgePill: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  dateArrowBtnDisabled: {
    opacity: 0.35,
  },

  searchContainer: { marginBottom: SPACING.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    height: 44,
    ...SHADOW.sm,
  },
  searchIcon: { marginRight: SPACING.xs },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 13 },

  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: SPACING.sm,
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  quickBtnPresent: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  quickBtnAbsent: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  quickBtnText: { fontSize: 12, fontWeight: '700' },
  lockedNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: SPACING.sm,
  },
  lockedNoticeText: { fontSize: 12, fontWeight: '600', flex: 1 },

  statsCard: { marginBottom: SPACING.md, borderRadius: RADIUS.lg },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statPill: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 1, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: COLORS.borderLight, height: 26 },

  studentsLoadingWrap: { paddingVertical: 40, alignItems: 'center', gap: 8 },
  loadingText: { color: COLORS.textMuted, fontSize: 13 },
  emptyWrap: { marginTop: 30 },

  studentsContainer: { gap: 10 },
  studentCard: { borderRadius: RADIUS.lg },
  studentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  indexCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  studentMeta: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  studentSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },

  statusButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.sm,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  statusBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },

  floatingBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.md + 4,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOW.md,
  },
  lockedBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  lockedBottomTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  lockedBottomSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
