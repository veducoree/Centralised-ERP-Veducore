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
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '@/components/layout/Header';
import {
  fetchTeacherByUserId,
  fetchTeacherScheduleByTeacher,
  fetchTimetablePeriods,
  fetchSubstitutions,
  fetchSchool,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, formatTime, getDayName } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileListSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { TeacherSchedule, TimetableSubstitution } from '@/types';
import {
  addDays,
  getTimetableDays,
  periodOfSlot,
  sortPeriods,
  toISODate,
  weekdayOf,
} from '@/lib/timetable';

interface ScheduleSlot extends TeacherSchedule {
  className: string;
  sectionName: string;
  subjectName: string;
  /** Bell-schedule period name, e.g. "Period 3". */
  periodName: string | null;
}

type DaySchedule = {
  dayNum: number;
  dayName: string;
  slots: ScheduleSlot[];
};

export default function TeacherScheduleModal() {
  const { user, school: authSchool } = useAuth();
  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>([]);
  const [duties, setDuties] = useState<TimetableSubstitution[]>([]);
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // JS weekday (0 = Sunday), same numbering as teacher_schedules.day_of_week.
  const todaySeedDay = useMemo(() => new Date().getDay(), []);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const currentTeacher = await fetchTeacherByUserId(user.id);
      if (!currentTeacher) return;

      const today = toISODate(new Date());
      const [schedules, periods, school, subs] = await Promise.all([
        fetchTeacherScheduleByTeacher(currentTeacher.id),
        fetchTimetablePeriods(currentTeacher.school_id).catch(() => []),
        authSchool ? Promise.resolve(authSchool) : fetchSchool(currentTeacher.school_id).catch(() => null),
        fetchSubstitutions({ substituteTeacherId: currentTeacher.id, from: today, to: addDays(today, 6) }).catch(() => []),
      ]);
      const sortedPeriods = sortPeriods(periods);

      const enriched: ScheduleSlot[] = schedules.map(s => ({
        ...s,
        className: s.class?.name ?? 'Class',
        sectionName: s.section?.name ?? '',
        subjectName: s.subject?.name ?? 'General',
        periodName: periodOfSlot(s, sortedPeriods)?.name ?? null,
      }));

      const workingDays = getTimetableDays(school);
      const days: DaySchedule[] = workingDays.map(dayNum => {
        const slots = enriched
          .filter(s => s.day_of_week === dayNum)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        return { dayNum, dayName: getDayName(dayNum), slots };
      });

      setDaySchedules(days);
      setDuties(subs);

      // Default filter to today if it's a working day, otherwise 'all'
      if (workingDays.includes(todaySeedDay)) {
        setSelectedDayFilter(todaySeedDay);
      }
    } catch (err) {
      console.error('Load schedule error', err);
    }
  }, [user?.id, todaySeedDay, authSchool]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const displayedDays = useMemo(() => {
    if (selectedDayFilter === 'all') return daySchedules;
    return daySchedules.filter(d => d.dayNum === selectedDayFilter);
  }, [daySchedules, selectedDayFilter]);

  const totalClasses = useMemo(() => {
    return daySchedules.reduce((acc, d) => acc + d.slots.length, 0);
  }, [daySchedules]);

  const displayedDuties = useMemo(() => {
    if (selectedDayFilter === 'all') return duties;
    return duties.filter(d => weekdayOf(d.date) === selectedDayFilter);
  }, [duties, selectedDayFilter]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <Header title="My Schedule" showBack />
          <MobileListSkeleton rows={5} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <Header title="My Schedule" showBack />

        {/* Day Selector Pills */}
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}>
            <TouchableOpacity
              onPress={() => setSelectedDayFilter('all')}
              activeOpacity={0.8}
              style={[
                styles.filterChip,
                selectedDayFilter === 'all' && styles.filterChipActive,
              ]}>
              <Text
                style={[
                  styles.filterChipText,
                  selectedDayFilter === 'all' && styles.filterChipTextActive,
                ]}>
                All Days ({totalClasses})
              </Text>
            </TouchableOpacity>

            {daySchedules.map(({ dayNum, dayName: name }) => {
              const isToday = dayNum === todaySeedDay;
              const isSelected = selectedDayFilter === dayNum;
              const daySlotCount = daySchedules.find(d => d.dayNum === dayNum)?.slots.length ?? 0;

              return (
                <TouchableOpacity
                  key={dayNum}
                  onPress={() => setSelectedDayFilter(dayNum)}
                  activeOpacity={0.8}
                  style={[
                    styles.filterChip,
                    isSelected && styles.filterChipActive,
                    isToday && !isSelected && styles.filterChipToday,
                  ]}>
                  <Text
                    style={[
                      styles.filterChipText,
                      isSelected && styles.filterChipTextActive,
                      isToday && !isSelected && styles.filterChipTextToday,
                    ]}>
                    {name.slice(0, 3)} {isToday ? '• Today' : `(${daySlotCount})`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

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

          {displayedDuties.length > 0 && (
            <View style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <View style={styles.dayTitleRow}>
                  <Ionicons name="swap-horizontal" size={16} color="#059669" />
                  <Text style={styles.dayTitle}>Substitution Duties</Text>
                </View>
                <Text style={styles.slotCountText}>{displayedDuties.length}</Text>
              </View>
              <View style={styles.slotsList}>
                {displayedDuties.map(duty => {
                  const isTodayDuty = duty.date === toISODate(new Date());
                  const dutyDay = `${getDayName(weekdayOf(duty.date)).slice(0, 3)} ${duty.date.slice(8, 10)}`;
                  return (
                    <GlassCard key={duty.id} style={[styles.slotCard, styles.dutyCard]} padding={SPACING.md}>
                      <View style={styles.slotMainRow}>
                        <View style={[styles.timeBadge, styles.dutyTimeBadge]}>
                          <Ionicons name="swap-horizontal" size={13} color="#059669" />
                          <Text style={[styles.timeStart, styles.dutyText]}>{formatTime(duty.start_time ?? '')}</Text>
                          <Text style={styles.timeEnd}>{formatTime(duty.end_time ?? '')}</Text>
                        </View>
                        <View style={styles.slotContent}>
                          <View style={styles.slotSubjectRow}>
                            <Text style={styles.subjectTitle} numberOfLines={1}>
                              {duty.subject?.name ?? 'Class'}
                            </Text>
                            <View style={[styles.periodPill, styles.dutyPill]}>
                              <Text style={[styles.periodPillText, styles.dutyText]}>
                                {isTodayDuty ? 'Today' : dutyDay}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.slotMetaRow}>
                            <View style={styles.classPill}>
                              <Ionicons name="people-outline" size={12} color={COLORS.textMuted} />
                              <Text style={styles.classPillText}>
                                {duty.class?.name ?? ''} - Sec {duty.section?.name ?? ''}
                              </Text>
                            </View>
                            {duty.period?.name ? (
                              <View style={styles.roomPill}>
                                <Text style={styles.roomPillText}>{duty.period.name}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    </GlassCard>
                  );
                })}
              </View>
            </View>
          )}

          {displayedDays.length === 0 || displayedDays.every(d => d.slots.length === 0) ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="calendar-outline"
                title="No classes scheduled"
                subtitle="You do not have any teaching timetable assigned for this period."
              />
            </View>
          ) : (
            displayedDays.map(day => {
              const isToday = day.dayNum === todaySeedDay;
              return (
                <View key={day.dayNum} style={styles.dayGroup}>
                  {/* Day Header */}
                  <View style={styles.dayHeader}>
                    <View style={styles.dayTitleRow}>
                      <View style={[styles.dayBullet, isToday && styles.dayBulletToday]} />
                      <Text style={styles.dayTitle}>{day.dayName}</Text>
                    </View>
                    {isToday ? (
                      <View style={styles.todayPill}>
                        <Ionicons name="time" size={12} color="#059669" />
                        <Text style={styles.todayPillText}>Today</Text>
                      </View>
                    ) : (
                      <Text style={styles.slotCountText}>
                        {day.slots.length} {day.slots.length === 1 ? 'class' : 'classes'}
                      </Text>
                    )}
                  </View>

                  {day.slots.length === 0 ? (
                    <GlassCard style={styles.noClassCard}>
                      <Ionicons name="cafe-outline" size={24} color={COLORS.textDim} />
                      <Text style={styles.noClassText}>No classes scheduled for {day.dayName}</Text>
                    </GlassCard>
                  ) : (
                    <View style={styles.slotsList}>
                      {day.slots.map((slot, index) => (
                        <GlassCard key={slot.id} style={styles.slotCard} padding={SPACING.md}>
                          <View style={styles.slotMainRow}>
                            {/* Time Badge column */}
                            <View style={styles.timeBadge}>
                              <Ionicons name="time-outline" size={13} color={COLORS.primary} />
                              <Text style={styles.timeStart}>{formatTime(slot.start_time)}</Text>
                              <Text style={styles.timeEnd}>{formatTime(slot.end_time)}</Text>
                            </View>

                            {/* Details */}
                            <View style={styles.slotContent}>
                              <View style={styles.slotSubjectRow}>
                                <Text style={styles.subjectTitle} numberOfLines={1}>
                                  {slot.subjectName}
                                </Text>
                                <View style={styles.periodPill}>
                                  <Text style={styles.periodPillText}>{slot.periodName ?? `Period ${index + 1}`}</Text>
                                </View>
                              </View>

                              <View style={styles.slotMetaRow}>
                                <View style={styles.classPill}>
                                  <Ionicons name="people-outline" size={12} color={COLORS.textMuted} />
                                  <Text style={styles.classPillText}>
                                    {slot.className} - Sec {slot.sectionName}
                                  </Text>
                                </View>

                                <View style={styles.roomPill}>
                                  <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
                                  <Text style={styles.roomPillText}>
                                    Room {slot.room_number || '—'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        </GlassCard>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: SPACING.sm,
  },
  filterRow: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipToday: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterChipTextToday: {
    color: '#059669',
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  emptyWrap: {
    marginTop: 40,
    alignItems: 'center',
  },
  dayGroup: {
    marginBottom: SPACING.lg,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
    paddingHorizontal: 4,
  },
  dayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
  },
  dayBulletToday: {
    backgroundColor: '#10B981',
    transform: [{ scale: 1.2 }],
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  todayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  todayPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  slotCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  noClassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  noClassText: {
    fontSize: 13,
    color: COLORS.textDim,
    fontStyle: 'italic',
  },
  slotsList: {
    gap: SPACING.sm,
  },
  dutyCard: {
    borderColor: '#A7F3D0',
  },
  dutyTimeBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  dutyPill: {
    backgroundColor: '#ECFDF5',
  },
  dutyText: {
    color: '#059669',
  },
  slotCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    ...SHADOW.sm,
  },
  slotMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  timeBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 84,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  timeStart: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 2,
  },
  timeEnd: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  slotContent: {
    flex: 1,
  },
  slotSubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.xs,
    marginBottom: 4,
  },
  subjectTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
  },
  periodPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  periodPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  slotMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  classPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  classPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  roomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roomPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
});
