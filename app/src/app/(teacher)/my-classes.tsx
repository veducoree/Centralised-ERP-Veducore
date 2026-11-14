import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import {
  fetchTeacherByUserId,
  fetchTeacherAssignments,
  fetchClasses,
  fetchSubjects,
  fetchStudents,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileListSkeleton } from '@/components/ui/Skeleton';
import { StudentDetailModal } from '@/components/ui/StudentDetailModal';
import { useAuth } from '@/context/AuthContext';
import type { ClassAssignment, Student } from '@/types';

interface SubjectInfo {
  id: string;
  name: string;
  code: string | null;
}

interface GroupedClassCard {
  key: string;
  classId: string;
  sectionId: string;
  className: string;
  sectionName: string;
  isClassTeacher: boolean;
  subjects: SubjectInfo[];
  students: Student[];
}

export default function TeacherClasses() {
  const { user } = useAuth();

  const [cards, setCards] = useState<GroupedClassCard[]>([]);
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const teacher = await fetchTeacherByUserId(user.id);
      if (!teacher) return;

      const [classAssignments, subjects, students] = await Promise.all([
        fetchTeacherAssignments(teacher.id),
        fetchSubjects(teacher.school_id),
        fetchStudents(teacher.school_id),
      ]);

      // Group assignments by class + section (matches website logic)
      const map = new Map<string, GroupedClassCard>();

      for (const a of classAssignments) {
        const key = `${a.class_id}-${a.section_id}`;
        if (!map.has(key)) {
          const cls = (a as any).class;
          const sec = (a as any).section;
          const secStudents = students.filter(st => st.section_id === a.section_id);

          map.set(key, {
            key,
            classId: a.class_id,
            sectionId: a.section_id,
            className: cls?.name ?? 'Class',
            sectionName: sec?.name ?? 'A',
            isClassTeacher: !!a.is_class_teacher,
            subjects: [],
            students: secStudents,
          });
        }

        const card = map.get(key)!;
        if (!a.subject_id) {
          card.isClassTeacher = true;
        } else {
          const sub = (a as any).subject || subjects.find(s => s.id === a.subject_id);
          if (sub && !card.subjects.some(s => s.id === sub.id)) {
            card.subjects.push({
              id: sub.id,
              name: sub.name,
              code: sub.code ?? null,
            });
          }
        }
      }

      setCards(Array.from(map.values()));
    } catch (err) {
      console.error('My classes load error', err);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      c =>
        c.className.toLowerCase().includes(q) ||
        c.sectionName.toLowerCase().includes(q) ||
        c.subjects.some(s => s.name.toLowerCase().includes(q) || (s.code && s.code.toLowerCase().includes(q)))
    );
  }, [cards, search]);

  const totalStudents = useMemo(() => {
    const uniqueIds = new Set<string>();
    cards.forEach(c => c.students.forEach(st => uniqueIds.add(st.id)));
    return uniqueIds.size;
  }, [cards]);

  const totalSubjects = useMemo(() => {
    const subIds = new Set<string>();
    cards.forEach(c => c.subjects.forEach(s => subIds.add(s.id)));
    return subIds.size;
  }, [cards]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.content}>
          <Header title="My Classes & Roster" />
          <MobileListSkeleton rows={5} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Header title="My Classes & Roster" />

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

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search class, section, or subject..."
                placeholderTextColor={COLORS.textLight}
                value={search}
                onChangeText={setSearch}
                clearButtonMode="while-editing"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Summary Row */}
          <GlassCard style={styles.summaryCard} padding={SPACING.sm + 2}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>{cards.length}</Text>
                <Text style={styles.summaryLabel}>Classes</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>{totalSubjects}</Text>
                <Text style={styles.summaryLabel}>Subjects</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>{totalStudents}</Text>
                <Text style={styles.summaryLabel}>Students</Text>
              </View>
            </View>
          </GlassCard>

          {filteredCards.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="book-outline"
                title={search ? 'No classes found' : 'No classes assigned'}
                subtitle={search ? 'Try a different search term.' : 'Contact your administrator to assign classes.'}
              />
            </View>
          ) : (
            filteredCards.map(card => {
              const isExpanded = expandedKeys.has(card.key);
              return (
                <GlassCard key={card.key} style={styles.classCard} padding={SPACING.md}>
                  {/* Class Header Row */}
                  <TouchableOpacity
                    onPress={() => toggleExpand(card.key)}
                    activeOpacity={0.8}
                    style={styles.classHeader}>
                    <View style={styles.classIconCircle}>
                      <Ionicons name="book-outline" size={22} color={COLORS.primary} />
                    </View>

                    <View style={styles.classInfo}>
                      <View style={styles.titleRow}>
                        <Text style={styles.className}>
                          {card.className} – Section {card.sectionName}
                        </Text>
                      </View>

                      <View style={styles.badgeRow}>
                        {card.isClassTeacher && (
                          <View style={styles.classTeacherBadge}>
                            <Ionicons name="school" size={12} color="#0369A1" style={{ marginRight: 4 }} />
                            <Text style={styles.classTeacherText}>Class Incharge</Text>
                          </View>
                        )}
                        <View style={styles.studentCountPill}>
                          <Ionicons name="people-outline" size={12} color={COLORS.textMuted} style={{ marginRight: 4 }} />
                          <Text style={styles.studentCountText}>{card.students.length} Students</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.chevronWrap}>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={COLORS.textMuted}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Assigned Subjects */}
                  <View style={styles.subjectsSection}>
                    <View style={styles.subjectsHeaderRow}>
                      <Text style={styles.subjectsHeader}>Assigned Subjects</Text>
                    </View>
                    {card.subjects.length === 0 ? (
                      <Text style={styles.noSubjectsText}>
                        {card.isClassTeacher
                          ? 'No subject assigned — Class Teacher role only'
                          : 'No subjects assigned'}
                      </Text>
                    ) : (
                      <View style={styles.subjectBadgesWrap}>
                        {card.subjects.map(subj => (
                          <View key={subj.id} style={styles.subjectChip}>
                            <Text style={styles.subjectChipName}>{subj.name}</Text>
                            {subj.code && (
                              <View style={styles.subjectCodePill}>
                                <Text style={styles.subjectCodeText}>{subj.code}</Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Expanded Student List */}
                  {isExpanded && (
                    <View style={styles.studentList}>
                      <View style={styles.studentListDivider} />
                      <View style={styles.studentListHeaderRow}>
                        <Text style={styles.studentListTitle}>Student Roster</Text>
                        <Text style={styles.studentListCount}>{card.students.length} Total</Text>
                      </View>

                      {card.students.length === 0 ? (
                        <View style={styles.noStudents}>
                          <Text style={styles.noStudentsText}>No students in this section</Text>
                        </View>
                      ) : (
                        card.students.map((student, index) => (
                          <TouchableOpacity
                            key={student.id}
                            onPress={() => {
                              setSelectedStudent(student);
                              setDetailModalVisible(true);
                            }}
                            activeOpacity={0.7}
                            style={[
                              styles.studentRow,
                              index < card.students.length - 1 && styles.studentRowBorder,
                            ]}>
                            <Avatar
                              name={student.full_name}
                              uri={student.avatar_url}
                              size={38}
                              color={student.gender === 'female' ? '#EC4899' : COLORS.primary}
                            />
                            <View style={styles.studentInfo}>
                              <Text style={styles.studentName}>{student.full_name}</Text>
                              <Text style={styles.studentRoll}>
                                Adm No: #{student.admission_number}
                              </Text>
                            </View>
                            <Badge
                              variant={student.status === 'active' ? 'active' : 'inactive'}
                              size="sm"
                            />
                            <Ionicons
                              name="chevron-forward"
                              size={15}
                              color={COLORS.textLight}
                              style={{ marginLeft: 6 }}
                            />
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  )}
                </GlassCard>
              );
            })
          )}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>

        <StudentDetailModal
          student={selectedStudent}
          visible={detailModalVisible}
          onClose={() => setDetailModalVisible(false)}
        />

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
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },

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
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14 },

  summaryCard: { marginBottom: SPACING.md, borderRadius: RADIUS.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  summaryLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' },
  summaryDivider: { width: 1, backgroundColor: COLORS.borderLight, height: 28 },

  emptyWrap: { flex: 1, marginTop: 40 },

  classCard: { marginBottom: SPACING.md, borderRadius: RADIUS.lg },
  classHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  classIconCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: '#EEF0FD',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  classInfo: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  className: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  classTeacherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  classTeacherText: { fontSize: 11, fontWeight: '700', color: '#0369A1' },
  studentCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  studentCountText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  chevronWrap: { padding: 4 },

  subjectsSection: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  subjectsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectsHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  addSubjectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEF0FD',
    borderWidth: 1,
    borderColor: '#C7CDFB',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  addSubjectBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  noSubjectsText: { fontSize: 12, color: COLORS.textLight, fontStyle: 'italic' },
  subjectBadgesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F5FB',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 6,
  },
  subjectChipName: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  subjectCodePill: {
    backgroundColor: '#EEF0FD',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  subjectCodeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },

  studentList: { marginTop: SPACING.sm },
  studentListDivider: { height: 1, backgroundColor: COLORS.borderLight, marginBottom: SPACING.sm },
  studentListHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  studentListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  studentListCount: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  noStudents: { paddingVertical: SPACING.sm },
  noStudentsText: { fontSize: 13, color: COLORS.textLight, textAlign: 'center' },

  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  studentRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  studentRoll: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
});
