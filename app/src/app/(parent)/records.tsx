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
  fetchStudentRecords,
} from '@/services/api';
import { GLASS_BG, GLASS, SPACING, RADIUS, formatDate } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileListSkeleton, MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type {
  Parent, ParentStudent, Student, Class, Section, StudentRecord,
} from '@/types';

interface ChildInfo {
  student: Student;
  className: string;
  sectionName: string;
}

function gradeColor(grade: string): string {
  if (grade === 'A+' || grade === 'A') return '#10B981';
  if (grade === 'B+' || grade === 'B') return '#38BDF8';
  if (grade === 'C' || grade === 'D') return '#F59E0B';
  if (grade === 'F') return '#EF4444';
  return GLASS.textMuted;
}

function capitalizeWords(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function ParentRecords() {
  const { user } = useAuth();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [selectedExamTypeFilter, setSelectedExamTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [recLoading, setRecLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
      console.error('Parent records load children error', err);
    }
  }, [user?.id]);

  const loadRecords = useCallback(async (child: ChildInfo) => {
    setRecLoading(true);
    try {
      const recs = await fetchStudentRecords({
        studentId: child.student.id,
      });
      const sorted = [...recs].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      setRecords(sorted);
    } catch (err) {
      console.error('Parent records load error', err);
    } finally {
      setRecLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChildren().finally(() => setLoading(false));
  }, [loadChildren]);

  useEffect(() => {
    if (children.length > 0) {
      loadRecords(children[selectedIndex]);
    }
  }, [children, selectedIndex, loadRecords]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadChildren();
    if (children.length > 0) {
      await loadRecords(children[selectedIndex]);
    }
    setRefreshing(false);
  }, [loadChildren, children, selectedIndex, loadRecords]);

  // Overall statistics
  const summaryStats = useMemo(() => {
    if (records.length === 0) return { avgPct: 0, totalExams: 0, highestGrade: '—' };
    let totalMarks = 0;
    let totalMax = 0;
    records.forEach(r => {
      totalMarks += r.marks;
      totalMax += r.max_marks;
    });
    const avgPct = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100) : 0;
    const grades = records.map(r => r.grade).filter(Boolean);
    const highestGrade = grades.includes('A+') ? 'A+' : grades.includes('A') ? 'A' : grades[0] || '—';
    return { avgPct, totalExams: records.length, highestGrade };
  }, [records]);

  // Exam type options
  const examTypeOptions = useMemo(() => {
    const types = new Set<string>();
    records.forEach(r => types.add(r.record_type));
    return Array.from(types);
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (selectedExamTypeFilter === 'all') return records;
    return records.filter(r => r.record_type === selectedExamTypeFilter);
  }, [records, selectedExamTypeFilter]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.content}>
          <Header title="Academic Records" />
          <MobileListSkeleton rows={5} />
        </View>
      </View>
    );
  }

  const selectedChild = children[selectedIndex] ?? null;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Header title="Academic Records" />

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

          {/* Summary Performance Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: '#059669' }]}>
                  {summaryStats.avgPct}%
                </Text>
                <Text style={styles.summaryLabel}>Average Score</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>{summaryStats.totalExams}</Text>
                <Text style={styles.summaryLabel}>Exams Taken</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: '#4F46E5' }]}>
                  {summaryStats.highestGrade}
                </Text>
                <Text style={styles.summaryLabel}>Top Grade</Text>
              </View>
            </View>
          </View>

          {/* Filter Pills */}
          {examTypeOptions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
              <TouchableOpacity
                onPress={() => setSelectedExamTypeFilter('all')}
                style={[styles.filterPill, selectedExamTypeFilter === 'all' && styles.filterPillActive]}>
                <Text style={[styles.filterPillText, selectedExamTypeFilter === 'all' && styles.filterPillTextActive]}>
                  All ({records.length})
                </Text>
              </TouchableOpacity>
              {examTypeOptions.map(t => {
                const active = selectedExamTypeFilter === t;
                const count = records.filter(r => r.record_type === t).length;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setSelectedExamTypeFilter(t)}
                    style={[styles.filterPill, active && styles.filterPillActive]}>
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                      {capitalizeWords(t)} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Records List */}
          {recLoading ? (
            <MobileInlineSkeleton rows={4} />
          ) : filteredRecords.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="document-text-outline"
                title="No academic records"
                subtitle="Academic results will appear here once recorded by teachers."
              />
            </View>
          ) : (
            <View style={styles.recordsList}>
              {filteredRecords.map(rec => {
                const pct = rec.max_marks > 0 ? Math.round((rec.marks / rec.max_marks) * 100) : 0;
                const isTop = rec.grade === 'A+' || rec.grade === 'A';
                const isGood = rec.grade === 'B+' || rec.grade === 'B';
                const isFair = rec.grade === 'C' || rec.grade === 'D';
                const col = isTop ? '#059669' : isGood ? '#2563EB' : isFair ? '#D97706' : '#DC2626';
                const bg = isTop ? '#ECFDF5' : isGood ? '#EFF6FF' : isFair ? '#FFFBEB' : '#FEF2F2';
                const border = isTop ? '#A7F3D0' : isGood ? '#BFDBFE' : isFair ? '#FDE68A' : '#FECACA';

                return (
                  <View key={rec.id} style={styles.recCard}>
                    {/* Header Row: Subject, Exam, Grade */}
                    <View style={styles.recCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recSubjectName}>{rec.subject_name}</Text>
                        <Text style={styles.recExamName}>{rec.exam_name} · {formatDate(rec.date)}</Text>
                      </View>

                      <View style={[styles.gradeBadge, { backgroundColor: bg, borderColor: border }]}>
                        <Text style={[styles.gradeBadgeText, { color: col }]}>
                          Grade {rec.grade || '—'}
                        </Text>
                      </View>
                    </View>

                    {/* Score Bar */}
                    <View style={styles.scoreRow}>
                      <View style={styles.scoreTextWrap}>
                        <Text style={styles.scoreValueText}>
                          {rec.marks} <Text style={styles.scoreMaxText}>/ {rec.max_marks}</Text>
                        </Text>
                        <Text style={[styles.scorePctText, { color: col }]}>{pct}%</Text>
                      </View>

                      <View style={styles.progressBarTrack}>
                        <View style={[styles.progressBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: col }]} />
                      </View>
                    </View>

                    {/* Teacher Comment */}
                    {rec.teacher_comment ? (
                      <View style={styles.commentBox}>
                        <Ionicons name="chatbubble-ellipses-outline" size={14} color="#4F46E5" style={{ marginRight: 6 }} />
                        <Text style={styles.commentText}>"{rec.teacher_comment}"</Text>
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centerContainer: { flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  childChipName: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  childChipNameActive: { color: '#4F46E5' },
  childChipSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  childChipSubActive: { color: '#4338CA' },

  singleChildBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  singleChildDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4F46E5', marginRight: 8 },
  singleChildText: { fontSize: 12, fontWeight: '600', color: '#3730A3' },

  summaryCard: {
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
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  summaryLabel: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  summaryDivider: { width: 1, backgroundColor: '#F1F5F9', height: 28 },

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
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterPillText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  filterPillTextActive: { color: '#FFFFFF', fontWeight: '700' },

  emptyWrap: { marginTop: 40 },
  recordsList: { gap: 10 },
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
  recCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  recSubjectName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  recExamName: { fontSize: 12, color: '#64748B', marginTop: 2 },
  gradeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  gradeBadgeText: { fontSize: 11, fontWeight: '800' },

  scoreRow: { marginTop: SPACING.sm },
  scoreTextWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  scoreValueText: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  scoreMaxText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  scorePctText: { fontSize: 13, fontWeight: '800' },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  progressBarFill: { height: 6, borderRadius: 3 },

  commentBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
  },
  commentText: { fontSize: 12, color: '#475569', fontStyle: 'italic', flex: 1 },
});
