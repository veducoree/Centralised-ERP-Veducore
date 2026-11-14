import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '@/components/layout/Header';
import {
  fetchTeacherByUserId,
  fetchTeacherAssignments,
  fetchRemarks,
  createRemark,
  deleteRemark,
  fetchStudents,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, formatDate } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { MobileListSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { Remark, Student } from '@/types';

type RemarkCategory = 'academic' | 'behaviour' | 'attendance' | 'performance' | 'general';
type RemarkVisibility = 'public' | 'parents_only' | 'staff_only';

const CATEGORIES: { key: RemarkCategory; label: string; bg: string; text: string; border: string }[] = [
  { key: 'academic', label: 'Academic', bg: '#EEF0FD', text: '#5B6EE8', border: '#C7CDFB' },
  { key: 'behaviour', label: 'Behaviour', bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
  { key: 'attendance', label: 'Attendance', bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
  { key: 'performance', label: 'Performance', bg: '#F3E8FF', text: '#7C3AED', border: '#DDD6FE' },
  { key: 'general', label: 'General', bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' },
];

const VISIBILITIES: { value: RemarkVisibility; label: string; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
  { value: 'public', label: 'Public', icon: 'globe-outline', desc: 'Visible to parents and school' },
  { value: 'parents_only', label: 'Parents Only', icon: 'people-outline', desc: 'Visible to student parents' },
  { value: 'staff_only', label: 'Staff Only', icon: 'lock-closed-outline', desc: 'Internal teacher notes' },
];

interface RemarkWithStudent extends Remark {
  studentName: string;
  studentRoll: string;
  className: string;
  sectionName: string;
}

export default function TeacherRemarksModal() {
  const { user } = useAuth();

  const [remarks, setRemarks] = useState<RemarkWithStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<RemarkCategory>('academic');
  const [selectedVisibility, setSelectedVisibility] = useState<RemarkVisibility>('public');
  const [remarkText, setRemarkText] = useState('');
  const [currentTeacherId, setCurrentTeacherId] = useState('');
  const [currentSchoolId, setCurrentSchoolId] = useState('');

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const teacher = await fetchTeacherByUserId(user.id);
      if (!teacher) return;
      setCurrentTeacherId(teacher.id);
      setCurrentSchoolId(teacher.school_id);

      const [classAssignments, allRemarks, allStudents] = await Promise.all([
        fetchTeacherAssignments(teacher.id),
        fetchRemarks({ teacherId: teacher.id }),
        fetchStudents(teacher.school_id),
      ]);

      const assignedSectionIds = [...new Set(classAssignments.map(ca => ca.section_id))];
      const eligibleStudents = assignedSectionIds.length > 0
        ? allStudents.filter(s => assignedSectionIds.includes(s.section_id))
        : allStudents;

      setStudents(eligibleStudents);

      const enriched: RemarkWithStudent[] = allRemarks.map(r => {
        const student = (r as any).student || allStudents.find(s => s.id === r.student_id);
        const cls = (student as any)?.class;
        const sec = (student as any)?.section;
        return {
          ...r,
          studentName: student?.full_name ?? 'Student',
          studentRoll: String(student?.roll_number ?? '—'),
          className: cls?.name ?? '',
          sectionName: sec?.name ?? '',
        };
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setRemarks(enriched);
    } catch (err) {
      console.error('Load remarks error', err);
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

  const openAddModal = () => {
    setSelectedStudentId(students.length > 0 ? students[0].id : '');
    setStudentSearch('');
    setSelectedCategory('academic');
    setSelectedVisibility('public');
    setRemarkText('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!selectedStudentId) {
      Alert.alert('Required', 'Please select a student.');
      return;
    }
    if (!remarkText.trim()) {
      Alert.alert('Required', 'Please write your remark.');
      return;
    }

    setSaving(true);
    try {
      await createRemark({
        school_id: currentSchoolId,
        student_id: selectedStudentId,
        teacher_id: currentTeacherId,
        category: selectedCategory,
        remark: remarkText.trim(),
        visibility: selectedVisibility,
      });

      setModalVisible(false);
      await loadData();
    } catch (err) {
      console.error('Save remark error', err);
      Alert.alert('Error', 'Failed to save remark. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (remark: RemarkWithStudent) => {
    Alert.alert(
      'Delete Remark',
      `Delete remark for ${remark.studentName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRemark(remark.id);
              setRemarks(prev => prev.filter(r => r.id !== remark.id));
            } catch (err) {
              console.error('Delete remark error', err);
              Alert.alert('Error', 'Failed to delete remark.');
            }
          },
        },
      ],
    );
  };

  const filteredRemarks = useMemo(() => {
    return remarks.filter(r => {
      const matchCat = selectedCategoryFilter === 'all' || r.category === selectedCategoryFilter;
      const matchQuery = !searchQuery.trim() ||
        r.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.remark.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [remarks, selectedCategoryFilter, searchQuery]);

  const filteredModalStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(s =>
      s.full_name.toLowerCase().includes(q) ||
      (s.roll_number != null && String(s.roll_number).toLowerCase().includes(q)),
    );
  }, [students, studentSearch]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <Header title="Student Remarks" showBack />
          <MobileListSkeleton rows={5} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <Header
          title="Student Remarks"
          showBack
          rightAction={
            <TouchableOpacity
              onPress={openAddModal}
              activeOpacity={0.8}
              style={styles.headerAddBtn}>
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.headerAddBtnText}>Add Remark</Text>
            </TouchableOpacity>
          }
        />

        {/* Search bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={COLORS.textDim} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by student or remark..."
              placeholderTextColor={COLORS.textDim}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={COLORS.textDim} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Category Filter Chips */}
        <View style={styles.categoryFilterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilterRow}>
            <TouchableOpacity
              onPress={() => setSelectedCategoryFilter('all')}
              activeOpacity={0.8}
              style={[
                styles.categoryFilterChip,
                selectedCategoryFilter === 'all' && styles.categoryFilterChipActive,
              ]}>
              <Text
                style={[
                  styles.categoryFilterChipText,
                  selectedCategoryFilter === 'all' && styles.categoryFilterChipTextActive,
                ]}>
                All ({remarks.length})
              </Text>
            </TouchableOpacity>

            {CATEGORIES.map(cat => {
              const isSelected = selectedCategoryFilter === cat.key;
              const count = remarks.filter(r => r.category === cat.key).length;
              return (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => setSelectedCategoryFilter(cat.key)}
                  activeOpacity={0.8}
                  style={[
                    styles.categoryFilterChip,
                    isSelected && { backgroundColor: cat.text, borderColor: cat.text },
                  ]}>
                  <Text
                    style={[
                      styles.categoryFilterChipText,
                      isSelected && { color: '#FFFFFF', fontWeight: '700' },
                    ]}>
                    {cat.label} ({count})
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

          {filteredRemarks.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="chatbubble-ellipses-outline"
                title="No remarks found"
                subtitle={searchQuery ? 'Try matching another name or query.' : "Tap 'Add Remark' to post academic or behavioral feedback."}
              />
            </View>
          ) : (
            filteredRemarks.map(remark => {
              const catConfig = CATEGORIES.find(c => c.key === remark.category) ?? CATEGORIES[0];
              const visConfig = VISIBILITIES.find(v => v.value === remark.visibility) ?? VISIBILITIES[0];

              return (
                <GlassCard key={remark.id} style={styles.remarkCard} padding={SPACING.md}>
                  <View style={styles.remarkHeader}>
                    <Avatar
                      name={remark.studentName}
                      size={40}
                      color={COLORS.primary}
                    />

                    <View style={styles.remarkStudentInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.remarkStudentName} numberOfLines={1}>
                          {remark.studentName}
                        </Text>
                        {remark.className ? (
                          <Text style={styles.classSubtitle}>
                            • {remark.className} - {remark.sectionName}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.remarkDate}>{formatDate(remark.created_at)}</Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleDelete(remark)}
                      activeOpacity={0.8}
                      style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.remarkText}>{remark.remark}</Text>

                  <View style={styles.remarkFooter}>
                    <View
                      style={[
                        styles.catBadge,
                        { backgroundColor: catConfig.bg, borderColor: catConfig.border },
                      ]}>
                      <Text style={[styles.catBadgeText, { color: catConfig.text }]}>
                        {catConfig.label}
                      </Text>
                    </View>

                    <View style={styles.visibilityBadge}>
                      <Ionicons name={visConfig.icon} size={13} color={COLORS.textDim} />
                      <Text style={styles.visibilityText}>{visConfig.label}</Text>
                    </View>
                  </View>
                </GlassCard>
              );
            })
          )}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </SafeAreaView>

      {/* Add Remark Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setModalVisible(false)}
            />
            <View style={styles.modalSheet}>
              {/* Modal Drag Handle */}
              <View style={styles.dragHandleWrap}>
                <View style={styles.dragHandle} />
              </View>

              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Add Student Remark</Text>
                  <Text style={styles.modalSubtitle}>Provide student feedback or observations</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled">

                {/* Student Selector */}
                <Text style={styles.modalSectionLabel}>Select Student</Text>
                <View style={styles.studentSearchBox}>
                  <Ionicons name="search-outline" size={16} color={COLORS.textDim} />
                  <TextInput
                    style={styles.studentSearchInput}
                    placeholder="Search student by name or roll..."
                    placeholderTextColor={COLORS.textDim}
                    value={studentSearch}
                    onChangeText={setStudentSearch}
                  />
                </View>

                <ScrollView
                  style={styles.studentListScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}>
                  {filteredModalStudents.slice(0, 15).map(student => {
                    const isSelected = student.id === selectedStudentId;
                    return (
                      <TouchableOpacity
                        key={student.id}
                        onPress={() => setSelectedStudentId(student.id)}
                        activeOpacity={0.8}
                        style={[
                          styles.studentItem,
                          isSelected && styles.studentItemActive,
                        ]}>
                        <Avatar
                          name={student.full_name}
                          size={32}
                          color={student.gender === 'female' ? '#EC4899' : COLORS.primary}
                        />
                        <View style={styles.studentItemDetails}>
                          <Text style={[styles.studentItemName, isSelected && styles.studentItemNameActive]}>
                            {student.full_name}
                          </Text>
                          <Text style={styles.studentItemMeta}>
                            Roll #{student.roll_number || '—'}
                          </Text>
                        </View>
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                        ) : (
                          <View style={styles.unselectedCircle} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Category Picker */}
                <Text style={styles.modalSectionLabel}>Category</Text>
                <View style={styles.categoryPickerRow}>
                  {CATEGORIES.map(cat => {
                    const isSelected = selectedCategory === cat.key;
                    return (
                      <TouchableOpacity
                        key={cat.key}
                        onPress={() => setSelectedCategory(cat.key)}
                        activeOpacity={0.8}
                        style={[
                          styles.modalCatChip,
                          isSelected && { backgroundColor: cat.bg, borderColor: cat.text },
                        ]}>
                        <Text
                          style={[
                            styles.modalCatChipText,
                            isSelected && { color: cat.text, fontWeight: '700' },
                          ]}>
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Remark Text input */}
                <Text style={styles.modalSectionLabel}>Remark Description</Text>
                <TextInput
                  style={styles.remarkInput}
                  value={remarkText}
                  onChangeText={setRemarkText}
                  placeholder="Type your feedback, performance remark, or behavior observation..."
                  placeholderTextColor={COLORS.textDim}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                {/* Visibility Options */}
                <Text style={styles.modalSectionLabel}>Visibility</Text>
                <View style={styles.visibilityOptions}>
                  {VISIBILITIES.map(v => {
                    const isSelected = selectedVisibility === v.value;
                    return (
                      <TouchableOpacity
                        key={v.value}
                        onPress={() => setSelectedVisibility(v.value)}
                        activeOpacity={0.8}
                        style={[
                          styles.visibilityCard,
                          isSelected && styles.visibilityCardActive,
                        ]}>
                        <Ionicons
                          name={v.icon}
                          size={18}
                          color={isSelected ? COLORS.primary : COLORS.textMuted}
                        />
                        <View style={styles.visibilityTextWrap}>
                          <Text
                            style={[
                              styles.visibilityTitle,
                              isSelected && styles.visibilityTitleActive,
                            ]}>
                            {v.label}
                          </Text>
                          <Text style={styles.visibilityDesc}>{v.desc}</Text>
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Save button */}
                <TouchableOpacity
                  onPress={handleSave}
                  activeOpacity={0.85}
                  disabled={saving}
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.saveBtnText}>Publish Remark</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={{ height: SPACING.lg }} />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  headerAddBtnText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F5FB',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  categoryFilterSection: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: SPACING.sm,
  },
  categoryFilterRow: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  categoryFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryFilterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryFilterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  categoryFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  emptyWrap: {
    marginTop: 48,
    alignItems: 'center',
  },
  remarkCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    ...SHADOW.sm,
  },
  remarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  remarkStudentInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  remarkStudentName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  classSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  remarkDate: {
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 2,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
  },
  remarkText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 21,
    marginBottom: SPACING.md,
  },
  remarkFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  catBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F4F5FB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  visibilityText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '92%',
    ...SHADOW.lg,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  modalSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    marginTop: SPACING.sm,
  },
  studentSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F5FB',
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
    marginBottom: 6,
  },
  studentSearchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
  },
  studentListScroll: {
    maxHeight: 140,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F4F5FB',
    padding: 4,
    marginBottom: SPACING.sm,
  },
  studentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: '#FFFFFF',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  studentItemActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#EEF0FD',
  },
  studentItemDetails: {
    flex: 1,
  },
  studentItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  studentItemNameActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  studentItemMeta: {
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 1,
  },
  unselectedCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  categoryPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  modalCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: '#F4F5FB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalCatChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  remarkInput: {
    backgroundColor: '#F4F5FB',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 90,
    marginBottom: SPACING.sm,
  },
  visibilityOptions: {
    gap: 6,
    marginBottom: SPACING.lg,
  },
  visibilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: RADIUS.md,
    backgroundColor: '#F4F5FB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  visibilityCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#EEF0FD',
  },
  visibilityTextWrap: {
    flex: 1,
  },
  visibilityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  visibilityTitleActive: {
    color: COLORS.primary,
  },
  visibilityDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 11,
    ...SHADOW.md,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
