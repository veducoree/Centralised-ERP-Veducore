import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchAttendance,
  fetchStudentRecords,
  fetchFees,
  fetchRemarks,
  updateStudent,
} from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, formatDate, formatCurrency } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { MobileInlineSkeleton } from '@/components/ui/Skeleton';
import type { Student, Attendance, StudentRecord, Fee, Remark, Class, Section } from '@/types';
import { StudentPhotoPickerModal } from '@/components/ui/StudentPhotoPickerModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface StudentDetailModalProps {
  student: Student | null;
  visible: boolean;
  onClose: () => void;
  onStudentUpdated?: () => void;
  isClassIncharge?: boolean;
}

type TabType = 'overview' | 'academic' | 'attendance' | 'fees';

export function StudentDetailModal({
  student,
  visible,
  onClose,
  onStudentUpdated,
  isClassIncharge = true,
}: StudentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [className, setClassName] = useState<string>('');
  const [sectionName, setSectionName] = useState<string>('');
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);

  useEffect(() => {
    if (!student || !visible) return;
    setAvatarUrl(student.avatar_url ?? null);

    let isMounted = true;
    setLoading(true);

    (async () => {
      try {
        const [attList, recList, feeList, remList] = await Promise.all([
          fetchAttendance({ studentId: student.id }),
          fetchStudentRecords({ studentId: student.id }),
          fetchFees({ studentId: student.id }),
          fetchRemarks({ studentId: student.id }),
        ]);

        if (!isMounted) return;

        setClassName(student.class?.name ?? '—');
        setSectionName(student.section?.name ?? '—');
        setAttendance(attList);
        setRecords(recList);
        setFees(feeList);
        setRemarks(remList);
      } catch (err) {
        console.error('Error loading student details:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [student, visible]);

  if (!student) return null;

  const handlePhotoSelected = async (uri: string | null) => {
    setAvatarUrl(uri);
    try {
      await updateStudent(student.id, { avatar_url: uri ?? undefined });
      onStudentUpdated?.();
    } catch (err) {
      console.error('Failed to update student photo:', err);
    }
  };

  const handleAvatarPress = () => {
    if (!isClassIncharge) {
      Alert.alert(
        'Permission Restricted',
        'Only the assigned Class Incharge can upload or capture student photos for this section.',
      );
      return;
    }
    setPhotoPickerVisible(true);
  };

  const presentCount = attendance.filter(a => a.status === 'present').length;
  const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 100;
  const totalFees = fees.reduce((sum, f) => sum + (f.amount || 0), 0);
  const totalPaid = fees.reduce((sum, f) => sum + (f.paid_amount || 0), 0);
  const totalPending = totalFees - totalPaid;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.header}>
            <View style={styles.headerHandle} />
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>

            {/* Student Hero */}
            <View style={styles.heroRow}>
              <TouchableOpacity
                activeOpacity={isClassIncharge ? 0.8 : 1}
                onPress={handleAvatarPress}
                style={styles.avatarTouchable}>
                <Avatar
                  name={student.full_name}
                  uri={avatarUrl ?? student.avatar_url}
                  size={64}
                  color={student.gender === 'female' ? '#EC4899' : COLORS.primary}
                />
                {isClassIncharge && (
                  <View style={styles.cameraIconBadge}>
                    <Ionicons name="camera" size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.heroInfo}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {student.full_name}
                </Text>
                <Text style={styles.heroSub}>
                  {className} &bull; Section {sectionName}
                </Text>
                <View style={styles.badgeRow}>
                  <View style={styles.idBadge}>
                    <Text style={styles.idBadgeText}>Adm #{student.admission_number}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          student.status === 'active' ? '#ECFDF5' : '#FEF2F2',
                        borderColor:
                          student.status === 'active' ? '#A7F3D0' : '#FECACA',
                      },
                    ]}>
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: student.status === 'active' ? '#059669' : '#DC2626' },
                      ]}>
                      {student.status === 'active' ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabRow}>
              {(['overview', 'academic', 'attendance', 'fees'] as TabType[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
                  activeOpacity={0.7}>
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Modal Body */}
          <ScrollView contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {loading ? (
              <MobileInlineSkeleton rows={4} />
            ) : (
              <>
                {activeTab === 'overview' && (
                  <View style={styles.tabSection}>
                    <Text style={styles.sectionTitle}>Personal & Guardian Info</Text>

                    <GlassCard style={styles.cardSpacing} padding={0}>
                      <InfoRow icon="calendar-outline" label="Date of Birth" value={student.date_of_birth ? formatDate(student.date_of_birth) : 'Not specified'} />
                      <InfoRow icon="person-outline" label="Gender" value={student.gender ? student.gender.toUpperCase() : '—'} />
                      <InfoRow icon="people-outline" label="Father's Name" value={student.father_name || 'Not provided'} />
                      <InfoRow icon="people-outline" label="Mother's Name" value={student.mother_name || 'Not provided'} />
                      <InfoRow icon="mail-outline" label="Parent Email" value={student.parent_email || 'Not provided'} />
                      <InfoRow icon="location-outline" label="Residential Address" value={student.address || 'Not specified'} isLast />
                    </GlassCard>

                    {remarks.length > 0 && (
                      <>
                        <Text style={[styles.sectionTitle, { marginTop: SPACING.md }]}>Recent Remarks</Text>
                        {remarks.map(rem => (
                          <GlassCard key={rem.id} style={styles.remarkCard} padding={SPACING.sm}>
                            <View style={styles.remarkHeader}>
                              <Badge label={rem.category.toUpperCase()} variant="info" />
                              <Text style={styles.remarkDate}>{formatDate(rem.created_at)}</Text>
                            </View>
                            <Text style={styles.remarkText}>{rem.remark}</Text>
                          </GlassCard>
                        ))}
                      </>
                    )}
                  </View>
                )}

                {activeTab === 'academic' && (
                  <View style={styles.tabSection}>
                    <Text style={styles.sectionTitle}>Exam Marks & Records</Text>
                    {records.length === 0 ? (
                      <GlassCard padding={SPACING.md}>
                        <Text style={styles.emptyText}>No academic records entered yet.</Text>
                      </GlassCard>
                    ) : (
                      records.map(rec => (
                        <GlassCard key={rec.id} style={styles.recordCard} padding={SPACING.md}>
                          <View style={styles.recordHeader}>
                            <View>
                              <Text style={styles.recordExam}>{rec.exam_name || 'Exam'}</Text>
                              <Text style={styles.recordSubject}>{rec.subject_name || 'Subject'}</Text>
                            </View>
                            <View style={styles.gradeBadge}>
                              <Text style={styles.gradeText}>{rec.grade || '—'}</Text>
                            </View>
                          </View>
                          <View style={styles.recordFooter}>
                            <Text style={styles.recordScore}>
                              Score: <Text style={styles.scoreHighlight}>{rec.marks}</Text> / {rec.max_marks}
                            </Text>
                            <Text style={styles.recordPct}>
                              {rec.max_marks > 0 ? Math.round((rec.marks / rec.max_marks) * 100) : 0}%
                            </Text>
                          </View>
                          {rec.teacher_comment ? (
                            <Text style={styles.recordComment}>&ldquo;{rec.teacher_comment}&rdquo;</Text>
                          ) : null}
                        </GlassCard>
                      ))
                    )}
                  </View>
                )}

                {activeTab === 'attendance' && (
                  <View style={styles.tabSection}>
                    <Text style={styles.sectionTitle}>Attendance Overview</Text>

                    <View style={styles.statGrid}>
                      <StatBox label="Rate" value={`${attendanceRate}%`} color={COLORS.primary} />
                      <StatBox label="Present" value={presentCount} color="#059669" />
                      <StatBox label="Total Recorded" value={attendance.length} color={COLORS.text} />
                    </View>

                    <Text style={[styles.sectionTitle, { marginTop: SPACING.md }]}>Attendance Log</Text>
                    {attendance.length === 0 ? (
                      <GlassCard padding={SPACING.md}>
                        <Text style={styles.emptyText}>No attendance records found.</Text>
                      </GlassCard>
                    ) : (
                      attendance.slice(0, 10).map(att => (
                        <GlassCard key={att.id} style={styles.attRowCard} padding={SPACING.sm}>
                          <View style={styles.attRow}>
                            <View>
                              <Text style={styles.attDate}>{formatDate(att.attendance_date)}</Text>
                              {att.notes ? <Text style={styles.attNotes}>{att.notes}</Text> : null}
                            </View>
                            <View
                              style={[
                                styles.attStatusPill,
                                {
                                  backgroundColor:
                                    att.status === 'present'
                                      ? '#ECFDF5'
                                      : att.status === 'absent'
                                      ? '#FEF2F2'
                                      : '#FEF3C7',
                                },
                              ]}>
                              <Text
                                style={[
                                  styles.attStatusText,
                                  {
                                    color:
                                      att.status === 'present'
                                        ? '#059669'
                                        : att.status === 'absent'
                                        ? '#DC2626'
                                        : '#D97706',
                                  },
                                ]}>
                                {att.status.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                        </GlassCard>
                      ))
                    )}
                  </View>
                )}

                {activeTab === 'fees' && (
                  <View style={styles.tabSection}>
                    <Text style={styles.sectionTitle}>Fee Status</Text>

                    <View style={styles.statGrid}>
                      <StatBox label="Total Fee" value={formatCurrency(totalFees)} color={COLORS.text} />
                      <StatBox label="Paid" value={formatCurrency(totalPaid)} color="#059669" />
                      <StatBox label="Pending" value={formatCurrency(totalPending)} color={totalPending > 0 ? '#D97706' : '#059669'} />
                    </View>

                    <Text style={[styles.sectionTitle, { marginTop: SPACING.md }]}>Fee Invoices</Text>
                    {fees.length === 0 ? (
                      <GlassCard padding={SPACING.md}>
                        <Text style={styles.emptyText}>No fee records found for this student.</Text>
                      </GlassCard>
                    ) : (
                      fees.map(fee => (
                        <GlassCard key={fee.id} style={styles.feeCard} padding={SPACING.md}>
                          <View style={styles.feeHeader}>
                            <Text style={styles.feeType}>{fee.fee_type || 'Tuition Fee'}</Text>
                            <View
                              style={[
                                styles.attStatusPill,
                                {
                                  backgroundColor:
                                    fee.status === 'paid'
                                      ? '#ECFDF5'
                                      : fee.status === 'overdue'
                                      ? '#FEF2F2'
                                      : '#FEF3C7',
                                },
                              ]}>
                              <Text
                                style={[
                                  styles.attStatusText,
                                  {
                                    color:
                                      fee.status === 'paid'
                                        ? '#059669'
                                        : fee.status === 'overdue'
                                        ? '#DC2626'
                                        : '#D97706',
                                  },
                                ]}>
                                {fee.status.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.feeAmountRow}>
                            <Text style={styles.feeAmount}>{formatCurrency(fee.amount)}</Text>
                            <Text style={styles.feeDue}>Due: {formatDate(fee.due_date)}</Text>
                          </View>
                          {fee.receipt_number ? (
                            <Text style={styles.feeReceipt}>Receipt: #{fee.receipt_number}</Text>
                          ) : null}
                        </GlassCard>
                      ))
                    )}
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Photo Picker Modal */}
          <StudentPhotoPickerModal
            visible={photoPickerVisible}
            onClose={() => setPhotoPickerVisible(false)}
            onPhotoSelected={handlePhotoSelected}
            studentName={student.full_name}
          />
        </View>
      </View>
    </Modal>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon} size={16} color={COLORS.primary} />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: SCREEN_HEIGHT * 0.88,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
    ...SHADOW.lg,
  },
  header: {
    paddingTop: 10,
    paddingHorizontal: SPACING.md,
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
  closeBtn: {
    position: 'absolute',
    right: SPACING.md,
    top: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: SPACING.sm,
  },
  avatarTouchable: {
    position: 'relative',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  heroSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  idBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  idBadgeText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  bodyContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
    backgroundColor: '#F4F5FB',
  },
  loaderWrap: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  tabSection: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardSpacing: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    ...SHADOW.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    gap: 12,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EEF0FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextWrap: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: COLORS.textDim,
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  remarkCard: {
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    ...SHADOW.sm,
  },
  remarkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  remarkDate: {
    flexShrink: 1,
    fontSize: 11,
    color: COLORS.textDim,
  },
  remarkText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textDim,
    textAlign: 'center',
    paddingVertical: 16,
  },
  recordCard: {
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    ...SHADOW.sm,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  recordExam: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  recordSubject: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 2,
    fontWeight: '600',
  },
  gradeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#EEF0FD',
  },
  gradeText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  recordFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  recordScore: {
    flexShrink: 1,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  scoreHighlight: {
    color: COLORS.text,
    fontWeight: '700',
  },
  recordPct: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  recordComment: {
    fontSize: 12,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    marginTop: 6,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    ...SHADOW.sm,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textDim,
  },
  attRowCard: {
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    ...SHADOW.sm,
  },
  attRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attDate: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  attNotes: {
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 2,
  },
  attStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  attStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  feeCard: {
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    ...SHADOW.sm,
  },
  feeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  feeType: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  feeAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  feeAmount: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  feeDue: {
    fontSize: 12,
    color: COLORS.textDim,
  },
  feeReceipt: {
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 4,
  },
});
