import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { fetchTeacherByUserId, fetchTeacherAssignments } from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, formatDate, getInitials } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import type { Teacher } from '@/types';

interface AssignmentInfo {
  className: string;
  sectionName: string;
  isClassTeacher: boolean;
}

export default function TeacherProfileModal() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignments, setAssignments] = useState<AssignmentInfo[]>([]);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      try {
        const found = await fetchTeacherByUserId(user.id);
        setTeacher(found);

        if (found) {
          const allAssign = await fetchTeacherAssignments(found.id);

          const assignedList = allAssign.map(a => ({
            className: (a as any).class?.name ?? 'Class',
            sectionName: (a as any).section?.name ?? 'A',
            isClassTeacher: !!a.is_class_teacher,
          }));

          setAssignments(assignedList);
        }
      } catch (err) {
        console.error('Error loading teacher profile:', err);
      }
    }
    load();
  }, [user?.id]);

  const performLogout = async () => {
    await logout();
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/login');
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to log out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: performLogout,
        },
      ],
    );
  };

  const initials = teacher ? getInitials(teacher.full_name) : 'T';

  const infoRows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | null }[] = teacher
    ? [
        { icon: 'card-outline',     label: 'Employee ID',    value: teacher.employee_id },
        { icon: 'school-outline',   label: 'Qualification',  value: teacher.qualification },
        { icon: 'book-outline',     label: 'Primary Subject', value: teacher.subject },
        { icon: 'calendar-outline', label: 'Date of Joining', value: formatDate(teacher.date_of_joining) },
        { icon: 'mail-outline',     label: 'Email',          value: teacher.email },
        { icon: 'call-outline',     label: 'Phone',          value: teacher.phone ?? 'Not provided' },
      ]
    : [];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <Header title="My Profile" showBack />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          {/* Teacher Profile Card */}
          <GlassCard style={styles.profileCard} padding={SPACING.lg}>
            <View style={styles.avatarSection}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
              <Text style={styles.name}>{teacher?.full_name ?? 'Faculty Member'}</Text>
              <View style={styles.roleBadgeRow}>
                <View style={styles.roleBadge}>
                  <Ionicons name="school" size={13} color={COLORS.primary} />
                  <Text style={styles.roleText}>Faculty Teacher</Text>
                </View>
                {assignments.some(a => a.isClassTeacher) && (
                  <View style={styles.inchargeBadge}>
                    <Ionicons name="shield-checkmark" size={13} color="#059669" />
                    <Text style={styles.inchargeText}>Class Incharge</Text>
                  </View>
                )}
              </View>
            </View>
          </GlassCard>

          {/* Assigned Classes */}
          {assignments.length > 0 && (
            <GlassCard style={styles.cardSection} padding={SPACING.md}>
              <Text style={styles.sectionHeading}>Teaching Assignments</Text>
              <View style={styles.assignmentChips}>
                {assignments.map((item, idx) => (
                  <View key={idx} style={styles.assignChip}>
                    <Ionicons name="people" size={14} color={COLORS.primary} />
                    <Text style={styles.assignChipText}>
                      {item.className} - {item.sectionName}
                    </Text>
                    {item.isClassTeacher && (
                      <View style={styles.inchargeMiniTag}>
                        <Text style={styles.inchargeMiniText}>Incharge</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </GlassCard>
          )}

          {/* Info Details Card */}
          <GlassCard padding={0} style={styles.cardSection}>
            <View style={styles.detailsHeader}>
              <Text style={styles.sectionHeading}>Personal & Professional Details</Text>
            </View>
            {infoRows.map((row, index) => (
              <View
                key={row.label}
                style={[styles.infoRow, index < infoRows.length - 1 && styles.divider]}>
                <View style={styles.infoIconCircle}>
                  <Ionicons name={row.icon} size={18} color={COLORS.primary} />
                </View>
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value ?? '—'}</Text>
                </View>
              </View>
            ))}
          </GlassCard>

          {/* Edit Profile Button */}
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => Alert.alert('Edit Profile', 'Profile updates are managed by the school administrator.')}
            activeOpacity={0.8}>
            <Ionicons name="pencil-outline" size={17} color={COLORS.primary} />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>

          {/* Sign Out Button */}
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            <Text style={styles.logoutBtnText}>Sign Out</Text>
          </TouchableOpacity>

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </SafeAreaView>
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
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.md,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    alignItems: 'center',
    ...SHADOW.sm,
  },
  avatarSection: {
    alignItems: 'center',
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#DFE3FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  avatarInitials: {
    fontSize: 26,
    fontWeight: '700',
    color: '#3B4DC8',
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  roleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: '#EEF0FD',
    borderWidth: 1,
    borderColor: '#C7CDFB',
  },
  roleText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  inchargeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  inchargeText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  cardSection: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    ...SHADOW.sm,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  detailsHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: 2,
  },
  assignmentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assignChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: '#F4F5FB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  assignChipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  inchargeMiniTag: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  inchargeMiniText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  infoIconCircle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: '#EEF0FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 2,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
    ...SHADOW.sm,
  },
  editBtnText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  logoutBtnText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
});
