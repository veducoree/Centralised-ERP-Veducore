import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import {
  fetchTeacherByUserId,
  fetchSubjects,
  createSubject,
  createClassAssignment,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW } from '@/lib/utils';
import { generateSubjectCode } from '@/lib/subjectUtils';
import { Button } from '@/components/ui/Button';
import { VeducoreLoader } from '@/components/ui/Skeleton';
import type { Subject, ClassAssignment } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AddSubjectModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  classId: string;
  sectionId: string;
  className: string;
  sectionName: string;
  existingSubjectIds?: string[];
}

export function AddSubjectModal({
  visible,
  onClose,
  onSuccess,
  classId,
  sectionId,
  className,
  sectionName,
  existingSubjectIds = [],
}: AddSubjectModalProps) {
  const { user, profile } = useAuth();
  const schoolId = profile?.school_id || 'school-001';

  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New subject fields
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');

  const handleNameChange = (val: string) => {
    setNewName(val);
    const autoCode = generateSubjectCode(val, allSubjects.map(s => s.code));
    setNewCode(autoCode);
  };

  useEffect(() => {
    if (!visible) return;
    (async () => {
      setLoading(true);
      try {
        const subs = await fetchSubjects(schoolId);
        setAllSubjects(subs);
        const unassigned = subs.filter(s => !existingSubjectIds.includes(s.id));
        if (unassigned.length > 0) {
          setSelectedSubjectId(unassigned[0].id);
        } else {
          setSelectedSubjectId('');
        }
      } catch (err) {
        console.error('AddSubjectModal load error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, existingSubjectIds, schoolId]);

  const handleSubmit = async () => {
    if (!classId || !sectionId) {
      Alert.alert('Error', 'Class or section information is missing.');
      return;
    }
    if (!user?.id) return;

    setSubmitting(true);
    try {
      const teacher = await fetchTeacherByUserId(user.id);
      if (!teacher) {
        Alert.alert('Error', 'Teacher profile not found.');
        return;
      }

      let subjectToAssignId = selectedSubjectId;

      if (tab === 'new') {
        if (!newName.trim()) {
          Alert.alert('Validation Error', 'Please enter a subject name');
          setSubmitting(false);
          return;
        }

        const codeVal = newCode.trim() ? newCode.trim().toUpperCase() : newName.trim().slice(0, 4).toUpperCase();
        const newSub = await createSubject(schoolId, newName.trim(), codeVal);
        if (!newSub) throw new Error('Failed to create subject');
        subjectToAssignId = newSub.id;
      } else {
        if (!subjectToAssignId) {
          Alert.alert('Validation Error', 'Please choose a subject to assign');
          setSubmitting(false);
          return;
        }
      }

      await createClassAssignment({
        teacher_id: teacher.id,
        section_id: sectionId,
        subject_id: subjectToAssignId,
        is_class_teacher: false,
      });

      Alert.alert('Subject Assigned', `Subject successfully added to ${className} – Section ${sectionName}!`);
      onSuccess();
      onClose();

      // Reset
      setNewName('');
      setNewCode('');
    } catch (err) {
      console.error('Failed to assign subject', err);
      Alert.alert('Error', 'Failed to assign subject');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerHandle} />
            <View style={styles.headerTitleRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.headerTitle}>Add Subject to Class</Text>
                <Text style={styles.headerSubtitle}>
                  {className} &bull; Section {sectionName}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mode switch */}
          <View style={styles.tabToggleRow}>
            <TouchableOpacity
              style={[styles.tabToggleBtn, tab === 'existing' && styles.tabToggleActive]}
              onPress={() => setTab('existing')}
              activeOpacity={0.8}>
              <Ionicons
                name="list-outline"
                size={15}
                color={tab === 'existing' ? COLORS.primary : COLORS.textMuted}
              />
              <Text style={[styles.tabToggleText, tab === 'existing' && styles.tabToggleTextActive]}>
                Choose Existing
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabToggleBtn, tab === 'new' && styles.tabToggleActive]}
              onPress={() => setTab('new')}
              activeOpacity={0.8}>
              <Ionicons
                name="add-circle-outline"
                size={15}
                color={tab === 'new' ? COLORS.primary : COLORS.textMuted}
              />
              <Text style={[styles.tabToggleText, tab === 'new' && styles.tabToggleTextActive]}>
                Create New Subject
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <VeducoreLoader size="sm" style={{ minHeight: 200 }} />
          ) : (
            <ScrollView
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {tab === 'existing' ? (
                <View>
                  <Text style={styles.fieldLabel}>Select Subject from School Curriculum</Text>
                  <Text style={styles.fieldHint}>
                    Tap a subject below to assign it to your class timetable and marks roster.
                  </Text>

                  <View style={styles.subjectList}>
                    {allSubjects.map(sub => {
                      const isAlreadyAssigned = existingSubjectIds.includes(sub.id);
                      const isSelected = selectedSubjectId === sub.id;

                      return (
                        <TouchableOpacity
                          key={sub.id}
                          disabled={isAlreadyAssigned}
                          onPress={() => setSelectedSubjectId(sub.id)}
                          activeOpacity={0.8}
                          style={[
                            styles.subjectSelectCard,
                            isSelected && styles.subjectSelectCardActive,
                            isAlreadyAssigned && styles.subjectSelectCardDisabled,
                          ]}>
                          <View style={styles.subLeft}>
                            <View
                              style={[
                                styles.subIconBadge,
                                isSelected && { backgroundColor: COLORS.primary },
                                isAlreadyAssigned && { backgroundColor: '#F1F5F9' },
                              ]}>
                              <Ionicons
                                name={isAlreadyAssigned ? 'checkmark-done' : 'book-outline'}
                                size={16}
                                color={isAlreadyAssigned ? COLORS.textDim : isSelected ? '#FFFFFF' : COLORS.primary}
                              />
                            </View>
                            <View>
                              <Text
                                style={[
                                  styles.subNameText,
                                  isAlreadyAssigned && { color: COLORS.textDim },
                                  isSelected && { color: COLORS.primary, fontWeight: '700' },
                                ]}>
                                {sub.name}
                              </Text>
                              <Text style={styles.subCodeText}>Code: {sub.code || 'N/A'}</Text>
                            </View>
                          </View>

                          <View>
                            {isAlreadyAssigned ? (
                              <Text style={styles.assignedBadge}>Already Assigned</Text>
                            ) : isSelected ? (
                              <View style={styles.radioSelected}>
                                <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                              </View>
                            ) : (
                              <View style={styles.radioEmpty} />
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.fieldLabel}>Subject Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Artificial Intelligence, Sanskrit, Art"
                    placeholderTextColor={COLORS.textDim}
                    value={newName}
                    onChangeText={handleNameChange}
                    autoCapitalize="words"
                  />

                  <View style={styles.codeLabelRow}>
                    <Text style={styles.fieldLabel}>Subject Code</Text>
                    <View style={styles.autoCodeBadge}>
                      <Ionicons name="sparkles" size={12} color="#4F46E5" />
                      <Text style={styles.autoCodeBadgeText}>AUTO-GENERATED</Text>
                    </View>
                  </View>
                  <TextInput
                    style={[styles.input, styles.codeInputAuto]}
                    placeholder="Auto-generated from name"
                    placeholderTextColor={COLORS.textDim}
                    value={newCode}
                    onChangeText={setNewCode}
                    autoCapitalize="characters"
                  />

                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.infoBoxText}>
                      This will register the subject in Veducore&apos;s curriculum with auto-assigned code and link it directly to your class assignment roster.
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.actionsRow}>
                <Button
                  label="Cancel"
                  onPress={onClose}
                  variant="ghost"
                  style={{ flex: 1 }}
                />
                <Button
                  label={tab === 'existing' ? 'Assign Subject' : 'Create & Assign'}
                  onPress={handleSubmit}
                  loading={submitting}
                  variant="primary"
                  style={{ flex: 1.5 }}
                />
              </View>

              <View style={{ height: SPACING.xl }} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: SCREEN_HEIGHT * 0.78,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
    ...SHADOW.lg,
  },
  header: {
    paddingTop: 10,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  headerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabToggleRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  tabToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabToggleActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  tabToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabToggleTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },

  formContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
    backgroundColor: '#F8FAFC',
  },
  loaderWrap: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
    marginTop: 8,
  },
  fieldHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },

  subjectList: {
    gap: 8,
    marginTop: 4,
  },
  subjectSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.sm,
  },
  subjectSelectCardActive: {
    backgroundColor: '#EEF2FF',
    borderColor: COLORS.primary,
  },
  subjectSelectCardDisabled: {
    opacity: 0.5,
    backgroundColor: '#F8FAFC',
  },
  subLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  subCodeText: {
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 1,
  },
  assignedBadge: {
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  radioSelected: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: RADIUS.md,
    padding: 10,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  infoBoxText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.primary,
    lineHeight: 17,
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: SPACING.lg,
  },
  codeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginTop: 4,
  },
  autoCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  autoCodeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
    letterSpacing: 0.5,
  },
  codeInputAuto: {
    backgroundColor: '#F8FAFC',
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: 1,
  },
});
