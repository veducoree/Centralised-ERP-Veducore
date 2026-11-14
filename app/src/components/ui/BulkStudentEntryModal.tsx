import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/context/AuthContext';
import { fetchClasses, createStudent } from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import type { Student, Class, Section } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface BulkStudentEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sections: { section_id: string; sectionName: string }[];
  defaultSectionId?: string;
  isClassIncharge?: boolean;
  inchargeSectionIds?: string[];
}

export interface ParsedCsvStudent {
  admission_number: string;
  full_name: string;
  father_name: string;
  mother_name: string;
  parent_email: string;
  phone_number: string;
  date_of_birth: string;
  gender: 'male' | 'female';
  class_name: string;
  section_name: string;
  address: string;
  admission_date: string;
  class_id?: string;
  section_id?: string;
  isValid: boolean;
  error?: string;
}

const SAMPLE_CSV_CONTENT =
  `admission_number,full_name,father_name,mother_name,parent_email,phone_number,date_of_birth,gender,class_name,section_name,address,admission_date\n` +
  `ADM-2026-101,Aarav Sharma,Deepak Sharma,Pooja Sharma,sharma@example.com,9876543210,2018-05-14,male,Class 1,A,45 Park Street Mumbai,2026-04-01\n` +
  `ADM-2026-102,Diya Patel,Vikram Patel,Anjali Patel,patel@example.com,9876543211,2018-08-22,female,Class 1,A,78 MG Road Pune,2026-04-01\n` +
  `ADM-2026-103,Rohan Verma,Suresh Verma,Sunita Verma,verma@example.com,9876543212,2018-03-10,male,Class 1,A,12 Lakeview Colony Nashik,2026-04-01\n`;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

async function readCsvFile(uri: string, rawFile?: any): Promise<string> {
  // If browser File object is available (Web)
  if (rawFile && typeof rawFile.text === 'function') {
    try {
      const text = await rawFile.text();
      if (typeof text === 'string' && text.length > 0) return text;
    } catch (e) {
      console.warn('rawFile.text() failed, trying fetch:', e);
    }
  }

  // Fetch read (works on Web and many local file uris)
  try {
    const res = await fetch(uri);
    const text = await res.text();
    if (typeof text === 'string' && text.length > 0) {
      return text;
    }
  } catch (err) {
    console.warn('fetch read failed, attempting FileSystem:', err);
  }

  // Native FileSystem read
  try {
    if (FileSystem?.readAsStringAsync) {
      const text = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType?.UTF8 || 'utf8',
      });
      if (typeof text === 'string' && text.length > 0) {
        return text;
      }
    }
  } catch (err) {
    console.warn('FileSystem read failed:', err);
  }

  throw new Error('Could not read the selected CSV file content.');
}

export function BulkStudentEntryModal({
  visible,
  onClose,
  onSuccess,
  isClassIncharge = true,
  inchargeSectionIds = [],
}: BulkStudentEntryModalProps) {
  const { profile } = useAuth();
  const schoolId = profile?.school_id || 'school-001';

  const [classes, setClasses] = useState<Class[]>([]);
  const [sectionsList, setSectionsList] = useState<Section[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [parsedStudents, setParsedStudents] = useState<ParsedCsvStudent[]>([]);
  const [readingFile, setReadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingSample, setDownloadingSample] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const cls = await fetchClasses(schoolId);
        const sec: Section[] = [];
        cls.forEach(c => {
          if (c.sections) sec.push(...c.sections);
        });
        setClasses(cls);
        setSectionsList(sec);
      } catch (err) {
        console.error('Error loading metadata for CSV modal:', err);
      }
    })();
  }, [visible, schoolId]);

  const handleDownloadSampleCsv = async () => {
    setDownloadingSample(true);
    try {
      // 1. Web browser: Direct browser file download
      if (Platform.OS === 'web') {
        const blob = new Blob([SAMPLE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'sample_student_admissions.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      // 2. Native (iOS / Android): Write to FileSystem cache and open native share sheet
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!dir) {
        throw new Error('Storage directory is not available on this device');
      }

      const fileUri = `${dir}sample_student_admissions.csv`;
      await FileSystem.writeAsStringAsync(fileUri, SAMPLE_CSV_CONTENT, {
        encoding: FileSystem.EncodingType?.UTF8 || 'utf8',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Download / Share Sample Student CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert(
          'Sample CSV Saved',
          'Sample CSV has been created successfully in temporary storage.'
        );
      }
    } catch (err: any) {
      console.error('Download sample error:', err);
      Alert.alert(
        'Download Error',
        'Could not save CSV to storage. Please check device permissions.'
      );
    } finally {
      setDownloadingSample(false);
    }
  };

  const handlePickCsv = async () => {
    const hasInchargePerms = isClassIncharge || (inchargeSectionIds && inchargeSectionIds.length > 0);
    if (!hasInchargePerms) {
      Alert.alert(
        'Permission Restricted',
        'Only designated Class Incharges can upload and admit students in bulk.'
      );
      return;
    }

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const file = res.assets[0];
      setCsvFileName(file.name);
      setReadingFile(true);

      const content = await readCsvFile(file.uri, (file as any).file);
      parseCsvContent(content);
    } catch (err) {
      console.error('Error selecting CSV:', err);
      Alert.alert('CSV Error', 'Could not open or read the selected file.');
    } finally {
      setReadingFile(false);
    }
  };

  const parseCsvContent = (content: string) => {
    const rawLines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (rawLines.length < 2) {
      Alert.alert('Invalid CSV', 'CSV file is empty or does not contain a header row.');
      setParsedStudents([]);
      return;
    }

    const headers = parseCsvLine(rawLines[0]).map(h => h.toLowerCase().trim());
    const rows = rawLines.slice(1);

    const parsed: ParsedCsvStudent[] = rows.map((line, idx) => {
      const cols = parseCsvLine(line);
      const rowData: Record<string, string> = {};

      headers.forEach((h, colIdx) => {
        rowData[h] = cols[colIdx] || '';
      });

      const admNo = rowData['admission_number'] || `ADM-2026-${Math.floor(100 + Math.random() * 900)}`;
      const fullName = rowData['full_name'] || '';
      const fatherName = rowData['father_name'] || 'Parent';
      const motherName = rowData['mother_name'] || 'Parent';
      const parentEmail = rowData['parent_email'] || 'parent@example.com';
      const rawPhone = rowData['phone_number'] || rowData['phone'] || rowData['parent_phone'] || rowData['emergency_contact'] || '';
      const phoneDigits = rawPhone.replace(/\D/g, '');
      const phoneNumber = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;
      const dob = rowData['date_of_birth'] || '2018-01-01';
      const rawGender = (rowData['gender'] || 'male').toLowerCase();
      const gender: 'male' | 'female' = rawGender === 'female' ? 'female' : 'male';
      const className = rowData['class_name'] || '';
      const sectionName = rowData['section_name'] || '';
      const address = rowData['address'] || 'Mumbai, Maharashtra';
      const admDate = rowData['admission_date'] || new Date().toISOString().split('T')[0];

      let isValid = true;
      let error = '';

      if (!fullName) {
        isValid = false;
        error = 'Missing full_name';
      }

      const matchedClass = classes.find(
        c => c.name.toLowerCase() === className.toLowerCase()
      );
      const matchedSection = sectionsList.find(
        s =>
          s.name.toLowerCase() === sectionName.toLowerCase() &&
          (!matchedClass || s.class_id === matchedClass.id)
      );

      if (!matchedSection) {
        isValid = false;
        error = error ? `${error}, section '${sectionName}' not found` : `Section '${sectionName}' not found`;
      } else if (
        inchargeSectionIds.length > 0 &&
        !inchargeSectionIds.includes(matchedSection.id)
      ) {
        isValid = false;
        error = `Not Incharge of ${className} - ${sectionName}`;
      }

      return {
        admission_number: admNo,
        full_name: fullName,
        father_name: fatherName,
        mother_name: motherName,
        parent_email: parentEmail,
        phone_number: phoneNumber,
        date_of_birth: dob,
        gender,
        class_name: className,
        section_name: sectionName,
        address,
        admission_date: admDate,
        class_id: matchedClass?.id,
        section_id: matchedSection?.id,
        isValid,
        error: error || undefined,
      };
    });

    setParsedStudents(parsed);
  };

  const handleBulkSubmit = async () => {
    const validRows = parsedStudents.filter(s => s.isValid && s.class_id && s.section_id);
    if (validRows.length === 0) {
      Alert.alert('No Valid Records', 'There are no valid student rows ready to import.');
      return;
    }

    setSubmitting(true);
    try {
      for (const st of validRows) {
        await createStudent({
          school_id: schoolId,
          admission_number: st.admission_number,
          full_name: st.full_name,
          father_name: st.father_name || undefined,
          mother_name: st.mother_name || undefined,
          parent_email: st.parent_email || undefined,
          parent_phone: st.phone_number || undefined,
          date_of_birth: st.date_of_birth,
          gender: st.gender,
          class_id: st.class_id!,
          section_id: st.section_id!,
          address: st.address || undefined,
          admission_date: st.admission_date,
        });
      }

      Alert.alert(
        'Bulk Admission Success',
        `Successfully enrolled ${validRows.length} students!\n\nNote: Student profile photos can be added anytime by the Class Incharge from each student's card.`
      );
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Bulk student entry error', err);
      Alert.alert('Error', 'Failed to import students.');
    } finally {
      setSubmitting(false);
    }
  };

  const validCount = parsedStudents.filter(s => s.isValid).length;
  const invalidCount = parsedStudents.length - validCount;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.headerHandle} />

          {/* Modal Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Bulk Student CSV Import</Text>
              <Text style={styles.subtitle}>Enrol multiple students directly from a .csv file</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {!isClassIncharge ? (
            <View style={styles.restrictedBanner}>
              <Ionicons name="shield-outline" size={18} color="#D97706" />
              <Text style={styles.restrictedText}>
                Only designated Class Incharges can perform bulk student enrolments.
              </Text>
            </View>
          ) : null}

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Download Sample CSV Action Card */}
            <View style={styles.sampleDownloadCard}>
              <View style={styles.sampleIconCircle}>
                <Ionicons name="cloud-download" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.sampleInfo}>
                <Text style={styles.sampleTitle}>Download Sample CSV</Text>
                <Text style={styles.sampleSubtitle}>Pre-filled template with all required & optional fields</Text>
              </View>
              <TouchableOpacity
                onPress={handleDownloadSampleCsv}
                disabled={downloadingSample}
                style={styles.sampleDownloadBtn}
                activeOpacity={0.8}>
                {downloadingSample ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.sampleDownloadBtnText}>Get CSV</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* CSV Format Specification Box */}
            <View style={styles.formatSpecCard}>
              <View style={styles.formatSpecHeader}>
                <Ionicons name="information-circle" size={16} color={COLORS.primary} />
                <Text style={styles.formatSpecTitle}>CSV Column Guidelines</Text>
              </View>

              <View style={styles.tagGroup}>
                <Text style={styles.tagGroupLabel}>REQUIRED (Must Not Be Empty):</Text>
                <View style={styles.tagsRow}>
                  {['admission_number', 'full_name', 'class_name', 'section_name'].map(col => (
                    <View key={col} style={styles.requiredTag}>
                      <Ionicons name="checkmark-circle" size={11} color="#059669" style={{ marginRight: 3 }} />
                      <Text style={styles.requiredTagText}>{col}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={[styles.tagGroup, { marginTop: 8 }]}>
                <Text style={styles.tagGroupLabel}>OPTIONAL (Auto-Filled if Blank):</Text>
                <View style={styles.tagsRow}>
                  {[
                    'father_name',
                    'mother_name',
                    'parent_email',
                    'phone_number',
                    'date_of_birth',
                    'gender',
                    'address',
                    'admission_date',
                  ].map(col => (
                    <View key={col} style={styles.optionalTag}>
                      <Text style={styles.optionalTagText}>{col}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Upload File Section */}
            {!csvFileName ? (
              <TouchableOpacity
                onPress={handlePickCsv}
                activeOpacity={0.8}
                style={styles.csvDropzone}>
                <View style={styles.csvIconCircle}>
                  <Ionicons name="cloud-upload" size={30} color={COLORS.primary} />
                </View>
                <Text style={styles.csvDropzoneTitle}>
                  {readingFile ? 'Reading CSV File...' : 'Select CSV File from Device'}
                </Text>
                <Text style={styles.csvDropzoneSub}>
                  Tap here to browse .csv files from Downloads, Drive, or Files
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.csvSelectedWrap}>
                <View style={styles.csvFileHeader}>
                  <View style={styles.csvFileLeft}>
                    <Ionicons name="document-text" size={24} color={COLORS.primary} />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <Text style={styles.csvFileName} numberOfLines={1}>{csvFileName}</Text>
                      <Text style={styles.csvFileMeta}>
                        {parsedStudents.length} Students detected &bull; {validCount} Valid
                        {invalidCount > 0 ? ` &bull; ${invalidCount} Invalid` : ''}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={handlePickCsv} style={styles.csvChangeBtn}>
                    <Text style={styles.csvChangeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>

                {/* Preview Table */}
                <Text style={styles.csvPreviewTitle}>Preview Students to Import ({validCount} Ready):</Text>
                <View style={styles.previewTable}>
                  {parsedStudents.slice(0, 10).map((st, i) => (
                    <View key={i} style={[styles.previewTableRow, !st.isValid && styles.previewTableRowError]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Ionicons
                          name={st.isValid ? 'checkmark-circle' : 'alert-circle'}
                          size={15}
                          color={st.isValid ? '#059669' : '#DC2626'}
                          style={{ marginRight: 6 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.previewTableName} numberOfLines={1}>{st.full_name || 'Missing Name'}</Text>
                          <Text style={styles.previewTableSub}>
                            #{st.admission_number || 'No Adm No'} &bull; {st.class_name} - {st.section_name} {st.phone_number ? `• 📞 ${st.phone_number}` : ''}
                          </Text>
                          {st.error ? (
                            <Text style={styles.previewTableErrorText}>{st.error}</Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={[styles.previewGenderBadge, st.gender === 'female' && styles.previewGenderFemale]}>
                        <Text style={styles.previewGenderText}>{st.gender.toUpperCase()}</Text>
                      </View>
                    </View>
                  ))}
                  {parsedStudents.length > 10 && (
                    <Text style={styles.previewMoreText}>+ {parsedStudents.length - 10} more students in file</Text>
                  )}
                </View>
              </View>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <Button label="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label={
                submitting
                  ? 'Importing...'
                  : validCount > 0
                  ? `Import ${validCount} Student${validCount !== 1 ? 's' : ''}`
                  : 'Import Students'
              }
              variant="primary"
              loading={submitting}
              disabled={!isClassIncharge || validCount === 0}
              onPress={handleBulkSubmit}
              style={{ flex: 1.6 }}
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
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
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

  restrictedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    gap: 8,
  },
  restrictedText: {
    color: '#D97706',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },

  bodyScroll: {
    flex: 1,
  },

  sampleDownloadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF0FD',
    borderWidth: 1,
    borderColor: '#C7CDFB',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: 10,
  },
  sampleIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DFE3FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleInfo: {
    flex: 1,
  },
  sampleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  sampleSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  sampleDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
  sampleDownloadBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  formatSpecCard: {
    backgroundColor: '#F4F5FB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  formatSpecHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.xs,
  },
  formatSpecTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagGroup: {
    marginTop: 4,
  },
  tagGroupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textDim,
    marginBottom: 4,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  requiredTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  requiredTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  optionalTag: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  optionalTagText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  csvDropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C7CDFB',
    borderRadius: RADIUS.xl,
    backgroundColor: '#F4F5FB',
    paddingVertical: 32,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  csvIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EEF0FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  csvDropzoneTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  csvDropzoneSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },

  csvSelectedWrap: {
    marginBottom: SPACING.md,
  },
  csvFileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.sm,
    ...SHADOW.sm,
  },
  csvFileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  csvFileName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  csvFileMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  csvChangeBtn: {
    backgroundColor: '#EEF0FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
  },
  csvChangeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },

  csvPreviewTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  previewTable: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  previewTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  previewTableRowError: {
    backgroundColor: '#FEF2F2',
  },
  previewTableName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  previewTableSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  previewTableErrorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 2,
    fontWeight: '600',
  },
  previewGenderBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  previewGenderFemale: {
    backgroundColor: '#FDF2F8',
  },
  previewGenderText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.text,
  },
  previewMoreText: {
    fontSize: 11,
    color: COLORS.textDim,
    textAlign: 'center',
    paddingVertical: 8,
  },

  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
});
