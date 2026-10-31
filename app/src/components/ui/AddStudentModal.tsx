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
import { fetchClasses, createStudent } from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { VeducoreLoader } from '@/components/ui/Skeleton';
import type { Class, Section, Student } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AddStudentModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (newStudent: Student) => void;
  defaultSectionId?: string;
  inchargeSectionIds?: string[];
}

export default function AddStudentModalComponent({
  visible,
  onClose,
  onSuccess,
  defaultSectionId,
  inchargeSectionIds,
}: AddStudentModalProps) {
  return (
    <AddStudentModal
      visible={visible}
      onClose={onClose}
      onSuccess={onSuccess}
      defaultSectionId={defaultSectionId}
      inchargeSectionIds={inchargeSectionIds}
    />
  );
}

export function AddStudentModal({
  visible,
  onClose,
  onSuccess,
  defaultSectionId,
  inchargeSectionIds,
}: AddStudentModalProps) {
  const { profile } = useAuth();
  const schoolId = profile?.school_id || 'school-001';

  const [fullName, setFullName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [dob, setDob] = useState('2018-01-15');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [address, setAddress] = useState('');

  const [classes, setClasses] = useState<Class[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      setLoading(true);
      try {
        const clsList = await fetchClasses(schoolId);
        let secList: Section[] = [];
        clsList.forEach(c => {
          if (c.sections) secList.push(...c.sections);
        });

        // Restrict to incharge sections if provided
        if (inchargeSectionIds && inchargeSectionIds.length > 0) {
          secList = secList.filter(s => inchargeSectionIds.includes(s.id));
        }

        setClasses(clsList);
        setSections(secList);

        if (defaultSectionId && secList.some(s => s.id === defaultSectionId)) {
          const matchedSec = secList.find(s => s.id === defaultSectionId);
          if (matchedSec) {
            setSelectedClassId(matchedSec.class_id);
            setSelectedSectionId(matchedSec.id);
          }
        } else if (clsList.length > 0) {
          setSelectedClassId(clsList[0].id);
          const firstSec = secList.find(s => s.class_id === clsList[0].id);
          if (firstSec) setSelectedSectionId(firstSec.id);
        }
      } catch (err) {
        console.error('Failed to load classes in AddStudentModal:', err);
      } finally {
        setLoading(false);
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

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Student full name is required');
      return;
    }
    if (!selectedClassId || !selectedSectionId) {
      Alert.alert('Validation Error', 'Please select Class and Section');
      return;
    }

    setSubmitting(true);
    try {
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const admNo = `ADM-2026-${randomSuffix}`;

      const matchedClass = classes.find(c => c.id === selectedClassId);
      const matchedSection = sections.find(s => s.id === selectedSectionId);

      const saved = await createStudent({
        school_id: schoolId,
        admission_number: admNo,
        full_name: fullName.trim(),
        father_name: fatherName.trim() || undefined,
        mother_name: motherName.trim() || undefined,
        parent_email: parentEmail.trim() || undefined,
        parent_phone: parentPhone.trim() || undefined,
        date_of_birth: dob || '2018-01-01',
        gender,
        class_id: selectedClassId,
        section_id: selectedSectionId,
        address: address.trim() || undefined,
        admission_date: new Date().toISOString().split('T')[0],
      });

      if (!saved) {
        throw new Error('Failed to create student');
      }

      const enrichedStudent: Student = {
        ...saved,
        class: matchedClass,
        section: matchedSection,
      };

      Alert.alert(
        'Student Enrolled',
        `Student "${enrichedStudent.full_name}" enrolled successfully!\nAdmission No: ${admNo}\n\nNote: You can add or capture their photo anytime from their profile card.`
      );
      onSuccess(enrichedStudent);
      onClose();

      // Reset form
      setFullName('');
      setFatherName('');
      setMotherName('');
      setParentEmail('');
      setParentPhone('');
      setAddress('');
    } catch (err) {
      console.error('Error adding student:', err);
      Alert.alert('Error', 'Failed to enroll student');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSections = sections.filter(s => s.class_id === selectedClassId);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerHandle} />
            <View style={styles.headerTitleRow}>
              <View>
                <Text style={styles.headerTitle}>New Student Admission</Text>
                <Text style={styles.headerSubtitle}>Enroll student into Greenwood International</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <VeducoreLoader size="sm" style={{ minHeight: 220 }} />
          ) : (
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              {/* Full Name */}
              <Text style={styles.fieldLabel}>Student Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Aarav Mehta"
                placeholderTextColor={COLORS.textDim}
                value={fullName}
                onChangeText={setFullName}
              />

              {/* Class & Section */}
              <Text style={styles.fieldLabel}>Select Class *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                <View style={styles.chipsRow}>
                  {classes.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => handleClassSelect(c.id)}
                      style={[styles.chip, selectedClassId === c.id && styles.chipActive]}>
                      <Text style={[styles.chipText, selectedClassId === c.id && styles.chipTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.fieldLabel}>Select Section *</Text>
              <View style={styles.chipsRow}>
                {filteredSections.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setSelectedSectionId(s.id)}
                    style={[styles.chip, selectedSectionId === s.id && styles.chipActive]}>
                    <Text style={[styles.chipText, selectedSectionId === s.id && styles.chipTextActive]}>
                      Section {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Gender */}
              <Text style={styles.fieldLabel}>Gender</Text>
              <View style={styles.genderRow}>
                <TouchableOpacity
                  onPress={() => setGender('male')}
                  style={[styles.genderBtn, gender === 'male' && styles.genderBtnActiveMale]}>
                  <Ionicons
                    name="male"
                    size={16}
                    color={gender === 'male' ? COLORS.primary : COLORS.textDim}
                  />
                  <Text style={[styles.genderBtnText, gender === 'male' && styles.genderBtnTextActiveMale]}>
                    Male
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setGender('female')}
                  style={[styles.genderBtn, gender === 'female' && styles.genderBtnActiveFemale]}>
                  <Ionicons
                    name="female"
                    size={16}
                    color={gender === 'female' ? '#EC4899' : COLORS.textDim}
                  />
                  <Text style={[styles.genderBtnText, gender === 'female' && styles.genderBtnTextActiveFemale]}>
                    Female
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Date of Birth */}
              <Text style={styles.fieldLabel}>Date of Birth (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2018-05-20"
                placeholderTextColor={COLORS.textDim}
                value={dob}
                onChangeText={setDob}
              />

              {/* Guardian Details */}
              <Text style={[styles.sectionHeading, { marginTop: SPACING.md }]}>Guardian Information</Text>

              <Text style={styles.fieldLabel}>Father&apos;s Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Rajesh Mehta"
                placeholderTextColor={COLORS.textDim}
                value={fatherName}
                onChangeText={setFatherName}
              />

              <Text style={styles.fieldLabel}>Mother&apos;s Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Suman Mehta"
                placeholderTextColor={COLORS.textDim}
                value={motherName}
                onChangeText={setMotherName}
              />

              <Text style={styles.fieldLabel}>Parent Email</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. mehta.family@example.com"
                placeholderTextColor={COLORS.textDim}
                keyboardType="email-address"
                autoCapitalize="none"
                value={parentEmail}
                onChangeText={setParentEmail}
              />

              <Text style={styles.fieldLabel}>Parent Phone (10 Digits)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 9876543210"
                placeholderTextColor={COLORS.textDim}
                keyboardType="phone-pad"
                maxLength={10}
                value={parentPhone}
                onChangeText={(text) => setParentPhone(text.replace(/\D/g, '').slice(0, 10))}
              />

              <Text style={styles.fieldLabel}>Residential Address</Text>
              <TextInput
                style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
                placeholder="Full street address, city, state"
                placeholderTextColor={COLORS.textDim}
                multiline
                value={address}
                onChangeText={setAddress}
              />

              {/* Submit button */}
              <View style={{ marginTop: SPACING.lg }}>
                <Button
                  label="Confirm Admission"
                  onPress={handleSubmit}
                  loading={submitting}
                  variant="primary"
                  size="lg"
                />
              </View>

              <View style={{ height: SPACING.xxl }} />
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
    height: SCREEN_HEIGHT * 0.9,
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
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formContent: {
    padding: SPACING.md,
    backgroundColor: '#F8FAFC',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    marginTop: 10,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 14,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
  },
  chipsScroll: {
    marginBottom: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  genderBtnActiveMale: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  genderBtnActiveFemale: {
    backgroundColor: '#FDF2F8',
    borderColor: '#FBCFE8',
  },
  genderBtnText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  genderBtnTextActiveMale: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  genderBtnTextActiveFemale: {
    color: '#EC4899',
    fontWeight: '700',
  },
});
