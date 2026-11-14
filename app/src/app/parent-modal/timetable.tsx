import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Header } from '@/components/layout/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileListSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchSchool,
  fetchTimetablePeriods,
  fetchSectionTimetable,
  fetchSubstitutions,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, formatTime, getDayName } from '@/lib/utils';
import {
  addDays,
  getTimetableDays,
  periodOfSlot,
  sortPeriods,
  toISODate,
  weekdayOf,
} from '@/lib/timetable';
import type { Student, TeacherSchedule, TimetablePeriod, TimetableSubstitution } from '@/types';

type Child = Student & { class?: { name: string } | null; section?: { name: string } | null };

/** Next date (today or later, within a week) that falls on the given weekday. */
function nextDateFor(weekday: number): string {
  const today = toISODate(new Date());
  const diff = (weekday - new Date().getDay() + 7) % 7;
  return addDays(today, diff);
}

export default function ParentTimetableModal() {
  const { user, school: authSchool } = useAuth();
  const params = useLocalSearchParams<{ studentId?: string }>();

  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string>('');
  const [days, setDays] = useState<number[]>([]);
  const [periods, setPeriods] = useState<TimetablePeriod[]>([]);
  const [slots, setSlots] = useState<TeacherSchedule[]>([]);
  const [subs, setSubs] = useState<TimetableSubstitution[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const child = children.find((c) => c.id === childId) ?? null;

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const parent = await fetchParentByUserId(user.id);
      if (!parent) return;
      const links = await fetchParentStudents(parent.id);
      const kids = links.map((l) => l.student).filter(Boolean) as Child[];
      setChildren(kids);
      const current = kids.find((k) => k.id === (childId || params.studentId)) ?? kids[0];
      if (!current) return;
      setChildId(current.id);

      const schoolId = current.school_id;
      const today = toISODate(new Date());
      const [school, per, sectionSlots, sectionSubs] = await Promise.all([
        authSchool ? Promise.resolve(authSchool) : fetchSchool(schoolId).catch(() => null),
        fetchTimetablePeriods(schoolId).catch(() => []),
        current.section_id ? fetchSectionTimetable(current.section_id) : Promise.resolve([]),
        current.section_id
          ? fetchSubstitutions({ sectionId: current.section_id, from: today, to: addDays(today, 6) }).catch(() => [])
          : Promise.resolve([]),
      ]);
      const workingDays = getTimetableDays(school);
      setDays(workingDays);
      setPeriods(sortPeriods(per));
      setSlots(sectionSlots);
      setSubs(sectionSubs);
      setSelectedDay((d) => (workingDays.includes(d) ? d : workingDays[0]));
    } catch (err) {
      console.error('Load timetable error', err);
    }
  }, [user?.id, authSchool, childId, params.studentId]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Rows for the selected day: every period (breaks included) or, with no bell
  // schedule, the day's slots in time order.
  const rows = useMemo(() => {
    const daySlots = slots.filter((s) => s.day_of_week === selectedDay);
    const date = nextDateFor(selectedDay);
    const subFor = (slot: TeacherSchedule) => subs.find((s) => s.schedule_id === slot.id && s.date === date);
    if (periods.length === 0) {
      return [...daySlots]
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .map((slot) => ({ key: slot.id, period: null as TimetablePeriod | null, slot, sub: subFor(slot) }));
    }
    return periods.map((p) => {
      const slot = daySlots.find((s) => periodOfSlot(s, periods)?.id === p.id) ?? null;
      return { key: p.id, period: p, slot, sub: slot ? subFor(slot) : undefined };
    });
  }, [slots, subs, periods, selectedDay]);

  const todayWeekday = new Date().getDay();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <Header title="Class Timetable" showBack />

        {loading ? (
          <MobileListSkeleton rows={6} />
        ) : (
          <>
            {children.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.childRow}>
                {children.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setChildId(c.id)}
                    activeOpacity={0.8}
                    style={[styles.childChip, c.id === childId && styles.chipActive]}>
                    <Text style={[styles.chipText, c.id === childId && styles.chipTextActive]}>
                      {c.full_name.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.filterSection}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {days.map((d) => {
                  const active = d === selectedDay;
                  const isToday = d === todayWeekday;
                  return (
                    <TouchableOpacity
                      key={d}
                      onPress={() => setSelectedDay(d)}
                      activeOpacity={0.8}
                      style={[styles.filterChip, active && styles.chipActive, isToday && !active && styles.chipToday]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive, isToday && !active && styles.chipTextToday]}>
                        {getDayName(d).slice(0, 3)}{isToday ? ' • Today' : ''}
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
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />
              }>
              {child && (
                <Text style={styles.childLine}>
                  {child.full_name} · {child.class?.name ?? ''}{child.section?.name ? ` - ${child.section.name}` : ''}
                </Text>
              )}

              {!child?.section_id || slots.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <EmptyState
                    icon="calendar-outline"
                    title="Timetable not published yet"
                    subtitle="The school has not set up this class's timetable."
                  />
                </View>
              ) : (
                <View style={styles.list}>
                  {rows.map(({ key, period, slot, sub }) => {
                    const start = period?.start_time ?? slot?.start_time ?? '';
                    const end = period?.end_time ?? slot?.end_time ?? '';
                    if (period?.is_break) {
                      return (
                        <View key={key} style={styles.breakRow}>
                          <Ionicons name="cafe-outline" size={14} color="#B45309" />
                          <Text style={styles.breakText}>
                            {period.name} · {formatTime(start)} – {formatTime(end)}
                          </Text>
                        </View>
                      );
                    }
                    return (
                      <GlassCard key={key} style={[styles.slotCard, sub && styles.slotCardSub]} padding={SPACING.md}>
                        <View style={styles.slotRow}>
                          <View style={styles.timeBadge}>
                            <Text style={styles.timeStart}>{start ? formatTime(start) : '—'}</Text>
                            <Text style={styles.timeEnd}>{end ? formatTime(end) : ''}</Text>
                          </View>
                          <View style={styles.slotContent}>
                            <View style={styles.titleRow}>
                              <Text style={[styles.subject, !slot && styles.subjectFree]} numberOfLines={1}>
                                {slot ? slot.subject?.name ?? 'Class' : 'Free period'}
                              </Text>
                              {period && <Text style={styles.periodName}>{period.name}</Text>}
                            </View>
                            {slot && (
                              <Text style={styles.teacher} numberOfLines={1}>
                                {sub
                                  ? `Substitute: ${sub.substitute_teacher?.full_name ?? 'another teacher'}`
                                  : slot.teacher?.full_name ?? ''}
                              </Text>
                            )}
                          </View>
                        </View>
                      </GlassCard>
                    );
                  })}
                </View>
              )}
              <View style={{ height: SPACING.xxl }} />
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  safeArea: { flex: 1 },
  childRow: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, gap: SPACING.xs },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
  },
  filterRow: { paddingHorizontal: SPACING.md, gap: SPACING.xs },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipToday: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  chipTextActive: { color: '#FFFFFF', fontWeight: '700' },
  chipTextToday: { color: '#059669', fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  childLine: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: SPACING.sm },
  emptyWrap: { marginTop: 40, alignItems: 'center' },
  list: { gap: SPACING.sm },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  breakText: { fontSize: 12, fontWeight: '700', color: '#B45309' },
  slotCard: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', ...SHADOW.sm },
  slotCardSub: { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  timeBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF0FD',
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 78,
    borderWidth: 1,
    borderColor: '#DFE3FC',
  },
  timeStart: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  timeEnd: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  slotContent: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.xs },
  subject: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  subjectFree: { color: COLORS.textDim, fontWeight: '600' },
  periodName: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  teacher: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
});
