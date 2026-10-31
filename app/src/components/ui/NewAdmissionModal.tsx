import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { fetchClasses, createStudent } from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import type { Class, Section, Student } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NewAdmissionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (student: Student) => void;
  defaultSectionId?: string;
  inchargeSectionIds?: string[];
}

export function NewAdmissionModal({
  visible,
  onClose,
  onSuccess,
  defaultSectionId,
  inchargeSectionIds,
}: NewAdmissionModalProps) {
  const { profile } = useAuth();
  const schoolId = profile?.school_id || 'school-001';

  // Step/Tab inside Admission: 'personal' | 'parents' | 'academic'
  const [tab, setTab] = useState<'personal' | 'parents' | 'academic'>('personal');

  // Personal Fields
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [dob, setDob] = useState('2018-04-12');
  const [address, setAddress] = useState('');

  // Parent Fields
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');

  // Academic Fields
  const [classes, setClasses] = useState<Class[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [admissionNo, setAdmissionNo] = useState(() => `ADM-2026-${Math.floor(100 + Math.random() * 900)}`);
  const [admissionDate, setAdmissionDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const clsList = await fetchClasses(schoolId);
        let secList: Section[] = [];
        clsList.forEach(c => {
          if (c.sections) secList.push(...c.sections);
        });

        // Filter to incharge sections if provided
        if (inchargeSectionIds && inchargeSectionIds.length > 0) {
          secList = secList.filter(s => inchargeSectionIds.includes(s.id));
        }

        setClasses(clsList);
        setSections(secList);

        if (defaultSectionId && secList.some(s => s.id === defaultSectionId)) {
          const matched = secList.find(s => s.id === defaultSectionId);
          if (matched) {
            setSelectedClassId(matched.class_id);
            setSelectedSectionId(matched.id);
          }
        } else if (clsList.length > 0) {
          setSelectedClassId(clsList[0].id);
          const firstSec = secList.find(s => s.class_id === clsList[0].id);
          if (firstSec) setSelectedSectionId(firstSec.id);
        }
      } catch (err) {
        console.error('NewAdmissionModal load error', err);
      }
    })();
  }, [visible, defaultSectionId, inchargeSectionIds, schoolId]);

  const handleClassSelect = (classId: string) => {
    setSelectedClassId(classId);
    const available = sections.filter(s => s.class_id === classId);
    if (available.length > 0) {
      setSelectedSectionId(available[0].id);
    } else {
      setSelectedSectionId('');
    }
  };

  const handleSaveAdmission = async () => {
    if (!fullName.trim()) {
      setTab('personal');
      Alert.alert('Validation Error', 'Student full name is required');
      return;
    }
    if (!selectedSectionId) {
      setTab('academic');
      Alert.alert('Validation Error', 'Please select a Class & Section');
      return;
    }

    setSubmitting(true);
    try {
      const saved = await createStudent({
        school_id: schoolId,
        admission_number: admissionNo.trim() || `ADM-${Date.now()}`,
        full_name: fullName.trim(),
        father_name: fatherName.trim() || undefined,
        mother_name: motherName.trim() || undefined,
        parent_email: parentEmail.trim() || undefined,
        parent_phone: parentPhone.trim() || undefined,
        date_of_birth: dob,
        gender,
        class_id: selectedClassId,
        section_id: selectedSectionId,
        address: address.trim() || undefined,
        admission_date: admissionDate,
      });

      if (!saved) throw new Error('Failed to create student');

      const matchedClass = classes.find(c => c.id === selectedClassId);
      const matchedSection = sections.find(s => s.id === selectedSectionId);

      const newStudent: Student = {
        ...saved,
        class: matchedClass,
        section: matchedSection,
      };

      Alert.alert(
        'Admission Complete!',
        `Student "${fullName.trim()}" has been admitted with Admission No: ${newStudent.admission_number}\n\nNote: You can upload or capture their photo anytime from their student profile card.`
      );
      onSuccess(newStudent);
      onClose();
    } catch (err) {
      console.error('Admission submit error', err);
      Alert.alert('Error', 'Failed to complete admission.');
    } finally {
      setSubmitting(false);
    }
  };

  const availableSections = sections.filter(s => s.class_id === selectedClassId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.headerHandle} />
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>New Student Admission</Text>
              <Text style={styles.subtitle}>Complete admission with student & guardian details</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Stepper Tabs */}
          <View style={styles.tabNavRow}>
            {[
              { id: 'personal', label: '1. Personal' },
              { id: 'parents', label: '2. Parents' },
              { id: 'academic', label: '3. Academic' },
            ].map(t => {
              const active = tab === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setTab(t.id as typeof tab)}
                  style={[styles.stepTab, active && styles.stepTabActive]}>
                  <Text style={[styles.stepTabText, active && styles.stepTabTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* TAB 1: PERSONAL DETAILS */}
            {tab === 'personal' && (
              <View style={styles.formSection}>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Aarav Sharma"
                  placeholderTextColor={COLORS.textDim}
                  value={fullName}
                  onChangeText={setFullName}
                />

                <Text style={styles.label}>Gender</Text>
                <View style={styles.genderRow}>
                  <TouchableOpacity
                    onPress={() => setGender('male')}
                    style={[styles.genderChip, gender === 'male' && styles.genderChipActiveMale]}>
                    <Ionicons name="male" size={16} color={gender === 'male' ? COLORS.primary : COLORS.textDim} style={{ marginRight: 4 }} />
                    <Text style={[styles.genderText, gender === 'male' && styles.genderTextActiveMale]}>Male</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setGender('female')}
                    style={[styles.genderChip, gender === 'female' && styles.genderChipActiveFemale]}>
                    <Ionicons name="female" size={16} color={gender === 'female' ? '#EC4899' : COLORS.textDim} style={{ marginRight: 4 }} />
                    <Text style={[styles.genderText, gender === 'female' && styles.genderTextActiveFemale]}>Female</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2018-04-12"
                  placeholderTextColor={COLORS.textDim}
                  value={dob}
                  onChangeText={setDob}
                />

                <Text style={styles.label}>Residential Address</Text>
                <TextInput
                  style={[styles.input, { height: 64, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="Enter full address..."
                  placeholderTextColor={COLORS.textDim}
                  value={address}
                  onChangeText={setAddress}
                />

                <Button
                  label="Next: Parent Details →"
                  variant="outline"
                  onPress={() => setTab('parents')}
                  style={{ marginTop: 12 }}
                />
              </View>
            )}

            {/* TAB 2: PARENTS DETAILS */}
            {tab === 'parents' && (
              <View style={styles.formSection}>
                <Text style={styles.label}>Father&apos;s Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Rajesh Sharma"
                  placeholderTextColor={COLORS.textDim}
                  value={fatherName}
                  onChangeText={setFatherName}
                />

                <Text style={styles.label}>Mother&apos;s Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Sunita Sharma"
                  placeholderTextColor={COLORS.textDim}
                  value={motherName}
                  onChangeText={setMotherName}
                />

                <Text style={styles.label}>Guardian Contact Phone (10 Digits)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="phone-pad"
                  placeholder="9876543210"
                  placeholderTextColor={COLORS.textDim}
                  maxLength={10}
                  value={parentPhone}
                  onChangeText={(text) => setParentPhone(text.replace(/\D/g, '').slice(0, 10))}
                />

                <Text style={styles.label}>Guardian Email</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="parent@example.com"
                  placeholderTextColor={COLORS.textDim}
                  value={parentEmail}
                  onChangeText={setParentEmail}
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <Button
                    label="← Back"
                    variant="ghost"
                    onPress={() => setTab('personal')}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Next: Academic Details →"
                    variant="outline"
                    onPress={() => setTab('academic')}
                    style={{ flex: 1.5 }}
                  />
                </View>
              </View>
            )}

            {/* TAB 3: ACADEMIC DETAILS */}
            {tab === 'academic' && (
              <View style={styles.formSection}>
                <Text style={styles.label}>Select Class *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  {classes.map(c => {
                    const active = c.id === selectedClassId;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => handleClassSelect(c.id)}
                        style={[styles.chip, active && styles.chipActive]}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={styles.label}>Select Section *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  {availableSections.map(s => {
                    const active = s.id === selectedSectionId;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => setSelectedSectionId(s.id)}
                        style={[styles.chip, active && styles.chipActive]}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>Section {s.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.twoCols}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Admission No.</Text>
                    <TextInput
                      style={styles.input}
                      value={admissionNo}
                      onChangeText={setAdmissionNo}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.label}>Admission Date</Text>
                    <TextInput
                      style={styles.input}
                      value={admissionDate}
                      onChangeText={setAdmissionDate}
                    />
                  </View>
                </View>
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <Button label="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label={submitting ? 'Admitting...' : 'Complete Admission'}
              variant="primary"
              loading={submitting}
              onPress={handleSaveAdmission}
              style={{ flex: 1.5 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: SCREEN_HEIGHT * 0.88,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingTop: 8,
    paddingBottom: SPACING.lg,
    ...SHADOW.lg,
  },
  headerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
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
  tabNavRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: RADIUS.md,
    padding: 3,
    marginVertical: SPACING.xs,
  },
  stepTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
  },
  stepTabActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOW.sm,
  },
  stepTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  stepTabTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },

  bodyScroll: {
    flex: 1,
  },
  formSection: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
    marginTop: 6,
  },
  input: {
    height: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 13,
  },

  genderRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 4,
  },
  genderChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
  },
  genderChipActiveMale: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  genderChipActiveFemale: {
    backgroundColor: '#FDF2F8',
    borderColor: '#FBCFE8',
  },
  genderText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  genderTextActiveMale: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  genderTextActiveFemale: {
    color: '#EC4899',
    fontWeight: '700',
  },

  chipsScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  twoCols: {
    flexDirection: 'row',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: SPACING.md,
  },
});
