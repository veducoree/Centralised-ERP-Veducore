import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import {
  fetchTeacherByUserId,
  fetchTeacherAssignments,
  fetchStudentsBySection,
  fetchClasses,
} from '@/services/api';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, RADIUS, SHADOW } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileListSkeleton, MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { StudentDetailModal } from '@/components/ui/StudentDetailModal';
import { AddStudentModal } from '@/components/ui/AddStudentModal';
import { NewAdmissionModal } from '@/components/ui/NewAdmissionModal';
import { BulkStudentEntryModal } from '@/components/ui/BulkStudentEntryModal';
import type { ClassAssignment, Section, Student } from '@/types';

interface SectionChip {
  section_id: string;
  class_id?: string;
  className: string;
  sectionName: string;
  chipLabel: string;
  isClassIncharge: boolean;
}

export default function TeacherStudents() {
  const { user, profile } = useAuth();
  const [sectionChips, setSectionChips] = useState<SectionChip[]>([]);
  const [inchargeSectionIds, setInchargeSectionIds] = useState<string[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newAdmissionModalVisible, setNewAdmissionModalVisible] = useState(false);
  const [bulkModalVisible, setBulkModalVisible] = useState(false);

  const loadSections = useCallback(async () => {
    if (!user?.id) return;
    try {
      const teacher = await fetchTeacherByUserId(user.id, user.email || profile?.email);
      if (!teacher) {
        console.warn('Teacher record not found for user:', user.id);
        return;
      }
      const classAssignments = await fetchTeacherAssignments(teacher.id);

      const inchargeIds: string[] = [];
      const sectionMap = new Map<string, SectionChip>();

      for (const ca of classAssignments) {
        const sec = (ca as any).section;
        const cls = (ca as any).class;
        const secId = ca.section_id;
        if (!secId) continue;

        const clsName = cls?.name || '';
        const secName = sec?.name || 'A';

        // An assignment designates Class Incharge if is_class_teacher is true, or subject_id is null / undefined
        const isAssignmentIncharge = Boolean(
          ca.is_class_teacher === true ||
          (ca as any).is_class_teacher === 'true' ||
          ca.subject_id === null ||
          ca.subject_id === undefined ||
          ca.subject_id === '' ||
          !(ca as any).subject
        );

        if (isAssignmentIncharge && !inchargeIds.includes(secId)) {
          inchargeIds.push(secId);
        }

        if (!sectionMap.has(secId)) {
          sectionMap.set(secId, {
            section_id: secId,
            class_id: ca.class_id,
            className: clsName,
            sectionName: secName,
            chipLabel: clsName ? `${clsName} - ${secName}` : `Sec ${secName}`,
            isClassIncharge: isAssignmentIncharge,
          });
        } else if (isAssignmentIncharge) {
          const existing = sectionMap.get(secId)!;
          existing.isClassIncharge = true;
          if (clsName && !existing.className) {
            existing.className = clsName;
            existing.chipLabel = `${clsName} - ${existing.sectionName}`;
          }
        }
      }

      // Check if sections table directly designates class_teacher_id
      try {
        const { data: ctSections } = await supabase
          .from('sections')
          .select('*, class:classes(*)')
          .eq('class_teacher_id', teacher.id);

        if (ctSections && ctSections.length > 0) {
          for (const s of ctSections) {
            if (!inchargeIds.includes(s.id)) inchargeIds.push(s.id);
            const cls = (s as any).class;
            const clsName = cls?.name || '';
            const secName = s.name || 'A';
            if (!sectionMap.has(s.id)) {
              sectionMap.set(s.id, {
                section_id: s.id,
                class_id: s.class_id,
                className: clsName,
                sectionName: secName,
                chipLabel: clsName ? `${clsName} - ${secName}` : `Sec ${secName}`,
                isClassIncharge: true,
              });
            } else {
              const existing = sectionMap.get(s.id)!;
              existing.isClassIncharge = true;
            }
          }
        }
      } catch {}

      // Fallback: If no assignments exist yet, load school classes so teacher can manage students
      if (sectionMap.size === 0 && teacher.school_id) {
        try {
          const allClasses = await fetchClasses(teacher.school_id);
          for (const c of allClasses) {
            if (c.sections) {
              for (const s of c.sections) {
                const clsName = c.name || '';
                const secName = s.name || 'A';
                inchargeIds.push(s.id);
                sectionMap.set(s.id, {
                  section_id: s.id,
                  class_id: c.id,
                  className: clsName,
                  sectionName: secName,
                  chipLabel: `${clsName} - ${secName}`,
                  isClassIncharge: true,
                });
              }
            }
          }
        } catch {}
      }

      const chips = Array.from(sectionMap.values());
      setInchargeSectionIds(inchargeIds);
      setSectionChips(chips);

      // Pre-select the incharge section first so teacher lands right on their incharge class!
      if (chips.length > 0) {
        const defaultChip = chips.find(c => c.isClassIncharge) || chips[0];
        setSelectedSectionId(prev => {
          if (!prev || !chips.some(c => c.section_id === prev)) {
            return defaultChip.section_id;
          }
          return prev;
        });
      }
    } catch (err) {
      console.error('Load sections error', err);
    }
  }, [user?.id, user?.email, profile?.email]);

  const loadStudents = useCallback(async (sectionId: string) => {
    if (!sectionId) return;
    setStudentsLoading(true);
    try {
      const students = await fetchStudentsBySection(sectionId);
      setAllStudents(students);
    } catch (err) {
      console.error('Load students error', err);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSections().finally(() => setLoading(false));
  }, [loadSections]);

  useEffect(() => {
    if (selectedSectionId) {
      loadStudents(selectedSectionId);
    }
  }, [selectedSectionId, loadStudents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSections();
    if (selectedSectionId) {
      await loadStudents(selectedSectionId);
    }
    setRefreshing(false);
  }, [loadSections, loadStudents, selectedSectionId]);

  const isTeacherAnyIncharge = inchargeSectionIds.length > 0;
  const isCurrentSectionIncharge = inchargeSectionIds.includes(selectedSectionId);
  const currentSectionChip = sectionChips.find(s => s.section_id === selectedSectionId);
  const inchargeSections = sectionChips.filter(s => inchargeSectionIds.includes(s.section_id));

  // Determine active section for modal operations (prefer current if incharge, else first incharge section)
  const activeInchargeSectionId = isCurrentSectionIncharge
    ? selectedSectionId
    : (inchargeSectionIds[0] || selectedSectionId);

  const canPerformInchargeActions = isCurrentSectionIncharge || isTeacherAnyIncharge;

  const handleOpenAddStudent = () => {
    if (!canPerformInchargeActions) {
      Alert.alert(
        'Permission Restricted',
        `Only designated Class Incharges can add new students.\n\nYou are currently assigned as a Subject Teacher.`
      );
      return;
    }
    if (!isCurrentSectionIncharge && inchargeSectionIds.length > 0) {
      setSelectedSectionId(inchargeSectionIds[0]);
    }
    setAddModalVisible(true);
  };

  const handleOpenAdmission = () => {
    if (!canPerformInchargeActions) {
      Alert.alert(
        'Permission Restricted',
        `Only designated Class Incharges can perform student admissions.\n\nYou are currently assigned as a Subject Teacher.`
      );
      return;
    }
    if (!isCurrentSectionIncharge && inchargeSectionIds.length > 0) {
      setSelectedSectionId(inchargeSectionIds[0]);
    }
    setNewAdmissionModalVisible(true);
  };

  const handleOpenBulk = () => {
    if (!canPerformInchargeActions) {
      Alert.alert(
        'Permission Restricted',
        `Only designated Class Incharges can perform bulk CSV student entry.\n\nYou are currently assigned as a Subject Teacher.`
      );
      return;
    }
    if (!isCurrentSectionIncharge && inchargeSectionIds.length > 0) {
      setSelectedSectionId(inchargeSectionIds[0]);
    }
    setBulkModalVisible(true);
  };

  const filteredStudents = allStudents.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.admission_number.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.content}>
          <Header title="Enrolled Students" />
          <MobileListSkeleton rows={6} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Header title="Enrolled Students" />

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

          {/* Action Cards: Add Student, New Admission, Bulk Entry */}
          <View style={styles.actionGrid}>
            <TouchableOpacity
              style={[
                styles.actionCard,
                styles.actionCardPrimary,
                !canPerformInchargeActions && styles.actionCardDisabled,
              ]}
              onPress={handleOpenAddStudent}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#EEF0FD' }]}>
                <Ionicons name="person-add" size={16} color={COLORS.primary} />
              </View>
              <Text style={[styles.actionCardTitle, { color: canPerformInchargeActions ? COLORS.primary : COLORS.textMuted }]} numberOfLines={1}>Add Student</Text>
              <Text style={styles.actionCardSub}>
                {canPerformInchargeActions ? 'Quick Enrol' : 'Incharge Only'}
              </Text>
              {!canPerformInchargeActions && (
                <View style={styles.actionLockBadge}>
                  <Ionicons name="lock-closed" size={10} color="#94A3B8" />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionCard,
                styles.actionCardSecondary,
                !canPerformInchargeActions && styles.actionCardDisabled,
              ]}
              onPress={handleOpenAdmission}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="school" size={16} color="#7C3AED" />
              </View>
              <Text style={[styles.actionCardTitle, { color: canPerformInchargeActions ? '#7C3AED' : COLORS.textMuted }]} numberOfLines={1}>Admission</Text>
              <Text style={styles.actionCardSub}>
                {canPerformInchargeActions ? 'Full Dossier' : 'Incharge Only'}
              </Text>
              {!canPerformInchargeActions && (
                <View style={styles.actionLockBadge}>
                  <Ionicons name="lock-closed" size={10} color="#94A3B8" />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionCard,
                styles.actionCardTertiary,
                !canPerformInchargeActions && styles.actionCardDisabled,
              ]}
              onPress={handleOpenBulk}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#F0F9FF' }]}>
                <Ionicons name="cloud-upload" size={16} color="#0284C7" />
              </View>
              <Text style={[styles.actionCardTitle, { color: canPerformInchargeActions ? '#0284C7' : COLORS.textMuted }]} numberOfLines={1}>Bulk CSV</Text>
              <Text style={styles.actionCardSub}>
                {canPerformInchargeActions ? 'CSV Import' : 'Incharge Only'}
              </Text>
              {!canPerformInchargeActions && (
                <View style={styles.actionLockBadge}>
                  <Ionicons name="lock-closed" size={10} color="#94A3B8" />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by student name or admission no."
                placeholderTextColor={COLORS.textLight}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Section & Class chips */}
          {sectionChips.length > 0 && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.sectionTitle}>
                    {currentSectionChip?.className ? `${currentSectionChip.className} • Section ${currentSectionChip.sectionName}` : `Section ${currentSectionChip?.sectionName ?? ''}`}
                  </Text>
                  <Text style={styles.sectionSubtitle}>
                    {isCurrentSectionIncharge ? '⭐ Designated Class Incharge' : 'Subject Teacher View'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.roleBadge,
                    isCurrentSectionIncharge ? styles.roleBadgeIncharge : styles.roleBadgeSubject,
                  ]}
                >
                  <Ionicons
                    name={isCurrentSectionIncharge ? 'shield-checkmark' : 'eye-outline'}
                    size={11}
                    color={isCurrentSectionIncharge ? '#047857' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.roleBadgeText,
                      isCurrentSectionIncharge ? styles.roleBadgeTextIncharge : styles.roleBadgeTextSubject,
                    ]}
                  >
                    {isCurrentSectionIncharge ? 'Class Incharge' : 'Subject Teacher'}
                  </Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chipScrollContent}>
                {sectionChips.map(chip => {
                  const active = chip.section_id === selectedSectionId;
                  return (
                    <TouchableOpacity
                      key={chip.section_id}
                      onPress={() => setSelectedSectionId(chip.section_id)}
                      activeOpacity={0.8}
                      style={[
                        styles.chip,
                        active && styles.chipActive,
                        chip.isClassIncharge && !active && styles.chipIncharge,
                      ]}>
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                          chip.isClassIncharge && !active && styles.chipInchargeText,
                        ]}>
                        {chip.chipLabel}
                        {chip.isClassIncharge ? '  ★' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Count */}
          <Text style={styles.countText}>
            {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
            {searchQuery.trim() ? ' found' : ''}
          </Text>

          {/* Student list */}
          {studentsLoading ? (
            <MobileInlineSkeleton rows={5} />
          ) : filteredStudents.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={searchQuery.trim() ? 'No students match your search' : 'No students in this section'}
            />
          ) : (
            <GlassCard padding={0} style={styles.studentsCard}>
              {filteredStudents.map((student, index) => (
                <TouchableOpacity
                  key={student.id}
                  onPress={() => {
                    setSelectedStudent(student);
                    setDetailModalVisible(true);
                  }}
                  activeOpacity={0.7}
                  style={[
                    styles.studentRow,
                    index < filteredStudents.length - 1 && styles.studentRowBorder,
                  ]}>
                  <Avatar
                    name={student.full_name}
                    uri={student.avatar_url}
                    size={42}
                    color={student.gender === 'female' ? '#EC4899' : COLORS.primary}
                  />
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{student.full_name}</Text>
                    <Text style={styles.studentAdm}>
                      {student.class?.name ? `${student.class.name} • ` : currentSectionChip?.className ? `${currentSectionChip.className} • ` : ''}Adm: #{student.admission_number}
                    </Text>
                    <Text style={styles.studentGender}>
                      {student.gender.charAt(0).toUpperCase() + student.gender.slice(1)}
                      {student.section?.name ? ` • Sec ${student.section.name}` : ''}
                      {(student as any).parent_phone || (student as any).emergency_contact ? ` • 📞 ${(student as any).parent_phone || (student as any).emergency_contact}` : ''}
                    </Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: student.status === 'active' ? '#ECFDF5' : '#F1F5F9' },
                  ]}>
                    <Text style={[
                      styles.statusBadgeText,
                      { color: student.status === 'active' ? '#047857' : '#64748B' },
                    ]}>
                      {student.status === 'active' ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              ))}
            </GlassCard>
          )}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>

        {/* Student Detail Modal */}
        <StudentDetailModal
          student={selectedStudent}
          visible={detailModalVisible}
          isClassIncharge={canPerformInchargeActions}
          onClose={() => setDetailModalVisible(false)}
          onStudentUpdated={() => {
            if (selectedSectionId) loadStudents(selectedSectionId);
          }}
        />

        {/* Add Student Modal */}
        <AddStudentModal
          visible={addModalVisible}
          defaultSectionId={activeInchargeSectionId}
          inchargeSectionIds={inchargeSectionIds}
          onClose={() => setAddModalVisible(false)}
          onSuccess={() => {
            if (selectedSectionId) loadStudents(selectedSectionId);
          }}
        />

        {/* New Admission Modal */}
        <NewAdmissionModal
          visible={newAdmissionModalVisible}
          defaultSectionId={activeInchargeSectionId}
          inchargeSectionIds={inchargeSectionIds}
          onClose={() => setNewAdmissionModalVisible(false)}
          onSuccess={() => {
            if (selectedSectionId) loadStudents(selectedSectionId);
          }}
        />

        {/* Bulk Student Entry Modal */}
        <BulkStudentEntryModal
          visible={bulkModalVisible}
          sections={inchargeSections.length > 0 ? inchargeSections : sectionChips}
          defaultSectionId={activeInchargeSectionId}
          isClassIncharge={canPerformInchargeActions}
          inchargeSectionIds={inchargeSectionIds}
          onClose={() => setBulkModalVisible(false)}
          onSuccess={() => {
            if (selectedSectionId) loadStudents(selectedSectionId);
          }}
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

  actionGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.sm + 4,
  },
  actionCard: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...SHADOW.sm,
  },
  actionCardPrimary: {
    backgroundColor: COLORS.surface,
    borderColor: '#C7CDFB',
  },
  actionCardSecondary: {
    backgroundColor: COLORS.surface,
    borderColor: '#DDD6FE',
  },
  actionCardTertiary: {
    backgroundColor: COLORS.surface,
    borderColor: '#BAE6FD',
  },
  actionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionCardSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },

  searchRow: {
    marginBottom: SPACING.sm + 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    height: 44,
    ...SHADOW.sm,
  },
  searchIcon: { marginRight: SPACING.xs },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.text,
  },

  sectionTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#059669',
    marginTop: 2,
    fontWeight: '600',
  },
  chipScroll: { marginBottom: SPACING.sm },
  chipScrollContent: { gap: 8, paddingRight: SPACING.md },
  chip: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipIncharge: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  chipInchargeText: {
    color: '#047857',
    fontWeight: '700',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  chipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  countText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs + 4,
    fontWeight: '600',
  },

  studentsLoader: { paddingVertical: 48, alignItems: 'center' },

  studentsCard: {
    borderRadius: RADIUS.lg,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  studentRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  studentAdm: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  studentGender: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },

  statusBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  actionCardDisabled: {
    opacity: 0.65,
    backgroundColor: '#F4F5FB',
    borderColor: COLORS.borderLight,
  },
  actionLockBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sectionBlock: {
    marginBottom: SPACING.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs + 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  roleBadgeIncharge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  roleBadgeSubject: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  roleBadgeTextIncharge: {
    color: '#047857',
  },
  roleBadgeTextSubject: {
    color: '#64748B',
  },
});
