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
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Header } from '@/components/layout/Header';
import {
  fetchTeacherByUserId,
  fetchTeacherAssignments,
  fetchExamDefs,
  fetchExamScheduleFor,
  fetchClasses,
  fetchSubjects,
  fetchStudentsBySection,
  fetchStudentRecords,
  createStudentRecord,
  fetchRecordsForExamSubject,
  deleteStudentRecord,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, formatDate } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileListSkeleton, MobileInlineSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type {
  ClassAssignment,
  Class,
  Section,
  Subject,
  Student,
  StudentRecord,
  ExamDef,
} from '@/types';

function computeGrade(marks: number, maxMarks: number): string {
  const pct = maxMarks > 0 ? (marks / maxMarks) * 100 : 0;
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 33) return 'D';
  return 'F';
}

function getRecordTypeLabel(rt: string): string {
  const labels: Record<string, string> = {
    unit_test: 'Unit Test',
    mid_term: 'Mid Term',
    final_exam: 'Final Exam',
    assignment: 'Assignment',
    practical: 'Practical',
  };
  return labels[rt] || rt;
}

export default function TeacherMarks() {
  const { user: _user } = useAuth();

  const [view, setView] = useState<'list' | 'enter-marks'>('list');
  const [examDefs, setExamDefs] = useState<ExamDef[]>([]);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allRecords, setAllRecords] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter exams by section
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');


  // Enter Marks view state
  const [selectedExam, setSelectedExam] = useState<ExamDef | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [sectionStudents, setSectionStudents] = useState<Student[]>([]);
  const [marksInput, setMarksInput] = useState<Record<string, string>>({});
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [savingMarks, setSavingMarks] = useState(false);
  const [schedule, setSchedule] = useState<{ exam_id: string; class_id: string; subject_id: string; max_marks: number }[]>([]);
  const [selectedMax, setSelectedMax] = useState(100);

  const { user } = useAuth();

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const teacher = await fetchTeacherByUserId(user.id);
      if (!teacher) return;

      const [defs, ca, cls, sub, records] = await Promise.all([
        fetchExamDefs({ schoolId: teacher.school_id }),
        fetchTeacherAssignments(teacher.id),
        fetchClasses(teacher.school_id),
        fetchSubjects(teacher.school_id),
        fetchStudentRecords({ teacherId: teacher.id, schoolId: teacher.school_id }),
      ]);

      const secList: Section[] = cls.flatMap(c => c.sections || []);

      // Exams are scheduled by the office; teachers only enter marks.
      const officeDefs = defs.filter(d => d.exam_id);
      setExamDefs(officeDefs);
      const examIds = [...new Set(officeDefs.map(d => d.exam_id as string))];
      setSchedule(await fetchExamScheduleFor(examIds).catch(() => []));
      setAssignments(ca);
      setClasses(cls);
      setSections(secList);
      setSubjects(sub);
      setAllRecords(records);

    } catch (err) {
      console.error('Teacher marks load error', err);
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

  // Section options for teacher
  const uniqueSections = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; label: string }[] = [];
    for (const a of assignments) {
      if (!seen.has(a.section_id)) {
        seen.add(a.section_id);
        const cls = classes.find(c => c.id === a.class_id);
        const sec = sections.find(s => s.id === a.section_id);
        list.push({
          id: a.section_id,
          label: `${cls?.name ?? 'Class'} - ${sec?.name ?? 'Section'}`,
        });
      }
    }
    return list;
  }, [assignments, classes, sections]);

  // Section label helper
  const sectionLabelFor = (secId: string): string => {
    const sec = sections.find(s => s.id === secId);
    if (!sec) return secId;
    const cls = classes.find(c => c.id === sec.class_id);
    return `${cls?.name ?? 'Class'} - ${sec.name}`;
  };

  // Subjects available for an exam based on teacher's assignments
  const classIdOf = (sectionId: string) => sections.find(s => s.id === sectionId)?.class_id;

  // Class teacher: every subject on the exam's datesheet for the class.
  // Subject teacher: only their own subjects from that datesheet.
  const getSubjectsForExam = (exam: ExamDef): Subject[] => {
    const classId = classIdOf(exam.section_id);
    const scheduled = schedule.filter(r => r.exam_id === exam.exam_id && r.class_id === classId).map(r => r.subject_id);
    const isClassTeacher = assignments.some(a => a.section_id === exam.section_id && !a.subject_id);
    const mineIds = new Set(assignments.filter(a => a.section_id === exam.section_id && a.subject_id).map(a => a.subject_id as string));
    const allowed = isClassTeacher ? scheduled : scheduled.filter(id => mineIds.has(id));
    return subjects.filter(sub => allowed.includes(sub.id));
  };

  const maxFor = (exam: ExamDef, subjectId: string) => {
    const classId = classIdOf(exam.section_id);
    const row = schedule.find(r => r.exam_id === exam.exam_id && r.class_id === classId && r.subject_id === subjectId);
    return Number(row?.max_marks ?? exam.max_marks);
  };

  // Count marked students for an exam and subject
  const countMarked = (exam: ExamDef, subject: Subject): { marked: number; total: number } => {
    const records = allRecords.filter(
      r => r.exam_name.toLowerCase() === exam.exam_name.toLowerCase()
        && r.subject_id === subject.id
        && (r as { student?: { section_id?: string | null } }).student?.section_id === exam.section_id
    );
    return { marked: records.length, total: 5 };
  };

  const openEnterMarks = async (exam: ExamDef, subject: Subject) => {
    setSelectedExam(exam);
    setSelectedSubject(subject);
    setSelectedMax(maxFor(exam, subject.id));
    setView('enter-marks');
    setStudentsLoading(true);

    try {
      const students = await fetchStudentsBySection(exam.section_id);
      setSectionStudents(students);

      const existing = await fetchRecordsForExamSubject(exam.exam_name, subject.id, students.map(s => s.id));

      const marks: Record<string, string> = {};
      const comments: Record<string, string> = {};

      for (const r of existing) {
        marks[r.student_id] = String(r.marks);
        comments[r.student_id] = r.teacher_comment ?? '';
      }

      setMarksInput(marks);
      setCommentInput(comments);
    } catch (err) {
      console.error('Open enter marks error', err);
    } finally {
      setStudentsLoading(false);
    }
  };

  // Save Marks handler
  const handleSaveMarks = async () => {
    if (!selectedExam || !selectedSubject) return;
    setSavingMarks(true);
    try {
      const teacher = user?.id ? await fetchTeacherByUserId(user.id) : null;
      const schoolId = teacher?.school_id || 'school-001';

      // Only this section's marks for this exam + subject are replaced.
      const existing = await fetchRecordsForExamSubject(
        selectedExam.exam_name, selectedSubject.id, sectionStudents.map(s => s.id));

      for (const r of existing) {
        await deleteStudentRecord(r.id);
      }

      for (const st of sectionStudents) {
        const val = marksInput[st.id];
        if (val === undefined || val === '') continue;
        const num = parseFloat(val);
        if (isNaN(num)) continue;

        const grade = computeGrade(num, selectedMax);
        await createStudentRecord({
          school_id: schoolId,
          student_id: st.id,
          teacher_id: teacher?.id,
          subject_id: selectedSubject.id,
          subject_name: selectedSubject.name,
          record_type: selectedExam.record_type,
          exam_name: selectedExam.exam_name,
          marks: num,
          max_marks: selectedMax,
          grade,
          date: selectedExam.date,
          teacher_comment: commentInput[st.id] || null,
        });
      }

      Alert.alert('Marks Saved', 'Marks and comments have been recorded successfully.');
      await loadData();
      setView('list');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert('Error', /row-level security|policy/i.test(msg)
        ? 'Results for this exam are published, so marks are locked. Ask the office to unpublish to make changes.'
        : 'Failed to save marks.');
    } finally {
      setSavingMarks(false);
    }
  };

  const filteredExams = useMemo(() => {
    if (selectedSectionFilter === 'all') return examDefs;
    return examDefs.filter(d => d.section_id === selectedSectionFilter);
  }, [examDefs, selectedSectionFilter]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.content}>
          <Header title="Exam Marks" />
          <MobileListSkeleton rows={5} />
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW: ENTER MARKS
  // ─────────────────────────────────────────────────────────────
  if (view === 'enter-marks' && selectedExam && selectedSubject) {
    const filledCount = sectionStudents.filter(
      s => marksInput[s.id] !== undefined && marksInput[s.id] !== ''
    ).length;

    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.content}>
          <Header
            title="Enter Marks"
            showBack
            onBackPress={() => setView('list')}
          />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">

            {/* Exam & Subject Summary Banner */}
            <GlassCard style={styles.marksBannerCard} padding={SPACING.md}>
              <View style={styles.bannerTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerExamName}>{selectedExam.exam_name}</Text>
                  <Text style={styles.bannerSubTitle}>
                    {selectedSubject.name} · {sectionLabelFor(selectedExam.section_id)}
                  </Text>
                </View>
                <View style={styles.bannerMaxMarksPill}>
                  <Text style={styles.bannerMaxMarksVal}>Max {selectedMax} pts</Text>
                </View>
              </View>

              <View style={styles.bannerMetaRow}>
                <View style={styles.metaBadge}>
                  <Ionicons name="calendar-outline" size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.metaBadgeText}>{formatDate(selectedExam.date)}</Text>
                </View>
                <View style={styles.metaBadge}>
                  <Ionicons name="people-outline" size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.metaBadgeText}>
                    {filledCount}/{sectionStudents.length} Marked
                  </Text>
                </View>
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>{getRecordTypeLabel(selectedExam.record_type)}</Text>
                </View>
              </View>
            </GlassCard>

            {/* Student Mark Entry List */}
            {studentsLoading ? (
              <MobileInlineSkeleton rows={5} />
            ) : sectionStudents.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No students found"
                subtitle="There are no students enrolled in this section."
              />
            ) : (
              <View style={styles.marksEntryList}>
                {sectionStudents.map((student, idx) => {
                  const currentVal = marksInput[student.id] ?? '';
                  const num = parseFloat(currentVal);
                  const valid = !isNaN(num) && num >= 0 && num <= selectedMax;
                  const grade = valid ? computeGrade(num, selectedMax) : null;
                  const isOverMax = !isNaN(num) && num > selectedMax;

                  return (
                    <GlassCard key={student.id} style={styles.entryCard} padding={SPACING.md}>
                      {/* Student Header */}
                      <View style={styles.entryHeaderRow}>
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
                          <Text style={styles.studentName}>{student.full_name}</Text>
                          <Text style={styles.studentSubtitle}>
                            Adm No: #{student.admission_number}
                          </Text>
                        </View>

                        {grade && (
                          <View style={styles.gradePill}>
                            <Text style={styles.gradeText}>{grade}</Text>
                          </View>
                        )}
                      </View>

                      {/* Marks Input & Comment */}
                      <View style={styles.entryInputsRow}>
                        <View style={styles.marksInputWrap}>
                          <Text style={styles.inputFieldLabel}>Marks (/{selectedMax})</Text>
                          <TextInput
                            style={[styles.numericInput, isOverMax && styles.inputError]}
                            keyboardType="numeric"
                            placeholder="e.g. 45"
                            placeholderTextColor={COLORS.textLight}
                            value={currentVal}
                            onChangeText={txt => setMarksInput(prev => ({ ...prev, [student.id]: txt }))}
                          />
                          {isOverMax && (
                            <Text style={styles.errorText}>Max {selectedMax}</Text>
                          )}
                        </View>

                        <View style={styles.commentInputWrap}>
                          <Text style={styles.inputFieldLabel}>Teacher Comment (Optional)</Text>
                          <TextInput
                            style={styles.commentTextInput}
                            placeholder="Add brief remark..."
                            placeholderTextColor={COLORS.textLight}
                            value={commentInput[student.id] ?? ''}
                            onChangeText={txt => setCommentInput(prev => ({ ...prev, [student.id]: txt }))}
                          />
                        </View>
                      </View>
                    </GlassCard>
                  );
                })}
              </View>
            )}

            <View style={{ height: 110 }} />
          </ScrollView>

          {/* Floating Save Button */}
          {sectionStudents.length > 0 && (
            <View style={styles.floatingBottomBar}>
              <Button
                label={savingMarks ? 'Saving Marks...' : 'Save & Submit Marks'}
                icon="save-outline"
                variant="primary"
                loading={savingMarks}
                fullWidth
                onPress={handleSaveMarks}
              />
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW: EXAMS LIST (DEFAULT)
  // ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Header title="Examination & Marks" />

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

          <View style={styles.examTopActionRow}>
            <View style={styles.pageTitleBlock}>
              <Text style={styles.pageTitle} numberOfLines={1}>Exam Marks</Text>
              <Text style={styles.pageSubtitle} numberOfLines={2}>Exams are set by the office. Enter marks for your subjects.</Text>
            </View>
          </View>

          {/* Section Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipsRow}>
            <TouchableOpacity
              onPress={() => setSelectedSectionFilter('all')}
              style={[
                styles.filterChip,
                selectedSectionFilter === 'all' && styles.filterChipActive,
              ]}>
              <Text
                style={[
                  styles.filterChipText,
                  selectedSectionFilter === 'all' && styles.filterChipTextActive,
                ]}>
                All Sections ({examDefs.length})
              </Text>
            </TouchableOpacity>

            {uniqueSections.map(s => {
              const active = selectedSectionFilter === s.id;
              const count = examDefs.filter(d => d.section_id === s.id).length;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSelectedSectionFilter(s.id)}
                  style={[styles.filterChip, active && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {s.label} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Exam Cards List */}
          {filteredExams.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="stats-chart-outline"
                title="No exams found"
                subtitle="Exams appear here once the office adds them with a datesheet."
              />
            </View>
          ) : (
            filteredExams.map(exam => {
              const subjectsForExam = getSubjectsForExam(exam);
              return (
                <GlassCard key={exam.id} style={styles.examCard} padding={SPACING.md}>
                  {/* Top Row: Exam Name, Type, Delete */}
                  <View style={styles.examCardHeader}>
                    <View style={styles.examIconWrap}>
                      <Ionicons name="clipboard-outline" size={20} color={COLORS.primary} />
                    </View>

                    <View style={styles.examHeaderMeta}>
                      <View style={styles.examTitleRow}>
                        <Text style={styles.examNameText}>{exam.exam_name}</Text>
                        <View style={styles.examTypePill}>
                          <Text style={styles.examTypePillText}>{getRecordTypeLabel(exam.record_type)}</Text>
                        </View>
                      </View>

                      <Text style={styles.examSectionSub}>
                        {sectionLabelFor(exam.section_id)} · {formatDate(exam.date)}
                      </Text>
                    </View>

                  </View>

                  <View style={styles.examDivider} />

                  {/* Subjects for this Exam */}
                  <Text style={styles.examSubjectsTitle}>Subjects & Mark Entry</Text>
                  {subjectsForExam.length === 0 ? (
                    <Text style={styles.noSubText}>No assigned subjects for this section</Text>
                  ) : (
                    <View style={styles.examSubjectList}>
                      {subjectsForExam.map(subj => {
                        const { marked } = countMarked(exam, subj);
                        return (
                          <TouchableOpacity
                            key={subj.id}
                            onPress={() => openEnterMarks(exam, subj)}
                            activeOpacity={0.75}
                            style={styles.subjectEntryRow}>
                            <View style={styles.subjectRowLeft}>
                              <Ionicons name="book-outline" size={16} color={COLORS.primary} style={{ marginRight: 8 }} />
                              <View>
                                <Text style={styles.subjectRowName}>{subj.name}</Text>
                                {subj.code && <Text style={styles.subjectRowCode}>{subj.code}</Text>}
                              </View>
                            </View>

                            <View style={styles.subjectRowRight}>
                              <View
                                style={[
                                  styles.markedStatusPill,
                                  marked > 0 ? styles.markedStatusActive : styles.markedStatusEmpty,
                                ]}>
                                <Text
                                  style={[
                                    styles.markedStatusText,
                                    marked > 0 ? { color: '#047857' } : { color: COLORS.textMuted },
                                  ]}>
                                  {marked > 0 ? `${marked} Recorded` : 'Pending'}
                                </Text>
                              </View>

                              <View style={styles.enterMarksBtn}>
                                <Text style={styles.enterMarksBtnText}>Enter</Text>
                                <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </GlassCard>
              );
            })
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
  loadingArea: { alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs },

  examTopActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    gap: 8,
  },
  pageTitleBlock: {
    flex: 1,
    paddingRight: 6,
  },
  pageTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  pageSubtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  addExamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 0,
    ...SHADOW.sm,
  },
  addExamBtnText: { flexShrink: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  filterChipsRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.md },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  emptyWrap: { marginTop: 40 },

  examCard: { marginBottom: SPACING.md, borderRadius: RADIUS.lg },
  examCardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  examIconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: '#EEF0FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  examHeaderMeta: { flex: 1 },
  examTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  examNameText: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  examTypePill: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  examTypePillText: { fontSize: 10, fontWeight: '700', color: '#0369A1' },
  examSectionSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  deleteExamBtn: {
    padding: 7,
    borderRadius: RADIUS.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  examDivider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: SPACING.sm + 2 },
  examSubjectsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  noSubText: { fontSize: 12, color: COLORS.textLight, fontStyle: 'italic' },
  examSubjectList: { gap: 8 },
  subjectEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F4F5FB',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  subjectRowLeft: { flexDirection: 'row', alignItems: 'center' },
  subjectRowName: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: COLORS.text },
  subjectRowCode: { fontSize: 11, color: COLORS.textMuted },
  subjectRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  markedStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm },
  markedStatusActive: { backgroundColor: '#ECFDF5' },
  markedStatusEmpty: { backgroundColor: '#F1F5F9' },
  markedStatusText: { fontSize: 10, fontWeight: '700' },
  enterMarksBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF0FD',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  enterMarksBtnText: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: COLORS.primary, marginRight: 2 },

  // Enter Marks Banner
  marksBannerCard: { marginBottom: SPACING.md, borderRadius: RADIUS.lg },
  bannerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bannerExamName: { flexShrink: 1, fontSize: 18, fontWeight: '700', color: COLORS.text },
  bannerSubTitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  bannerMaxMarksPill: {
    backgroundColor: '#EEF0FD',
    borderWidth: 1,
    borderColor: '#C7CDFB',
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bannerMaxMarksVal: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  bannerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.sm, flexWrap: 'wrap' },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaBadgeText: { flexShrink: 1, fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },

  studentsLoadingWrap: { paddingVertical: 30, alignItems: 'center', gap: 6 },
  loadingText: { color: COLORS.textMuted, fontSize: 13 },

  marksEntryList: { gap: 10 },
  entryCard: { borderRadius: RADIUS.lg },
  entryHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
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
  gradePill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  gradeText: { fontSize: 13, fontWeight: '700', color: '#047857' },

  entryInputsRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.sm,
  },
  marksInputWrap: { width: 110 },
  inputFieldLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4 },
  numericInput: {
    height: 42,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  inputError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  errorText: { fontSize: 10, color: '#EF4444', marginTop: 2 },
  commentInputWrap: { flex: 1 },
  commentTextInput: {
    height: 42,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    color: COLORS.text,
    fontSize: 13,
  },

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

  // Modal styles
  modalOverlay: { flex: 1, justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', padding: SPACING.md },
  modalBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    ...SHADOW.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: { flexShrink: 1, fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalLabel: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 5, marginTop: 10 },
  modalInput: {
    height: 44,
    backgroundColor: '#F4F5FB',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    color: COLORS.text,
    fontSize: 14,
  },
  typePickerScroll: { flexDirection: 'row', gap: 6, marginVertical: 4 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 6,
  },
  typeChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  typeChipTextActive: { color: '#FFFFFF', fontWeight: '700' },
  modalTwoCols: { flexDirection: 'row', marginTop: 4 },
  modalActionsRow: { flexDirection: 'row', gap: 10, marginTop: SPACING.lg },
});
