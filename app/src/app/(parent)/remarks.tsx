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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import {
  fetchParentByUserId,
  fetchParentStudents,
  fetchRemarks,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, formatDate } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileListSkeleton, MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type {
  Parent, ParentStudent, Student, Class, Section, Remark, Teacher,
} from '@/types';

interface ChildInfo {
  student: Student;
  className: string;
  sectionName: string;
}

interface RemarkWithTeacher extends Remark {
  teacherName: string;
}

const CATEGORY_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  academic: { color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
  behaviour: { color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  attendance: { color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  performance: { color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
  general: { color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE' },
};

export default function ParentRemarks() {
  const { user } = useAuth();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [remarks, setRemarks] = useState<RemarkWithTeacher[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [remarksLoading, setRemarksLoading] = useState(false);
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
      console.error('Parent remarks load children error', err);
    }
  }, [user?.id]);

  const loadRemarks = useCallback(async (child: ChildInfo) => {
    setRemarksLoading(true);
    try {
      const allRemarks = await fetchRemarks({
        studentId: child.student.id,
      });

      // Filter out staff_only remarks — only public & parents_only are visible to parents
      const visible = allRemarks.filter(r => r.visibility !== 'staff_only');
      const sorted = [...visible].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const enriched: RemarkWithTeacher[] = sorted.map(r => ({
        ...r,
        teacherName: (r as any).teacher?.full_name ?? 'Teacher',
      }));

      setRemarks(enriched);
    } catch (err) {
      console.error('Parent remarks load error', err);
    } finally {
      setRemarksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChildren().finally(() => setLoading(false));
  }, [loadChildren]);

  useEffect(() => {
    if (children.length > 0) {
      loadRemarks(children[selectedIndex]);
    }
  }, [children, selectedIndex, loadRemarks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadChildren();
    if (children.length > 0) {
      await loadRemarks(children[selectedIndex]);
    }
    setRefreshing(false);
  }, [loadChildren, children, selectedIndex, loadRemarks]);

  const filteredRemarks = useMemo(() => {
    if (categoryFilter === 'all') return remarks;
    return remarks.filter(r => r.category === categoryFilter);
  }, [remarks, categoryFilter]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.content}>
          <Header title="Teacher Remarks" />
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
        <Header title="Teacher Remarks" />

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

          {/* Child selector if multiple children */}
          {children.length > 1 && (
            <View style={styles.childSelectSection}>
              <Text style={styles.sectionTitle}>Select Student</Text>
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
                        {child.className} • Section {child.sectionName}
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

          {/* Category Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
            {[
              { id: 'all', label: `All (${remarks.length})` },
              { id: 'academic', label: 'Academic' },
              { id: 'behaviour', label: 'Behaviour' },
              { id: 'performance', label: 'Performance' },
              { id: 'attendance', label: 'Attendance' },
              { id: 'general', label: 'General' },
            ].map(f => {
              const active = categoryFilter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => setCategoryFilter(f.id)}
                  style={[styles.filterPill, active && styles.filterPillActive]}>
                  <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Remarks List */}
          {remarksLoading ? (
            <MobileInlineSkeleton rows={4} />
          ) : filteredRemarks.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="chatbubble-outline"
                title="No remarks found"
                subtitle={categoryFilter === 'all' ? 'No remarks from teachers yet.' : 'No remarks in this category.'}
              />
            </View>
          ) : (
            <View style={styles.remarksList}>
              {filteredRemarks.map(remark => {
                const catTheme = CATEGORY_COLORS[remark.category] || CATEGORY_COLORS.general;
                return (
                  <GlassCard key={remark.id} style={styles.remarkCard} padding={SPACING.md}>
                    {/* Header Row: Category badge & date */}
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.badgeLeftRow}>
                        <View style={[styles.categoryBadge, { backgroundColor: catTheme.bg, borderColor: catTheme.border }]}>
                          <Text style={[styles.categoryBadgeText, { color: catTheme.color }]}>
                            {remark.category.toUpperCase()}
                          </Text>
                        </View>
                        {remark.visibility === 'parents_only' && (
                          <View style={styles.parentsOnlyBadge}>
                            <Text style={styles.parentsOnlyText}>Parents Only</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.dateText}>{formatDate(remark.created_at)}</Text>
                    </View>

                    {/* Remark Body */}
                    <Text style={styles.remarkContent}>{remark.remark}</Text>

                    {/* Footer Row: Teacher Info */}
                    <View style={styles.footerRow}>
                      <Ionicons name="person-circle-outline" size={17} color={COLORS.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.teacherNameText}>By {remark.teacherName}</Text>
                    </View>
                  </GlassCard>
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
  container: { flex: 1, backgroundColor: COLORS.canvas },
  centerContainer: { flex: 1, backgroundColor: COLORS.canvas, alignItems: 'center', justifyContent: 'center' },
  loadingArea: { paddingVertical: 40, alignItems: 'center', gap: 8 },
  loadingText: { color: COLORS.textMuted, fontSize: 13 },
  content: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs },

  childSelectSection: { marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  childChipsScroll: { flexDirection: 'row', gap: 8 },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  childChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: COLORS.primary,
  },
  childChipName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  childChipNameActive: { color: COLORS.primary },
  childChipSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  childChipSubActive: { color: COLORS.primaryDark },

  singleChildBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  singleChildDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary, marginRight: 8 },
  singleChildText: { fontSize: 12, fontWeight: '600', color: COLORS.text },

  filterPillsScroll: { flexDirection: 'row', gap: 8, marginVertical: SPACING.sm },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  filterPillTextActive: { color: '#FFFFFF', fontWeight: '700' },

  emptyWrap: { marginTop: 40 },
  remarksList: { gap: 12 },
  remarkCard: {
    borderRadius: RADIUS.lg,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  badgeLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  categoryBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  parentsOnlyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  parentsOnlyText: { fontSize: 10, fontWeight: '700', color: '#B45309' },
  dateText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },

  remarkContent: { fontSize: 14, color: COLORS.text, lineHeight: 22 },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.xs + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  teacherNameText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
});
